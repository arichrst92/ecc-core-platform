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
export * from './schemas/pelayanan.js';
export * from './schemas/reservasi.js';
export * from './schemas/konten.js';
export * from './schemas/homecell.js';
export * from './schemas/event.js';
export * from './schemas/menu-catalog.js';
export * from './schemas/api-key.js';
export * from './schemas/family.js';
export * from './schemas/branch-change.js';
export * from './schemas/visit.js';
export * from './schemas/local-business.js';
export * from './schemas/delete-account.js';
export * from './schemas/legal.js';
export * from './schemas/app-version.js';
export * from './schemas/maintenance-mode.js';
export * from './schemas/credential.js';
export * from './schemas/diagnostics.js';
export * from './schemas/guest-public.js';

export * from './schemas/website-section.js';
export * from './schemas/homecell-schedule.js';
export * from './schemas/group.js';
