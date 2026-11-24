import type { Request } from 'express';

/**
 * App mobile (Els App) mengirim header `X-Client: mobile`. Dipakai untuk
 * aturan yang berbeda antara app jemaat dan portal admin, mis. bypass
 * fulltimer hanya berlaku di portal.
 */
export function isMobileClient(req: Request): boolean {
  return (req.get('x-client') ?? '').toLowerCase() === 'mobile';
}

/** "2.5.1/ios" → [2,5,1]; tidak terbaca → null. */
function parseAppVersion(req: Request): number[] | null {
  const raw = (req.get('x-app-version') ?? '').trim().split('/')[0] ?? '';
  if (!/^\d+(\.\d+)*$/.test(raw)) return null;
  return raw.split('.').map(Number);
}

/** Versi app ≥ min (mis. '2.5.1')? Bukan app mobile (Portal/website) → true. */
export function appAtLeast(req: Request, min: string): boolean {
  if (!isMobileClient(req)) return true;
  const v = parseAppVersion(req);
  if (!v) return false;
  const m = min.split('.').map(Number);
  for (let i = 0; i < Math.max(v.length, m.length); i++) {
    const a = v[i] ?? 0;
    const b = m[i] ?? 0;
    if (a !== b) return a > b;
  }
  return true;
}

/**
 * Els App ≤ 2.5.0 — tidak membaca konfigurasi jendela per ibadah/event; jam
 * tiket dihitung dari opensAt + 15 / closesAt − 30 → server mengirim bentuk lama.
 */
export function isLegacyApp(req: Request): boolean {
  return isMobileClient(req) && !appAtLeast(req, '2.5.1');
}
