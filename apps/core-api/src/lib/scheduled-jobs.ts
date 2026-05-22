/**
 * In-process scheduled jobs untuk maintenance.
 *
 * Jobs:
 *   1. cleanupExpiredRefreshTokens — purge row `refresh_token` yang sudah lewat `expiresAt`.
 *
 * Strategy: pakai `setInterval` daripada library cron (no new dependency).
 * Jalankan satu kali setelah startup delay, lalu setiap CLEANUP_INTERVAL_MS.
 *
 * Catatan multi-instance: kalau backend di-scale ke >1 pod, simple setInterval
 * akan run di setiap pod (ok untuk DELETE idempotent, hanya boros query).
 * Untuk skala lebih besar, pindah ke external cron (k8s CronJob / GitHub
 * Actions / dst) atau pakai distributed lock (Redis SETNX).
 */
import { prisma } from '@ecc/database';
import { logger } from './logger.js';

// 6 jam — kompromi antara fresh data dan beban query.
const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;

// Tunggu 30 detik setelah startup baru kick off pertama, supaya tidak
// kompete dengan startup load (Prisma connect, dst).
const STARTUP_DELAY_MS = 30 * 1000;

/**
 * Hapus semua refresh token yang sudah lewat `expiresAt`.
 *
 * Logika:
 *   - Token expired (expiresAt < now()): hapus, tidak ada nilai security/function.
 *   - Token revoked + expired: hapus (window reuse-detection sudah lewat).
 *   - Token revoked + belum expired: KEEP sampai expiresAt — masih relevan
 *     untuk reuse detection (kalau bocor & dipakai sebelum expiresAt, server
 *     bisa detect "sudah di-revoke" lalu revoke semua user's sessions).
 *
 * Return: jumlah row yang dihapus.
 */
export async function cleanupExpiredRefreshTokens(): Promise<number> {
  const now = new Date();
  const result = await prisma.refreshToken.deleteMany({
    where: { expiresAt: { lt: now } },
  });
  return result.count;
}

/**
 * Kick off scheduled jobs. Idempotent: kalau dipanggil dua kali, return early
 * supaya tidak double-register interval.
 */
let started = false;
let intervalHandle: NodeJS.Timeout | null = null;

export function startScheduledJobs() {
  if (started) {
    logger.warn('startScheduledJobs() dipanggil lebih dari sekali — skip.');
    return;
  }
  started = true;

  const runOnce = async () => {
    const startMs = Date.now();
    try {
      const deleted = await cleanupExpiredRefreshTokens();
      const tookMs = Date.now() - startMs;
      logger.info(
        { job: 'cleanup-refresh-token', deleted, tookMs },
        `🧹 Refresh token cleanup: ${deleted} expired token(s) dihapus (${tookMs}ms)`,
      );
    } catch (err) {
      logger.error(
        { job: 'cleanup-refresh-token', err },
        'Refresh token cleanup gagal — akan retry di interval berikutnya.',
      );
    }
  };

  // Initial run setelah startup delay.
  setTimeout(() => {
    void runOnce();
  }, STARTUP_DELAY_MS);

  // Recurring run.
  intervalHandle = setInterval(() => {
    void runOnce();
  }, CLEANUP_INTERVAL_MS);

  // Pastikan interval tidak menahan process exit (penting untuk graceful shutdown / test).
  intervalHandle.unref?.();

  logger.info(
    { intervalMs: CLEANUP_INTERVAL_MS, startupDelayMs: STARTUP_DELAY_MS },
    '⏰ Scheduled jobs started: cleanup-refresh-token',
  );
}

/** Untuk test / shutdown — clear interval. */
export function stopScheduledJobs() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
  started = false;
}
