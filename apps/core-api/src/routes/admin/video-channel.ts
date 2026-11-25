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
 *   DELETE /:id
 */
import { Router, type Request } from 'express';
import { prisma, type Prisma } from '@ecc/database';
import { parseYoutubeVideoId, videoInputSchema, videoKategoriOrderSchema, videoKategoriSchema, youtubeLinkKind, youtubeThumb } from '@ecc/shared-types';
import { requireMenu } from '../../middleware/require-menu.js';
import { BadRequest, Conflict, NotFound } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { UUID_RE, youtubeOembed } from '../../lib/video-channel.js';

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
  const now = new Date();
  const where: Prisma.VideoWhereInput = {
    ...(q ? { judul: { contains: q, mode: 'insensitive' } } : {}),
    ...(kategoriId === 'none' ? { kategoriId: null } : kategoriId && UUID_RE.test(kategoriId) ? { kategoriId } : {}),
    ...(status === 'draft'
      ? { isPublished: false }
      : status === 'scheduled'
        ? { isPublished: true, tayangAt: { gt: now } }
        : status === 'published'
          ? { isPublished: true, OR: [{ tayangAt: null }, { tayangAt: { lte: now } }] }
          : {}),
  };
  const rows = await prisma.video.findMany({ where, include: inc, orderBy: [{ createdAt: 'desc' }], take: 1000 });
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
  audit(req, { action: 'DELETE', resource: 'video', resourceId: id, resourceLabel: v.judul });
  res.json({ success: true, data: { deleted: true } });
});
