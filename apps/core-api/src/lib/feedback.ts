/** Kritik & Saran — konstanta & schema bersama (me + admin). */
import { z } from 'zod';

export const FEEDBACK_KATEGORI = ['APLIKASI', 'IBADAH', 'PELAYANAN', 'EVENT', 'HOMECELL', 'LAINNYA'] as const;

export const createFeedbackSchema = z.object({
  tipe: z.enum(['KRITIK', 'SARAN']),
  kategori: z.enum(FEEDBACK_KATEGORI),
  isi: z.string().trim().min(10, 'Tulis minimal 10 karakter').max(3000),
  appInfo: z.string().trim().max(200).optional(),
});

export const replySchema = z.object({
  isi: z.string().trim().min(1, 'Balasan wajib diisi').max(3000),
});

export const feedbackPersonSelect = {
  id: true,
  namaLengkap: true,
  fotoUrl: true,
} as const;
