import { z } from 'zod';

export const createSinodeSchema = z.object({
  nama: z.string().trim().min(2).max(255),
  kode: z.string().trim().min(2).max(20).toUpperCase(),
  alamat: z.string().trim().optional(),
  kontak: z.string().trim().max(100).optional(),
});
export type CreateSinodeInput = z.infer<typeof createSinodeSchema>;

export const updateSinodeSchema = createSinodeSchema.partial().extend({
  isActive: z.boolean().optional(),
});
export type UpdateSinodeInput = z.infer<typeof updateSinodeSchema>;
