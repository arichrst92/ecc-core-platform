/**
 * Link laporan bertanda tangan (HMAC, berumur pendek) — supaya app mobile bisa
 * membuka laporan PDF (print view) di browser tanpa JWT. Hanya dibuat untuk
 * pemimpin homecell / PIC area lewat endpoint ber-JWT.
 */
import crypto from 'node:crypto';

const SECRET = process.env.REPORT_LINK_SECRET ?? process.env.JWT_SECRET ?? 'dev-report-secret';
export const REPORT_LINK_TTL_SEC = 30 * 60;

export type ReportKind = 'homecell' | 'area';
export interface ReportPayload {
  k: ReportKind;
  id: string;
  p?: string; // periode preset
  f?: string; // from YYYY-MM-DD
  t?: string; // to YYYY-MM-DD
  exp: number; // epoch detik
}

const sign = (body: string) => crypto.createHmac('sha256', SECRET).update(`report:${body}`).digest('base64url');

export function createReportToken(p: Omit<ReportPayload, 'exp'>, ttlSec = REPORT_LINK_TTL_SEC): string {
  const body = Buffer.from(JSON.stringify({ ...p, exp: Math.floor(Date.now() / 1000) + ttlSec })).toString('base64url');
  return `${body}.${sign(body)}`;
}

export function verifyReportToken(token: string): ReportPayload | null {
  const [body, sig] = String(token).split('.');
  if (!body || !sig) return null;
  const expected = Buffer.from(sign(body));
  const got = Buffer.from(sig);
  if (expected.length !== got.length || !crypto.timingSafeEqual(expected, got)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as ReportPayload;
    if (!p || (p.k !== 'homecell' && p.k !== 'area') || typeof p.id !== 'string') return null;
    if (!Number.isFinite(p.exp) || p.exp < Math.floor(Date.now() / 1000)) return null;
    return p;
  } catch {
    return null;
  }
}
