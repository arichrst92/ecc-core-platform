import './common.js'; // ensures z.openapi() extension applied
import { z } from 'zod';
import { uuidSchema, emptyToUndefined } from './common.js';

export const reservasiStatusSchema = z.enum(['RESERVE', 'JOIN', 'CANCEL']);
export type ReservasiStatus = z.infer<typeof reservasiStatusSchema>;

// ===== Create Reservasi =====
// Kode di-generate server-side, jadi tidak ada di create payload.
export const createReservasiSchema = z
  .object({
    jemaatId: uuidSchema,
    ibadahId: uuidSchema,
    tanggalIbadah: z.string().date().openapi({ example: '2026-05-25' }),
    catatan: emptyToUndefined(z.string().trim()),
  })
  .openapi('CreateReservasiInput');
export type CreateReservasiInput = z.infer<typeof createReservasiSchema>;

// ===== Update Status (admin manual: bisa pindah ke status apa pun) =====
export const updateReservasiStatusSchema = z
  .object({
    status: reservasiStatusSchema,
    catatan: emptyToUndefined(z.string().trim()),
  })
  .openapi('UpdateReservasiStatusInput');
export type UpdateReservasiStatusInput = z.infer<typeof updateReservasiStatusSchema>;

// ===== Bulk Reserve =====
// Untuk bikin banyak reservasi sekaligus (mis. admin invite list jemaat).
export const bulkReserveSchema = z
  .object({
    ibadahId: uuidSchema,
    tanggalIbadah: z.string().date(),
    jemaatIds: z.array(uuidSchema).min(1).max(500),
  })
  .openapi('BulkReserveInput');
export type BulkReserveInput = z.infer<typeof bulkReserveSchema>;

// ===== Check-in via Kode (mobile scanner) =====
export const checkinByKodeSchema = z
  .object({
    kode: z.string().trim().min(4).max(20).openapi({ example: 'R7K2X9P' }),
  })
  .openapi('CheckinByKodeInput');
export type CheckinByKodeInput = z.infer<typeof checkinByKodeSchema>;
