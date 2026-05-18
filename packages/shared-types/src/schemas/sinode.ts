import './common.js'; // ensures z.openapi() extension applied
import { z } from 'zod';
import { emptyToUndefined } from './common.js';

export const createSinodeSchema = z
  .object({
    nama: z.string().trim().min(2).max(255).openapi({ example: 'Sinode ECC' }),
    kode: z.string().trim().min(2).max(20).toUpperCase().openapi({ example: 'ECC' }),
    alamat: emptyToUndefined(z.string().trim()),
    kontak: emptyToUndefined(z.string().trim().max(100)),
  })
  .openapi('CreateSinodeInput');
export type CreateSinodeInput = z.infer<typeof createSinodeSchema>;

export const updateSinodeSchema = z
  .object({
    nama: z.string().trim().min(2).max(255).optional(),
    kode: z.string().trim().min(2).max(20).toUpperCase().optional(),
    alamat: emptyToUndefined(z.string().trim()),
    kontak: emptyToUndefined(z.string().trim().max(100)),
    isActive: z.boolean().optional(),
  })
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
