import './common.js';
import { z } from 'zod';
import { uuidSchema, emptyToUndefined } from './common.js';

/**
 * Scope catalog — harus sinkron dengan API_KEY_SCOPES di
 * apps/core-api/src/lib/api-key.ts.
 */
export const API_KEY_SCOPES = [
  'read:jemaat',
  'read:ibadah',
  'read:event',
  'read:news',
  'read:renungan',
  'read:reservasi',
  'write:reservasi',
] as const;

export const apiKeyScopeSchema = z.enum(API_KEY_SCOPES);
export type ApiKeyScope = z.infer<typeof apiKeyScopeSchema>;

// Catatan: sinodeId optional — kalau dikosongkan, key bersifat GLOBAL
// (akses lintas sinode). UI default sekarang membuat global key.
// scopes juga optional — kalau kosong, key punya FULL ACCESS ke semua
// endpoint yang di-protect requireApiKey middleware.
export const createApiKeySchema = z
  .object({
    sinodeId: emptyToUndefined(uuidSchema),
    nama: z
      .string()
      .trim()
      .min(2, 'Minimal 2 karakter')
      .max(255)
      .openapi({ example: 'Mobile App Global' }),
    scopes: z.array(apiKeyScopeSchema).default([]),
    expiresAt: emptyToUndefined(z.string().datetime({ offset: true }).or(z.string().date())),
  })
  .openapi('CreateApiKeyInput');
export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;

export const updateApiKeySchema = z
  .object({
    nama: z.string().trim().min(2).max(255).optional(),
    scopes: z.array(apiKeyScopeSchema).optional(),
    expiresAt: emptyToUndefined(z.string().datetime({ offset: true }).or(z.string().date())),
    isActive: z.boolean().optional(),
  })
  .openapi('UpdateApiKeyInput');
export type UpdateApiKeyInput = z.infer<typeof updateApiKeySchema>;
