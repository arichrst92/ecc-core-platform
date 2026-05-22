/**
 * Server Health — diagnostic endpoint untuk tim ops post-production.
 *
 * GET /admin/server-health
 *
 * Mengembalikan:
 *   - OS info (platform, hostname, uptime sistem)
 *   - CPU (model, cores, load average 1m/5m/15m)
 *   - Memory (total, free, used, process RSS/heap)
 *   - Node runtime (version, process uptime, pid)
 *   - Disk usage UPLOADS_DIR (dir size)
 *   - Database stats (connection count, query latency sample)
 *   - Entity counts (jemaat aktif, ibadah aktif, cabang aktif)
 *   - Active session count (RefreshToken non-revoked, non-expired)
 *
 * Endpoint sengaja heavyweight (queries beberapa table). Jangan polling
 * lebih cepat dari setiap 5 detik.
 */
import { Router } from 'express';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { prisma } from '@ecc/database';
import { UPLOADS_DIR } from '../../lib/storage.js';
import { logger } from '../../lib/logger.js';

export const serverHealthRouter = Router();

/**
 * Recursive directory size (bytes). Skip kalau error (mis. permission denied
 * pada subdir tertentu) supaya endpoint tetap return.
 */
async function dirSize(dir: string): Promise<number> {
  let total = 0;
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      try {
        if (entry.isDirectory()) {
          total += await dirSize(full);
        } else if (entry.isFile()) {
          const st = await fs.stat(full);
          total += st.size;
        }
      } catch {
        // Skip file/dir yang tidak bisa di-stat (broken symlink, permission, dll)
      }
    }
  } catch {
    // Dir tidak ada / tidak bisa di-baca
    return 0;
  }
  return total;
}

serverHealthRouter.get('/', async (_req, res) => {
  const startMs = Date.now();

  // ===== OS + CPU =====
  const cpus = os.cpus();
  const cpuModel = cpus[0]?.model ?? 'unknown';
  const cpuCores = cpus.length;
  const loadAvg = os.loadavg(); // [1m, 5m, 15m] — semua Mac/Linux. Windows return [0,0,0].
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;

  // ===== Process =====
  const memUsage = process.memoryUsage();
  const procUptimeSec = Math.floor(process.uptime());
  const sysUptimeSec = Math.floor(os.uptime());

  // ===== Storage =====
  // Ukuran direktori uploads (rekursif). Kalau besar (>100k file) bisa lambat
  // — return promise dgn timeout safety implicit (no timeout, tapi
  // di-throttle via frontend polling interval).
  let uploadsBytes = 0;
  let uploadsError: string | null = null;
  try {
    uploadsBytes = await dirSize(UPLOADS_DIR);
  } catch (err: any) {
    uploadsError = err?.message ?? 'Unknown error reading UPLOADS_DIR';
  }

  // ===== Database =====
  let dbConnections: number | null = null;
  let dbLatencyMs: number | null = null;
  let dbVersion: string | null = null;
  try {
    const dbStart = Date.now();
    // Query ringan untuk measure latency
    const rows = (await prisma.$queryRawUnsafe<Array<{ version: string }>>(
      'SELECT version()',
    )) ?? [];
    dbLatencyMs = Date.now() - dbStart;
    dbVersion = rows[0]?.version ?? null;

    // PG-specific: pg_stat_activity untuk hitung connection
    const connRows = (await prisma.$queryRawUnsafe<
      Array<{ count: bigint | number }>
    >(`SELECT COUNT(*)::int as count FROM pg_stat_activity WHERE datname = current_database()`)) ?? [];
    const c = connRows[0]?.count;
    dbConnections = typeof c === 'bigint' ? Number(c) : (c ?? null);
  } catch (err) {
    logger.warn({ err }, 'server-health: DB stats query failed');
  }

  // ===== Entity counts (untuk quick sanity) =====
  const [jemaatAktif, ibadahAktif, cabangAktif, eventPublished, activeSessions] = await Promise.all([
    prisma.jemaat.count({ where: { isActive: true } }).catch(() => -1),
    prisma.ibadah.count({ where: { isActive: true } }).catch(() => -1),
    prisma.cabangGereja.count({ where: { isActive: true } }).catch(() => -1),
    prisma.event.count({ where: { isPublished: true } }).catch(() => -1),
    prisma.refreshToken
      .count({
        where: { expiresAt: { gte: new Date() }, revokedAt: null },
      })
      .catch(() => -1),
  ]);

  // ===== Recent jobs status (last 7 days) =====
  const last7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const notifGrouped = await prisma.notificationLog
    .groupBy({
      by: ['type', 'status'],
      where: { createdAt: { gte: last7Days } },
      _count: { _all: true },
    })
    .catch(() => []);

  const notifByType: Record<string, Record<string, number>> = {};
  for (const g of notifGrouped) {
    notifByType[g.type] ??= { SENT: 0, FAILED: 0, PENDING: 0 };
    notifByType[g.type]![g.status] = g._count._all;
  }

  const tookMs = Date.now() - startMs;
  res.json({
    success: true,
    data: {
      asOf: new Date(),
      tookMs,
      os: {
        platform: os.platform(),
        release: os.release(),
        arch: os.arch(),
        hostname: os.hostname(),
        nodeVersion: process.version,
        uptimeSec: sysUptimeSec,
      },
      cpu: {
        model: cpuModel,
        cores: cpuCores,
        loadAvg1m: loadAvg[0],
        loadAvg5m: loadAvg[1],
        loadAvg15m: loadAvg[2],
      },
      memory: {
        totalBytes: totalMem,
        freeBytes: freeMem,
        usedBytes: usedMem,
        usedPercent: totalMem > 0 ? (usedMem / totalMem) * 100 : 0,
      },
      process: {
        pid: process.pid,
        uptimeSec: procUptimeSec,
        memoryRssBytes: memUsage.rss,
        memoryHeapTotalBytes: memUsage.heapTotal,
        memoryHeapUsedBytes: memUsage.heapUsed,
        memoryExternalBytes: memUsage.external,
      },
      storage: {
        uploadsDir: UPLOADS_DIR,
        uploadsSizeBytes: uploadsBytes,
        uploadsError,
      },
      database: {
        connectionCount: dbConnections,
        queryLatencyMs: dbLatencyMs,
        version: dbVersion,
      },
      entities: {
        jemaatAktif,
        ibadahAktif,
        cabangAktif,
        eventPublished,
        activeSessions,
      },
      notifications: {
        last7Days: notifByType,
      },
      env: {
        nodeEnv: process.env.NODE_ENV ?? 'unknown',
        auditLogRetentionDays: Number(process.env.AUDIT_LOG_RETENTION_DAYS ?? 365),
        reminderHourStart: Number(process.env.REMINDER_SEND_HOUR_START ?? 7),
        reminderHourEnd: Number(process.env.REMINDER_SEND_HOUR_END ?? 10),
        fonnteConfigured: !!process.env.FONNTE_TOKEN,
        livenessSecretSet: !!process.env.LIVENESS_NONCE_SECRET,
      },
    },
  });
});
