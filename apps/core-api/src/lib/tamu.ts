/**
 * Tamu — orang non-anggota tanpa akun yang dibawa jemaat (DIUNDANG) atau
 * datang langsung (WALK_IN) ke event/ibadah. Disimpan sebagai Jemaat dengan
 * isTamu=true supaya alur pendaftaran, pembayaran, kuota & check-in yang ada
 * tetap berlaku. Nomor HP jadi kunci: tamu yang sama dikenali lagi.
 */
import { prisma } from '@ecc/database';
import { noHpSchema } from '@ecc/shared-types';
import { z } from 'zod';
import { namaOrangSchema } from '@ecc/shared-types';
import { ApiError } from './errors.js';
import { generateUniqueKode } from './kode-reservasi.js';

// ------------------------------------------------------------ kategori tamu
/**
 * Hanya dua kategori: VISITOR (berkunjung) · NEW_COMER (orang baru).
 * "Belum ditentukan" dihapus (2026-11): data lama & app lama yang masih
 * mengirim 'BELUM' / tanpa kategori → dianggap VISITOR.
 */
export const TAMU_KATEGORI = ['VISITOR', 'NEW_COMER'] as const;
export type TamuKategori = (typeof TAMU_KATEGORI)[number];
export const TAMU_KATEGORI_LABEL: Record<TamuKategori, string> = {
  VISITOR: 'Visitor',
  NEW_COMER: 'New Comer',
};
/** Input kategori dari form (app/portal). 'BELUM' masih diterima dari app lama (= Visitor). */
export const tamuKategoriInput = z.enum(['VISITOR', 'NEW_COMER', 'BELUM']).optional();
/** Kategori yang disimpan: NEW_COMER, selain itu VISITOR. */
export const normKategori = (v: string | null | undefined): TamuKategori => (v === 'NEW_COMER' ? 'NEW_COMER' : 'VISITOR');
export const kategoriKey = normKategori;

/**
 * Kategori baru untuk tamu yang sudah ada: isi bila masih kosong (default
 * Visitor); NEW_COMER boleh menaikkan VISITOR. Tidak pernah menurunkan
 * NEW_COMER → VISITOR (itu hanya lewat admin Portal). undefined = tidak berubah.
 */
export function mergeKategori(current: string | null | undefined, incoming: string | null | undefined): TamuKategori | undefined {
  const cur = current === 'VISITOR' || current === 'NEW_COMER' ? current : null;
  if (!cur) return normKategori(incoming);
  if (cur === 'VISITOR' && incoming === 'NEW_COMER') return 'NEW_COMER';
  return undefined;
}

export const tamuInputSchema = z.object({
  nama: namaOrangSchema(),
  noHp: noHpSchema,
  kategori: tamuKategoriInput,
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
    select: { id: true, namaLengkap: true, noHp: true, kode: true, isTamu: true, isActive: true, tamuKategori: true },
  });
  if (existing) {
    const { tamuKategori, isTamu, isActive, ...tamu } = existing;
    if (!isTamu) return { tamu, created: false, member: true };
    const kat = mergeKategori(tamuKategori, input.kategori);
    if (!isActive || kat !== undefined) {
      await prisma.jemaat.update({
        where: { id: existing.id },
        data: { ...(!isActive ? { isActive: true } : {}), ...(kat !== undefined ? { tamuKategori: kat } : {}) },
      });
    }
    return { tamu, created: false, member: false };
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
      tamuKategori: normKategori(input.kategori),
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
