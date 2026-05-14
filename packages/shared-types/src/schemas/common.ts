import { z } from 'zod';

/** UUID v4 string */
export const uuidSchema = z.string().uuid();

/** Pagination query params (untuk list endpoints) */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(),
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
  .regex(/^\+62[0-9]{8,13}$/, 'Format no HP harus E.164 (+62...)');
