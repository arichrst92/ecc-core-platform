/** Video Channel (2026-12) — video YouTube per kategori (universal, semua cabang). */
import { z } from 'zod';

const YT_ID = /^[A-Za-z0-9_-]{11}$/;

/**
 * Ambil ID video YouTube dari link. Hanya **video biasa**:
 * youtube.com/watch?v=…, youtu.be/…, youtube.com/embed/…, m.youtube.com, music.youtube.com.
 * Shorts (/shorts/), live (/live/), dan playlist tanpa video → null.
 */
export function parseYoutubeVideoId(input: string): string | null {
  const s = (input ?? '').trim();
  if (YT_ID.test(s)) return s;
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^(www|m|music)\./, '').toLowerCase();
  let id: string | null = null;
  if (host === 'youtu.be') id = u.pathname.split('/')[1] ?? null;
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts[0] === 'watch') id = u.searchParams.get('v');
    else if (parts[0] === 'embed' || parts[0] === 'v') id = parts[1] ?? null;
  }
  return id && YT_ID.test(id) ? id : null;
}

/** Link Shorts / live → pesan khusus (hanya video biasa yang diterima). */
export function youtubeLinkKind(input: string): 'video' | 'shorts' | 'live' | 'playlist' | 'invalid' {
  const s = (input ?? '').toLowerCase();
  if (/youtube\.com\/shorts\//.test(s)) return 'shorts';
  if (/youtube\.com\/live\//.test(s)) return 'live';
  if (parseYoutubeVideoId(input)) return 'video';
  if (/[?&]list=/.test(s)) return 'playlist';
  return 'invalid';
}

export const youtubeThumb = (id: string, q: 'hq' | 'mq' | 'maxres' = 'hq') =>
  `https://i.ytimg.com/vi/${id}/${q === 'maxres' ? 'maxresdefault' : q === 'mq' ? 'mqdefault' : 'hqdefault'}.jpg`;

export const videoKategoriSchema = z.object({
  nama: z.string().trim().min(2, 'Nama kategori minimal 2 karakter.').max(100),
  isActive: z.boolean().default(true),
});

export const videoKategoriOrderSchema = z.object({ ids: z.array(z.string().uuid()).max(200) });

export const videoInputSchema = z.object({
  url: z.string().trim().min(5, 'Tempel link video YouTube.').max(500),
  judul: z.string().trim().min(2, 'Judul minimal 2 karakter.').max(200),
  deskripsi: z.string().trim().max(5000).nullish(),
  kategoriId: z.string().uuid().nullish(),
  isFeatured: z.boolean().default(false),
  isPublished: z.boolean().default(false),
  tayangAt: z.preprocess((v) => (v === '' ? null : v), z.coerce.date().nullish()),
});
export type VideoInput = z.infer<typeof videoInputSchema>;
