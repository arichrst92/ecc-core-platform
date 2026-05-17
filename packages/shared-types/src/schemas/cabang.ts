import { z } from 'zod';
import { uuidSchema } from './common.js';

export const createCabangSchema = z
  .object({
    sinodeId: uuidSchema,
    nama: z.string().trim().min(2).max(255).openapi({ example: 'ECC Jakarta' }),
    kode: z.string().trim().min(2).max(20).toUpperCase().openapi({ example: 'JKT' }),
    alamat: z.string().trim().optional(),
    kontak: z.string().trim().max(100).optional(),
  })
  .openapi('CreateCabangInput');
export type CreateCabangInput = z.infer<typeof createCabangSchema>;

export const updateCabangSchema = createCabangSchema
  .partial()
  .extend({ isActive: z.boolean().optional() })
  .openapi('UpdateCabangInput');
export type UpdateCabangInput = z.infer<typeof updateCabangSchema>;
