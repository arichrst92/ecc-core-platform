/**
 * Statistik versi Els App dari header `X-App-Version` (dikirim app versi baru).
 * Request app tanpa header = app versi lama. Disimpan di memori (sejak server
 * start), cukup untuk memutuskan kapan saklar "app versi lama" dimatikan.
 */
import type { RequestHandler } from 'express';

const stats = new Map<string, { requests: number; lastSeen: number }>();
const KEEP_MS = 7 * 24 * 60 * 60_000;

export const appVersionMiddleware: RequestHandler = (req, _res, next) => {
  if ((req.get('x-client') ?? '').toLowerCase() === 'mobile') {
    const v = (req.get('x-app-version') ?? '').trim().slice(0, 32) || 'lama (tanpa versi)';
    const cur = stats.get(v) ?? { requests: 0, lastSeen: 0 };
    cur.requests++;
    cur.lastSeen = Date.now();
    stats.set(v, cur);
  }
  next();
};

export function appVersionStats(): { version: string; requests: number; lastSeen: string }[] {
  const now = Date.now();
  for (const [k, v] of stats) if (now - v.lastSeen > KEEP_MS) stats.delete(k);
  return [...stats.entries()]
    .map(([version, v]) => ({ version, requests: v.requests, lastSeen: new Date(v.lastSeen).toISOString() }))
    .sort((a, b) => b.requests - a.requests);
}
