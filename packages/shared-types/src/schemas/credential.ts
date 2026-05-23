/**
 * Credential vault — admin store third-party credentials.
 *
 * Master-password gate diluar JWT — header `X-Credential-Master` wajib di
 * semua endpoint /admin/credential/*. Verified vs env `CREDENTIAL_MASTER_PASSWORD`.
 *
 * Schema field semantik:
 *   - nama: required (display key, harus ada untuk listing)
 *   - sisanya: opsional
 */
import { z } from 'zod';
import { emptyToUndefined } from './common.js';

export const createCredentialSchema = z.object({
  nama: z.string().trim().min(1).max(255).openapi({ example: 'Fonnte WhatsApp Gateway' }),
  email: emptyToUndefined(z.string().trim().email().max(255)),
  username: emptyToUndefined(z.string().trim().max(255)),
  noHpTerdaftar: emptyToUndefined(z.string().trim().max(100)),
  linkAkses: emptyToUndefined(z.string().trim().url().max(500)),
  recoveryEmail: emptyToUndefined(z.string().trim().email().max(255)),
  catatan: emptyToUndefined(z.string().trim().max(5000)),
});
export type CreateCredentialInput = z.infer<typeof createCredentialSchema>;

export const updateCredentialSchema = z.object({
  nama: z.string().trim().min(1).max(255).optional(),
  email: emptyToUndefined(z.string().trim().email().max(255)),
  username: emptyToUndefined(z.string().trim().max(255)),
  noHpTerdaftar: emptyToUndefined(z.string().trim().max(100)),
  linkAkses: emptyToUndefined(z.string().trim().url().max(500)),
  recoveryEmail: emptyToUndefined(z.string().trim().email().max(255)),
  catatan: emptyToUndefined(z.string().trim().max(5000)),
});
export type UpdateCredentialInput = z.infer<typeof updateCredentialSchema>;

/** Unlock body — verify master password. */
export const unlockCredentialSchema = z.object({
  password: z.string().min(1).max(500),
});
export type UnlockCredentialInput = z.infer<typeof unlockCredentialSchema>;
