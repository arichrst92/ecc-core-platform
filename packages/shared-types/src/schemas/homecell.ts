import './common.js';
import { z } from 'zod';
import { uuidSchema, emptyToUndefined } from './common.js';

// `hariMingguSchema` di-export dari schemas/ibadah.ts; tidak duplicate di sini.

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

// Catatan: alamat / hari / jam pertemuan TIDAK lagi disimpan via form karena
// di lapangan jadwal homecell ditentukan oleh kesepakatan dan bisa berubah
// tiap minggu. Kolom DB masih ada (data lama tetap), tapi tidak diekspos
// di form/UI.

// Kategori + rentang usia homecell. '' / null = kosong (umum / semua usia).
export const HOMECELL_KATEGORI = ['SINGLE', 'COUPLE'] as const;
export const HOMECELL_KATEGORI_LABEL: Record<(typeof HOMECELL_KATEGORI)[number], string> = {
  SINGLE: 'Single',
  COUPLE: 'Couple',
};
const kategoriField = z.preprocess((v) => (v === '' ? null : v), z.enum(HOMECELL_KATEGORI).nullable()).optional();
const usiaField = z
  .preprocess(
    // '' (select/teks kosong) dan NaN (input number kosong di portal) = tidak diisi.
    (v) => (v === '' || (typeof v === 'number' && Number.isNaN(v)) ? null : typeof v === 'string' ? Number(v) : v),
    z.number().int().min(0, 'Usia minimal 0').max(120, 'Usia maksimal 120').nullable(),
  )
  .optional();
const usiaRangeOk = (d: { usiaMin?: number | null; usiaMax?: number | null }) =>
  d.usiaMin == null || d.usiaMax == null || d.usiaMin <= d.usiaMax;
const usiaRangeMsg = { message: 'Usia minimal tidak boleh lebih besar dari usia maksimal.', path: ['usiaMax'] };

/** "20–30 th", "≥ 20 th", "≤ 30 th", atau null (semua usia). */
export function homecellUsiaLabel(min?: number | null, max?: number | null): string | null {
  if (min != null && max != null) return min === max ? `${min} th` : `${min}–${max} th`;
  if (min != null) return `≥ ${min} th`;
  if (max != null) return `≤ ${max} th`;
  return null;
}

/**
 * Indikator kehadiran homecell (persen 0–100):
 * merah 0–25 · oranye 26–50 · kuning 51–75 · hijau 76–100.
 */
export type HomecellAttendanceTier = 'merah' | 'oranye' | 'kuning' | 'hijau';
export function homecellAttendanceTier(pct: number): HomecellAttendanceTier {
  if (pct <= 25) return 'merah';
  if (pct <= 50) return 'oranye';
  if (pct <= 75) return 'kuning';
  return 'hijau';
}

export const createHomecellSchema = z
  .object({
    areaId: uuidSchema,
    nama: z.string().trim().min(2).max(150),
    deskripsi: emptyToUndefined(z.string().trim().max(1000)),
    alamat: emptyToUndefined(z.string().trim().max(1000)),
    // Link / koordinat Google Maps → lat/lng di-parse server (Cari homecell terdekat).
    mapsUrl: emptyToUndefined(z.string().trim().max(2000)),
    picJemaatId: emptyToUndefined(uuidSchema),
    kategori: kategoriField,
    usiaMin: usiaField,
    usiaMax: usiaField,
    isActive: z.boolean().default(true),
  })
  .refine(usiaRangeOk, usiaRangeMsg)
  .openapi('CreateHomecellInput');
export type CreateHomecellInput = z.infer<typeof createHomecellSchema>;

export const updateHomecellSchema = z
  .object({
    areaId: emptyToUndefined(uuidSchema),
    nama: z.string().trim().min(2).max(150).optional(),
    deskripsi: emptyToUndefined(z.string().trim().max(1000)),
    alamat: emptyToUndefined(z.string().trim().max(1000)),
    // '' / null = hapus lokasi; undefined = tidak diubah.
    mapsUrl: z.union([z.string().trim().max(2000), z.null()]).optional(),
    picJemaatId: emptyToUndefined(uuidSchema),
    kategori: kategoriField,
    usiaMin: usiaField,
    usiaMax: usiaField,
    isActive: z.boolean().optional(),
  })
  .refine(usiaRangeOk, usiaRangeMsg)
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
