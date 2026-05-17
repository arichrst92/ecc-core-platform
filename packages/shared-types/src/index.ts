/**
 * Shared types & Zod schemas — dipakai oleh apps/portal dan apps/core-api.
 *
 * Strategi: Zod sebagai single source of truth untuk runtime validation,
 * lalu `z.infer<>` untuk TypeScript type. Konsisten antara FE & BE.
 *
 * Kita extend Zod dengan `.openapi()` (dari @asteasolutions/zod-to-openapi)
 * di import time supaya semua schema bisa di-annotate untuk auto-generate spec.
 */
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

extendZodWithOpenApi(z);

export * from './schemas/common.js';
export * from './schemas/auth.js';
export * from './schemas/sinode.js';
export * from './schemas/cabang.js';
export * from './schemas/jemaat.js';
export * from './schemas/role.js';
export * from './schemas/ibadah.js';
export * from './schemas/keluarga.js';
