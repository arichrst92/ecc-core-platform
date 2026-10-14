/**
 * Tamu — orang non-anggota tanpa akun yang dibawa jemaat (DIUNDANG) atau
 * datang langsung (WALK_IN) ke event/ibadah. Disimpan sebagai Jemaat dengan
 * isTamu=true supaya alur pendaftaran, pembayaran, kuota & check-in yang ada
 * tetap berlaku. Nomor HP jadi kunci: tamu yang sama dikenali lagi.
 */
import { prisma } from '@ecc/database';
import { noHpSchema } from '@ecc/shared-types';
import { z } from 'zod';
import { ApiError } from './errors.js';
import { generateUniqueKode } from './kode-reservasi.js';

export const tamuInputSchema = z.object({
  nama: z.string().trim().min(2, 'Nama tamu minimal 2 karakter').max(255),
  noHp: noHpSchema,
});
export type TamuInput = z.infer<typeof tamuInputSchema>;

export type GuestSource = 'DIUNDANG' | 'WALK_IN';

/**
 * Cari / buat tamu berdasarkan no HP.
 *  - No HP milik ANGGOTA (bukan tamu) → `{ member }` (pemanggil yang memutuskan).
 *  - No HP milik tamu lama → pakai record itu (tamu berulang).
 *  - Belum ada → buat Jemaat isTamu=true (dengan kode, supaya bisa dicari petugas).
 */
export async function resolveTamu(
  input: TamuInput,
  cabangId: string,
): Promise<{ tamu: { id: string; namaLengkap: string; noHp: string | null; kode: string | null }; created: boolean; member: boolean }> {
  const existing = await prisma.jemaat.findUnique({
    where: { noHp: input.noHp },
    select: { id: true, namaLengkap: true, noHp: true, kode: true, isTamu: true, isActive: true },
  });
  if (existing) {
    if (!existing.isTamu) return { tamu: existing, created: false, member: true };
    if (!existing.isActive) {
      await prisma.jemaat.update({ where: { id: existing.id }, data: { isActive: true } });
    }
    return { tamu: existing, created: false, member: false };
  }
  const kode = await generateUniqueKode(async (k) => !!(await prisma.jemaat.findUnique({ where: { kode: k } })));
  const tamu = await prisma.jemaat.create({
    data: {
      cabangId,
      namaLengkap: input.nama,
      noHp: input.noHp,
      kode,
      isTamu: true,
      isActive: true,
      tanggalBergabung: new Date(),
    },
    select: { id: true, namaLengkap: true, noHp: true, kode: true },
  });
  return { tamu, created: true, member: false };
}

/** Error standar kalau no HP ternyata milik anggota terdaftar. */
export function memberPhoneError(): ApiError {
  return new ApiError(
    409,
    'PHONE_IS_MEMBER',
    'Nomor ini sudah terdaftar sebagai jemaat Els App. Minta ia mendaftar sendiri, atau hubungkan lewat menu Keluarga.',
  );
}

/** ID tamu yang saya simpan ("Tamu saya"). */
export async function myTamuIds(inviterId: string): Promise<string[]> {
  const rows = await prisma.jemaatTamu.findMany({ where: { inviterId }, select: { tamuId: true } });
  return rows.map((r) => r.tamuId);
}
