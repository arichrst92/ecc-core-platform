/**
 * Zod schemas untuk Modul 28: CKids Point System + Hadiah Redeem.
 *
 * Konsumer: apps/core-api (validation), apps/ckids (types),
 * apps/mobile (types via generated JSON schema).
 */
import './common.js';
import { z } from 'zod';
import { uuidSchema, emptyToUndefined } from './common.js';

// ============================================================
//  Hadiah Katalog CRUD
// ============================================================
export const createHadiahSchema = z
  .object({
    cabangId: uuidSchema,
    nama: z.string().trim().min(2).max(200),
    deskripsi: emptyToUndefined(z.string().trim()),
    fotoUrl: emptyToUndefined(z.string().trim().max(500)),
    pointCost: z.number().int().positive().max(1_000_000),
    stock: z.number().int().nonnegative().default(0),
    isActive: z.boolean().default(true),
  })
  .openapi('CreateHadiahInput');
export type CreateHadiahInput = z.infer<typeof createHadiahSchema>;

export const updateHadiahSchema = z
  .object({
    nama: z.string().trim().min(2).max(200).optional(),
    deskripsi: emptyToUndefined(z.string().trim()),
    fotoUrl: emptyToUndefined(z.string().trim().max(500)),
    pointCost: z.number().int().positive().max(1_000_000).optional(),
    isActive: z.boolean().optional(),
  })
  .openapi('UpdateHadiahInput');
export type UpdateHadiahInput = z.infer<typeof updateHadiahSchema>;

// ============================================================
//  Stock Ops
// ============================================================
export const addStockSchema = z
  .object({
    quantity: z.number().int().positive().max(10_000),
    note: emptyToUndefined(z.string().trim().max(500)),
  })
  .openapi('AddStockInput');
export type AddStockInput = z.infer<typeof addStockSchema>;

// ============================================================
//  Redeem
// ============================================================
export const redeemHadiahSchema = z
  .object({
    // Anak yg redeem — scan QR jemaat = ambil dari Jemaat.kode → lookup ID
    jemaatId: uuidSchema,
    // Hadiah yg diambil
    hadiahId: uuidSchema,
    note: emptyToUndefined(z.string().trim().max(500)),
  })
  .openapi('RedeemHadiahInput');
export type RedeemHadiahInput = z.infer<typeof redeemHadiahSchema>;

// ============================================================
//  Point Award — dipanggil setelah check-in kids ibadah
// ============================================================
export const awardPointSchema = z
  .object({
    // Reservasi ID (dari response check-in)
    reservasiId: uuidSchema,
    amount: z.number().int().positive().max(10_000),
    note: emptyToUndefined(z.string().trim().max(500)),
  })
  .openapi('AwardPointInput');
export type AwardPointInput = z.infer<typeof awardPointSchema>;

// ============================================================
//  Manual point adjust (admin koreksi)
// ============================================================
export const adjustPointSchema = z
  .object({
    jemaatId: uuidSchema,
    cabangId: uuidSchema,
    // Bisa positive atau negative, tapi harus non-zero.
    amount: z.number().int().refine((v) => v !== 0, 'Amount tidak boleh 0'),
    note: z.string().trim().min(1).max(500), // wajib note untuk audit
  })
  .openapi('AdjustPointInput');
export type AdjustPointInput = z.infer<typeof adjustPointSchema>;

// ============================================================
//  Lookup jemaat by kode (QR scan di stall)
// ============================================================
export const lookupJemaatByKodeSchema = z
  .object({
    kode: z.string().trim().min(4).max(20),
    // Cabang scope untuk balance lookup (default = cabang selector aktif)
    cabangId: uuidSchema,
  })
  .openapi('LookupJemaatByKodeInput');
export type LookupJemaatByKodeInput = z.infer<typeof lookupJemaatByKodeSchema>;
