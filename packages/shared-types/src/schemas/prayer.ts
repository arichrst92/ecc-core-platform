/**
 * Prayer Request ("Doa") & Resolusi Tahunan — schema bersama (2026-10-18).
 * Kategori disimpan sebagai kode; label id/en di-resolve di client (i18n).
 */
import { z } from 'zod';

export const PRAYER_KATEGORI = [
  'HEALTH',
  'FAMILY',
  'WORK',
  'FINANCE',
  'STUDY',
  'RELATIONSHIP',
  'RESTORATION',
  'THANKSGIVING',
  'OTHER',
] as const;
export type PrayerKategori = (typeof PRAYER_KATEGORI)[number];

export const PRAYER_KATEGORI_LABEL: Record<PrayerKategori, { id: string; en: string }> = {
  HEALTH: { id: 'Kesehatan', en: 'Health' },
  FAMILY: { id: 'Keluarga', en: 'Family' },
  WORK: { id: 'Pekerjaan', en: 'Work' },
  FINANCE: { id: 'Keuangan', en: 'Finances' },
  STUDY: { id: 'Studi', en: 'Studies' },
  RELATIONSHIP: { id: 'Pernikahan & Hubungan', en: 'Marriage & Relationships' },
  RESTORATION: { id: 'Pemulihan', en: 'Restoration' },
  THANKSGIVING: { id: 'Ucapan Syukur', en: 'Thanksgiving' },
  OTHER: { id: 'Lainnya', en: 'Other' },
};

export const PRAYER_TARGET = ['DIRI_SENDIRI', 'KELUARGA', 'ORANG_LAIN'] as const;
export type PrayerTarget = (typeof PRAYER_TARGET)[number];
export const PRAYER_TARGET_LABEL: Record<PrayerTarget, { id: string; en: string }> = {
  DIRI_SENDIRI: { id: 'Diri sendiri', en: 'Myself' },
  KELUARGA: { id: 'Keluarga', en: 'Family' },
  ORANG_LAIN: { id: 'Orang lain', en: 'Someone else' },
};

/** Status tampilan: TERJAWAB diturunkan dari terjawabAt. */
export const PRAYER_STATUS = ['BARU', 'DITUGASKAN', 'SUDAH_DIDOAKAN'] as const;
export type PrayerStatus = (typeof PRAYER_STATUS)[number];
export type PrayerDisplayStatus = PrayerStatus | 'TERJAWAB';
export const PRAYER_STATUS_LABEL: Record<PrayerDisplayStatus, { id: string; en: string }> = {
  BARU: { id: 'Menunggu', en: 'Waiting' },
  DITUGASKAN: { id: 'Ditugaskan', en: 'Assigned' },
  SUDAH_DIDOAKAN: { id: 'Sudah Didoakan', en: 'Prayed For' },
  TERJAWAB: { id: 'Sudah Mendapat Jawaban Doa', en: 'Prayer Answered' },
};

const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

const prayerBase = z.object({
  kategori: z.enum(PRAYER_KATEGORI),
  untuk: z.enum(PRAYER_TARGET).default('DIRI_SENDIRI'),
  untukNama: optText(150),
  untukJemaatId: z.string().uuid().optional().nullable(),
  isi: z.string().trim().min(5, 'Tulis minimal 5 karakter').max(3000),
  isAnonim: z.boolean().default(false),
});

export const createPrayerSchema = prayerBase.superRefine((v, ctx) => {
  if (v.untuk === 'ORANG_LAIN' && !v.untukNama) {
    ctx.addIssue({ code: 'custom', path: ['untukNama'], message: 'Nama yang didoakan wajib diisi' });
  }
});
export type CreatePrayerInput = z.infer<typeof createPrayerSchema>;
export const updatePrayerSchema = createPrayerSchema;

export const markAnsweredSchema = z.object({
  answered: z.boolean(),
  kesaksian: optText(3000),
});

export const markPrayedSchema = z.object({ catatan: optText(1000) });

export const assignPrayerSchema = z.object({
  petugasId: z.string().uuid().nullable(),
});

export const prayerPetugasRolesSchema = z.object({
  items: z
    .array(z.object({ roleId: z.string().uuid(), subRoleId: z.string().uuid().nullable().optional() }))
    .max(50),
});

// ── Resolusi ────────────────────────────────────────────────
export const RESOLUSI_KATEGORI = [
  'SPIRITUAL',
  'FAMILY',
  'HEALTH',
  'CAREER',
  'FINANCE',
  'MINISTRY',
  'PERSONAL_GROWTH',
  'OTHER',
] as const;
export type ResolusiKategori = (typeof RESOLUSI_KATEGORI)[number];
export const RESOLUSI_KATEGORI_LABEL: Record<ResolusiKategori, { id: string; en: string }> = {
  SPIRITUAL: { id: 'Rohani', en: 'Spiritual' },
  FAMILY: { id: 'Keluarga', en: 'Family' },
  HEALTH: { id: 'Kesehatan', en: 'Health' },
  CAREER: { id: 'Karier', en: 'Career' },
  FINANCE: { id: 'Keuangan', en: 'Finances' },
  MINISTRY: { id: 'Pelayanan', en: 'Ministry' },
  PERSONAL_GROWTH: { id: 'Pengembangan Diri', en: 'Personal Growth' },
  OTHER: { id: 'Lainnya', en: 'Other' },
};

export const resolusiTahunSchema = z.coerce.number().int().min(2000).max(2100);

export const createResolusiSchema = z.object({
  tahun: resolusiTahunSchema,
  judul: z.string().trim().min(1, 'Judul wajib diisi').max(200),
  catatan: optText(2000),
  kategori: z.enum(RESOLUSI_KATEGORI),
  isDone: z.boolean().optional(),
});
export type CreateResolusiInput = z.infer<typeof createResolusiSchema>;

export const updateResolusiSchema = z.object({
  judul: z.string().trim().min(1).max(200).optional(),
  catatan: optText(2000),
  kategori: z.enum(RESOLUSI_KATEGORI).optional(),
  isDone: z.boolean().optional(),
});

export const reorderResolusiSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
});
