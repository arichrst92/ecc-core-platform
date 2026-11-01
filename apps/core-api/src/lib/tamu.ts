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

// ------------------------------------------------------------ kategori tamu
/** VISITOR = berkunjung saja · NEW_COMER = orang baru · BELUM = belum ditentukan (disimpan NULL). */
export const TAMU_KATEGORI = ['VISITOR', 'NEW_COMER'] as const;
export type TamuKategori = (typeof TAMU_KATEGORI)[number];
export const TAMU_KATEGORI_LABEL: Record<TamuKategori | 'BELUM', string> = {
  VISITOR: 'Visitor saja',
  NEW_COMER: 'New Comer',
  BELUM: 'Belum ditentukan',
};
/** Input kategori dari form (app/portal). Tidak dikirim (app lama) = belum ditentukan. */
export const tamuKategoriInput = z.enum(['VISITOR', 'NEW_COMER', 'BELUM']).optional();
export const normKategori = (v: string | null | undefined): TamuKategori | null =>
  v === 'VISITOR' || v === 'NEW_COMER' ? v : null;
export const kategoriKey = (v: string | null | undefined): TamuKategori | 'BELUM' => normKategori(v) ?? 'BELUM';

/**
 * Kategori baru untuk tamu yang sudah ada: isi bila masih kosong; NEW_COMER
 * boleh menaikkan VISITOR. Tidak pernah menurunkan NEW_COMER → VISITOR dan
 * tidak mengosongkan (itu hanya lewat admin Portal).
 */
export function mergeKategori(current: string | null | undefined, incoming: string | null | undefined): TamuKategori | null | undefined {
  const inc = normKategori(incoming);
  if (!inc) return undefined;
  const cur = normKategori(current);
  if (!cur || (cur === 'VISITOR' && inc === 'NEW_COMER')) return inc;
  return undefined;
}

export const tamuInputSchema = z.object({
  nama: z.string().trim().min(2, 'Nama tamu minimal 2 karakter').max(255),
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
