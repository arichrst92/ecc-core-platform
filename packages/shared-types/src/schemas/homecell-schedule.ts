/**
 * Homecell Schedule + Attendance schemas.
 *
 * PIC homecell create jadwal pertemuan + scan QR member untuk record absensi.
 * Per request mobile docs/backend-request-homecell-schedule-attendance.md (2026-05-24).
 */
import { z } from 'zod';
import { uuidSchema } from './common.js';

// Maksimum hari mundur untuk create jadwal — prevent backdate spam.
const BACKDATE_MAX_DAYS = 30;

export const createHomecellScheduleSchema = z
  .object({
    tanggal: z.string().date().openapi({
      example: '2026-05-28',
      description: 'Tanggal pertemuan YYYY-MM-DD. Tidak boleh > 30 hari yang lalu.',
    }),
    // "HH:MM" — opsional (app lama tidak mengirim). Jam selesai harus > jam mulai.
    jamMulai: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Format jam HH:MM').nullish(),
    jamSelesai: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Format jam HH:MM').nullish(),
    lokasi: z.string().trim().min(1, 'Lokasi wajib').max(500),
    catatan: z
      .string()
      .trim()
      .max(1000)
      .optional()
      .transform((v) => (v === '' ? undefined : v)),
  })
  .refine(
    (d) => {
      const tanggal = new Date(d.tanggal);
      const cutoff = new Date(Date.now() - BACKDATE_MAX_DAYS * 24 * 60 * 60 * 1000);
      cutoff.setUTCHours(0, 0, 0, 0);
      return tanggal.getTime() >= cutoff.getTime();
    },
    {
      message: `Tanggal tidak boleh lebih dari ${BACKDATE_MAX_DAYS} hari yang lalu.`,
      path: ['tanggal'],
    },
  )
  .refine((d) => !d.jamMulai || !d.jamSelesai || d.jamSelesai > d.jamMulai, {
    message: 'Jam selesai harus setelah jam mulai.',
    path: ['jamSelesai'],
  });
export type CreateHomecellScheduleInput = z.infer<typeof createHomecellScheduleSchema>;

export const listHomecellSchedulesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
});
export type ListHomecellSchedulesQuery = z.infer<typeof listHomecellSchedulesQuerySchema>;

export const scanHomecellAttendanceSchema = z.object({
  // Kode jemaat dari QR code (mis. "ECC-2025-00123"). Free-form string,
  // resolve ke jemaatId di handler.
  kode: z.string().trim().min(1, 'Kode wajib').max(64),
});
export type ScanHomecellAttendanceInput = z.infer<typeof scanHomecellAttendanceSchema>;

/**
 * Bulk attendance — PIC tandai banyak jemaat sekaligus via checklist
 * (bukan QR scan 1-per-1). Max 50 kodes per request (homecell terbesar ~30).
 */
// Bulk: kirim `jemaatIds` (app ≥ 2.5.0) dan/atau `kodes`. Kode boleh null/kosong
// (anggota tanpa kode dari app lama) — baris itu dilaporkan error, sisanya tetap
// dicatat (dulu satu kode null membuat seluruh request 400).
export const bulkScanHomecellAttendanceSchema = z
  .object({
    kodes: z.array(z.string().trim().max(64).nullable()).max(50, 'Maksimal 50 kode per batch').optional(),
    jemaatIds: z.array(z.string().uuid()).max(50, 'Maksimal 50 jemaat per batch').optional(),
  })
  .refine((v) => (v.kodes?.length ?? 0) + (v.jemaatIds?.length ?? 0) > 0, { message: 'Minimal 1 jemaat' })
  .refine((v) => (v.kodes?.length ?? 0) + (v.jemaatIds?.length ?? 0) <= 50, { message: 'Maksimal 50 jemaat per batch' });
export type BulkScanHomecellAttendanceInput = z.infer<typeof bulkScanHomecellAttendanceSchema>;
