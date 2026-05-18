import { z } from 'zod';
import { noHpSchema, uuidSchema, emptyToUndefined } from './common.js';

export const jenisKelaminSchema = z.enum(['L', 'P']);

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
});
export type UpdateJemaatInput = z.infer<typeof updateJemaatSchema>;
