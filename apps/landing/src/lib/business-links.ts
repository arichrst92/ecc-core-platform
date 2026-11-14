/** Sosial media & marketplace usaha Local Market (dipakai halaman & panel). */
export type SocialKey = 'instagram' | 'facebook' | 'tiktok' | 'youtube' | 'x' | 'linkedin' | 'threads';
export type MarketKey = 'shopee' | 'lazada' | 'tiktokshop' | 'tokopedia';

export const SOCIAL_LABEL: Record<SocialKey, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  x: 'X',
  linkedin: 'LinkedIn',
  threads: 'Threads',
};
export const MARKET_LABEL: Record<MarketKey, string> = { shopee: 'Shopee', lazada: 'Lazada', tiktokshop: 'TikTok Shop', tokopedia: 'Tokopedia' };

/** Platform dari URL sosmed. */
export function platformOf(url: string): SocialKey | null {
  const h = (/^https?:\/\/(?:www\.|m\.)?([^/?#]+)/i.exec(url)?.[1] ?? '').toLowerCase();
  if (h.endsWith('instagram.com')) return 'instagram';
  if (h.endsWith('facebook.com') || h === 'fb.com') return 'facebook';
  if (h.endsWith('tiktok.com')) return 'tiktok';
  if (h.endsWith('youtube.com') || h === 'youtu.be') return 'youtube';
  if (h === 'x.com' || h.endsWith('twitter.com')) return 'x';
  if (h.endsWith('linkedin.com')) return 'linkedin';
  if (h.endsWith('threads.net') || h.endsWith('threads.com')) return 'threads';
  return null;
}

/** Teks yang ditampilkan: @username dari URL (bila bisa), selain itu domain + path. */
export function handleOf(url: string): string {
  try {
    const u = new URL(url);
    const seg = u.pathname.split('/').filter(Boolean);
    const last = seg[seg.length - 1] ?? '';
    if (/^@?[\w.\-]{2,}$/.test(last) && !/^(in|company|channel|c|user|profile\.php)$/i.test(last)) return last.startsWith('@') ? last : `@${last}`;
    return (u.hostname.replace(/^www\./, '') + u.pathname).replace(/\/$/, '');
  } catch {
    return url;
  }
}

export const shortUrl = (url: string) => url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
