/**
 * Hak akses scan kehadiran ibadah (reservasi / walk-in / checkout / pickup).
 *
 * Boleh:
 *   - Admin: Fulltimer, atau Role Access menu "Kehadiran" / "Ibadah" (Ubah) — Portal.
 *   - Petugas CKids: Akses CKids "Scanner Ibadah" (atau Gift Stall) — khusus ibadah anak.
 *   - Petugas scan ibadah: IbadahPelayananPetugas canScanAttendance=true di ibadah itu
 *     (diatur di Portal / Jadwal ministry) — app Els "Mode Scanner".
 * Jemaat biasa TIDAK boleh (sebelumnya /admin/reservasi hanya butuh login).
 */
import type { Request, RequestHandler } from 'express';
import { prisma } from '@ecc/database';
import { ckidsAllowedMenus } from '@ecc/shared-types';
import { resolveJemaatAccess } from './menu-access.js';
import { Forbidden, Unauthorized } from './errors.js';

type Access = { admin: boolean; ckids: Set<string>; jemaatId: string | null };
const CACHE = Symbol('scanAccess');

/** Akses scan user (di-cache per request). */
export async function scanAccess(req: Request): Promise<Access> {
  const r = req as Request & { [CACHE]?: Access };
  if (r[CACHE]) return r[CACHE];
  if (!req.user) throw Unauthorized();
  const jemaatId = req.user.jemaatId ?? null;
  let access: Access;
  if (req.user.isFulltimer) {
    access = { admin: true, ckids: new Set(['scanner', 'hadir', 'gift', 'adjust-point']), jemaatId };
  } else if (!jemaatId) {
    access = { admin: false, ckids: new Set(), jemaatId };
  } else {
    const { menuAccess } = await resolveJemaatAccess(jemaatId);
    const admin = !!(menuAccess['kehadiran']?.canWrite || menuAccess['ibadah']?.canWrite);
    const ckids = ckidsAllowedMenus({ isFulltimer: false, menuAccess }) as Set<string>;
    access = { admin, ckids, jemaatId };
  }
  r[CACHE] = access;
  return access;
}

/** Petugas scan di ibadah ini (atau salah satu ibadah bila ibadahId kosong). */
async function isIbadahScanner(jemaatId: string, ibadahId?: string): Promise<boolean> {
  const row = await prisma.ibadahPelayananPetugas.findFirst({
    where: { jemaatId, canScanAttendance: true, ...(ibadahId ? { ibadahPelayanan: { ibadahId } } : {}) },
    select: { id: true },
  });
  return !!row;
}

/** Boleh scan ibadah tertentu (walk-in / check-in / checkout / pickup). */
export async function canScanIbadah(req: Request, ibadahId: string): Promise<boolean> {
  const a = await scanAccess(req);
  if (a.admin) return true;
  if (a.ckids.has('scanner')) {
    const ib = await prisma.ibadah.findUnique({ where: { id: ibadahId }, select: { isKidsIbadah: true } });
    if (ib?.isKidsIbadah) return true;
  }
  return !!a.jemaatId && isIbadahScanner(a.jemaatId, ibadahId);
}

export async function assertCanScanIbadah(req: Request, ibadahId: string, nama?: string): Promise<void> {
  if (!(await canScanIbadah(req, ibadahId))) {
    throw Forbidden(
      `Anda tidak berwenang scan kehadiran${nama ? ` ibadah "${nama}"` : ' ibadah ini'}. Hubungi admin untuk minta akses sebagai petugas scan.`,
    );
  }
}

/** Middleware: punya peran scan apa pun (admin / CKids / petugas ibadah). Cek per ibadah tetap di handler. */
export const requireAnyScanner: RequestHandler = (req, _res, next) => {
  void (async () => {
    const a = await scanAccess(req);
    if (a.admin || a.ckids.has('scanner') || a.ckids.has('hadir')) return;
    if (a.jemaatId && (await isIbadahScanner(a.jemaatId))) return;
    throw Forbidden('Fitur ini hanya untuk petugas scan / admin kehadiran.');
  })().then(() => next(), next);
};

/** Middleware: point CKids (award) — admin, Scanner Ibadah, atau Adjust Point CKids. */
export const requireCkidsPoint: RequestHandler = (req, _res, next) => {
  void (async () => {
    const a = await scanAccess(req);
    if (a.admin || a.ckids.has('scanner') || a.ckids.has('adjust-point')) return;
    throw Forbidden('Fitur ini hanya untuk petugas CKids.');
  })().then(() => next(), next);
};
