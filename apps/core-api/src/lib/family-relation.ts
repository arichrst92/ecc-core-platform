/**
 * Family relation helpers — dipakai oleh mobile /admin/me/family/* dan
 * portal /admin/keluarga/* untuk consistent behavior.
 *
 * Storage single source: `jemaat_relasi` + `tipe_relasi_keluarga`.
 * Auto-reciprocal gender-aware — kalau A tag "Suami" B, otomatis B punya
 * "Istri" A, dst.
 */
import { prisma, Prisma } from '@ecc/database';
import type { FamilyRole } from '@ecc/shared-types';
import { BadRequest, NotFound } from './errors.js';

/**
 * Broad enum → nama TipeRelasiKeluarga default (as seeded). Refine di
 * resolver berdasarkan gender.
 */
const ROLE_TO_TIPE_NAMA: Record<FamilyRole, string> = {
  SPOUSE: 'Suami',
  CHILD: 'Anak Laki-Laki',
  PARENT: 'Ayah',
  SIBLING: 'Saudara Kandung',
  GUARDIAN: 'Wali',
  OTHER: 'Lainnya',
};

/**
 * Broad enum reverse: TipeRelasi.nama → FamilyRole (untuk response backward
 * compat mobile lama).
 */
const TIPE_TO_BROAD_ROLE: Record<string, FamilyRole> = {
  Suami: 'SPOUSE',
  Istri: 'SPOUSE',
  Ayah: 'PARENT',
  Ibu: 'PARENT',
  'Anak Laki-Laki': 'CHILD',
  'Anak Perempuan': 'CHILD',
  'Saudara Kandung': 'SIBLING',
  Kakek: 'GUARDIAN',
  Nenek: 'GUARDIAN',
  Cucu: 'OTHER',
  Wali: 'GUARDIAN',
  Lainnya: 'OTHER',
};

export function tipeNamaToBroadRole(nama: string): FamilyRole {
  return TIPE_TO_BROAD_ROLE[nama] ?? 'OTHER';
}

/**
 * Resolve tipeRelasiId dari input (role atau tipeRelasiId langsung).
 * Refine granularity dgn gender kalau input pakai role broad.
 */
export async function resolveTipeRelasiId(
  tx: Prisma.TransactionClient,
  input: { role?: FamilyRole; tipeRelasiId?: string },
  targetJenisKelamin: 'L' | 'P' | null,
  selfJenisKelamin: 'L' | 'P' | null,
): Promise<string> {
  if (input.tipeRelasiId) {
    const t = await tx.tipeRelasiKeluarga.findUnique({
      where: { id: input.tipeRelasiId },
      select: { id: true },
    });
    if (!t) throw BadRequest('tipeRelasiId tidak ditemukan');
    return t.id;
  }
  if (!input.role) throw BadRequest('role atau tipeRelasiId harus dikirim');

  let namaTipe = ROLE_TO_TIPE_NAMA[input.role];
  if (input.role === 'SPOUSE') {
    namaTipe = selfJenisKelamin === 'P' ? 'Suami' : 'Istri';
  } else if (input.role === 'CHILD') {
    namaTipe = targetJenisKelamin === 'P' ? 'Anak Perempuan' : 'Anak Laki-Laki';
  } else if (input.role === 'PARENT') {
    namaTipe = targetJenisKelamin === 'P' ? 'Ibu' : 'Ayah';
  }
  const tipe = await tx.tipeRelasiKeluarga.findUnique({
    where: { nama: namaTipe },
    select: { id: true },
  });
  if (!tipe) throw BadRequest(`TipeRelasi "${namaTipe}" belum di-seed`);
  return tipe.id;
}

/**
 * Reciprocal tipe nama — untuk create row balik B → A.
 * Pakai gender info reciprocal target (yaitu jemaat A dari sisi B).
 */
export function reciprocalTipeNama(
  tipeNama: string,
  reciprocalTargetGender: 'L' | 'P' | null,
): string {
  const M: Record<string, string> = {
    Suami: 'Istri',
    Istri: 'Suami',
    Ayah: reciprocalTargetGender === 'P' ? 'Anak Perempuan' : 'Anak Laki-Laki',
    Ibu: reciprocalTargetGender === 'P' ? 'Anak Perempuan' : 'Anak Laki-Laki',
    'Anak Laki-Laki': reciprocalTargetGender === 'P' ? 'Ibu' : 'Ayah',
    'Anak Perempuan': reciprocalTargetGender === 'P' ? 'Ibu' : 'Ayah',
    'Saudara Kandung': 'Saudara Kandung',
    Kakek: 'Cucu',
    Nenek: 'Cucu',
    Cucu: reciprocalTargetGender === 'P' ? 'Nenek' : 'Kakek',
    Wali: 'Lainnya',
    Lainnya: 'Lainnya',
  };
  return M[tipeNama] ?? 'Lainnya';
}

/**
 * Auto-reciprocal family link — 2 row di JemaatRelasi.
 * Idempotent via deleteMany + create fresh.
 */
export async function upsertJemaatRelasi(
  selfId: string,
  targetId: string,
  input: { role?: FamilyRole; tipeRelasiId?: string },
): Promise<{ id: string; tipeRelasi: { id: string; nama: string } }> {
  if (selfId === targetId) throw BadRequest('Tidak bisa link ke diri sendiri.');

  return prisma.$transaction(async (tx) => {
    const [self, target] = await Promise.all([
      tx.jemaat.findUnique({
        where: { id: selfId },
        select: { id: true, jenisKelamin: true },
      }),
      tx.jemaat.findUnique({
        where: { id: targetId },
        select: { id: true, jenisKelamin: true },
      }),
    ]);
    if (!self) throw NotFound('Jemaat self tidak ditemukan');
    if (!target) throw NotFound('Jemaat target tidak ditemukan');

    const tipeAId = await resolveTipeRelasiId(
      tx,
      input,
      target.jenisKelamin,
      self.jenisKelamin,
    );
    const tipeA = await tx.tipeRelasiKeluarga.findUnique({
      where: { id: tipeAId },
      select: { id: true, nama: true },
    });
    if (!tipeA) throw BadRequest('TipeRelasi tidak valid');

    const recipNama = reciprocalTipeNama(tipeA.nama, self.jenisKelamin);
    const tipeB = await tx.tipeRelasiKeluarga.findUnique({
      where: { nama: recipNama },
      select: { id: true, nama: true },
    });
    if (!tipeB) throw BadRequest(`Reciprocal tipe "${recipNama}" belum di-seed`);

    // Hapus row lama antara pair ini + create fresh (idempotent).
    await tx.jemaatRelasi.deleteMany({
      where: {
        OR: [
          { jemaatId: selfId, jemaatTerkaitId: targetId },
          { jemaatId: targetId, jemaatTerkaitId: selfId },
        ],
      },
    });
    const a = await tx.jemaatRelasi.create({
      data: {
        jemaatId: selfId,
        jemaatTerkaitId: targetId,
        tipeRelasiId: tipeA.id,
      },
      include: { tipeRelasi: { select: { id: true, nama: true } } },
    });
    await tx.jemaatRelasi.create({
      data: {
        jemaatId: targetId,
        jemaatTerkaitId: selfId,
        tipeRelasiId: tipeB.id,
      },
    });
    return a;
  });
}
