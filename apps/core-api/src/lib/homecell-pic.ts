import { prisma } from '@ecc/database';
import { BadRequest } from './errors.js';
import { resolvePenggembalaan, type PenggembalaanPeran } from './penggembalaan.js';

/**
 * Validasi PIC HomecellArea / Homecell.
 *
 * Business rule:
 *   - PIC harus jemaat aktif
 *   - Harus punya ACTIVE JemaatPelayanan di pelayanan penggembalaan dengan role
 *     PIC zona (untuk Area) / PIC homecell (untuk Homecell).
 * Pelayanan & role dikenali dari ID (lib/penggembalaan.ts) — boleh di-rename.
 *
 * Throws BadRequest jika tidak memenuhi.
 */
export const PENGGEMBALAAN = {
  ZONE_LEADER: 'ZONE_LEADER',
  HOMECELL_LEADER: 'HOMECELL_LEADER',
} as const;

export async function assertPenggembalaanRole(jemaatId: string, peran: PenggembalaanPeran) {
  const pg = await resolvePenggembalaan();
  const roleId = pg.roleId[peran];
  const jemaat = await prisma.jemaat.findUnique({
    where: { id: jemaatId },
    select: {
      id: true,
      namaLengkap: true,
      isActive: true,
      jemaatPelayanan: {
        where: {
          isActive: true,
          pelayananId: pg.pelayananId ?? '00000000-0000-0000-0000-000000000000',
          pelayananRoleId: roleId ?? '00000000-0000-0000-0000-000000000000',
        },
        select: { id: true },
        take: 1,
      },
    },
  });
  if (!jemaat) throw BadRequest('PIC jemaat tidak ditemukan');
  if (!jemaat.isActive) throw BadRequest(`PIC "${jemaat.namaLengkap}" tidak aktif`);
  if (jemaat.jemaatPelayanan.length === 0) {
    throw BadRequest(
      `PIC "${jemaat.namaLengkap}" harus punya pelayanan "${pg.pelayananNama}" dengan role "${pg.roleNama[peran]}"`,
    );
  }
}

/**
 * Authorization helper untuk endpoint Homecell Schedule + Attendance.
 *
 * Allow:
 *   - Admin dengan Role Access menu Homecell (tulis) — dihitung pemanggil lewat
 *     `homecellAdmin(req)`. 2026-11: TIDAK ada lagi jalan pintas Fulltimer.
 *   - PIC homecell (homecell.picJemaatId === userJemaatId)
 *   - PIC area parent (area.picJemaatId === userJemaatId)
 *   - Pastor zona parent (homecell_area_pastor)
 *
 * Throws ApiError 403 'FORBIDDEN' kalau bukan ketiganya.
 *
 * Lookup user.jemaatId via prisma.user.findUnique kalau userJemaatId
 * tidak di-pass. Caller bisa pre-fetch untuk efficiency.
 */
import { ApiError } from './errors.js';

/** Anggota aktif yang ditunjuk PIC sebagai asisten homecell. */
export async function isHomecellAsisten(homecellId: string, jemaatId: string): Promise<boolean> {
  const m = await prisma.homecellMember.findUnique({
    where: { homecellId_jemaatId: { homecellId, jemaatId } },
    select: { isActive: true, isAsisten: true },
  });
  return !!m?.isActive && !!m.isAsisten;
}

export async function assertCanManageHomecell(
  homecellId: string,
  userJemaatId: string,
  /** Admin Role Access menu Homecell (tulis) — lihat `homecellAdmin`. */
  isAdmin: boolean,
  /** Asisten homecell juga boleh (jadwal, absen, tamu, lampiran). */
  opts: { allowAsisten?: boolean } = {},
): Promise<void> {
  if (isAdmin) return;

  const homecell = await prisma.homecell.findUnique({
    where: { id: homecellId },
    select: {
      id: true,
      picJemaatId: true,
      area: { select: { picJemaatId: true, pastors: { where: { jemaatId: userJemaatId }, select: { id: true } } } },
    },
  });
  if (!homecell) {
    throw new ApiError(404, 'NOT_FOUND', 'Homecell tidak ditemukan.');
  }

  // PIC homecell direct
  if (homecell.picJemaatId === userJemaatId) return;

  // PIC area parent
  if (homecell.area?.picJemaatId === userJemaatId) return;

  // Pastor zona parent
  if (homecell.area && homecell.area.pastors.length > 0) return;

  // Asisten homecell (ditunjuk PIC)
  if (opts.allowAsisten && (await isHomecellAsisten(homecellId, userJemaatId))) return;

  throw new ApiError(
    403,
    'FORBIDDEN',
    'Hanya PIC homecell, PIC/pastor zona, atau admin yang boleh akses.',
  );
}

/**
 * Helper untuk get userJemaatId dari req.user.sub.
 * Cache di-request scope via WeakMap ringan supaya tidak query 2x per request.
 */
const userJemaatCache = new Map<string, string>();

export async function getJemaatIdForUser(userId: string): Promise<string | null> {
  if (userJemaatCache.has(userId)) {
    return userJemaatCache.get(userId)!;
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { jemaatId: true },
  });
  if (!user?.jemaatId) return null;
  userJemaatCache.set(userId, user.jemaatId);
  // Auto-cleanup setelah 5 menit supaya tidak grow unbounded
  setTimeout(() => userJemaatCache.delete(userId), 5 * 60 * 1000);
  return user.jemaatId;
}

/** Admin homecell = Role Access menu Homecell (level `level`), bukan status Fulltimer. */
export async function homecellAdmin(
  req: { user?: { jemaatId: string; isFulltimer?: boolean } },
  level: 'read' | 'write' = 'write',
): Promise<boolean> {
  const { hasMenuAccessFor } = await import('../middleware/require-menu.js');
  return hasMenuAccessFor(req.user, 'homecell', level);
}
