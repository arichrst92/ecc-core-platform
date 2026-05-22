/**
 * Maintenance ops endpoints — admin manual triggers untuk background jobs.
 *
 * Untuk operasi yang biasanya berjalan otomatis via scheduled-jobs.ts,
 * admin bisa trigger manual lewat sini. Berguna untuk ops debugging atau
 * saat butuh purge segera tanpa nunggu interval cron.
 *
 *   - GET  /admin/maintenance/refresh-token-stats  → diagnostic count
 *   - POST /admin/maintenance/refresh-token-cleanup → trigger cleanup expired
 */
import { Router } from 'express';
import { prisma } from '@ecc/database';
import { cleanupExpiredRefreshTokens } from '../../lib/scheduled-jobs.js';
import { audit } from '../../lib/audit.js';

export const maintenanceRouter = Router();

maintenanceRouter.get('/refresh-token-stats', async (_req, res) => {
  const now = new Date();
  const [total, expired, revoked, active] = await Promise.all([
    prisma.refreshToken.count(),
    prisma.refreshToken.count({ where: { expiresAt: { lt: now } } }),
    prisma.refreshToken.count({ where: { revokedAt: { not: null } } }),
    prisma.refreshToken.count({
      where: { expiresAt: { gte: now }, revokedAt: null },
    }),
  ]);
  res.json({
    success: true,
    data: { total, expired, revoked, active, asOf: now },
  });
});

maintenanceRouter.post('/refresh-token-cleanup', async (req, res) => {
  const startMs = Date.now();
  const deleted = await cleanupExpiredRefreshTokens();
  const tookMs = Date.now() - startMs;
  audit(req, {
    action: 'DELETE',
    resource: 'refresh_token',
    resourceLabel: `[maintenance] purge ${deleted} expired tokens (${tookMs}ms)`,
    metadata: { kind: 'refresh-token-cleanup', deleted, tookMs },
  });
  res.json({ success: true, data: { deleted, tookMs } });
});
