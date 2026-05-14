import { z } from 'zod';
import { uuidSchema } from './common.js';

export const tipeJadwalSchema = z.enum(['WEEKLY', 'BIWEEKLY', 'MONTHLY']);
export const hariMingguSchema = z.enum(['MINGGU', 'SENIN', 'SELASA', 'RABU', 'KAMIS', 'JUMAT', 'SABTU']);

// ===== Kategori Ibadah =====
export const createKategoriIbadahSchema = z.object({
  nama: z.string().trim().min(2).max(100),
  deskripsi: z.string().trim().optional(),
});
export type CreateKategoriIbadahInput = z.infer<typeof createKategoriIbadahSchema>;
export const updateKategoriIbadahSchema = createKategoriIbadahSchema.partial().extend({ isActive: z.boolean().optional() });
export type UpdateKategoriIbadahInput = z.infer<typeof updateKategoriIbadahSchema>;

// ===== Ibadah =====
const jamRegex = /^([01]\d|2[0-3]):[0-5]\d$/;     // HH:mm

export const createIbadahSchema = z
  .object({
    cabangId: uuidSchema,
    kategoriIbadahId: uuidSchema,
    nama: z.string().trim().min(2).max(255),
    tipeJadwal: tipeJadwalSchema,
    tanggalMulai: z.string().date(),
    hari: hariMingguSchema.optional().nullable(),
    jamMulai: z.string().regex(jamRegex, 'Format jam HH:mm'),
    jamSelesai: z.string().regex(jamRegex, 'Format jam HH:mm'),
    lokasi: z.string().trim().optional(),
    isOnline: z.boolean().default(false),
    linkStream: z.string().url().optional().nullable(),
    deskripsi: z.string().trim().optional(),
  })
  .refine(
    (d) => (d.tipeJadwal === 'MONTHLY' ? true : !!d.hari),
    { message: 'Field hari wajib untuk WEEKLY/BIWEEKLY', path: ['hari'] },
  )
  .refine(
    (d) => (!d.isOnline ? true : !!d.linkStream),
    { message: 'linkStream wajib jika ibadah online', path: ['linkStream'] },
  );
export type CreateIbadahInput = z.infer<typeof createIbadahSchema>;

export const updateIbadahSchema = z.object({
  cabangId: uuidSchema.optional(),
  kategoriIbadahId: uuidSchema.optional(),
  nama: z.string().trim().min(2).max(255).optional(),
  tipeJadwal: tipeJadwalSchema.optional(),
  tanggalMulai: z.string().date().optional(),
  hari: hariMingguSchema.optional().nullable(),
  jamMulai: z.string().regex(jamRegex).optional(),
  jamSelesai: z.string().regex(jamRegex).optional(),
  lokasi: z.string().trim().optional(),
  isOnline: z.boolean().optional(),
  linkStream: z.string().url().optional().nullable(),
  deskripsi: z.string().trim().optional(),
  isActive: z.boolean().optional(),
});
export type UpdateIbadahInput = z.infer<typeof updateIbadahSchema>;
