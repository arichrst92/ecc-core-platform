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
