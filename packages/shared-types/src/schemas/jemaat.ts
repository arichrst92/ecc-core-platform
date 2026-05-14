import { z } from 'zod';
import { noHpSchema, uuidSchema } from './common.js';

export const jenisKelaminSchema = z.enum(['L', 'P']);

export const createJemaatSchema = z.object({
  cabangId: uuidSchema,
  namaLengkap: z.string().trim().min(2).max(255),
  email: z.string().trim().email().optional().or(z.literal('')),
  noHp: noHpSchema.optional(),
  tanggalLahir: z.string().date().optional(),       // ISO date YYYY-MM-DD
  jenisKelamin: jenisKelaminSchema.optional(),
  alamat: z.string().trim().optional(),
  tanggalBergabung: z.string().date().optional(),
  fotoUrl: z.string().url().optional(),
});
export type CreateJemaatInput = z.infer<typeof createJemaatSchema>;

export const updateJemaatSchema = createJemaatSchema.partial().extend({
  isActive: z.boolean().optional(),
});
export type UpdateJemaatInput = z.infer<typeof updateJemaatSchema>;
