/**
 * Video Channel (2026-12) — helper bersama Portal, app, dan website.
 * Video universal (semua cabang); tampil bila terbit, tanggal tayang sudah lewat,
 * dan kategorinya aktif (atau tanpa kategori).
 */
import { prisma, type Prisma } from '@ecc/database';
import { youtubeThumb } from '@ecc/shared-types';

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function publicVideoWhere(now = new Date()): Prisma.VideoWhereInput {
  return {
    isPublished: true,
    OR: [{ tayangAt: null }, { tayangAt: { lte: now } }],
    AND: [{ OR: [{ kategoriId: null }, { kategori: { isActive: true } }] }],
  };
}

type Row = Prisma.VideoGetPayload<{ include: { kategori: { select: { id: true; nama: true } } } }>;

export function videoView(v: Row) {
  return {
    id: v.id,
    youtubeId: v.youtubeId,
    judul: v.judul,
    deskripsi: v.deskripsi,
    kategori: v.kategori ? { id: v.kategori.id, nama: v.kategori.nama } : null,
    channelNama: v.channelNama,
    isFeatured: v.isFeatured,
    thumbnailUrl: youtubeThumb(v.youtubeId, 'hq'),
    tayangAt: v.tayangAt ?? v.createdAt,
  };
}

/** Katalog publik: kategori aktif yang berisi video + daftar video terbaru dulu. */
export async function publicCatalog(limit = 500) {
  const [kategori, videos] = await Promise.all([
    prisma.videoKategori.findMany({ where: { isActive: true }, orderBy: [{ urutan: 'asc' }, { nama: 'asc' }], select: { id: true, nama: true } }),
    prisma.video.findMany({
      where: publicVideoWhere(),
      include: { kategori: { select: { id: true, nama: true } } },
      orderBy: [{ tayangAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      take: limit,
    }),
  ]);
  const items = videos.map(videoView).sort((a, b) => +new Date(b.tayangAt) - +new Date(a.tayangAt));
  const used = new Set(items.map((v) => v.kategori?.id).filter(Boolean));
  return {
    kategori: kategori.filter((k) => used.has(k.id)),
    featured: items.filter((v) => v.isFeatured).slice(0, 5),
    videos: items,
    total: items.length,
  };
}

/** Judul & nama channel dari oEmbed YouTube (tanpa API key). null bila gagal / bukan video publik. */
export async function youtubeOembed(youtubeId: string): Promise<{ judul: string; channelNama: string | null } | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const url = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${youtubeId}`)}`;
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    const j = (await res.json()) as { title?: string; author_name?: string };
    return j.title ? { judul: j.title.slice(0, 200), channelNama: j.author_name?.slice(0, 150) ?? null } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
