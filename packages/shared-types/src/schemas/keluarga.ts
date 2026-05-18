import { z } from 'zod';
import { uuidSchema, emptyToUndefined } from './common.js';

// ===== Tipe Relasi Keluarga (master) =====
export const createTipeRelasiSchema = z.object({
  nama: z.string().trim().min(2).max(50),
  deskripsi: emptyToUndefined(z.string().trim()),
});
export type CreateTipeRelasiInput = z.infer<typeof createTipeRelasiSchema>;

export const updateTipeRelasiSchema = z.object({
  nama: z.string().trim().min(2).max(50).optional(),
  deskripsi: emptyToUndefined(z.string().trim()),
  isActive: z.boolean().optional(),
});
export type UpdateTipeRelasiInput = z.infer<typeof updateTipeRelasiSchema>;

// ===== Jemaat Relasi (assignment) =====
export const createJemaatRelasiSchema = z
  .object({
    jemaatId: uuidSchema,
    jemaatTerkaitId: uuidSchema,
    tipeRelasiId: uuidSchema,
    keterangan: emptyToUndefined(z.string().trim()),
  })
  .refine((d) => d.jemaatId !== d.jemaatTerkaitId, {
    message: 'Tidak boleh relasi ke diri sendiri',
    path: ['jemaatTerkaitId'],
  });
export type CreateJemaatRelasiInput = z.infer<typeof createJemaatRelasiSchema>;
