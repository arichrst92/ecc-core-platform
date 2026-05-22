/**
 * Self-deactivation (delete account) untuk mobile.
 *
 * Endpoint: DELETE /admin/me. Soft delete — set Jemaat.isActive=false +
 * deactivatedAt + deactivationReason, revoke semua RefreshToken.
 */
import { z } from 'zod';
import { emptyToUndefined } from './common.js';

export const DELETE_ACCOUNT_CONFIRM_TEXT = 'HAPUS AKUN SAYA';

export const deleteMyAccountSchema = z.object({
  /** Wajib match exact text "HAPUS AKUN SAYA" untuk konfirmasi destructive action. */
  confirmText: z.literal(DELETE_ACCOUNT_CONFIRM_TEXT, {
    errorMap: () => ({
      message: `Konfirmasi tidak cocok. Harap ketik persis: "${DELETE_ACCOUNT_CONFIRM_TEXT}"`,
    }),
  }),
  /** Alasan opsional, untuk audit & analytics admin. */
  reason: emptyToUndefined(z.string().trim().max(500)),
});
export type DeleteMyAccountInput = z.infer<typeof deleteMyAccountSchema>;
