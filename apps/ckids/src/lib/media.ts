/**
 * Resolve URL foto/media dari backend response.
 *
 * Backend simpan URL relatif `/uploads/xxx.webp?v=timestamp` — kalau di-render
 * langsung di ckids.eccchurch.global akan 404 (browser resolve ke host ckids,
 * tapi file di-serve dari api.eccchurch.global).
 *
 * Fungsi ini prefix `NEXT_PUBLIC_CORE_API_URL` kalau URL relatif.
 * External URL (https://...) di-passthrough as-is.
 */
const API_BASE = process.env.NEXT_PUBLIC_CORE_API_URL ?? 'http://localhost:4100';

export function resolveMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('/')) return `${API_BASE}${url}`;
  return `${API_BASE}/${url}`;
}
