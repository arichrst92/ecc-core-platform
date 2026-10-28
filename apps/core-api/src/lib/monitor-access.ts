/**
 * Akses layar monitor tanpa login (portal /monitor).
 *
 * Kode akses = env MONITOR_ACCESS_CODE (pola sama dengan CREDENTIAL_MASTER_PASSWORD,
 * tapi kode TERPISAH — kode ini disebar ke banyak monitor cabang, jangan pakai
 * password vault). Setelah kode benar, server memberi token bertanda tangan
 * (HMAC, 30 hari). Token otomatis tidak berlaku bila kode di .env diganti.
 */
import crypto from 'node:crypto';

const SECRET = process.env.MONITOR_TOKEN_SECRET ?? process.env.REPORT_LINK_SECRET ?? process.env.JWT_SECRET ?? 'dev-monitor-secret';
export const MONITOR_TOKEN_TTL_SEC = 30 * 24 * 60 * 60;

export function monitorCode(): string | null {
  const c = (process.env.MONITOR_ACCESS_CODE ?? '').trim();
  return c.length >= 6 ? c : null;
}

/** Sidik kode saat ini — token lama gugur saat kode diganti. */
const fingerprint = (code: string) => crypto.createHash('sha256').update(`monitor-code:${code}`).digest('base64url').slice(0, 16);
const sign = (body: string) => crypto.createHmac('sha256', SECRET).update(`monitor:${body}`).digest('base64url');

export function checkMonitorCode(input: string): boolean {
  const code = monitorCode();
  if (!code) return false;
  const a = Buffer.from(crypto.createHash('sha256').update(input).digest());
  const b = Buffer.from(crypto.createHash('sha256').update(code).digest());
  return crypto.timingSafeEqual(a, b);
}

export function createMonitorToken(): { token: string; expiresAt: string } {
  const code = monitorCode();
  if (!code) throw new Error('MONITOR_ACCESS_CODE belum di-set');
  const exp = Math.floor(Date.now() / 1000) + MONITOR_TOKEN_TTL_SEC;
  const body = Buffer.from(JSON.stringify({ f: fingerprint(code), exp })).toString('base64url');
  return { token: `${body}.${sign(body)}`, expiresAt: new Date(exp * 1000).toISOString() };
}

export function verifyMonitorToken(token: string | undefined | null): boolean {
  const code = monitorCode();
  if (!code || !token) return false;
  const [body, sig] = String(token).split('.');
  if (!body || !sig) return false;
  const expected = Buffer.from(sign(body));
  const got = Buffer.from(sig);
  if (expected.length !== got.length || !crypto.timingSafeEqual(expected, got)) return false;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as { f?: string; exp?: number };
    return p.f === fingerprint(code) && typeof p.exp === 'number' && p.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}
