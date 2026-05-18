import { z } from 'zod';
import { uuidSchema, emptyToUndefined } from './common.js';

export const createCabangSchema = z
  .object({
    sinodeId: uuidSchema,
    nama: z.string().trim().min(2).max(255).openapi({ example: 'ECC Jakarta' }),
    kode: z.string().trim().min(2).max(20).toUpperCase().openapi({ example: 'JKT' }),
    alamat: emptyToUndefined(z.string().trim()),
    kontak: emptyToUndefined(z.string().trim().max(100)),
  })
  .openapi('CreateCabangInput');
export type CreateCabangInput = z.infer<typeof createCabangSchema>;

export const updateCabangSchema = z
  .object({
    sinodeId: uuidSchema.optional(),
    nama: z.string().trim().min(2).max(255).optional(),
    kode: z.string().trim().min(2).max(20).toUpperCase().optional(),
    alamat: emptyToUndefined(z.string().trim()),
    kontak: emptyToUndefined(z.string().trim().max(100)),
    isActive: z.boolean().optional(),
  })
  .openapi('UpdateCabangInput');
export type UpdateCabangInput = z.infer<typeof updateCabangSchema>;
