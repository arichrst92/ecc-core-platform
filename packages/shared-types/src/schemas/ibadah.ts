import { z } from 'zod';
import { uuidSchema, emptyToUndefined } from './common.js';

/** Radius self check-in (meter). '' / null = boleh di mana saja; undefined = tidak diubah. */
const selfCheckinRadiusSchema = z
  .preprocess(
    (v) => (v === '' ? null : v),
    z.union([z.null(), z.coerce.number().int().min(10, 'Radius minimal 10 m').max(50000, 'Radius maksimal 50 km')]),
  )
  .optional();

/**
 * Jumlah seat — hanya untuk pendataan % okupansi, TIDAK membatasi check-in.
 * '' / null / NaN = tidak diisi; undefined = tidak diubah.
 */
const kapasitasSeatSchema = z
  .preprocess(
    (v) => (v === '' || (typeof v === 'number' && Number.isNaN(v)) ? null : v),
    z.union([z.null(), z.coerce.number().int().min(1, 'Seat minimal 1').max(1_000_000)]),
  )
  .optional();

export const tipeJadwalSchema = z.enum(['WEEKLY', 'BIWEEKLY', 'MONTHLY', 'ONCE']);
export const hariMingguSchema = z.enum(['MINGGU', 'SENIN', 'SELASA', 'RABU', 'KAMIS', 'JUMAT', 'SABTU']);

// ===== Kategori Ibadah =====
export const createKategoriIbadahSchema = z.object({
  nama: z.string().trim().min(2).max(100),
  deskripsi: emptyToUndefined(z.string().trim()),
});
export type CreateKategoriIbadahInput = z.infer<typeof createKategoriIbadahSchema>;

export const updateKategoriIbadahSchema = z.object({
  nama: z.string().trim().min(2).max(100).optional(),
  deskripsi: emptyToUndefined(z.string().trim()),
  isActive: z.boolean().optional(),
});
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
    hari: emptyToUndefined(hariMingguSchema),
    jamMulai: z.string().regex(jamRegex, 'Format jam HH:mm'),
    jamSelesai: z.string().regex(jamRegex, 'Format jam HH:mm'),
    lokasi: emptyToUndefined(z.string().trim()),
    // Link Google Maps / koordinat "lat, lng" — untuk cek radius self check-in.
    mapsUrl: emptyToUndefined(z.string().trim().max(2000)),
    // Radius self check-in (meter). null/'' = boleh di mana saja.
    selfCheckinRadiusM: selfCheckinRadiusSchema,
    kapasitasSeat: kapasitasSeatSchema,
    isOnline: z.boolean().default(false),
    linkOnline: emptyToUndefined(z.string().url()),
    // Modul 26 — toggle wajib checkout (biasanya untuk ibadah anak)
    requiresCheckout: z.boolean().default(false),
    // Modul 27 — flag ibadah anak: mobile tampil badge, checkin auto-gen pickup code
    isKidsIbadah: z.boolean().default(false),
    deskripsi: emptyToUndefined(z.string().trim()),
  })
  .refine(
    // Hari hanya wajib untuk recurring weekly/biweekly.
    // MONTHLY pakai day-of-month dari tanggalMulai, ONCE = sekali di tanggal_mulai.
    (d) => (d.tipeJadwal === 'WEEKLY' || d.tipeJadwal === 'BIWEEKLY' ? !!d.hari : true),
    { message: 'Field hari wajib untuk jadwal Mingguan / Dua Mingguan', path: ['hari'] },
  )
  .refine(
    (d) => (!d.isOnline ? true : !!d.linkOnline),
    { message: 'linkOnline wajib jika ibadah online', path: ['linkOnline'] },
  );
export type CreateIbadahInput = z.infer<typeof createIbadahSchema>;

export const updateIbadahSchema = z.object({
  cabangId: uuidSchema.optional(),
  kategoriIbadahId: uuidSchema.optional(),
  nama: z.string().trim().min(2).max(255).optional(),
  tipeJadwal: tipeJadwalSchema.optional(),
  tanggalMulai: emptyToUndefined(z.string().date()),
  hari: emptyToUndefined(hariMingguSchema),
  jamMulai: emptyToUndefined(z.string().regex(jamRegex)),
  jamSelesai: emptyToUndefined(z.string().regex(jamRegex)),
  lokasi: emptyToUndefined(z.string().trim()),
  mapsUrl: z.union([z.string().trim().max(2000), z.null()]).optional(),
  // Radius self check-in (meter). null/'' = boleh di mana saja.
  selfCheckinRadiusM: selfCheckinRadiusSchema,
  kapasitasSeat: kapasitasSeatSchema,
  isOnline: z.boolean().optional(),
  linkOnline: emptyToUndefined(z.string().url()),
  requiresCheckout: z.boolean().optional(),
  isKidsIbadah: z.boolean().optional(),
  deskripsi: emptyToUndefined(z.string().trim()),
  isActive: z.boolean().optional(),
});
export type UpdateIbadahInput = z.infer<typeof updateIbadahSchema>;
