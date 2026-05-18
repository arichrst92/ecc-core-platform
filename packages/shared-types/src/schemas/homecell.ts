import './common.js';
import { z } from 'zod';
import { uuidSchema, emptyToUndefined } from './common.js';

// Hari minggu enum — selaras Prisma HariMinggu
export const hariMingguSchema = z.enum([
  'MINGGU',
  'SENIN',
  'SELASA',
  'RABU',
  'KAMIS',
  'JUMAT',
  'SABTU',
]);
export type HariMinggu = z.infer<typeof hariMingguSchema>;

// jam HH:mm
const jamSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Format jam HH:mm');

// ====================== HOMECELL AREA ======================
//
// PIC area harus jemaat dengan active Pelayanan="Penggembalaan" + Role="Zone Leader".
// Validasi dilakukan di backend (cross-table check).

export const createHomecellAreaSchema = z
  .object({
    cabangId: uuidSchema,
    nama: z.string().trim().min(2).max(100),
    deskripsi: emptyToUndefined(z.string().trim().max(1000)),
    picJemaatId: emptyToUndefined(uuidSchema),
    isActive: z.boolean().default(true),
  })
  .openapi('CreateHomecellAreaInput');
export type CreateHomecellAreaInput = z.infer<typeof createHomecellAreaSchema>;

export const updateHomecellAreaSchema = z
  .object({
    cabangId: emptyToUndefined(uuidSchema),
    nama: z.string().trim().min(2).max(100).optional(),
    deskripsi: emptyToUndefined(z.string().trim().max(1000)),
    picJemaatId: emptyToUndefined(uuidSchema),
    isActive: z.boolean().optional(),
  })
  .openapi('UpdateHomecellAreaInput');
export type UpdateHomecellAreaInput = z.infer<typeof updateHomecellAreaSchema>;

// ====================== HOMECELL ======================
//
// PIC homecell harus Pelayanan="Penggembalaan" + Role="Homecell Leader".

export const createHomecellSchema = z
  .object({
    areaId: uuidSchema,
    nama: z.string().trim().min(2).max(150),
    deskripsi: emptyToUndefined(z.string().trim().max(1000)),
    alamat: emptyToUndefined(z.string().trim().max(500)),
    hari: emptyToUndefined(hariMingguSchema),
    jam: emptyToUndefined(jamSchema),
    picJemaatId: emptyToUndefined(uuidSchema),
    isActive: z.boolean().default(true),
  })
  .openapi('CreateHomecellInput');
export type CreateHomecellInput = z.infer<typeof createHomecellSchema>;

export const updateHomecellSchema = z
  .object({
    areaId: emptyToUndefined(uuidSchema),
    nama: z.string().trim().min(2).max(150).optional(),
    deskripsi: emptyToUndefined(z.string().trim().max(1000)),
    alamat: emptyToUndefined(z.string().trim().max(500)),
    hari: emptyToUndefined(hariMingguSchema),
    jam: emptyToUndefined(jamSchema),
    picJemaatId: emptyToUndefined(uuidSchema),
    isActive: z.boolean().optional(),
  })
  .openapi('UpdateHomecellInput');
export type UpdateHomecellInput = z.infer<typeof updateHomecellSchema>;

// ====================== HOMECELL MEMBER ======================

export const addHomecellMemberSchema = z
  .object({
    jemaatId: uuidSchema,
    tanggalBergabung: emptyToUndefined(z.string().date()),
    catatan: emptyToUndefined(z.string().trim().max(500)),
  })
  .openapi('AddHomecellMemberInput');
export type AddHomecellMemberInput = z.infer<typeof addHomecellMemberSchema>;

export const updateHomecellMemberSchema = z
  .object({
    tanggalKeluar: emptyToUndefined(z.string().date()),
    isActive: z.boolean().optional(),
    catatan: emptyToUndefined(z.string().trim().max(500)),
  })
  .openapi('UpdateHomecellMemberInput');
export type UpdateHomecellMemberInput = z.infer<typeof updateHomecellMemberSchema>;
