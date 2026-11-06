/**
 * Aturan isi input dari app (audit 2026-11): mencegah data yang menyalahi
 * fungsinya — nama berisi angka/simbol, teks hanya simbol, tanggal lahir di
 * masa depan, tanggal pernikahan untuk status Single, dll.
 *
 * Disalin (logika yang sama) di app mobile: src/utils/inputRules.ts.
 */
import { z } from 'zod';

/** Rapikan spasi: trim + spasi ganda → satu. */
export const rapikanSpasi = (v: unknown) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : v);

const HURUF = /\p{L}/gu;
const HURUF_ANGKA = /[\p{L}\p{N}]/gu;

/** Nama orang: huruf (semua bahasa), spasi, titik, koma, apostrof, tanda hubung; ≥ 2 huruf. */
export function namaOrangValid(s: string): boolean {
  if (!/^[\p{L}\p{M}][\p{L}\p{M} .,'’()\-]*$/u.test(s)) return false;
  if ((s.match(HURUF) ?? []).length < 2) return false;
  if (/(\p{L})\1{3,}/iu.test(s.replace(/\s/g, ''))) return false; // "aaaa"
  return true;
}

/** Teks bermakna: minimal N huruf/angka (bukan hanya simbol/emoji), tidak satu karakter berulang. */
export function teksBermakna(s: string, minHurufAngka = 2): boolean {
  const ha = s.match(HURUF_ANGKA) ?? [];
  if (ha.length < minHurufAngka) return false;
  if (new Set(ha.map((c) => c.toLowerCase())).size === 1 && ha.length >= 3) return false; // "xxxx", "1111"
  return true;
}

/** Teks berbasis huruf (nama tempat/kantor/usaha/industri): minimal 2 huruf. */
export function adaHuruf(s: string, min = 2): boolean {
  return (s.match(HURUF) ?? []).length >= min;
}

const today = () => new Date().toISOString().slice(0, 10);
const yearsAgo = (n: number) => {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - n);
  return d.toISOString().slice(0, 10);
};

export const MSG = {
  nama: 'Nama hanya boleh berisi huruf, spasi, titik, koma, apostrof, atau tanda hubung (tanpa angka/simbol).',
  teks: 'Isi dengan huruf/angka yang bermakna, bukan hanya simbol.',
  huruf: 'Isi dengan nama yang berisi huruf, bukan hanya angka/simbol.',
  lahirMasaDepan: 'Tanggal lahir tidak boleh di masa depan.',
  lahirTerlaluLama: 'Tanggal lahir tidak wajar (lebih dari 120 tahun lalu).',
  tanggalMasaDepan: 'Tanggal tidak boleh di masa depan.',
};

/** Nama orang (wajib). */
export const namaOrangSchema = (max = 255) =>
  z.preprocess(
    rapikanSpasi,
    z.string().min(2, 'Nama minimal 2 karakter').max(max).refine(namaOrangValid, MSG.nama),
  );

/** Teks bebas yang harus bermakna (wajib). */
export const teksSchema = (max: number, min = 2, minHurufAngka = 2) =>
  z.preprocess(
    rapikanSpasi,
    z.string().min(min, `Minimal ${min} karakter`).max(max).refine((s) => teksBermakna(s, minHurufAngka), MSG.teks),
  );

/** Teks yang harus berisi huruf (nama tempat, kantor, usaha, industri). */
export const teksHurufSchema = (max: number) =>
  z.preprocess(rapikanSpasi, z.string().min(2, 'Minimal 2 karakter').max(max).refine((s) => adaHuruf(s), MSG.huruf));

/** Tanggal lahir YYYY-MM-DD: tidak di masa depan & ≤ 120 tahun lalu. */
export const tanggalLahirSchema = z
  .string()
  .date()
  .refine((s) => s <= today(), MSG.lahirMasaDepan)
  .refine((s) => s >= yearsAgo(120), MSG.lahirTerlaluLama);

/** Tanggal yang sudah terjadi (mis. tanggal pernikahan). */
export const tanggalLampauSchema = z
  .string()
  .date()
  .refine((s) => s <= today(), MSG.tanggalMasaDepan)
  .refine((s) => s >= '1900-01-01', 'Tanggal tidak wajar.');

/** Pilihan pekerjaan & status pernikahan (sama dengan Portal & app). */
export const PEKERJAAN_OPTIONS = [
  'Pelajar / Mahasiswa',
  'Karyawan Swasta',
  'PNS / ASN',
  'TNI / Polri',
  'Wiraswasta / Pengusaha',
  'Profesional',
  'Ibu Rumah Tangga',
  'Pensiunan',
  'Belum Bekerja',
  'Lainnya',
] as const;
export const PERNIKAHAN_OPTIONS = ['Single', 'Menikah', 'Janda', 'Duda', 'Cerai'] as const;
/** Status yang tidak boleh punya tanggal pernikahan. */
export const PERNIKAHAN_TANPA_TANGGAL = ['Single'] as const;

/** Selisih tahun penuh antara dua tanggal YYYY-MM-DD. */
export function selisihTahun(dari: string, sampai: string): number {
  const a = new Date(`${dari}T00:00:00Z`);
  const b = new Date(`${sampai}T00:00:00Z`);
  let n = b.getUTCFullYear() - a.getUTCFullYear();
  if (b.getUTCMonth() < a.getUTCMonth() || (b.getUTCMonth() === a.getUTCMonth() && b.getUTCDate() < a.getUTCDate())) n--;
  return n;
}
