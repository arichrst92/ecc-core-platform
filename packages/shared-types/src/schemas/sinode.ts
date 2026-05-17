import { z } from 'zod';

export const createSinodeSchema = z
  .object({
    nama: z.string().trim().min(2).max(255).openapi({ example: 'Sinode ECC' }),
    kode: z.string().trim().min(2).max(20).toUpperCase().openapi({ example: 'ECC' }),
    alamat: z.string().trim().optional(),
    kontak: z.string().trim().max(100).optional(),
  })
  .openapi('CreateSinodeInput');
export type CreateSinodeInput = z.infer<typeof createSinodeSchema>;

export const updateSinodeSchema = createSinodeSchema
  .partial()
  .extend({ isActive: z.boolean().optional() })
  .openapi('UpdateSinodeInput');
export type UpdateSinodeInput = z.infer<typeof updateSinodeSchema>;

export const sinodeSchema = z
  .object({
    id: z.string().uuid(),
    nama: z.string(),
    kode: z.string(),
    alamat: z.string().nullable(),
    kontak: z.string().nullable(),
    isActive: z.boolean(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .openapi('Sinode');
