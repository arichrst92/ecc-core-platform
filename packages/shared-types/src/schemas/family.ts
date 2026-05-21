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

export const familyRoleSchema = z.enum(['SPOUSE', 'CHILD', 'PARENT', 'SIBLING']);
export type FamilyRole = z.infer<typeof familyRoleSchema>;

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
    role: familyRoleSchema,
  })
  .openapi('LinkFamilyByKodeInput');
export type LinkFamilyByKodeInput = z.infer<typeof linkFamilyByKodeSchema>;

/** Link existing jemaat via no HP (untuk yang belum punya QR card). */
export const linkFamilyByPhoneSchema = z
  .object({
    noHp: noHpSchema,
    role: familyRoleSchema,
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
    role: familyRoleSchema,
    cabangId: uuidSchema.optional(),       // default = user current's cabangId
    noHp: emptyToUndefined(noHpSchema),     // null = dependent (anak/lansia)
    tanggalLahir: emptyToUndefined(z.string().date()),
    jenisKelamin: emptyToUndefined(z.enum(['L', 'P'])),
    alamat: emptyToUndefined(z.string().trim()),
  })
  .openapi('RegisterFamilyNewInput');
export type RegisterFamilyNewInput = z.infer<typeof registerFamilyNewSchema>;

/** Update role saja (mis. setelah re-marriage). */
export const updateFamilyRelationSchema = z
  .object({ role: familyRoleSchema })
  .openapi('UpdateFamilyRelationInput');
export type UpdateFamilyRelationInput = z.infer<typeof updateFamilyRelationSchema>;
