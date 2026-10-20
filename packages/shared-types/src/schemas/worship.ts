/** ECC Worship — schema bersama (2026-10-20). */
import { z } from 'zod';

export const WORSHIP_ALBUM_TIPE = ['ALBUM', 'SINGLE'] as const;
export type WorshipAlbumTipe = (typeof WORSHIP_ALBUM_TIPE)[number];
export const WORSHIP_MODE = ['VOKAL', 'KARAOKE'] as const;
export type WorshipMode = (typeof WORSHIP_MODE)[number];

/** Batas ukuran file audio (MP3/M4A). */
export const WORSHIP_AUDIO_MAX_BYTES = 10 * 1024 * 1024;
/** Selisih durasi vokal vs karaoke yang masih dianggap aman (detik). */
export const WORSHIP_DURATION_TOLERANCE_SEC = 3;
/** Lagu dihitung "diputar" setelah N detik. */
export const WORSHIP_PLAY_COUNT_AFTER_SEC = 30;

const tahun = z.coerce.number().int().min(1900).max(2100).nullable().optional();
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v ? v : null));

export const createWorshipAlbumSchema = z.object({
  tipe: z.enum(WORSHIP_ALBUM_TIPE).default('ALBUM'),
  judul: z.string().trim().min(1, 'Judul wajib diisi').max(200),
  tahun,
  deskripsi: optText(3000),
});
export const updateWorshipAlbumSchema = z.object({
  judul: z.string().trim().min(1).max(200).optional(),
  tahun,
  deskripsi: optText(3000),
  isPublished: z.boolean().optional(),
});

export const createWorshipSongSchema = z.object({
  judul: z.string().trim().min(1, 'Judul wajib diisi').max(200),
  ciptaan: optText(200),
  tahun,
  lirik: optText(20000),
});
export const updateWorshipSongSchema = z.object({
  judul: z.string().trim().min(1).max(200).optional(),
  ciptaan: optText(200),
  tahun,
  lirik: optText(20000),
  isPublished: z.boolean().optional(),
});

export const syncLineSchema = z.object({
  t: z.number().min(0).max(36000),
  line: z.string().max(500),
});
export type SyncLine = z.infer<typeof syncLineSchema>;
export const saveSyncSchema = z.object({ lines: z.array(syncLineSchema).max(1000) });

export const reorderIdsSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(500) });
