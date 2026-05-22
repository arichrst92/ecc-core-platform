/**
 * Visit (Movement) — pertemuan peer-to-peer antar jemaat via scan QR.
 *
 * Mobile flow:
 *   1. Jemaat A scan QR kode jemaat B.
 *   2. Mobile prompt: input judul (wajib) + lokasi (opsional).
 *   3. POST /admin/me/visits dengan { targetKode, judul, lokasi? }.
 *      → server validate kode, create row Visit dengan initiator=A, target=B.
 *   4. Setelah create, A & B masing-masing bisa edit note mereka sendiri
 *      lewat PATCH /admin/me/visits/:id/note { note }.
 *   5. A juga bisa edit judul (initiator-only) lewat PATCH /admin/me/visits/:id.
 *
 * Portal admin: read-only list + delete (moderation).
 */
import { z } from 'zod';
import { uuidSchema, emptyToUndefined, paginationQuerySchema } from './common.js';

// ===== Mobile: create visit (scan QR) =====
export const createVisitSchema = z.object({
  /** Kode QR jemaat target (8-char alphanumeric). Initiator = caller. */
  targetKode: z
    .string()
    .trim()
    .min(4)
    .max(20)
    .transform((v) => v.toUpperCase())
    .openapi({ example: 'A1B2C3D4', description: 'Kode QR jemaat yang di-scan' }),
  judul: z
    .string()
    .trim()
    .min(2, 'Judul minimal 2 karakter')
    .max(255)
    .openapi({ example: 'Kunjungan ke rumah Pak Budi' }),
  lokasi: emptyToUndefined(z.string().trim().max(500)),
});
export type CreateVisitInput = z.infer<typeof createVisitSchema>;

// ===== Mobile: edit judul (initiator-only) atau lokasi =====
export const updateVisitMetaSchema = z.object({
  judul: emptyToUndefined(z.string().trim().min(2).max(255)),
  lokasi: emptyToUndefined(z.string().trim().max(500)),
});
export type UpdateVisitMetaInput = z.infer<typeof updateVisitMetaSchema>;

// ===== Mobile: edit own note =====
export const updateVisitNoteSchema = z.object({
  note: z.string().trim().max(2000).openapi({
    description: 'Catatan dari caller ke peserta lawan. Boleh string kosong untuk hapus.',
  }),
});
export type UpdateVisitNoteInput = z.infer<typeof updateVisitNoteSchema>;

// ===== Mobile: list query =====
export const myVisitsQuerySchema = paginationQuerySchema.extend({
  /** Filter: 'all' (default) | 'initiator' (yang saya scan) | 'target' (yang scan saya). */
  role: z.enum(['all', 'initiator', 'target']).default('all'),
  from: emptyToUndefined(z.string().date()),
  to: emptyToUndefined(z.string().date()),
});
export type MyVisitsQuery = z.infer<typeof myVisitsQuerySchema>;

// ===== Admin portal: list query =====
export const adminVisitsQuerySchema = paginationQuerySchema.extend({
  /** Filter visits dimana minimal salah satu peserta dari cabang ini. */
  cabangId: emptyToUndefined(uuidSchema),
  /** Filter visits dimana jemaat ini terlibat (initiator OR target). */
  jemaatId: emptyToUndefined(uuidSchema),
  /** Range tanggal visit (inclusive). */
  from: emptyToUndefined(z.string().date()),
  to: emptyToUndefined(z.string().date()),
});
export type AdminVisitsQuery = z.infer<typeof adminVisitsQuerySchema>;
