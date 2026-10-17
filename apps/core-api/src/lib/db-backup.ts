/**
 * Backup & restore database PostgreSQL (menu Maintenance di portal).
 *
 * - Backup  : `pg_dump -Fc` (format custom, terkompresi) → file di
 *             DB_BACKUP_DIR dengan nama berdasarkan waktu WIB, mis.
 *             `ecc-db_2026-10-17_23-45-12_WIB.dump`.
 * - Restore : `pg_restore --clean --if-exists --single-transaction` →
 *             atomik: kalau gagal di tengah, database kembali seperti semula.
 *             Sebelum restore selalu dibuat backup otomatis (`_pre-restore`)
 *             dan maintenance mode dinyalakan selama proses.
 *
 * Job berjalan async (spawn child process) dengan status di memori; portal
 * mem-poll status. Butuh `pg_dump` / `pg_restore` (paket postgresql-client)
 * dengan versi ≥ versi server PostgreSQL.
 */
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readdir, stat, unlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { prisma } from '@ecc/database';
import { logger } from './logger.js';

export const BACKUP_DIR = process.env.DB_BACKUP_DIR || path.join(os.homedir(), 'ecc-db-backups');
const BACKUP_RE = /^[A-Za-z0-9._-]+\.(dump|backup)$/;

/** Nama file aman (tanpa path traversal). */
export function isSafeBackupName(name: string): boolean {
  return BACKUP_RE.test(name) && !name.includes('..');
}

/** `ecc-db_YYYY-MM-DD_HH-mm-ss_WIB[_label].dump` dari waktu `now` (zona WIB). */
export function backupFileName(now: Date = new Date(), label?: string): string {
  const w = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp = `${w.getUTCFullYear()}-${p(w.getUTCMonth() + 1)}-${p(w.getUTCDate())}_${p(w.getUTCHours())}-${p(w.getUTCMinutes())}-${p(w.getUTCSeconds())}`;
  const suffix = label ? `_${label.replace(/[^A-Za-z0-9-]/g, '')}` : '';
  return `ecc-db_${stamp}_WIB${suffix}.dump`;
}

/**
 * DATABASE_URL Prisma → URI yang diterima pg_dump/pg_restore. Parameter khusus
 * Prisma (schema, connection_limit, pgbouncer, …) dibuang; sslmode dipertahankan.
 */
export function pgConnUrl(raw: string | undefined = process.env.DATABASE_URL): string {
  if (!raw) throw new Error('DATABASE_URL belum di-set.');
  const u = new URL(raw);
  const keep = new Set(['sslmode', 'sslcert', 'sslkey', 'sslrootcert', 'application_name', 'connect_timeout']);
  for (const k of [...u.searchParams.keys()]) if (!keep.has(k)) u.searchParams.delete(k);
  return u.toString();
}

export interface BackupFile {
  name: string;
  size: number;
  createdAt: string;
  kind: 'manual' | 'pre-restore' | 'upload';
}

export async function listBackups(): Promise<BackupFile[]> {
  await mkdir(BACKUP_DIR, { recursive: true });
  const names = (await readdir(BACKUP_DIR)).filter(isSafeBackupName);
  const files = await Promise.all(
    names.map(async (name) => {
      const st = await stat(path.join(BACKUP_DIR, name));
      const kind: BackupFile['kind'] = name.includes('_pre-restore') ? 'pre-restore' : name.startsWith('upload_') ? 'upload' : 'manual';
      return { name, size: st.size, createdAt: st.mtime.toISOString(), kind };
    }),
  );
  return files.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function deleteBackup(name: string): Promise<void> {
  if (!isSafeBackupName(name)) throw new Error('Nama file tidak valid.');
  await unlink(path.join(BACKUP_DIR, name));
}

export const backupPath = (name: string) => path.join(BACKUP_DIR, name);

// ------------------------------------------------------------------ jobs

export type DbJobKind = 'BACKUP' | 'RESTORE';
export interface DbJob {
  id: string;
  kind: DbJobKind;
  status: 'RUNNING' | 'SUCCESS' | 'FAILED';
  step: string;
  file: string | null;
  safetyBackup: string | null;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
  log: string[];
  byUserId: string | null;
}

const jobs = new Map<string, DbJob>();
let running: DbJob | null = null;

export function getJob(id: string): DbJob | null {
  return jobs.get(id) ?? null;
}
export function listJobs(): DbJob[] {
  return [...jobs.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 10);
}
export const runningJob = () => running;

function run(cmd: string, args: string[], job: DbJob): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { env: { ...process.env, PGCONNECT_TIMEOUT: '15' } });
    let out = '';
    const push = (d: Buffer) => {
      const text = d.toString();
      out += text;
      for (const line of text.split('\n').filter(Boolean)) {
        job.log.push(line.slice(0, 500));
        if (job.log.length > 200) job.log.shift();
      }
    };
    child.stdout.on('data', push);
    child.stderr.on('data', push);
    child.on('error', (e) => reject(new Error(`${cmd} tidak bisa dijalankan: ${e.message}. Pastikan postgresql-client terpasang.`)));
    child.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(`${cmd} keluar dengan kode ${code}`))));
  });
}

/** Versi pg_dump / pg_restore yang terpasang (null kalau tidak ada). */
export async function toolVersions(): Promise<{ pgDump: string | null; pgRestore: string | null }> {
  const v = (cmd: string) =>
    new Promise<string | null>((resolve) => {
      const c = spawn(cmd, ['--version']);
      let o = '';
      c.stdout.on('data', (d) => (o += d.toString()));
      c.on('error', () => resolve(null));
      c.on('close', (code) => resolve(code === 0 ? o.trim() : null));
    });
  const [pgDump, pgRestore] = await Promise.all([v('pg_dump'), v('pg_restore')]);
  return { pgDump, pgRestore };
}

async function dumpTo(name: string, job: DbJob): Promise<string> {
  await mkdir(BACKUP_DIR, { recursive: true });
  const file = path.join(BACKUP_DIR, name);
  await run('pg_dump', ['--format=custom', '--no-owner', '--no-privileges', `--file=${file}`, `--dbname=${pgConnUrl()}`], job);
  return name;
}

function newJob(kind: DbJobKind, byUserId: string | null): DbJob {
  if (running) throw new Error(`Masih ada proses ${running.kind.toLowerCase()} yang berjalan. Tunggu sampai selesai.`);
  const job: DbJob = {
    id: randomUUID(),
    kind,
    status: 'RUNNING',
    step: 'Memulai',
    file: null,
    safetyBackup: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    error: null,
    log: [],
    byUserId,
  };
  jobs.set(job.id, job);
  running = job;
  return job;
}

function finish(job: DbJob, err?: unknown) {
  job.status = err ? 'FAILED' : 'SUCCESS';
  job.error = err ? (err instanceof Error ? err.message : String(err)) : null;
  job.step = err ? 'Gagal' : 'Selesai';
  job.finishedAt = new Date().toISOString();
  running = null;
  if (err) logger.error({ err, jobId: job.id, kind: job.kind }, '[db-backup] job gagal');
}

/** Mulai backup async. */
export function startBackup(byUserId: string | null): DbJob {
  const job = newJob('BACKUP', byUserId);
  const name = backupFileName();
  job.file = name;
  job.step = 'Membuat backup (pg_dump)';
  dumpTo(name, job)
    .then(() => finish(job))
    .catch(async (e) => {
      await unlink(path.join(BACKUP_DIR, name)).catch(() => {});
      finish(job, e);
    });
  return job;
}

async function setMaintenance(on: boolean, message: string | null, byUserId: string | null) {
  await prisma.maintenanceMode.upsert({
    where: { id: 'global' },
    create: { id: 'global', isEnabled: on, message, startedAt: on ? new Date() : null, updatedByUserId: byUserId },
    update: { isEnabled: on, message, startedAt: on ? new Date() : null, estimatedEndAt: null, updatedByUserId: byUserId },
  });
}

/**
 * Restore dari file backup di BACKUP_DIR. Langkah:
 *   1. Validasi file (`pg_restore --list`)
 *   2. Backup otomatis kondisi sekarang (`_pre-restore`)
 *   3. Nyalakan maintenance mode
 *   4. `pg_restore --clean --if-exists --single-transaction` (atomik)
 *   5. Kembalikan maintenance mode ke kondisi sebelumnya
 */
export function startRestore(fileName: string, byUserId: string | null): DbJob {
  if (!isSafeBackupName(fileName)) throw new Error('Nama file tidak valid.');
  const job = newJob('RESTORE', byUserId);
  job.file = fileName;
  const file = path.join(BACKUP_DIR, fileName);

  (async () => {
    job.step = 'Memeriksa file backup';
    await run('pg_restore', ['--list', file], job);

    job.step = 'Membuat backup pengaman (pre-restore)';
    job.safetyBackup = await dumpTo(backupFileName(new Date(), 'pre-restore'), job);

    const before = await prisma.maintenanceMode.findUnique({ where: { id: 'global' } });
    job.step = 'Menyalakan maintenance mode';
    await setMaintenance(true, 'Sedang pemulihan data. Mohon tunggu sebentar.', byUserId);

    let restoreErr: unknown = null;
    try {
      job.step = 'Memulihkan database (pg_restore)';
      await run(
        'pg_restore',
        ['--clean', '--if-exists', '--no-owner', '--no-privileges', '--single-transaction', '--exit-on-error', `--dbname=${pgConnUrl()}`, file],
        job,
      );
    } catch (e) {
      restoreErr = e;
    }

    job.step = 'Mengembalikan maintenance mode';
    // Tabel maintenance_mode ikut ter-restore → set ulang ke kondisi sebelum restore.
    await setMaintenance(before?.isEnabled ?? false, before?.message ?? null, byUserId).catch(() => {});
    if (restoreErr) throw restoreErr;
  })()
    .then(() => finish(job))
    .catch((e) => finish(job, e));
  return job;
}
