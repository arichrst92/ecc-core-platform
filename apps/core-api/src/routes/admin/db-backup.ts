/**
 * Backup & Restore Database — /admin/maintenance/db/*
 *
 *   GET    /                    → daftar file backup + job terakhir + versi tool
 *   POST   /backup              → buat backup baru (async) → job
 *   GET    /jobs/:id            → status job (poll)
 *   GET    /files/:name         → unduh file backup
 *   DELETE /files/:name         → hapus file backup
 *   POST   /restore/upload      → multipart file (.dump) → restore (async)
 *   POST   /restore/:name       → restore dari file backup yang ada di server
 *
 * Akses: fulltimer + menu "maintenance" (write). Restore juga wajib master
 * password (header X-Credential-Master) + body/field confirm = "RESTORE".
 * Penamaan file berdasarkan waktu WIB (lib/db-backup.ts).
 */
import { Router } from 'express';
import multer from 'multer';
import { mkdir } from 'node:fs/promises';
import { BadRequest, NotFound } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { requireFulltimer } from '../../middleware/require-auth.js';
import { requireMenu } from '../../middleware/require-menu.js';
import { requireMasterAccess } from '../../middleware/require-master-access.js';
import {
  BACKUP_DIR,
  backupFileName,
  backupPath,
  deleteBackup,
  getJob,
  isSafeBackupName,
  listBackups,
  listJobs,
  runningJob,
  startBackup,
  startRestore,
  toolVersions,
} from '../../lib/db-backup.js';

export const dbBackupRouter = Router();
dbBackupRouter.use(requireFulltimer, requireMenu('maintenance', 'write'));

const MAX_UPLOAD = Number(process.env.DB_RESTORE_MAX_MB ?? 2048) * 1024 * 1024;
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      mkdir(BACKUP_DIR, { recursive: true })
        .then(() => cb(null, BACKUP_DIR))
        .catch((e) => cb(e as Error, BACKUP_DIR));
    },
    // File unggahan juga diberi nama berdasarkan waktu.
    filename: (_req, _file, cb) => cb(null, `upload_${backupFileName()}`),
  }),
  limits: { fileSize: MAX_UPLOAD, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (/\.(dump|backup)$/i.test(file.originalname)) cb(null, true);
    else cb(new Error('File harus hasil backup (.dump / .backup).'));
  },
});

dbBackupRouter.get('/', async (_req, res) => {
  const [files, tools] = await Promise.all([listBackups(), toolVersions()]);
  res.json({ success: true, data: { files, jobs: listJobs(), running: runningJob(), tools, dir: BACKUP_DIR } });
});

dbBackupRouter.post('/backup', async (req, res) => {
  let job;
  try {
    job = startBackup(req.user?.sub ?? null);
  } catch (e) {
    throw BadRequest((e as Error).message);
  }
  audit(req, { action: 'CREATE', resource: 'db_backup', resourceLabel: `Backup database: ${job.file}`, metadata: { jobId: job.id } });
  res.status(202).json({ success: true, data: job });
});

dbBackupRouter.get('/jobs/:id', async (req, res) => {
  const job = getJob(req.params.id);
  if (!job) throw NotFound('Job tidak ditemukan (server mungkin sudah restart).');
  res.json({ success: true, data: job });
});

dbBackupRouter.get('/files/:name', async (req, res) => {
  const name = String(req.params.name ?? '');
  if (!isSafeBackupName(name)) throw BadRequest('Nama file tidak valid.');
  audit(req, { action: 'UPDATE', resource: 'db_backup', resourceLabel: `Unduh backup: ${name}`, metadata: { kind: 'download' } });
  res.download(backupPath(name), name, (err) => {
    if (err && !res.headersSent) res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'File tidak ditemukan.' } });
  });
});

dbBackupRouter.delete('/files/:name', async (req, res) => {
  const name = String(req.params.name ?? '');
  if (!isSafeBackupName(name)) throw BadRequest('Nama file tidak valid.');
  await deleteBackup(name).catch(() => {
    throw NotFound('File tidak ditemukan.');
  });
  audit(req, { action: 'DELETE', resource: 'db_backup', resourceLabel: `Hapus backup: ${name}` });
  res.json({ success: true, data: { deleted: name } });
});

function assertConfirm(v: unknown) {
  if (String(v ?? '').trim() !== 'RESTORE') throw BadRequest('Ketik RESTORE untuk konfirmasi.');
}

function doRestore(req: Parameters<Parameters<typeof dbBackupRouter.post>[1]>[0], name: string) {
  let job;
  try {
    job = startRestore(name, req.user?.sub ?? null);
  } catch (e) {
    throw BadRequest((e as Error).message);
  }
  audit(req, {
    action: 'UPDATE',
    resource: 'db_restore',
    resourceLabel: `RESTORE database dari ${name}`,
    metadata: { jobId: job.id, file: name },
  });
  return job;
}

dbBackupRouter.post('/restore/upload', requireMasterAccess, (req, res, next) => {
  if (runningJob()) return next(BadRequest('Masih ada proses backup/restore yang berjalan.'));
  upload.single('file')(req, res, (err: unknown) => {
    if (err) {
      const code = (err as { code?: string }).code;
      return next(BadRequest(code === 'LIMIT_FILE_SIZE' ? 'File terlalu besar.' : (err as Error).message));
    }
    try {
      if (!req.file) throw BadRequest('File backup wajib diunggah (field "file").');
      assertConfirm(req.body?.confirm);
      const job = doRestore(req, req.file.filename);
      res.status(202).json({ success: true, data: job });
    } catch (e) {
      next(e);
    }
  });
});

dbBackupRouter.post('/restore/:name', requireMasterAccess, async (req, res) => {
  const name = String(req.params.name ?? '');
  if (!isSafeBackupName(name)) throw BadRequest('Nama file tidak valid.');
  assertConfirm(req.body?.confirm);
  const files = await listBackups();
  if (!files.some((f) => f.name === name)) throw NotFound('File backup tidak ditemukan.');
  const job = doRestore(req, name);
  res.status(202).json({ success: true, data: job });
});
