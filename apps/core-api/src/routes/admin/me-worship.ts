/**
 * ECC Worship — Els App — /admin/me/worship
 *
 *   GET    /summary                 → { hasSongs, canPreview } (tile Quick Access)
 *   GET    /library                 → { albums, singles, popular, favorites, canPreview }
 *   GET    /songs/:id/play-url      → { url, expiresAt } (?mode=VOKAL|KARAOKE)
 *   POST   /songs/:id/played        → { mode } — dipanggil app setelah ≥ 30 detik
 *   POST   /songs/:id/downloaded    → { mode }
 *   POST   /favorites/:songId · DELETE /favorites/:songId
 *
 * Pengelola (akses menu ecc-worship / fulltimer) ikut melihat draft (draft: true).
 */
import { Router, type Request } from 'express';
import { prisma } from '@ecc/database';
import { z } from 'zod';
import { NotFound, Unauthorized } from '../../lib/errors.js';
import { UUID_RE, absUrl, apiBase, canManageWorship, hasVisibleSongs, visibleSongWhere } from '../../lib/worship.js';
import { signedMediaPath } from '../../lib/worship-media.js';

export const meWorshipRouter = Router();

function me(req: Request) {
  if (!req.user) throw Unauthorized();
  return req.user;
}

const modeSchema = z.object({ mode: z.enum(['VOKAL', 'KARAOKE']).default('VOKAL') });

async function loadVisibleSong(req: Request) {
  const id = String(req.params.id ?? req.params.songId ?? '');
  if (!UUID_RE.test(id)) throw NotFound('Lagu tidak ditemukan');
  const preview = await canManageWorship(req);
  const s = await prisma.worshipSong.findFirst({
    where: { id, ...visibleSongWhere(preview) },
    select: { id: true, karaokeFile: true },
  });
  if (!s) throw NotFound('Lagu tidak ditemukan');
  return s;
}

meWorshipRouter.get('/summary', async (req, res) => {
  me(req);
  const canPreview = await canManageWorship(req);
  res.json({ success: true, data: { hasSongs: await hasVisibleSongs(canPreview), canPreview } });
});

meWorshipRouter.get('/library', async (req, res) => {
  const u = me(req);
  const preview = await canManageWorship(req);
  const albums = await prisma.worshipAlbum.findMany({
    where: preview ? {} : { isPublished: true },
    orderBy: [{ urutan: 'asc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      tipe: true,
      judul: true,
      tahun: true,
      deskripsi: true,
      coverUrl: true,
      isPublished: true,
      songs: {
        where: visibleSongWhere(preview),
        orderBy: [{ urutan: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          judul: true,
          ciptaan: true,
          tahun: true,
          lirik: true,
          lirikSinkron: true,
          durasi: true,
          karaokeFile: true,
          karaokeDurasi: true,
          audioMime: true,
          karaokeMime: true,
          audioSize: true,
          karaokeSize: true,
          isPublished: true,
          updatedAt: true,
        },
      },
    },
  });
  const shaped = albums
    .filter((a) => a.songs.length > 0)
    .map((a) => ({
      id: a.id,
      tipe: a.tipe,
      judul: a.judul,
      tahun: a.tahun,
      deskripsi: a.deskripsi,
      coverUrl: absUrl(req, a.coverUrl),
      draft: !a.isPublished,
      songs: a.songs.map(({ karaokeFile, isPublished, audioMime, karaokeMime, ...s }) => ({
        ...s,
        // Ekstensi file (untuk nama file unduhan offline di app).
        audioExt: audioMime === 'audio/mp4' ? 'm4a' : 'mp3',
        karaokeExt: karaokeMime === 'audio/mp4' ? 'm4a' : 'mp3',
        albumId: a.id,
        hasKaraoke: !!karaokeFile,
        draft: !a.isPublished || !isPublished,
      })),
    }));
  const songIds = shaped.flatMap((a) => a.songs.map((s) => s.id));
  const since = new Date(Date.now() - 30 * 86400_000);
  const [popular, favs] = await Promise.all([
    songIds.length
      ? prisma.worshipPlay.groupBy({
          by: ['songId'],
          where: { songId: { in: songIds }, createdAt: { gte: since } },
          _count: { _all: true },
          orderBy: { _count: { songId: 'desc' } },
          take: 10,
        })
      : [],
    prisma.worshipFavorite.findMany({ where: { jemaatId: u.jemaatId }, select: { songId: true }, orderBy: { createdAt: 'desc' } }),
  ]);
  res.json({
    success: true,
    data: {
      canPreview: preview,
      albums: shaped.filter((a) => a.tipe === 'ALBUM'),
      singles: shaped.filter((a) => a.tipe === 'SINGLE'),
      popular: popular.map((p) => ({ songId: p.songId, plays: p._count._all })),
      favorites: favs.map((f) => f.songId),
    },
  });
});

meWorshipRouter.get('/songs/:id/play-url', async (req, res) => {
  me(req);
  const s = await loadVisibleSong(req);
  const mode = req.query.mode === 'KARAOKE' ? 'KARAOKE' : 'VOKAL';
  if (mode === 'KARAOKE' && !s.karaokeFile) throw NotFound('Versi karaoke belum tersedia.');
  const p = signedMediaPath(s.id, mode);
  res.json({ success: true, data: { url: `${apiBase(req)}${p.path}`, expiresAt: p.expiresAt } });
});

meWorshipRouter.post('/songs/:id/played', async (req, res) => {
  const u = me(req);
  const s = await loadVisibleSong(req);
  const { mode } = modeSchema.parse(req.body ?? {});
  await prisma.$transaction([
    prisma.worshipPlay.create({ data: { songId: s.id, jemaatId: u.jemaatId, mode } }),
    prisma.worshipSong.update({
      where: { id: s.id },
      data: mode === 'KARAOKE' ? { playsKaraoke: { increment: 1 } } : { playsVokal: { increment: 1 } },
    }),
  ]);
  res.json({ success: true });
});

meWorshipRouter.post('/songs/:id/downloaded', async (req, res) => {
  const u = me(req);
  const s = await loadVisibleSong(req);
  const { mode } = modeSchema.parse(req.body ?? {});
  await prisma.worshipDownload.create({ data: { songId: s.id, jemaatId: u.jemaatId, mode } });
  res.json({ success: true });
});

meWorshipRouter.post('/favorites/:songId', async (req, res) => {
  const u = me(req);
  const s = await loadVisibleSong(req);
  await prisma.worshipFavorite.upsert({
    where: { jemaatId_songId: { jemaatId: u.jemaatId, songId: s.id } },
    create: { jemaatId: u.jemaatId, songId: s.id },
    update: {},
  });
  res.json({ success: true });
});

meWorshipRouter.delete('/favorites/:songId', async (req, res) => {
  const u = me(req);
  const id = String(req.params.songId ?? '');
  if (!UUID_RE.test(id)) throw NotFound('Lagu tidak ditemukan');
  await prisma.worshipFavorite.deleteMany({ where: { jemaatId: u.jemaatId, songId: id } });
  res.json({ success: true });
});
