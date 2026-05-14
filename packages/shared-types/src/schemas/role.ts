import { z } from 'zod';
import { uuidSchema } from './common.js';

// ===== Role (master) =====
export const createRoleSchema = z.object({
  nama: z.string().trim().min(2).max(100),
  deskripsi: z.string().trim().optional(),
});
export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export const updateRoleSchema = createRoleSchema.partial().extend({ isActive: z.boolean().optional() });
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;

// ===== Sub Role =====
export const createSubRoleSchema = z.object({
  roleId: uuidSchema,
  nama: z.string().trim().min(2).max(100),
  deskripsi: z.string().trim().optional(),
});
export type CreateSubRoleInput = z.infer<typeof createSubRoleSchema>;
export const updateSubRoleSchema = createSubRoleSchema.partial().extend({ isActive: z.boolean().optional() });
export type UpdateSubRoleInput = z.infer<typeof updateSubRoleSchema>;

// ===== Sub Role Status =====
export const createSubRoleStatusSchema = z.object({
  subRoleId: uuidSchema,
  nama: z.string().trim().min(2).max(100),
  deskripsi: z.string().trim().optional(),
});
export type CreateSubRoleStatusInput = z.infer<typeof createSubRoleStatusSchema>;
export const updateSubRoleStatusSchema = createSubRoleStatusSchema.partial().extend({ isActive: z.boolean().optional() });
export type UpdateSubRoleStatusInput = z.infer<typeof updateSubRoleStatusSchema>;

// ===== Assign Role ke Jemaat (junction) =====
export const assignJemaatRoleSchema = z.object({
  jemaatId: uuidSchema,
  roleId: uuidSchema,
  subRoleId: uuidSchema,
  subRoleStatusId: uuidSchema.nullable().optional(),
  tanggalMulai: z.string().date().optional(),       // default now
  catatan: z.string().trim().optional(),
});
export type AssignJemaatRoleInput = z.infer<typeof assignJemaatRoleSchema>;

export const updateJemaatRoleSchema = z.object({
  subRoleStatusId: uuidSchema.nullable().optional(),
  tanggalSelesai: z.string().date().optional(),     // mengakhiri penugasan
  isActive: z.boolean().optional(),
  catatan: z.string().trim().optional(),
});
export type UpdateJemaatRoleInput = z.infer<typeof updateJemaatRoleSchema>;
