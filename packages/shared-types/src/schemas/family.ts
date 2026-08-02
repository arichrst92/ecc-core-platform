/**
 * Family relation schemas — dipakai oleh mobile app.
 *
 * Berbeda dari `jemaatRelasi` (master data dari admin portal),
 * FamilyRelation adalah self-managed network dari mobile app.
 *
 * Decision (2026-05-19): **auto-verify** — link langsung verified, tanpa
 * flow konfirmasi 2 arah. Kalau perlu, switch ke confirmation flow di
 * iteration berikutnya (kolom isVerified sudah ada di schema).
 */
import { z } from 'zod';
import { noHpSchema, uuidSchema, emptyToUndefined } from './common.js';

/**
 * Legacy enum — dipertahankan untuk backward compat mobile lama.
 * Endpoint tetap terima `role` enum ATAU `tipeRelasiId` (preferred, granular).
 * Backend auto-map role enum → tipeRelasiId via broad mapping.
 */
export const familyRoleSchema = z.enum([
  'SPOUSE',
  'CHILD',
  'PARENT',
  'SIBLING',
  'GUARDIAN',
  'OTHER',
]);
export type FamilyRole = z.infer<typeof familyRoleSchema>;

/**
 * Input dual: kirim EITHER role (enum) OR tipeRelasiId (uuid).
 * Kalau kedua-nya kosong → error di backend.
 */
const roleOrTipeInput = z
  .object({
    role: familyRoleSchema.optional(),
    tipeRelasiId: uuidSchema.optional(),
  })
  .refine((d) => d.role !== undefined || d.tipeRelasiId !== undefined, {
    message: 'Harus kirim role (enum) atau tipeRelasiId (uuid)',
  });

/**
 * Link existing jemaat ke family user (current) via kode jemaat (QR scan).
 * `role` dari perspektif user current → target.
 *   - SPOUSE: A spouse B
 *   - CHILD: target adalah anak dari user (= user PARENT of target)
 *   - PARENT: target adalah orang tua user (= user CHILD of target)
 *   - SIBLING: kakak/adik
 */
export const linkFamilyByKodeSchema = z
  .object({
    kode: z
      .string()
      .trim()
      .min(4)
      .max(20)
      .transform((s) => s.toUpperCase())
      .openapi({ example: 'A3K7P9XQ' }),
    role: familyRoleSchema.optional(),
    tipeRelasiId: uuidSchema.optional(),
  })
  .refine((d) => d.role !== undefined || d.tipeRelasiId !== undefined, {
    message: 'Kirim role atau tipeRelasiId',
    path: ['role'],
  })
  .openapi('LinkFamilyByKodeInput');
export type LinkFamilyByKodeInput = z.infer<typeof linkFamilyByKodeSchema>;

/** Link existing jemaat via no HP (untuk yang belum punya QR card). */
export const linkFamilyByPhoneSchema = z
  .object({
    noHp: noHpSchema,
    role: familyRoleSchema.optional(),
    tipeRelasiId: uuidSchema.optional(),
  })
  .refine((d) => d.role !== undefined || d.tipeRelasiId !== undefined, {
    message: 'Kirim role atau tipeRelasiId',
    path: ['role'],
  })
  .openapi('LinkFamilyByPhoneInput');
export type LinkFamilyByPhoneInput = z.infer<typeof linkFamilyByPhoneSchema>;

/**
 * Register jemaat baru sebagai anggota keluarga. Endpoint ini tidak butuh
 * OTP — user current sudah authenticated dan "menjamin" jemaat baru.
 *
 * Use case: anak balita tanpa HP, lansia tanpa HP, atau anggota keluarga
 * yang belum self-register di mobile.
 *
 * Kalau `noHp` tidak diisi:
 *   - Akun di-create tanpa noHp; primaryGuardianId = user current.
 *   - Tidak bisa login mandiri (perlu noHp untuk OTP login).
 */
export const registerFamilyNewSchema = z
  .object({
    namaLengkap: z.string().trim().min(2).max(255),
    role: familyRoleSchema.optional(),
    tipeRelasiId: uuidSchema.optional(),
    cabangId: uuidSchema.optional(),
    noHp: emptyToUndefined(noHpSchema),
    tanggalLahir: emptyToUndefined(z.string().date()),
    jenisKelamin: emptyToUndefined(z.enum(['L', 'P'])),
    alamat: emptyToUndefined(z.string().trim()),
  })
  .refine((d) => d.role !== undefined || d.tipeRelasiId !== undefined, {
    message: 'Kirim role atau tipeRelasiId',
    path: ['role'],
  })
  .openapi('RegisterFamilyNewInput');
export type RegisterFamilyNewInput = z.infer<typeof registerFamilyNewSchema>;

/** Update tipe relasi (mis. setelah re-marriage). */
export const updateFamilyRelationSchema = z
  .object({
    role: familyRoleSchema.optional(),
    tipeRelasiId: uuidSchema.optional(),
  })
  .refine((d) => d.role !== undefined || d.tipeRelasiId !== undefined, {
    message: 'Kirim role atau tipeRelasiId',
    path: ['role'],
  })
  .openapi('UpdateFamilyRelationInput');
export type UpdateFamilyRelationInput = z.infer<typeof updateFamilyRelationSchema>;
