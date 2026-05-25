/**
 * Guest Mode Public Endpoints — query schemas.
 *
 * Mobile guest mode (M24+M25): browse-only tanpa signup. Endpoint di
 * /public/* (no auth, rate-limited per IP).
 *
 * Lihat docs/backend-request-public-endpoints-for-guest.md untuk konteks.
 */
import { z } from 'zod';
import { uuidSchema } from './common.js';

// ============================================================
// GET /public/ibadah/calendar
// ============================================================
export const publicIbadahCalendarQuerySchema = z.object({
  cabangId: uuidSchema.optional().openapi({
    description: 'Filter by cabang. Omit untuk lihat semua cabang.',
  }),
  from: z.string().date().optional().openapi({
    example: '2026-05-24',
    description: 'ISO date inklusif. Default = today.',
  }),
  to: z.string().date().optional().openapi({
    example: '2026-06-23',
    description: 'ISO date inklusif. Default = from + 30 hari.',
  }),
});
export type PublicIbadahCalendarQuery = z.infer<typeof publicIbadahCalendarQuerySchema>;

// ============================================================
// GET /public/event
// ============================================================
export const publicEventQuerySchema = z.object({
  cabangId: uuidSchema.optional().openapi({
    description: 'Filter by cabang. Omit untuk lihat semua cabang + sinode-level event.',
  }),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  page: z.coerce.number().int().min(1).default(1),
});
export type PublicEventQuery = z.infer<typeof publicEventQuerySchema>;

// ============================================================
// GET /public/local-market
// ============================================================
export const publicLocalMarketQuerySchema = z.object({
  cabangId: uuidSchema.optional().openapi({
    description: 'Filter by cabang. Omit untuk lihat semua.',
  }),
  industri: z.string().trim().max(64).optional().openapi({
    description: 'Filter substring di field industri (case-insensitive).',
  }),
  tipeBisnis: z.enum(['B2C', 'B2B', 'B2B2C']).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  page: z.coerce.number().int().min(1).default(1),
});
export type PublicLocalMarketQuery = z.infer<typeof publicLocalMarketQuerySchema>;

// ============================================================
// GET /public/news + /public/renungan
// Konten model di-pisah by tipe via path. Query params sama untuk keduanya.
// ============================================================
export const publicKontenQuerySchema = z.object({
  cabangId: uuidSchema.optional().openapi({
    description:
      'Filter by cabang (NEWS bisa scoped per cabang). Renungan biasanya ' +
      'global, jadi field ini di-ignore untuk /public/renungan kalau diset.',
  }),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  page: z.coerce.number().int().min(1).default(1),
});
export type PublicKontenQuery = z.infer<typeof publicKontenQuerySchema>;

// ============================================================
// GET /public/ministry — list pelayanan (tanpa data jemaat)
// Dipakai landing site untuk menampilkan ministry / pelayanan
// gereja secara publik. Anggota & roster sengaja dihilangkan
// supaya tidak ada PII jemaat di guest endpoint.
// ============================================================
export const publicMinistryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  page: z.coerce.number().int().min(1).default(1),
});
export type PublicMinistryQuery = z.infer<typeof publicMinistryQuerySchema>;
