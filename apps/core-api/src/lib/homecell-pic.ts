import { prisma } from '@ecc/database';
import { BadRequest } from './errors.js';

/**
 * Validasi PIC HomecellArea / Homecell.
 *
 * Business rule:
 *   - PIC harus jemaat aktif
 *   - Harus punya ACTIVE JemaatPelayanan dengan Pelayanan="Penggembalaan"
 *     dan PelayananRole sesuai (Zone Leader untuk Area, Homecell Leader untuk Homecell)
 *
 * Throws BadRequest jika tidak memenuhi.
 */
export const PENGGEMBALAAN = {
  NAMA: 'Penggembalaan',
  ZONE_LEADER: 'Zone Leader',
  HOMECELL_LEADER: 'Homecell Leader',
} as const;

export async function assertPenggembalaanRole(jemaatId: string, roleNama: string) {
  const jemaat = await prisma.jemaat.findUnique({
    where: { id: jemaatId },
    select: {
      id: true,
      namaLengkap: true,
      isActive: true,
      jemaatPelayanan: {
        where: {
          isActive: true,
          pelayanan: { nama: PENGGEMBALAAN.NAMA },
          pelayananRole: { nama: roleNama },
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
      `PIC "${jemaat.namaLengkap}" harus punya pelayanan "${PENGGEMBALAAN.NAMA}" dengan role "${roleNama}"`,
    );
  }
}

/**
 * Authorization helper untuk endpoint Homecell Schedule + Attendance.
 *
 * Allow:
 *   - Admin Fulltimer (req.user.isFulltimer = true)
 *   - PIC homecell (homecell.picJemaatId === userJemaatId)
 *   - PIC area parent (area.picJemaatId === userJemaatId)
 *
 * Throws ApiError 403 'FORBIDDEN' kalau bukan ketiganya.
 *
 * Lookup user.jemaatId via prisma.user.findUnique kalau userJemaatId
 * tidak di-pass. Caller bisa pre-fetch untuk efficiency.
 */
import { ApiError } from './errors.js';

export async function assertCanManageHomecell(
  homecellId: string,
  userJemaatId: string,
  isFulltimer: boolean,
): Promise<void> {
  if (isFulltimer) return; // admin bypass

  const homecell = await prisma.homecell.findUnique({
    where: { id: homecellId },
    select: {
      id: true,
      picJemaatId: true,
      area: { select: { picJemaatId: true } },
    },
  });
  if (!homecell) {
    throw new ApiError(404, 'NOT_FOUND', 'Homecell tidak ditemukan.');
  }

  // PIC homecell direct
  if (homecell.picJemaatId === userJemaatId) return;

  // PIC area parent
  if (homecell.area?.picJemaatId === userJemaatId) return;

  throw new ApiError(
    403,
    'FORBIDDEN',
    'Hanya PIC homecell, PIC area, atau admin yang boleh akses.',
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
