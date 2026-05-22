/**
 * Maintenance ops endpoints — admin manual triggers untuk background jobs +
 * diagnostic.
 *
 *   - GET  /admin/maintenance/refresh-token-stats
 *   - POST /admin/maintenance/refresh-token-cleanup
 *   - GET  /admin/maintenance/audit-log-stats
 *   - POST /admin/maintenance/audit-log-cleanup
 *   - GET  /admin/maintenance/notification-stats
 *   - POST /admin/maintenance/dispatch-ibadah-reminder
 *   - POST /admin/maintenance/dispatch-event-reminder
 *   - GET  /admin/maintenance/notification-logs    (recent 200, filter type/status)
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@ecc/database';
import {
  cleanupExpiredRefreshTokens,
  cleanupOldAuditLogs,
  dispatchIbadahReminders,
  dispatchEventReminders,
} from '../../lib/scheduled-jobs.js';
import { audit } from '../../lib/audit.js';

export const maintenanceRouter = Router();

// ============================================================
//  Refresh token
// ============================================================
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

// ============================================================
//  Audit log
// ============================================================
maintenanceRouter.get('/audit-log-stats', async (_req, res) => {
  const now = new Date();
  const retentionDays = Number(process.env.AUDIT_LOG_RETENTION_DAYS ?? 365);
  const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
  const [total, old, last7Days] = await Promise.all([
    prisma.auditLog.count(),
    prisma.auditLog.count({ where: { createdAt: { lt: cutoff } } }),
    prisma.auditLog.count({
      where: { createdAt: { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) } },
    }),
  ]);
  res.json({
    success: true,
    data: {
      total,
      eligibleForCleanup: old,
      last7Days,
      retentionDays,
      cutoffDate: cutoff,
      asOf: now,
    },
  });
});

maintenanceRouter.post('/audit-log-cleanup', async (req, res) => {
  const startMs = Date.now();
  const deleted = await cleanupOldAuditLogs();
  const tookMs = Date.now() - startMs;
  audit(req, {
    action: 'DELETE',
    resource: 'audit_log',
    resourceLabel: `[maintenance] purge ${deleted} old audit logs (${tookMs}ms)`,
    metadata: { kind: 'audit-log-cleanup', deleted, tookMs },
  });
  res.json({ success: true, data: { deleted, tookMs } });
});

// ============================================================
//  Notification log
// ============================================================
maintenanceRouter.get('/notification-stats', async (_req, res) => {
  const now = new Date();
  const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const grouped = await prisma.notificationLog.groupBy({
    by: ['type', 'status'],
    where: { createdAt: { gte: last7Days } },
    _count: { _all: true },
  });
  // Reshape: { [type]: { SENT, FAILED, PENDING } }
  const byType: Record<string, Record<string, number>> = {};
  for (const g of grouped) {
    byType[g.type] ??= { SENT: 0, FAILED: 0, PENDING: 0 };
    byType[g.type]![g.status] = g._count._all;
  }
  res.json({
    success: true,
    data: {
      byTypeLast7Days: byType,
      window: { from: last7Days, to: now },
    },
  });
});

const recentLogsQuerySchema = z.object({
  type: z.enum(['IBADAH_REMINDER', 'EVENT_REMINDER']).optional(),
  status: z.enum(['PENDING', 'SENT', 'FAILED']).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

maintenanceRouter.get('/notification-logs', async (req, res) => {
  const q = recentLogsQuerySchema.parse(req.query);
  const where: any = {};
  if (q.type) where.type = q.type;
  if (q.status) where.status = q.status;
  const rows = await prisma.notificationLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: q.limit,
    include: {
      jemaat: { select: { id: true, namaLengkap: true, noHp: true } },
    },
  });
  res.json({ success: true, data: rows });
});

maintenanceRouter.post('/dispatch-ibadah-reminder', async (req, res) => {
  const startMs = Date.now();
  const result = await dispatchIbadahReminders();
  const tookMs = Date.now() - startMs;
  audit(req, {
    action: 'CREATE',
    resource: 'notification_log',
    resourceLabel: `[maintenance] manual dispatch ibadah reminder (sent=${result.sent}, failed=${result.failed}, skipped=${result.skipped}) — ${tookMs}ms`,
    metadata: { kind: 'manual-dispatch-ibadah-reminder', ...result, tookMs },
  });
  res.json({ success: true, data: { ...result, tookMs } });
});

maintenanceRouter.post('/dispatch-event-reminder', async (req, res) => {
  const startMs = Date.now();
  const result = await dispatchEventReminders();
  const tookMs = Date.now() - startMs;
  audit(req, {
    action: 'CREATE',
    resource: 'notification_log',
    resourceLabel: `[maintenance] manual dispatch event reminder (sent=${result.sent}, failed=${result.failed}, skipped=${result.skipped}) — ${tookMs}ms`,
    metadata: { kind: 'manual-dispatch-event-reminder', ...result, tookMs },
  });
  res.json({ success: true, data: { ...result, tookMs } });
});
