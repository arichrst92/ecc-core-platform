/**
 * Persetujuan S&K + Kebijakan Privasi (bukti consent).
 *
 *   GET  /admin/me/consent  → status (perlu setuju ulang atau tidak)
 *   POST /admin/me/consent  → catat persetujuan versi dokumen yang sedang terbit
 *   POST /auth/register     → field `consent` opsional (dicatat saat daftar)
 */
import { z } from 'zod';

export const consentAgeGroupSchema = z.enum(['ADULT', 'MINOR_WITH_GUARDIAN']);
export type ConsentAgeGroup = z.infer<typeof consentAgeGroupSchema>;

export const consentAcceptSchema = z.object({
  /** Wajib true — setuju S&K + Kebijakan Privasi. */
  acceptTerms: z.literal(true),
  /** Wajib true — persetujuan eksplisit data sensitif (keyakinan agama, data anak). */
  sensitiveData: z.literal(true),
  ageGroup: consentAgeGroupSchema,
  /** Versi yang ditampilkan di layar (dicatat untuk audit; server pakai versi terbit). */
  termsVersion: z.string().trim().max(20).optional(),
  privacyVersion: z.string().trim().max(20).optional(),
  language: z.string().trim().max(5).optional(),
  platform: z.string().trim().max(20).optional(),
  appVersion: z.string().trim().max(20).optional(),
});
export type ConsentAcceptInput = z.infer<typeof consentAcceptSchema>;

export interface ConsentStatus {
  required: boolean;
  current: { termsVersion: string | null; privacyVersion: string | null };
  latest: {
    termsVersion: string;
    privacyVersion: string;
    ageGroup: string | null;
    acceptedAt: string;
  } | null;
}
