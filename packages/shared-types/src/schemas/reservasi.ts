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

// ===== Checkout via Kode (Modul 26 — mirror check-in flow) =====
// Sama shape dengan checkinByKodeSchema, alias untuk kejelasan intent.
export const checkoutByKodeSchema = z
  .object({
    kode: z.string().trim().min(4).max(20).openapi({ example: 'R7K2X9P' }),
  })
  .openapi('CheckoutByKodeInput');
export type CheckoutByKodeInput = z.infer<typeof checkoutByKodeSchema>;

// ===== Walk-in (Modul 28-K — check-in tanpa reservasi upfront) =====
//
// Endpoint universal: admin scan/pilih jemaat + pilih ibadah + tanggal,
// backend auto-upsert Reservasi:
//   - checkin: create/flip status JOIN + joinedAt + generate kode + pickup code
//   - checkout: cari reservasi existing, set checkedOutAt
//   - pickup: cari kids reservasi, set pickedUpAt
export const walkInReservasiSchema = z
  .object({
    jemaatId: uuidSchema,
    ibadahId: uuidSchema,
    tanggalIbadah: z.string().date().openapi({ example: '2026-08-04' }),
    action: z.enum(['checkin', 'checkout', 'pickup']),
  })
  .openapi('WalkInReservasiInput');
export type WalkInReservasiInput = z.infer<typeof walkInReservasiSchema>;

// ===== Pickup via Kode Jemput (Modul 27 — ibadah anak) =====
//
// Admin scan/input 6-digit pickup code + scan QR jemaat (parent yg jemput).
// Backend validate: code unique dalam occurrence + belum di-pickup.
export const pickupByKodeSchema = z
  .object({
    // 6-digit numeric pickup code (dari app parent).
    pickupCode: z.string().trim().regex(/^\d{6}$/, 'Kode jemput harus 6 digit angka'),
    // Kode reservasi anak (dari QR jemaat anak). Optional — kalau tidak dikirim,
    // backend lookup by pickupCode saja (asal unique dalam occurrence hari ini).
    kodeReservasi: z.string().trim().min(4).max(20).optional(),
    // Jemaat yg jemput (parent/wali) — dari QR jemaat yg scan admin. Optional.
    pickedUpByJemaatId: uuidSchema.optional(),
  })
  .openapi('PickupByKodeInput');
export type PickupByKodeInput = z.infer<typeof pickupByKodeSchema>;
