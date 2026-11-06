/** Kritik & Saran — konstanta & schema bersama (me + admin). */
import { z } from 'zod';
import { teksSchema } from '@ecc/shared-types';

export const FEEDBACK_KATEGORI = ['APLIKASI', 'IBADAH', 'PELAYANAN', 'EVENT', 'HOMECELL', 'LAINNYA'] as const;

export const createFeedbackSchema = z.object({
  tipe: z.enum(['KRITIK', 'SARAN']),
  kategori: z.enum(FEEDBACK_KATEGORI),
  isi: teksSchema(3000, 10, 6),
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
