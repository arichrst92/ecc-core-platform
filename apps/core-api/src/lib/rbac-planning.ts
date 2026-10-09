/**
 * RBAC gate untuk Planning Backlog (dan Operations Tickets kedepannya).
 *
 * Rule: user harus punya at least 1 ITMinisterTeam assignment aktif.
 * Dipanggil dari middleware di /admin/planning/*.
 */
import type { Request, Response, NextFunction } from 'express';
import { prisma } from '@ecc/database';
import { Forbidden, Unauthorized } from './errors.js';

/** Simple in-memory cache: jemaatId → isITMember expires in 60s. */
const CACHE_TTL_MS = 60_000;
interface CacheEntry {
  value: boolean;
  expiresAt: number;
}
const cache = new Map<string, CacheEntry>();

export function invalidateItTeamCache(jemaatId?: string) {
  if (jemaatId) cache.delete(jemaatId);
  else cache.clear();
}

/** Check once — returns true kalau user adalah IT Minister Team aktif. */
export async function isItTeamMember(jemaatId: string): Promise<boolean> {
  const cached = cache.get(jemaatId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const row = await prisma.iTMinisterTeam.findFirst({
    where: { jemaatId, isActive: true },
    select: { id: true },
  });
  const value = row !== null;
  cache.set(jemaatId, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

/**
 * Express middleware. Lempar 401 kalau tidak login, 403 kalau bukan IT Team.
 */
export async function requireItTeam(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.user) return next(Unauthorized());
  const ok = await isItTeamMember(req.user.jemaatId);
  if (!ok) {
    return next(Forbidden('Fitur ini hanya untuk IT Minister Team.'));
  }
  next();
}
