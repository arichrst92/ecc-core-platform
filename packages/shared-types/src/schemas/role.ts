import { z } from 'zod';
import { uuidSchema, emptyToUndefined } from './common.js';

// ===== Role (master) =====
export const createRoleSchema = z.object({
  nama: z.string().trim().min(2).max(100),
  deskripsi: emptyToUndefined(z.string().trim()),
});
export type CreateRoleInput = z.infer<typeof createRoleSchema>;

export const updateRoleSchema = z.object({
  nama: z.string().trim().min(2).max(100).optional(),
  deskripsi: emptyToUndefined(z.string().trim()),
  isActive: z.boolean().optional(),
});
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;

// ===== Sub Role =====
export const createSubRoleSchema = z.object({
  roleId: uuidSchema,
  nama: z.string().trim().min(2).max(100),
  deskripsi: emptyToUndefined(z.string().trim()),
});
export type CreateSubRoleInput = z.infer<typeof createSubRoleSchema>;

export const updateSubRoleSchema = z.object({
  roleId: uuidSchema.optional(),
  nama: z.string().trim().min(2).max(100).optional(),
  deskripsi: emptyToUndefined(z.string().trim()),
  isActive: z.boolean().optional(),
});
export type UpdateSubRoleInput = z.infer<typeof updateSubRoleSchema>;

// ===== Sub Role Status =====
export const createSubRoleStatusSchema = z.object({
  subRoleId: uuidSchema,
  nama: z.string().trim().min(2).max(100),
  deskripsi: emptyToUndefined(z.string().trim()),
});
export type CreateSubRoleStatusInput = z.infer<typeof createSubRoleStatusSchema>;

export const updateSubRoleStatusSchema = z.object({
  subRoleId: uuidSchema.optional(),
  nama: z.string().trim().min(2).max(100).optional(),
  deskripsi: emptyToUndefined(z.string().trim()),
  isActive: z.boolean().optional(),
});
export type UpdateSubRoleStatusInput = z.infer<typeof updateSubRoleStatusSchema>;

// ===== Assign Role ke Jemaat (junction) =====
export const assignJemaatRoleSchema = z.object({
  jemaatId: uuidSchema,
  roleId: uuidSchema,
  subRoleId: uuidSchema,
  subRoleStatusId: emptyToUndefined(uuidSchema),
  tanggalMulai: emptyToUndefined(z.string().date()),
  catatan: emptyToUndefined(z.string().trim()),
});
export type AssignJemaatRoleInput = z.infer<typeof assignJemaatRoleSchema>;

export const updateJemaatRoleSchema = z.object({
  subRoleStatusId: emptyToUndefined(uuidSchema),
  tanggalSelesai: emptyToUndefined(z.string().date()),
  isActive: z.boolean().optional(),
  catatan: emptyToUndefined(z.string().trim()),
});
export type UpdateJemaatRoleInput = z.infer<typeof updateJemaatRoleSchema>;
