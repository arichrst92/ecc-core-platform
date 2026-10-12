/**
 * Jeda toleransi rotasi refresh token.
 *
 * Refresh token yang baru saja dirotasi (revoked < ROTATION_GRACE_MS lalu)
 * dianggap race antar-tab, bukan reuse/pencurian → tidak memicu revoke semua sesi.
 */
export const ROTATION_GRACE_MS = 2 * 60 * 1000;

export function isWithinRotationGrace(revokedAt: Date, now: Date = new Date()): boolean {
  const age = now.getTime() - revokedAt.getTime();
  return age >= 0 && age < ROTATION_GRACE_MS;
}
