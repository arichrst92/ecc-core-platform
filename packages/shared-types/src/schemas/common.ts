import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { isValidPhoneNumber } from 'libphonenumber-js';

// Pastikan z punya `.openapi()` method sebelum schema apa pun di-evaluate.
// Idempotent — aman dipanggil multi kali (tsx/CJS kadang load schema sebelum index.ts).
extendZodWithOpenApi(z);

/** UUID v4 string */
export const uuidSchema = z.string().uuid().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' });

/** Pagination query params (untuk list endpoints) */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1).openapi({ example: 1 }),
  limit: z.coerce.number().int().min(1).max(500).default(20).openapi({ example: 20 }),
  search: z.string().trim().optional().openapi({ description: 'Free-text search' }),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

/** Pagination response envelope */
export interface Paginated<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/** Format standar response API */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * Phone number — disimpan dalam format E.164 internasional (`+<countryCode><digits>`).
 *
 * Per request 2026-05-20 (ecc-mobile-app/docs/backend-request-international-phone.md):
 * sebelumnya hardcode `+62` only, sekarang accept E.164 dari country apa saja
 * yang valid (jemaat diaspora, missionari, jemaat international).
 *
 * Validasi pakai `libphonenumber-js` (port resmi Google libphonenumber) —
 * mengerti rules per country (panjang digit, valid mobile prefix, dll).
 * Untuk `+62` behavior identical dengan regex lama, untuk country lain
 * kasih validasi yang akurat.
 *
 * Format storage: E.164 tanpa spasi atau pemisah, contoh:
 *   - +6281234567890   (Indonesia)
 *   - +6512345678      (Singapore)
 *   - +14155551234     (US)
 *   - +61412345678     (Australia)
 *
 * Mobile dev: normalize string dulu sebelum kirim (strip spasi/dash/parens,
 * pakai libphonenumber-js juga di client untuk konsistensi).
 */
export const noHpSchema = z
  .string()
  .trim()
  .refine(
    (v) => {
      try {
        return isValidPhoneNumber(v);
      } catch {
        return false;
      }
    },
    {
      message:
        'Format no HP harus E.164 internasional yang valid (contoh: +6281234567890, +6512345678, +14155551234)',
    },
  )
  .openapi({
    example: '+6281234567890',
    description:
      'E.164 international format (any country). Examples: +62... (ID), +65... (SG), +1... (US/CA), +61... (AU).',
  });

/**
 * Helper universal: terima `''` / `null` / `undefined` sebagai "tidak diisi"
 * (→ `undefined`), supaya field opsional dengan validasi format (email/url/date)
 * tidak gagal saat form HTML kirim string kosong.
 *
 * Pakai untuk SEMUA field opsional di create/update schemas.
 *
 *   const emailField = emptyToUndefined(z.string().trim().email());
 *   // Diterima: undefined, null, '', "user@example.com"
 *   // Ditolak:  "not-an-email"
 */
export const emptyToUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === '' || v === null ? undefined : v), schema.optional());

/** Common envelope schemas (untuk OpenAPI registration) */
export const successEnvelopeSchema = z.object({
  success: z.literal(true),
  data: z.any(),
  message: z.string().optional(),
});

export const errorEnvelopeSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.any().optional(),
  }),
});
