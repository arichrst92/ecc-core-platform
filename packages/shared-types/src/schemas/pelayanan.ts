import './common.js'; // ensures z.openapi() extension applied
import { z } from 'zod';
import { uuidSchema } from './common.js';

// ===== Pelayanan (master) =====
export const createPelayananSchema = z
  .object({
    nama: z.string().trim().min(2).max(100),
    deskripsi: z.string().trim().optional(),
  })
  .openapi('CreatePelayananInput');
export type CreatePelayananInput = z.infer<typeof createPelayananSchema>;

export const updatePelayananSchema = createPelayananSchema
  .partial()
  .extend({ isActive: z.boolean().optional() })
  .openapi('UpdatePelayananInput');
export type UpdatePelayananInput = z.infer<typeof updatePelayananSchema>;

// ===== PelayananRole =====
export const createPelayananRoleSchema = z
  .object({
    pelayananId: uuidSchema,
    nama: z.string().trim().min(2).max(100),
    deskripsi: z.string().trim().optional(),
    level: z.coerce.number().int().min(-100).max(100).default(0),
  })
  .openapi('CreatePelayananRoleInput');
export type CreatePelayananRoleInput = z.infer<typeof createPelayananRoleSchema>;

export const updatePelayananRoleSchema = z
  .object({
    nama: z.string().trim().min(2).max(100).optional(),
    deskripsi: z.string().trim().optional(),
    level: z.coerce.number().int().min(-100).max(100).optional(),
    isActive: z.boolean().optional(),
  })
  .openapi('UpdatePelayananRoleInput');
export type UpdatePelayananRoleInput = z.infer<typeof updatePelayananRoleSchema>;

// ===== Assign Jemaat ke Pelayanan =====
export const assignJemaatPelayananSchema = z
  .object({
    jemaatId: uuidSchema,
    pelayananId: uuidSchema,
    pelayananRoleId: uuidSchema,
    tanggalMulai: z.string().date().optional(),    // default now
    catatan: z.string().trim().optional(),
  })
  .openapi('AssignJemaatPelayananInput');
export type AssignJemaatPelayananInput = z.infer<typeof assignJemaatPelayananSchema>;

export const updateJemaatPelayananSchema = z
  .object({
    pelayananRoleId: uuidSchema.optional(),
    tanggalSelesai: z.string().date().optional(), // mengakhiri penugasan
    isActive: z.boolean().optional(),
    catatan: z.string().trim().optional(),
  })
  .openapi('UpdateJemaatPelayananInput');
export type UpdateJemaatPelayananInput = z.infer<typeof updateJemaatPelayananSchema>;

// ===== Link Pelayanan ke Ibadah =====
export const linkIbadahPelayananSchema = z
  .object({
    ibadahId: uuidSchema,
    pelayananId: uuidSchema,
  })
  .openapi('LinkIbadahPelayananInput');
export type LinkIbadahPelayananInput = z.infer<typeof linkIbadahPelayananSchema>;

// ===== Assign Petugas (jemaat) ke Ibadah-Pelayanan =====
export const assignPetugasSchema = z
  .object({
    ibadahPelayananId: uuidSchema,
    jemaatId: uuidSchema,
    pelayananRoleId: uuidSchema,
    catatan: z.string().trim().optional(),
  })
  .openapi('AssignPetugasInput');
export type AssignPetugasInput = z.infer<typeof assignPetugasSchema>;

export const updatePetugasSchema = z
  .object({
    pelayananRoleId: uuidSchema.optional(),
    catatan: z.string().trim().optional(),
  })
  .openapi('UpdatePetugasInput');
export type UpdatePetugasInput = z.infer<typeof updatePetugasSchema>;
