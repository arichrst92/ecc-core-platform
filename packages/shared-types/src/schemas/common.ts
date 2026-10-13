import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';

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
/**
 * Normalisasi input no HP bebas → E.164 (`+<kode negara><nomor>`), semua negara.
 *
 * - `+65 9123 4567`, `0065 91234567`  → `+6591234567` (internasional apa adanya)
 * - `0812-3456-7890`, `812 3456 7890` → `+6281234567890` (lokal → default negara, ID)
 * - `6281234567890`                   → `+6281234567890` (kompatibel input lama tanpa "+")
 *
 * Return `null` kalau nomor tidak valid untuk negaranya (pakai libphonenumber-js).
 * Satu-satunya normalizer yang dipakai portal, ckids, core-api, dan auth.
 */
export function normalizePhoneNumber(
  input: string | number | null | undefined,
  defaultCountry: CountryCode = 'ID',
): string | null {
  let s = String(input ?? '').trim().replace(/[\s\-().]/g, '');
  if (!s) return null;
  if (s.startsWith('00')) s = `+${s.slice(2)}`;
  else if (!s.startsWith('+') && /^62\d{8,}$/.test(s)) s = `+${s}`;
  try {
    const p = s.startsWith('+')
      ? parsePhoneNumberFromString(s)
      : parsePhoneNumberFromString(s, defaultCountry);
    return p && p.isValid() ? p.number : null;
  } catch {
    return null;
  }
}

/** E.164 → tampilan internasional, mis. `+62 812-3456-7890`, `+65 9123 4567`. */
export function formatPhoneDisplay(e164: string | null | undefined): string {
  if (!e164) return '';
  try {
    return parsePhoneNumberFromString(e164)?.formatInternational() ?? e164;
  } catch {
    return e164;
  }
}

export const noHpSchema = z
  .string()
  .trim()
  // Terima input bebas (0812…, +65 9123 4567, 0065…) → simpan E.164 bersih.
  // Nomor lokal tanpa kode negara dianggap Indonesia.
  .transform((v, ctx) => {
    const n = normalizePhoneNumber(v);
    if (!n) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'No HP tidak valid. Pakai 08… untuk Indonesia, atau sertakan kode negara (mis. +65 9123 4567, +61 412 345 678).',
      });
      return z.NEVER;
    }
    return n;
  })
  .openapi({
    type: 'string',
    example: '+6281234567890',
    description:
      'No HP semua negara. Input boleh lokal Indonesia (08…) atau internasional (+65…, 0065…); disimpan sebagai E.164.',
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
