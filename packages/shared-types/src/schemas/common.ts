import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

// Pastikan z punya `.openapi()` method sebelum schema apa pun di-evaluate.
// Idempotent — aman dipanggil multi kali (tsx/CJS kadang load schema sebelum index.ts).
extendZodWithOpenApi(z);

/** UUID v4 string */
export const uuidSchema = z.string().uuid().openapi({ example: '550e8400-e29b-41d4-a716-446655440000' });

/** Pagination query params (untuk list endpoints) */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1).openapi({ example: 1 }),
  limit: z.coerce.number().int().min(1).max(100).default(20).openapi({ example: 20 }),
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

/** Indonesian phone number — disimpan dalam format E.164 (+62...) */
export const noHpSchema = z
  .string()
  .trim()
  .regex(/^\+62[0-9]{8,13}$/, 'Format no HP harus E.164 (+62...)')
  .openapi({ example: '+628123456789', description: 'Format E.164 Indonesia' });

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
