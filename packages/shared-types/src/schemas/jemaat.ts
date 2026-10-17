import { z } from 'zod';
import { noHpSchema, uuidSchema, emptyToUndefined } from './common.js';

export const jenisKelaminSchema = z.enum(['L', 'P']);

/** Teks opsional yang bisa dikosongkan: '' / null → null, undefined → tidak diubah. */
const nullableText = (max: number) =>
  z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? null : v), z.string().trim().max(max).nullable()).optional();

// Mandatory: cabangId (FK constraint DB), namaLengkap, noHp.
// Sisanya opsional dan terima empty string dari form.
export const createJemaatSchema = z.object({
  cabangId: uuidSchema,
  namaLengkap: z.string().trim().min(2).max(255),
  noHp: noHpSchema,

  email: emptyToUndefined(z.string().trim().email()),
  tanggalLahir: emptyToUndefined(z.string().date()),
  jenisKelamin: emptyToUndefined(jenisKelaminSchema),
  alamat: emptyToUndefined(z.string().trim()),
  tanggalBergabung: emptyToUndefined(z.string().date()),
  fotoUrl: emptyToUndefined(z.string().url()),
  statusPekerjaan: nullableText(100),
  namaKantor: nullableText(255),
  statusPernikahan: nullableText(50),
  tanggalPernikahan: z.preprocess((v) => (v === '' ? null : v), z.string().date().nullable()).optional(),
});
export type CreateJemaatInput = z.infer<typeof createJemaatSchema>;

// Update: semua opsional, tapi tetap validasi format kalau diisi.
export const updateJemaatSchema = z.object({
  cabangId: uuidSchema.optional(),
  namaLengkap: z.string().trim().min(2).max(255).optional(),
  noHp: emptyToUndefined(noHpSchema),
  email: emptyToUndefined(z.string().trim().email()),
  tanggalLahir: emptyToUndefined(z.string().date()),
  jenisKelamin: emptyToUndefined(jenisKelaminSchema),
  alamat: emptyToUndefined(z.string().trim()),
  tanggalBergabung: emptyToUndefined(z.string().date()),
  fotoUrl: emptyToUndefined(z.string().url()),
  isActive: z.boolean().optional(),
  // Pekerjaan & pernikahan — '' / null = kosongkan, undefined = tidak diubah.
  statusPekerjaan: nullableText(100),
  namaKantor: nullableText(255),
  statusPernikahan: nullableText(50),
  tanggalPernikahan: z.preprocess((v) => (v === '' ? null : v), z.string().date().nullable()).optional(),
});
export type UpdateJemaatInput = z.infer<typeof updateJemaatSchema>;
