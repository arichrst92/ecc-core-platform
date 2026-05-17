import jwt from 'jsonwebtoken';
import { createHash } from 'node:crypto';
import type { JwtPayload } from '@ecc/shared-types';

const JWT_SECRET = process.env.JWT_SECRET ?? '';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? '7d';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN ?? '30d';

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  // eslint-disable-next-line no-console
  console.warn('[auth] JWT_SECRET missing or too short (<32 chars). Set in .env');
}

export function signAccessToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions);
}

export function signRefreshToken(userId: string): string {
  return jwt.sign({ sub: userId, type: 'refresh' }, JWT_SECRET, {
    expiresIn: JWT_REFRESH_EXPIRES_IN,
  } as jwt.SignOptions);
}

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}

export function verifyRefreshToken(token: string): { sub: string; type: string } {
  return jwt.verify(token, JWT_SECRET) as { sub: string; type: string };
}

/** Helper untuk extract Bearer token dari header `Authorization`. */
export function extractBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

/**
 * SHA256 hash deterministik untuk refresh token storage.
 *
 * Kenapa SHA256 bukan bcrypt? Karena kita butuh exact-match lookup di DB
 * (`tokenHash` punya unique index). Bcrypt non-deterministik jadi memerlukan
 * iterasi semua row. SHA256 cukup secure di sini karena refresh token sudah
 * adalah token random yang panjang (JWT sign), bukan password user.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Detik tersisa hingga JWT expire. Berguna untuk response `expiresIn`. */
export function getJwtTtlSeconds(): number {
  const v = process.env.JWT_EXPIRES_IN ?? '7d';
  const m = v.match(/^(\d+)([smhd])$/);
  if (!m) return 7 * 24 * 3600;
  const n = Number(m[1]);
  const unit = m[2];
  const multiplier = unit === 's' ? 1 : unit === 'm' ? 60 : unit === 'h' ? 3600 : 86400;
  return n * multiplier;
}

/** Detik tersisa hingga refresh token expire. */
export function getRefreshTtlSeconds(): number {
  const v = process.env.JWT_REFRESH_EXPIRES_IN ?? '30d';
  const m = v.match(/^(\d+)([smhd])$/);
  if (!m) return 30 * 24 * 3600;
  const n = Number(m[1]);
  const unit = m[2];
  const multiplier = unit === 's' ? 1 : unit === 'm' ? 60 : unit === 'h' ? 3600 : 86400;
  return n * multiplier;
}
