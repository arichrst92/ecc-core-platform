/**
 * ECC Worship — portal admin — /admin/worship
 * Akses: menu "ecc-worship" (read = lihat; write = ubah/unggah/Elsa; delete = hapus).
 */
import { Router, type Request } from 'express';
import { prisma, type Prisma } from '@ecc/database';
import { z } from 'zod';
import {
  WORSHIP_ALBUM_TIPE,
  createWorshipAlbumSchema,
  createWorshipSongSchema,
  reorderIdsSchema,
  saveSyncSchema,
  updateWorshipAlbumSchema,
  updateWorshipSongSchema,
} from '@ecc/shared-types';
import { BadRequest, Conflict, NotFound } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { flexImageUpload } from '../../lib/image-upload.js';
import { requireMenu } from '../../middleware/require-menu.js';
import { MENU, UUID_RE, absUrl, apiBase } from '../../lib/worship.js';
import {
  audioUpload,
  deleteWorshipCover,
  deleteWorshipFile,
  saveWorshipAudio,
  saveWorshipCover,
  signedMediaPath,
} from '../../lib/worship-media.js';
import { parseLrc } from '../../lib/worship-align.js';
import { isNightWindow, killRunningElsaJob } from '../../lib/worship-elsa.js';

export const worshipAdminRouter = Router();
worshipAdminRouter.use(requireMenu(MENU));
const W = requireMenu(MENU, 'write');
const D = requireMenu(MENU, 'delete');

const songSelect = {
  id: true,
  albumId: true,
  judul: true,
  ciptaan: true,
  tahun: true,
  lirik: true,
  lirikSinkron: true,
  urutan: true,
  isPublished: true,
  audioFile: true,
  audioSize: true,
  durasi: true,
  karaokeFile: true,
  karaokeSize: true,
  karaokeDurasi: true,
  playsVokal: true,
  playsKaraoke: true,
  updatedAt: true,
  syncJobs: {
    orderBy: { createdAt: 'desc' },
    take: 1,
    select: { id: true, status: true, quality: true, stage: true, progress: true, etaSec: true, createdAt: true },
  },
} satisfies Prisma.WorshipSongSelect;

type SongRow = Prisma.WorshipSongGetPayload<{ select: typeof songSelect }>;
function serializeSong(s: SongRow) {
  const { syncJobs, audioFile, karaokeFile, ...rest } = s;
  return {
    ...rest,
    hasAudio: !!audioFile,
    hasKaraoke: !!karaokeFile,
    syncedLines: Array.isArray(s.lirikSinkron) ? (s.lirikSinkron as unknown[]).length : 0,
    lastJob: syncJobs[0] ?? null,
  };
}

const albumSelect = {
  id: true,
  tipe: true,
  judul: true,
  tahun: true,
  deskripsi: true,
  coverUrl: true,
  urutan: true,
  isPublished: true,
  createdAt: true,
  updatedAt: true,
  songs: { orderBy: [{ urutan: 'asc' }, { createdAt: 'asc' }], select: songSelect },
} satisfies Prisma.WorshipAlbumSelect;

type AlbumRow = Prisma.WorshipAlbumGetPayload<{ select: typeof albumSelect }>;
function serializeAlbum(req: Request, a: AlbumRow) {
  return { ...a, coverUrl: absUrl(req, a.coverUrl), songs: a.songs.map(serializeSong) };
}

function idOf(v: string | undefined, label: string) {
  const id = String(v ?? '');
  if (!UUID_RE.test(id)) throw NotFound(`${label} tidak ditemukan`);
  return id;
}

async function loadAlbum(id: string) {
  const a = await prisma.worshipAlbum.findUnique({ where: { id }, select: albumSelect });
  if (!a) throw NotFound('Album tidak ditemukan');
  return a;
}
async function loadSong(id: string) {
  const s = await prisma.worshipSong.findUnique({
    where: { id },
    select: { ...songSelect, audioFile: true, karaokeFile: true, album: { select: { id: true, tipe: true, judul: true, coverUrl: true, isPublished: true } } },
  });
  if (!s) throw NotFound('Lagu tidak ditemukan');
  return s;
}

// ── Album ───────────────────────────────────────────────────
worshipAdminRouter.get('/albums', async (req, res) => {
  const tipe = (WORSHIP_ALBUM_TIPE as readonly string[]).includes(String(req.query.tipe)) ? (String(req.query.tipe) as 'ALBUM' | 'SINGLE') : undefined;
  const rows = await prisma.worshipAlbum.findMany({
    where: tipe ? { tipe } : {},
    orderBy: [{ urutan: 'asc' }, { createdAt: 'desc' }],
    select: albumSelect,
  });
  res.json({ success: true, data: rows.map((a) => serializeAlbum(req, a)) });
});

worshipAdminRouter.get('/albums/:id', async (req, res) => {
  res.json({ success: true, data: serializeAlbum(req, await loadAlbum(idOf(req.params.id, 'Album'))) });
});

worshipAdminRouter.post('/albums', W, async (req, res) => {
  const input = createWorshipAlbumSchema.parse(req.body ?? {});
  const last = await prisma.worshipAlbum.findFirst({ where: { tipe: input.tipe }, orderBy: { urutan: 'desc' }, select: { urutan: true } });
  const created = await prisma.worshipAlbum.create({
    data: { ...input, tahun: input.tahun ?? null, urutan: (last?.urutan ?? -1) + 1 },
    select: albumSelect,
  });
  audit(req, { action: 'CREATE', resource: 'worship_album', resourceId: created.id, resourceLabel: `${input.tipe} ${input.judul}` });
  res.status(201).json({ success: true, data: serializeAlbum(req, created) });
});

worshipAdminRouter.patch('/albums/:id', W, async (req, res) => {
  const a = await loadAlbum(idOf(req.params.id, 'Album'));
  const input = updateWorshipAlbumSchema.parse(req.body ?? {});
  if (input.isPublished && !a.songs.some((s) => s.audioFile && s.isPublished)) {
    throw BadRequest('Belum ada lagu dengan audio — unggah audio vokal dulu sebelum dipublikasikan.');
  }
  const body = req.body ?? {};
  const updated = await prisma.worshipAlbum.update({
    where: { id: a.id },
    data: {
      judul: input.judul,
      tahun: 'tahun' in body ? (input.tahun ?? null) : undefined,
      deskripsi: 'deskripsi' in body ? input.deskripsi : undefined,
      isPublished: input.isPublished,
    },
    select: albumSelect,
  });
  // Single: judul lagu ikut judul album.
  if (a.tipe === 'SINGLE' && input.judul && a.songs[0]) {
    await prisma.worshipSong.update({ where: { id: a.songs[0].id }, data: { judul: input.judul } });
  }
  audit(req, { action: 'UPDATE', resource: 'worship_album', resourceId: a.id, resourceLabel: updated.judul, metadata: input });
  res.json({ success: true, data: serializeAlbum(req, await loadAlbum(a.id)) });
});

worshipAdminRouter.delete('/albums/:id', D, async (req, res) => {
  const a = await loadAlbum(idOf(req.params.id, 'Album'));
  const files = await prisma.worshipSong.findMany({ where: { albumId: a.id }, select: { audioFile: true, karaokeFile: true } });
  await prisma.worshipAlbum.delete({ where: { id: a.id } });
  for (const f of files) {
    await deleteWorshipFile(f.audioFile);
    await deleteWorshipFile(f.karaokeFile);
  }
  await deleteWorshipCover(a.id);
  audit(req, { action: 'DELETE', resource: 'worship_album', resourceId: a.id, resourceLabel: a.judul });
  res.json({ success: true });
});

worshipAdminRouter.post('/albums/:id/cover', W, flexImageUpload({ maxBytes: 8 * 1024 * 1024 }), async (req, res) => {
  const a = await loadAlbum(idOf(req.params.id, 'Album'));
  if (!req.file) throw BadRequest('File cover wajib diunggah.');
  const coverUrl = await saveWorshipCover(a.id, req.file.buffer);
  await prisma.worshipAlbum.update({ where: { id: a.id }, data: { coverUrl } });
  res.json({ success: true, data: { coverUrl: absUrl(req, coverUrl) } });
});

worshipAdminRouter.post('/albums/reorder', W, async (req, res) => {
  const { ids } = reorderIdsSchema.parse(req.body ?? {});
  await prisma.$transaction(ids.map((id, i) => prisma.worshipAlbum.updateMany({ where: { id }, data: { urutan: i } })));
  res.json({ success: true });
});

// ── Lagu ────────────────────────────────────────────────────
worshipAdminRouter.post('/albums/:id/songs', W, async (req, res) => {
  const a = await loadAlbum(idOf(req.params.id, 'Album'));
  if (a.tipe === 'SINGLE' && a.songs.length >= 1) throw Conflict('Single hanya berisi 1 lagu.');
  const input = createWorshipSongSchema.parse(req.body ?? {});
  const created = await prisma.worshipSong.create({
    data: { albumId: a.id, ...input, tahun: input.tahun ?? a.tahun ?? null, urutan: a.songs.length },
    select: songSelect,
  });
  audit(req, { action: 'CREATE', resource: 'worship_song', resourceId: created.id, resourceLabel: `${a.judul} — ${created.judul}` });
  res.status(201).json({ success: true, data: serializeSong(created) });
});

worshipAdminRouter.post('/albums/:id/songs/reorder', W, async (req, res) => {
  const a = await loadAlbum(idOf(req.params.id, 'Album'));
  const { ids } = reorderIdsSchema.parse(req.body ?? {});
  await prisma.$transaction(
    ids.map((id, i) => prisma.worshipSong.updateMany({ where: { id, albumId: a.id }, data: { urutan: i } })),
  );
  res.json({ success: true });
});

worshipAdminRouter.get('/songs/:id', async (req, res) => {
  const s = await loadSong(idOf(req.params.id, 'Lagu'));
  const { album, ...rest } = s;
  res.json({ success: true, data: { ...serializeSong(rest), album: { ...album, coverUrl: absUrl(req, album.coverUrl) } } });
});

worshipAdminRouter.patch('/songs/:id', W, async (req, res) => {
  const s = await loadSong(idOf(req.params.id, 'Lagu'));
  const input = updateWorshipSongSchema.parse(req.body ?? {});
  const body = req.body ?? {};
  await prisma.worshipSong.update({
    where: { id: s.id },
    data: {
      judul: input.judul,
      ciptaan: 'ciptaan' in body ? input.ciptaan : undefined,
      tahun: 'tahun' in body ? (input.tahun ?? null) : undefined,
      lirik: 'lirik' in body ? input.lirik : undefined,
      isPublished: input.isPublished,
    },
  });
  if (s.album.tipe === 'SINGLE' && input.judul) {
    await prisma.worshipAlbum.update({ where: { id: s.album.id }, data: { judul: input.judul } });
  }
  const fresh = await loadSong(s.id);
  const { album, ...rest } = fresh;
  res.json({ success: true, data: { ...serializeSong(rest), album } });
});

worshipAdminRouter.delete('/songs/:id', D, async (req, res) => {
  const s = await loadSong(idOf(req.params.id, 'Lagu'));
  await prisma.worshipSong.delete({ where: { id: s.id } });
  await deleteWorshipFile(s.audioFile);
  await deleteWorshipFile(s.karaokeFile);
  audit(req, { action: 'DELETE', resource: 'worship_song', resourceId: s.id, resourceLabel: s.judul });
  res.json({ success: true });
});

worshipAdminRouter.post('/songs/:id/audio/:mode', W, audioUpload(), async (req, res) => {
  const s = await loadSong(idOf(req.params.id, 'Lagu'));
  const mode = req.params.mode === 'KARAOKE' ? 'KARAOKE' : req.params.mode === 'VOKAL' ? 'VOKAL' : null;
  if (!mode) throw BadRequest('Mode harus VOKAL atau KARAOKE.');
  if (!req.file) throw BadRequest('File audio wajib diunggah.');
  const saved = await saveWorshipAudio(s.id, mode, req.file);
  const old = mode === 'VOKAL' ? s.audioFile : s.karaokeFile;
  await prisma.worshipSong.update({
    where: { id: s.id },
    data:
      mode === 'VOKAL'
        ? { audioFile: saved.file, audioMime: saved.mime, audioSize: saved.size, durasi: saved.durasi }
        : { karaokeFile: saved.file, karaokeMime: saved.mime, karaokeSize: saved.size, karaokeDurasi: saved.durasi },
  });
  await deleteWorshipFile(old);
  audit(req, { action: 'UPDATE', resource: 'worship_song', resourceId: s.id, resourceLabel: `Audio ${mode} ${s.judul}`, metadata: { size: saved.size, durasi: saved.durasi } });
  res.json({ success: true, data: { mode, size: saved.size, durasi: saved.durasi } });
});

worshipAdminRouter.delete('/songs/:id/audio/KARAOKE', W, async (req, res) => {
  const s = await loadSong(idOf(req.params.id, 'Lagu'));
  await prisma.worshipSong.update({
    where: { id: s.id },
    data: { karaokeFile: null, karaokeMime: null, karaokeSize: null, karaokeDurasi: null },
  });
  await deleteWorshipFile(s.karaokeFile);
  res.json({ success: true });
});

worshipAdminRouter.get('/songs/:id/play-url', async (req, res) => {
  const s = await loadSong(idOf(req.params.id, 'Lagu'));
  const mode = req.query.mode === 'KARAOKE' ? 'KARAOKE' : 'VOKAL';
  if (mode === 'VOKAL' ? !s.audioFile : !s.karaokeFile) throw NotFound('Audio belum diunggah.');
  const p = signedMediaPath(s.id, mode);
  res.json({ success: true, data: { url: `${apiBase(req)}${p.path}`, expiresAt: p.expiresAt } });
});

// ── Sinkron lirik ───────────────────────────────────────────
worshipAdminRouter.put('/songs/:id/sync', W, async (req, res) => {
  const s = await loadSong(idOf(req.params.id, 'Lagu'));
  const { lines } = saveSyncSchema.parse(req.body ?? {});
  const sorted = [...lines].sort((a, b) => a.t - b.t);
  await prisma.worshipSong.update({ where: { id: s.id }, data: { lirikSinkron: sorted as never } });
  audit(req, { action: 'UPDATE', resource: 'worship_song', resourceId: s.id, resourceLabel: `Sinkron lirik ${s.judul} (${sorted.length} baris)` });
  res.json({ success: true, data: { lines: sorted } });
});

worshipAdminRouter.delete('/songs/:id/sync', W, async (req, res) => {
  const s = await loadSong(idOf(req.params.id, 'Lagu'));
  await prisma.worshipSong.update({ where: { id: s.id }, data: { lirikSinkron: null as never } });
  res.json({ success: true });
});

worshipAdminRouter.post('/songs/:id/sync/lrc', W, async (req, res) => {
  await loadSong(idOf(req.params.id, 'Lagu'));
  const { text } = z.object({ text: z.string().min(1).max(200_000) }).parse(req.body ?? {});
  const lines = parseLrc(text);
  if (!lines.length) throw BadRequest('File .lrc tidak berisi baris bertimestamp.');
  // Hanya parse — admin meninjau dulu lalu menyimpan lewat PUT /sync.
  res.json({ success: true, data: { lines } });
});

// ── Sinkronkan dengan Elsa ──────────────────────────────────
const jobSelect = {
  id: true,
  songId: true,
  status: true,
  quality: true,
  stage: true,
  progress: true,
  processedSec: true,
  etaSec: true,
  threads: true,
  preview: true,
  result: true,
  error: true,
  startedAt: true,
  finishedAt: true,
  createdAt: true,
} satisfies Prisma.WorshipSyncJobSelect;

async function withQueuePos<T extends { id: string; status: string; quality: string; createdAt: Date }>(job: T) {
  if (job.status !== 'QUEUED') return { ...job, queuePosition: null, waitingForNight: false };
  const ahead = await prisma.worshipSyncJob.count({
    where: { status: { in: ['QUEUED', 'RUNNING'] }, createdAt: { lt: job.createdAt } },
  });
  return { ...job, queuePosition: ahead + 1, waitingForNight: job.quality === 'TELITI' && !isNightWindow() };
}

worshipAdminRouter.get('/songs/:id/elsa', async (req, res) => {
  const s = await loadSong(idOf(req.params.id, 'Lagu'));
  const job = await prisma.worshipSyncJob.findFirst({ where: { songId: s.id }, orderBy: { createdAt: 'desc' }, select: jobSelect });
  res.json({ success: true, data: job ? await withQueuePos(job) : null });
});

worshipAdminRouter.post('/songs/:id/elsa', W, async (req, res) => {
  const s = await loadSong(idOf(req.params.id, 'Lagu'));
  const { quality } = z.object({ quality: z.enum(['CEPAT', 'TELITI']).default('CEPAT') }).parse(req.body ?? {});
  if (!s.audioFile) throw BadRequest('Unggah audio vokal dulu.');
  if (!s.lirik?.trim()) throw BadRequest('Ketik lirik lagu dulu — Elsa mencocokkan suara ke lirik.');
  const active = await prisma.worshipSyncJob.findFirst({ where: { songId: s.id, status: { in: ['QUEUED', 'RUNNING'] } }, select: { id: true } });
  if (active) throw Conflict('Elsa sedang/akan memproses lagu ini.');
  const job = await prisma.worshipSyncJob.create({
    data: { songId: s.id, quality, requestedById: req.user!.jemaatId },
    select: jobSelect,
  });
  audit(req, { action: 'CREATE', resource: 'worship_sync_job', resourceId: job.id, resourceLabel: `Elsa sinkron ${s.judul} (${quality})` });
  res.status(201).json({ success: true, data: await withQueuePos(job) });
});

worshipAdminRouter.post('/elsa/:jobId/cancel', W, async (req, res) => {
  const id = idOf(req.params.jobId, 'Proses');
  const r = await prisma.worshipSyncJob.updateMany({
    where: { id, status: { in: ['QUEUED', 'RUNNING'] } },
    data: { status: 'CANCELLED', finishedAt: new Date() },
  });
  if (!r.count) throw BadRequest('Proses sudah selesai.');
  killRunningElsaJob(id);
  res.json({ success: true });
});

worshipAdminRouter.get('/elsa/active', async (_req, res) => {
  const rows = await prisma.worshipSyncJob.findMany({
    where: { status: { in: ['QUEUED', 'RUNNING'] } },
    orderBy: { createdAt: 'asc' },
    select: { id: true, songId: true, status: true, quality: true, stage: true, progress: true, etaSec: true, createdAt: true },
  });
  res.json({
    success: true,
    data: rows.map((r, i) => ({ ...r, queuePosition: r.status === 'QUEUED' ? i + 1 : null, waitingForNight: r.status === 'QUEUED' && r.quality === 'TELITI' && !isNightWindow() })),
  });
});

// ── Statistik ───────────────────────────────────────────────
worshipAdminRouter.get('/stats', async (_req, res) => {
  const since = new Date(Date.now() - 30 * 86400_000);
  const [songs, plays30, fav, dl, dl30] = await Promise.all([
    prisma.worshipSong.findMany({
      select: { id: true, judul: true, playsVokal: true, playsKaraoke: true, album: { select: { judul: true, tipe: true } } },
    }),
    prisma.worshipPlay.groupBy({ by: ['songId', 'mode'], where: { createdAt: { gte: since } }, _count: { _all: true } }),
    prisma.worshipFavorite.groupBy({ by: ['songId'], _count: { _all: true } }),
    prisma.worshipDownload.groupBy({ by: ['songId'], _count: { _all: true } }),
    prisma.worshipDownload.groupBy({ by: ['songId'], where: { createdAt: { gte: since } }, _count: { _all: true } }),
  ]);
  const p30 = new Map<string, { VOKAL: number; KARAOKE: number }>();
  for (const p of plays30) {
    const cur = p30.get(p.songId) ?? { VOKAL: 0, KARAOKE: 0 };
    cur[p.mode] = p._count._all;
    p30.set(p.songId, cur);
  }
  const m = (rows: { songId: string; _count: { _all: number } }[]) => new Map(rows.map((r) => [r.songId, r._count._all]));
  const favM = m(fav);
  const dlM = m(dl);
  const dl30M = m(dl30);
  const data = songs
    .map((s) => {
      const r30 = p30.get(s.id) ?? { VOKAL: 0, KARAOKE: 0 };
      return {
        songId: s.id,
        judul: s.judul,
        album: s.album.judul,
        tipe: s.album.tipe,
        plays: { vokal: s.playsVokal, karaoke: s.playsKaraoke, total: s.playsVokal + s.playsKaraoke },
        plays30: { vokal: r30.VOKAL, karaoke: r30.KARAOKE, total: r30.VOKAL + r30.KARAOKE },
        likes: favM.get(s.id) ?? 0,
        downloads: dlM.get(s.id) ?? 0,
        downloads30: dl30M.get(s.id) ?? 0,
      };
    })
    .sort((a, b) => b.plays30.total - a.plays30.total || b.plays.total - a.plays.total);
  res.json({ success: true, data });
});
