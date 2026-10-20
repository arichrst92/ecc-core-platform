/** ECC Worship — helper bersama (admin, app, publik). */
import type { Request } from 'express';
import { prisma, type Prisma } from '@ecc/database';
import { resolveJemaatAccess } from './menu-access.js';

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MENU = 'ecc-worship';

/** Base URL publik core-api (untuk URL absolut cover & media). */
export function apiBase(req: Request): string {
  return (process.env.PUBLIC_API_URL ?? `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
}
export function absUrl(req: Request, url: string | null | undefined): string | null {
  if (!url) return null;
  return /^https?:/i.test(url) ? url : `${apiBase(req)}${url}`;
}

/** Pengelola (fulltimer / punya akses menu ECC Worship) — boleh lihat draft. */
export async function canManageWorship(req: Request): Promise<boolean> {
  if (!req.user) return false;
  if (req.user.isFulltimer) return true;
  const a = await resolveJemaatAccess(req.user.jemaatId);
  return !!a.menuAccess[MENU]?.canRead;
}

/** Filter lagu yang terlihat di app. */
export function visibleSongWhere(preview: boolean): Prisma.WorshipSongWhereInput {
  return preview
    ? { audioFile: { not: null } }
    : { audioFile: { not: null }, isPublished: true, album: { isPublished: true } };
}

export async function hasVisibleSongs(preview: boolean): Promise<boolean> {
  return (await prisma.worshipSong.count({ where: visibleSongWhere(preview), take: 1 })) > 0;
}
