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
  );
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
