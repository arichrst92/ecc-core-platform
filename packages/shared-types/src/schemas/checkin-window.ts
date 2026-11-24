import { z } from 'zod';

/**
 * Jendela registrasi & self check-in per ibadah / event (2026-11).
 * '' / null = aturan bawaan (daftar tutup saat mulai; self check-in 15 menit
 * sebelum mulai s.d. 30 menit setelah selesai). undefined = tidak diubah.
 */
const menit = (min: number, max: number, label: string) =>
  z
    .preprocess(
      (v) => (v === '' || (typeof v === 'number' && Number.isNaN(v)) ? null : v),
      z.union([z.null(), z.coerce.number().int().min(min, `${label} minimal ${min}`).max(max, `${label} maksimal ${max}`)]),
    )
    .optional();

export const checkinWindowFields = {
  /** Batas reservasi/daftar online = mulai − N menit (negatif = N menit sesudah mulai). Maks 7 hari sebelum / 12 jam sesudah. */
  registrasiTutupMenit: menit(-720, 10080, 'Batas registrasi (menit)'),
  /** Self check-in dibuka N menit sebelum mulai (0–720). */
  checkinBukaMenit: menit(0, 720, 'Self check-in dibuka (menit)'),
  /** Self check-in ditutup N menit setelah acuan (0–720). */
  checkinTutupMenit: menit(0, 720, 'Self check-in ditutup (menit)'),
  /** Acuan penutupan: START (setelah mulai) | END (setelah selesai). */
  checkinTutupAcuan: z.preprocess((v) => (v === '' ? null : v), z.union([z.null(), z.enum(['START', 'END'])])).optional(),
};
