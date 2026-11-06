import './common.js'; // ensures z.openapi() extension applied
import { z } from 'zod';
import { uuidSchema, emptyToUndefined } from './common.js';

// ===== Pelayanan (master) =====
// ===== Ikon & warna pelayanan (Portal pilih, app & Portal tampilkan) =====
// Nama ikon Lucide (kebab-case) — HARUS sama dengan daftar di app mobile
// (src/components/ministry/MinistryIcon.tsx) & Portal (components/pelayanan/pelayanan-icon.tsx).
export const PELAYANAN_IKON = [
  'heart-handshake', 'camera', 'video', 'clapperboard', 'monitor', 'radio', 'music', 'mic', 'guitar', 'drum',
  'piano', 'headphones', 'speaker', 'lightbulb', 'palette', 'brush', 'pen-tool', 'flower-2', 'hand-helping',
  'hand-heart', 'users', 'baby', 'smile', 'heart', 'book-open', 'graduation-cap', 'church', 'flame', 'sparkles',
  'sun', 'star', 'coffee', 'utensils', 'car', 'shield', 'clipboard-list', 'megaphone', 'globe',
] as const;
export type PelayananIkon = (typeof PELAYANAN_IKON)[number];

/** Warna aksen pelayanan: solid (ikon/aksen), bg (latar lembut), fg (teks di atas bg). */
export const PELAYANAN_WARNA = {
  orange: { label: 'Oranye ECC', solid: '#F97316', bg: '#FFEDD5', fg: '#C2410C' },
  amber: { label: 'Kuning', solid: '#F59E0B', bg: '#FEF3C7', fg: '#B45309' },
  rose: { label: 'Merah', solid: '#F43F5E', bg: '#FFE4E6', fg: '#BE123C' },
  pink: { label: 'Merah muda', solid: '#EC4899', bg: '#FCE7F3', fg: '#BE185D' },
  violet: { label: 'Ungu', solid: '#8B5CF6', bg: '#EDE9FE', fg: '#6D28D9' },
  sky: { label: 'Biru', solid: '#0EA5E9', bg: '#E0F2FE', fg: '#0369A1' },
  teal: { label: 'Tosca', solid: '#14B8A6', bg: '#CCFBF1', fg: '#0F766E' },
  green: { label: 'Hijau', solid: '#22C55E', bg: '#DCFCE7', fg: '#15803D' },
} as const;
export type PelayananWarna = keyof typeof PELAYANAN_WARNA;
const warnaKeys = Object.keys(PELAYANAN_WARNA) as [PelayananWarna, ...PelayananWarna[]];

export const createPelayananSchema = z
  .object({
    nama: z.string().trim().min(2).max(100),
    deskripsi: emptyToUndefined(z.string().trim()),
    ikon: z.enum(PELAYANAN_IKON).nullish(),
    warna: z.enum(warnaKeys).nullish(),
  })
  .openapi('CreatePelayananInput');
export type CreatePelayananInput = z.infer<typeof createPelayananSchema>;

export const updatePelayananSchema = z
  .object({
    nama: z.string().trim().min(2).max(100).optional(),
    deskripsi: emptyToUndefined(z.string().trim()),
    ikon: z.enum(PELAYANAN_IKON).nullish(),
    warna: z.enum(warnaKeys).nullish(),
    isActive: z.boolean().optional(),
  })
  .openapi('UpdatePelayananInput');
export type UpdatePelayananInput = z.infer<typeof updatePelayananSchema>;

// ===== PelayananRole =====
export const createPelayananRoleSchema = z
  .object({
    pelayananId: uuidSchema,
    nama: z.string().trim().min(2).max(100),
    deskripsi: emptyToUndefined(z.string().trim()),
    level: z.coerce.number().int().min(-100).max(100).default(0),
  })
  .openapi('CreatePelayananRoleInput');
export type CreatePelayananRoleInput = z.infer<typeof createPelayananRoleSchema>;

export const updatePelayananRoleSchema = z
  .object({
    nama: z.string().trim().min(2).max(100).optional(),
    deskripsi: emptyToUndefined(z.string().trim()),
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
    tanggalMulai: emptyToUndefined(z.string().date()),
    catatan: emptyToUndefined(z.string().trim()),
  })
  .openapi('AssignJemaatPelayananInput');
export type AssignJemaatPelayananInput = z.infer<typeof assignJemaatPelayananSchema>;

export const updateJemaatPelayananSchema = z
  .object({
    pelayananRoleId: uuidSchema.optional(),
    tanggalSelesai: emptyToUndefined(z.string().date()),
    isActive: z.boolean().optional(),
    catatan: emptyToUndefined(z.string().trim()),
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
// tanggalIbadah:
//   undefined / "" → petugas default (berlaku untuk semua occurrence)
//   "YYYY-MM-DD"   → petugas override khusus tanggal itu
//
// canScanAttendance: kalau true, petugas ini berwenang scan QR kode jemaat
// untuk check-in via POST /admin/ibadah/:id/checkin.
export const assignPetugasSchema = z
  .object({
    ibadahPelayananId: uuidSchema,
    jemaatId: uuidSchema,
    pelayananRoleId: uuidSchema,
    tanggalIbadah: emptyToUndefined(z.string().date()),
    canScanAttendance: z.boolean().default(false),
    catatan: emptyToUndefined(z.string().trim()),
  })
  .openapi('AssignPetugasInput');
export type AssignPetugasInput = z.infer<typeof assignPetugasSchema>;

export const updatePetugasSchema = z
  .object({
    pelayananRoleId: uuidSchema.optional(),
    canScanAttendance: z.boolean().optional(),
    catatan: emptyToUndefined(z.string().trim()),
  })
  .openapi('UpdatePetugasInput');
export type UpdatePetugasInput = z.infer<typeof updatePetugasSchema>;

// ===== Occurrence cancel =====
export const cancelOccurrenceSchema = z
  .object({
    catatan: emptyToUndefined(z.string().trim()),
  })
  .openapi('CancelOccurrenceInput');
export type CancelOccurrenceInput = z.infer<typeof cancelOccurrenceSchema>;

// ===== Check-in Ibadah (scan QR kode jemaat) =====
export const ibadahCheckinSchema = z
  .object({
    kode: z
      .string()
      .trim()
      .min(4, 'Kode terlalu pendek')
      .max(20)
      .transform((v) => v.toUpperCase()),
    // YYYY-MM-DD — tanggal occurrence yang di-check-in. Default backend = today.
    tanggalIbadah: emptyToUndefined(z.string().date()),
    // Override warning (mis. kalau partisipasi sebelumnya CANCEL).
    force: z.boolean().default(false),
  })
  .openapi('IbadahCheckinInput');
export type IbadahCheckinInput = z.infer<typeof ibadahCheckinSchema>;
