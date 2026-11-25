/**
 * Video Channel — Portal (Broadcast → Video Channel), 2026-12. Role Access menu
 * `video-channel` (read = lihat, write = tambah/ubah, delete = hapus).
 * Universal (semua cabang), seperti ECC Worship. Hanya video YouTube biasa.
 *
 *   GET    /kategori             daftar kategori (+ jumlah video)
 *   POST   /kategori             { nama, isActive }
 *   PATCH  /kategori/:id         { nama, isActive }
 *   PUT    /kategori/order       { ids }
 *   DELETE /kategori/:id         video di dalamnya menjadi tanpa kategori
 *   POST   /resolve              { url } → { youtubeId, judul, channelNama, thumbnailUrl, existingId }
 *   GET    /                     ?q=&kategoriId=&status=published|draft|scheduled
 *   GET    /:id
 *   POST   /                     videoInputSchema
 *   PATCH  /:id                  videoInputSchema
 *   DELETE /:id                  (video hasil sinkron → dicatat agar tidak diimpor ulang)
 *
 *   Sinkron channel YouTube ECC (lib/video-youtube-sync.ts):
 *   GET    /youtube              { configured, running, sources, lastRun, runs, ignoredCount }
 *   POST   /youtube/playlists    muat ulang daftar playlist channel
 *   PATCH  /youtube/sources/:id  { isEnabled?, kategoriId? | '__new__' } (kategori baru = nama playlist)
 *   PUT    /youtube/sources/order { ids } — prioritas kategori
 *   POST   /youtube/sync         jalankan sinkron sekarang (berjalan di latar)
 *   GET    /youtube/ignored      video yang dihapus admin (tidak diimpor ulang)
 *   DELETE /youtube/ignored/:youtubeId  izinkan diimpor lagi pada sinkron berikutnya
 */
import { Router, type Request } from 'express';
import { prisma, type Prisma } from '@ecc/database';
import { parseYoutubeVideoId, videoInputSchema, videoKategoriOrderSchema, videoKategoriSchema, youtubeLinkKind, youtubeThumb } from '@ecc/shared-types';
import { requireMenu } from '../../middleware/require-menu.js';
import { BadRequest, Conflict, NotFound } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { UUID_RE, youtubeOembed } from '../../lib/video-channel.js';
import { isYoutubeSyncRunning, refreshYoutubeSources, runYoutubeSync, youtubeKey, YT_SYNC_CHANNELS } from '../../lib/video-youtube-sync.js';
import { logger } from '../../lib/logger.js';

export const videoChannelRouter = Router();
const MENU = 'video-channel';
const R = requireMenu(MENU);
const W = requireMenu(MENU, 'write');
const D = requireMenu(MENU, 'delete');

const pid = (v: string | undefined, what = 'Video') => {
  if (!v || !UUID_RE.test(v)) throw NotFound(`${what} tidak ditemukan`);
  return v;
};
const str = (req: Request, k: string) => (typeof req.query[k] === 'string' && req.query[k] ? String(req.query[k]) : undefined);

function linkError(url: string): never {
  const kind = youtubeLinkKind(url);
  if (kind === 'shorts') throw BadRequest('Link YouTube Shorts tidak didukung. Gunakan link video biasa.');
  if (kind === 'live') throw BadRequest('Link siaran live tidak didukung. Gunakan link video biasa (setelah siaran selesai).');
  if (kind === 'playlist') throw BadRequest('Link playlist tidak didukung. Buka salah satu video lalu salin link-nya.');
  throw BadRequest('Link YouTube tidak dikenali. Contoh: https://www.youtube.com/watch?v=xxxxxxxxxxx');
}

// ------------------------------------------------------------------ kategori

videoChannelRouter.get('/kategori', R, async (_req, res) => {
  const rows = await prisma.videoKategori.findMany({
    orderBy: [{ urutan: 'asc' }, { nama: 'asc' }],
    include: { _count: { select: { videos: true } } },
  });
  res.json({ success: true, data: rows.map(({ _count, ...k }) => ({ ...k, jumlahVideo: _count.videos })) });
});

videoChannelRouter.post('/kategori', W, async (req, res) => {
  const input = videoKategoriSchema.parse(req.body ?? {});
  const max = await prisma.videoKategori.aggregate({ _max: { urutan: true } });
  const k = await prisma.videoKategori.create({ data: { ...input, urutan: (max._max.urutan ?? 0) + 1 } });
  audit(req, { action: 'CREATE', resource: 'video_kategori', resourceId: k.id, resourceLabel: k.nama });
  res.status(201).json({ success: true, data: k });
});

videoChannelRouter.put('/kategori/order', W, async (req, res) => {
  const { ids } = videoKategoriOrderSchema.parse(req.body ?? {});
  await prisma.$transaction(ids.map((id, i) => prisma.videoKategori.updateMany({ where: { id }, data: { urutan: i + 1 } })));
  res.json({ success: true, data: { ok: true } });
});

videoChannelRouter.patch('/kategori/:id', W, async (req, res) => {
  const id = pid(req.params.id, 'Kategori');
  const input = videoKategoriSchema.parse(req.body ?? {});
  const k = await prisma.videoKategori.update({ where: { id }, data: input }).catch(() => null);
  if (!k) throw NotFound('Kategori tidak ditemukan');
  audit(req, { action: 'UPDATE', resource: 'video_kategori', resourceId: k.id, resourceLabel: k.nama });
  res.json({ success: true, data: k });
});

videoChannelRouter.delete('/kategori/:id', D, async (req, res) => {
  const id = pid(req.params.id, 'Kategori');
  const k = await prisma.videoKategori.delete({ where: { id } }).catch(() => null);
  if (!k) throw NotFound('Kategori tidak ditemukan');
  audit(req, { action: 'DELETE', resource: 'video_kategori', resourceId: id, resourceLabel: k.nama });
  res.json({ success: true, data: { deleted: true } });
});

// ------------------------------------------------------------------ sinkron YouTube

videoChannelRouter.get('/youtube', R, async (_req, res) => {
  const [sources, runs, ignoredCount, counts] = await Promise.all([
    prisma.videoYoutubeSource.findMany({ orderBy: [{ urutan: 'asc' }] }),
    prisma.videoSyncRun.findMany({ orderBy: { startedAt: 'desc' }, take: 10 }),
    prisma.videoYoutubeIgnore.count(),
    prisma.video.groupBy({ by: ['sourcePlaylistId'], where: { sumber: 'YOUTUBE' }, _count: { _all: true } }),
  ]);
  const imported = new Map(counts.map((c) => [c.sourcePlaylistId, c._count._all]));
  res.json({
    success: true,
    data: {
      configured: !!youtubeKey(),
      running: isYoutubeSyncRunning(),
      channels: YT_SYNC_CHANNELS,
      sources: sources.map((s) => ({ ...s, imported: imported.get(s.playlistId) ?? 0 })),
      lastRun: runs[0] ?? null,
      runs,
      ignoredCount,
    },
  });
});

videoChannelRouter.post('/youtube/playlists', W, async (req, res) => {
  if (!youtubeKey()) throw BadRequest('YOUTUBE_API_KEY belum diisi di server.');
  const r = await refreshYoutubeSources().catch((e: Error) => {
    throw BadRequest(e.message);
  });
  audit(req, { action: 'UPDATE', resource: 'video_youtube_source', resourceLabel: 'Muat ulang playlist YouTube' });
  res.json({ success: true, data: r });
});

videoChannelRouter.put('/youtube/sources/order', W, async (req, res) => {
  const { ids } = videoKategoriOrderSchema.parse(req.body ?? {});
  await prisma.$transaction(ids.map((id, i) => prisma.videoYoutubeSource.updateMany({ where: { id, isUploads: false }, data: { urutan: i + 1 } })));
  res.json({ success: true, data: { ok: true } });
});

videoChannelRouter.patch('/youtube/sources/:id', W, async (req, res) => {
  const id = pid(req.params.id, 'Playlist');
  const src = await prisma.videoYoutubeSource.findUnique({ where: { id } });
  if (!src) throw NotFound('Playlist tidak ditemukan');
  const body = (req.body ?? {}) as { isEnabled?: unknown; kategoriId?: unknown };
  const data: { isEnabled?: boolean; kategoriId?: string | null } = {};
  if (typeof body.isEnabled === 'boolean') data.isEnabled = body.isEnabled;
  if (body.kategoriId !== undefined) {
    if (body.kategoriId === null || body.kategoriId === '') data.kategoriId = null;
    else if (body.kategoriId === '__new__') {
      const nama = src.judul.replace(/^Semua unggahan — /, '').slice(0, 100);
      const found = await prisma.videoKategori.findFirst({ where: { nama: { equals: nama, mode: 'insensitive' } } });
      if (found) data.kategoriId = found.id;
      else {
        const max = await prisma.videoKategori.aggregate({ _max: { urutan: true } });
        data.kategoriId = (await prisma.videoKategori.create({ data: { nama, urutan: (max._max.urutan ?? 0) + 1 } })).id;
      }
    } else if (typeof body.kategoriId === 'string' && UUID_RE.test(body.kategoriId) && (await prisma.videoKategori.count({ where: { id: body.kategoriId } }))) {
      data.kategoriId = body.kategoriId;
    } else throw BadRequest('Kategori tidak ditemukan.');
  }
  const u = await prisma.videoYoutubeSource.update({ where: { id }, data });
  // Kategori playlist berubah → video yang diimpor dari playlist ini ikut pindah.
  let moved = 0;
  if (data.kategoriId !== undefined && data.kategoriId !== src.kategoriId) {
    moved = (await prisma.video.updateMany({ where: { sumber: 'YOUTUBE', sourcePlaylistId: src.playlistId }, data: { kategoriId: data.kategoriId } })).count;
  }
  audit(req, { action: 'UPDATE', resource: 'video_youtube_source', resourceId: id, resourceLabel: src.judul, metadata: { ...data, moved } });
  res.json({ success: true, data: { ...u, moved } });
});

videoChannelRouter.post('/youtube/sync', W, async (req, res) => {
  if (!youtubeKey()) throw BadRequest('YOUTUBE_API_KEY belum diisi di server.');
  if (isYoutubeSyncRunning()) throw Conflict('Sinkron sedang berjalan.');
  if (!(await prisma.videoYoutubeSource.count({ where: { isEnabled: true } }))) throw BadRequest('Belum ada playlist yang diaktifkan.');
  void runYoutubeSync('MANUAL', req.user?.jemaatId ?? null).catch((err) => logger.warn({ err }, 'manual youtube sync failed'));
  audit(req, { action: 'UPDATE', resource: 'video_sync_run', resourceLabel: 'Sinkron YouTube manual' });
  res.status(202).json({ success: true, data: { started: true } });
});

videoChannelRouter.get('/youtube/ignored', R, async (_req, res) => {
  const rows = await prisma.videoYoutubeIgnore.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
  res.json({ success: true, data: rows });
});

videoChannelRouter.delete('/youtube/ignored/:youtubeId', W, async (req, res) => {
  const yid = String(req.params.youtubeId ?? '');
  await prisma.videoYoutubeIgnore.deleteMany({ where: { youtubeId: yid } });
  res.json({ success: true, data: { ok: true } });
});

// ------------------------------------------------------------------ video

videoChannelRouter.post('/resolve', W, async (req, res) => {
  const url = String(req.body?.url ?? '');
  const youtubeId = parseYoutubeVideoId(url);
  if (!youtubeId) linkError(url);
  const [meta, existing] = await Promise.all([youtubeOembed(youtubeId), prisma.video.findUnique({ where: { youtubeId }, select: { id: true } })]);
  res.json({
    success: true,
    data: {
      youtubeId,
      judul: meta?.judul ?? null,
      channelNama: meta?.channelNama ?? null,
      thumbnailUrl: youtubeThumb(youtubeId, 'hq'),
      embeddable: !!meta,
      existingId: existing?.id ?? null,
    },
  });
});

function serialize(v: Prisma.VideoGetPayload<{ include: { kategori: { select: { id: true; nama: true; isActive: true } } } }>) {
  const now = Date.now();
  return {
    ...v,
    url: `https://www.youtube.com/watch?v=${v.youtubeId}`,
    thumbnailUrl: youtubeThumb(v.youtubeId, 'hq'),
    status: !v.isPublished ? 'DRAFT' : v.tayangAt && v.tayangAt.getTime() > now ? 'SCHEDULED' : 'PUBLISHED',
  };
}
const inc = { kategori: { select: { id: true, nama: true, isActive: true } } } as const;

videoChannelRouter.get('/', R, async (req, res) => {
  const q = str(req, 'q');
  const kategoriId = str(req, 'kategoriId');
  const status = str(req, 'status');
  const sumber = str(req, 'sumber');
  const now = new Date();
  const where: Prisma.VideoWhereInput = {
    ...(q ? { judul: { contains: q, mode: 'insensitive' } } : {}),
    ...(sumber === 'YOUTUBE' || sumber === 'MANUAL' ? { sumber } : {}),
    ...(kategoriId === 'none' ? { kategoriId: null } : kategoriId && UUID_RE.test(kategoriId) ? { kategoriId } : {}),
    ...(status === 'draft'
      ? { isPublished: false }
      : status === 'scheduled'
        ? { isPublished: true, tayangAt: { gt: now } }
        : status === 'published'
          ? { isPublished: true, OR: [{ tayangAt: null }, { tayangAt: { lte: now } }] }
          : {}),
  };
  const rows = await prisma.video.findMany({ where, include: inc, orderBy: [{ createdAt: 'desc' }], take: 2000 });
  res.json({ success: true, data: rows.map(serialize) });
});

videoChannelRouter.get('/:id', R, async (req, res) => {
  const v = await prisma.video.findUnique({ where: { id: pid(req.params.id) }, include: inc });
  if (!v) throw NotFound('Video tidak ditemukan');
  res.json({ success: true, data: serialize(v) });
});

async function dataFrom(req: Request) {
  const input = videoInputSchema.parse(req.body ?? {});
  const youtubeId = parseYoutubeVideoId(input.url);
  if (!youtubeId) linkError(input.url);
  if (input.kategoriId && !(await prisma.videoKategori.count({ where: { id: input.kategoriId } }))) throw BadRequest('Kategori tidak ditemukan.');
  return {
    youtubeId,
    judul: input.judul,
    deskripsi: input.deskripsi || null,
    kategoriId: input.kategoriId ?? null,
    isFeatured: input.isFeatured,
    isPublished: input.isPublished,
    tayangAt: input.tayangAt ?? null,
  };
}

videoChannelRouter.post('/', W, async (req, res) => {
  const data = await dataFrom(req);
  if (await prisma.video.count({ where: { youtubeId: data.youtubeId } })) throw Conflict('Video ini sudah ada di Video Channel.');
  const meta = await youtubeOembed(data.youtubeId);
  const v = await prisma.video.create({ data: { ...data, channelNama: meta?.channelNama ?? null, createdById: req.user?.jemaatId ?? null }, include: inc });
  audit(req, { action: 'CREATE', resource: 'video', resourceId: v.id, resourceLabel: v.judul });
  res.status(201).json({ success: true, data: serialize(v) });
});

videoChannelRouter.patch('/:id', W, async (req, res) => {
  const id = pid(req.params.id);
  const cur = await prisma.video.findUnique({ where: { id }, select: { youtubeId: true } });
  if (!cur) throw NotFound('Video tidak ditemukan');
  const data = await dataFrom(req);
  let channelNama: string | null | undefined;
  if (data.youtubeId !== cur.youtubeId) {
    if (await prisma.video.count({ where: { youtubeId: data.youtubeId, id: { not: id } } })) throw Conflict('Video ini sudah ada di Video Channel.');
    channelNama = (await youtubeOembed(data.youtubeId))?.channelNama ?? null;
  }
  const v = await prisma.video.update({ where: { id }, data: { ...data, ...(channelNama !== undefined ? { channelNama } : {}) }, include: inc });
  audit(req, { action: 'UPDATE', resource: 'video', resourceId: v.id, resourceLabel: v.judul });
  res.json({ success: true, data: serialize(v) });
});

videoChannelRouter.delete('/:id', D, async (req, res) => {
  const id = pid(req.params.id);
  const v = await prisma.video.delete({ where: { id } }).catch(() => null);
  if (!v) throw NotFound('Video tidak ditemukan');
  // Video hasil sinkron YouTube → jangan diimpor ulang pada sinkron berikutnya.
  if (v.sumber === 'YOUTUBE') {
    await prisma.videoYoutubeIgnore.upsert({ where: { youtubeId: v.youtubeId }, update: {}, create: { youtubeId: v.youtubeId, judul: v.judul } });
  }
  audit(req, { action: 'DELETE', resource: 'video', resourceId: id, resourceLabel: v.judul });
  res.json({ success: true, data: { deleted: true } });
});
