/**
 * Admin Diagnostics — dashboard untuk pilot rollout observability.
 *
 * Endpoints:
 *   - GET    /admin/diagnostics/app-config              — read current config
 *   - PATCH  /admin/diagnostics/app-config              — update tune-able fields
 *   - GET    /admin/diagnostics/face-telemetry          — aggregate funnel + latency
 *   - GET    /admin/diagnostics/error-events            — aggregate by fingerprint
 *   - GET    /admin/diagnostics/error-events/:fingerprint — detail (events + breadcrumbs)
 *
 * Auth: requireAuth via parent adminRouter. RBAC gate: menu_key 'diagnostics'.
 */
import { Router } from 'express';
import { Prisma, prisma } from '@ecc/database';
import {
  appConfigUpdateSchema,
  faceTelemetryQuerySchema,
  errorEventQuerySchema,
} from '@ecc/shared-types';
import { BadRequest, NotFound } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';

export const diagnosticsAdminRouter = Router();

// ============================================================
//  GET /admin/diagnostics/app-config
// ============================================================
diagnosticsAdminRouter.get('/app-config', async (_req, res) => {
  const row = await prisma.appConfig.findUnique({ where: { id: 'global' } });
  if (!row) throw NotFound('App config singleton tidak ditemukan (run migration).');
  res.json({ success: true, data: row });
});

// ============================================================
//  PATCH /admin/diagnostics/app-config
// ============================================================
diagnosticsAdminRouter.patch('/app-config', async (req, res) => {
  const input = appConfigUpdateSchema.parse(req.body);
  if (Object.keys(input).length === 0) {
    throw BadRequest('Minimal satu field harus diisi untuk update.');
  }
  const userId = req.user?.sub ?? null;
  const updated = await prisma.appConfig.update({
    where: { id: 'global' },
    data: {
      ...input,
      updatedByUserId: userId,
    },
  });

  audit(req, {
    action: 'UPDATE',
    resource: 'app_config',
    resourceId: 'global',
    resourceLabel: 'App Config (singleton)',
    metadata: { changes: input },
  });

  res.json({ success: true, data: updated });
});

// ============================================================
//  GET /admin/diagnostics/face-telemetry
//  Aggregate funnel + latency p50/p95. Filter via query.
// ============================================================
diagnosticsAdminRouter.get('/face-telemetry', async (req, res) => {
  const q = faceTelemetryQuerySchema.parse(req.query);
  const from = q.from ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // default 7d
  const to = q.to ?? new Date();

  // WHERE clause builder.
  const where: Prisma.FaceTelemetryEventWhereInput = {
    timestamp: { gte: from, lte: to },
  };
  if (q.platform !== 'all') {
    // platform stored di JSONB device.platform — Prisma path syntax.
    where.device = { path: ['platform'], equals: q.platform };
  }
  if (q.flow !== 'all') {
    where.flow = q.flow;
  }
  if (q.release) {
    where.device = { ...(where.device as object), path: ['appVersion'], equals: q.release };
  }
  if (q.noHp) {
    where.noHp = q.noHp;
  }

  // Funnel aggregate — count per event type.
  const eventCounts = await prisma.faceTelemetryEvent.groupBy({
    by: ['event', 'outcome'],
    where,
    _count: { _all: true },
  });

  // Failure breakdown — by failureReason di event yang outcome=failure.
  const failureBreakdown = await prisma.faceTelemetryEvent.groupBy({
    by: ['failureReason'],
    where: { ...where, outcome: 'failure', failureReason: { not: null } },
    _count: { _all: true },
    orderBy: { _count: { failureReason: 'desc' } },
    take: 10,
  });

  // Latency stats — pakai raw SQL untuk percentile (Prisma tidak support
  // built-in). PostgreSQL `percentile_cont` cocok untuk continuous data.
  const latencyRows = await prisma.$queryRaw<
    Array<{
      step: string;
      p50: number | null;
      p95: number | null;
      avg: number | null;
      samples: bigint;
    }>
  >`
    SELECT step, p50::float8 AS p50, p95::float8 AS p95, avg::float8 AS avg, samples
    FROM (
      SELECT
        'livenessTotal' AS step,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY (duration_ms->>'livenessTotal')::int) AS p50,
        percentile_cont(0.95) WITHIN GROUP (ORDER BY (duration_ms->>'livenessTotal')::int) AS p95,
        AVG((duration_ms->>'livenessTotal')::int) AS avg,
        COUNT(*) AS samples
      FROM face_telemetry_event
      WHERE timestamp BETWEEN ${from} AND ${to}
        AND duration_ms ? 'livenessTotal'
      UNION ALL
      SELECT
        'descriptorCompute' AS step,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY (duration_ms->>'descriptorCompute')::int) AS p50,
        percentile_cont(0.95) WITHIN GROUP (ORDER BY (duration_ms->>'descriptorCompute')::int) AS p95,
        AVG((duration_ms->>'descriptorCompute')::int) AS avg,
        COUNT(*) AS samples
      FROM face_telemetry_event
      WHERE timestamp BETWEEN ${from} AND ${to}
        AND duration_ms ? 'descriptorCompute'
      UNION ALL
      SELECT
        'serverRoundtrip' AS step,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY (duration_ms->>'serverRoundtrip')::int) AS p50,
        percentile_cont(0.95) WITHIN GROUP (ORDER BY (duration_ms->>'serverRoundtrip')::int) AS p95,
        AVG((duration_ms->>'serverRoundtrip')::int) AS avg,
        COUNT(*) AS samples
      FROM face_telemetry_event
      WHERE timestamp BETWEEN ${from} AND ${to}
        AND duration_ms ? 'serverRoundtrip'
    ) sub
  `;

  // Confidence distribution — successful login.
  const confidenceStats = await prisma.$queryRaw<
    Array<{ avg: number | null; p50: number | null; p95: number | null; samples: bigint }>
  >`
    SELECT
      AVG(confidence)::float8 AS avg,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY confidence)::float8 AS p50,
      percentile_cont(0.95) WITHIN GROUP (ORDER BY confidence)::float8 AS p95,
      COUNT(*) AS samples
    FROM face_telemetry_event
    WHERE timestamp BETWEEN ${from} AND ${to}
      AND event = 'face_login_server_response'
      AND outcome = 'success'
      AND confidence IS NOT NULL
  `;

  const totalEvents = await prisma.faceTelemetryEvent.count({ where });

  res.json({
    success: true,
    data: {
      filter: { from, to, platform: q.platform, flow: q.flow, release: q.release ?? null },
      totalEvents,
      eventCounts: eventCounts.map((e) => ({
        event: e.event,
        outcome: e.outcome,
        count: e._count._all,
      })),
      failureBreakdown: failureBreakdown.map((f) => ({
        reason: f.failureReason,
        count: f._count._all,
      })),
      latency: latencyRows.map((l) => ({
        step: l.step,
        p50: l.p50,
        p95: l.p95,
        avg: l.avg,
        samples: Number(l.samples),
      })),
      confidence: confidenceStats[0]
        ? {
            avg: confidenceStats[0].avg,
            p50: confidenceStats[0].p50,
            p95: confidenceStats[0].p95,
            samples: Number(confidenceStats[0].samples),
          }
        : null,
    },
  });
});

// ============================================================
//  GET /admin/diagnostics/error-events
//  Aggregate by fingerprint (Sentry-style). Pagination.
// ============================================================
diagnosticsAdminRouter.get('/error-events', async (req, res) => {
  const q = errorEventQuerySchema.parse(req.query);
  const from = q.from ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const to = q.to ?? new Date();

  const where: Prisma.DiagnosticsErrorEventWhereInput = {
    timestamp: { gte: from, lte: to },
  };
  if (q.platform !== 'all') where.platform = q.platform;
  if (q.release) where.release = q.release;
  if (q.search) where.message = { contains: q.search, mode: 'insensitive' };
  if (q.noHp) where.userNoHp = q.noHp;

  // Aggregate by fingerprint. Pakai raw SQL karena Prisma groupBy
  // tidak support nested aggregate dengan window function.
  const aggregates = await prisma.$queryRaw<
    Array<{
      fingerprint: string;
      total: bigint;
      first_seen: Date;
      last_seen: Date;
      user_count: bigint;
      sample_message: string;
      sample_error_name: string | null;
      platforms: string[];
      releases: string[];
    }>
  >`
    SELECT
      fingerprint,
      COUNT(*)::bigint AS total,
      MIN(timestamp) AS first_seen,
      MAX(timestamp) AS last_seen,
      COUNT(DISTINCT user_no_hp)::bigint AS user_count,
      (array_agg(message ORDER BY timestamp DESC))[1] AS sample_message,
      (array_agg(error_name ORDER BY timestamp DESC))[1] AS sample_error_name,
      array_agg(DISTINCT platform) AS platforms,
      array_agg(DISTINCT release) AS releases
    FROM diagnostics_error_event
    WHERE timestamp BETWEEN ${from} AND ${to}
      ${q.platform !== 'all' ? Prisma.sql`AND platform = ${q.platform}` : Prisma.empty}
      ${q.release ? Prisma.sql`AND release = ${q.release}` : Prisma.empty}
      ${q.search ? Prisma.sql`AND message ILIKE ${'%' + q.search + '%'}` : Prisma.empty}
      ${q.noHp ? Prisma.sql`AND user_no_hp = ${q.noHp}` : Prisma.empty}
    GROUP BY fingerprint
    ORDER BY total DESC
    LIMIT ${q.limit}
    OFFSET ${(q.page - 1) * q.limit}
  `;

  const totalGroups = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(DISTINCT fingerprint)::bigint AS count
    FROM diagnostics_error_event
    WHERE timestamp BETWEEN ${from} AND ${to}
      ${q.platform !== 'all' ? Prisma.sql`AND platform = ${q.platform}` : Prisma.empty}
      ${q.release ? Prisma.sql`AND release = ${q.release}` : Prisma.empty}
      ${q.search ? Prisma.sql`AND message ILIKE ${'%' + q.search + '%'}` : Prisma.empty}
      ${q.noHp ? Prisma.sql`AND user_no_hp = ${q.noHp}` : Prisma.empty}
  `;

  res.json({
    success: true,
    data: {
      filter: { from, to, platform: q.platform, release: q.release ?? null, search: q.search ?? null },
      pagination: {
        page: q.page,
        limit: q.limit,
        totalGroups: Number(totalGroups[0]?.count ?? 0),
      },
      groups: aggregates.map((g) => ({
        fingerprint: g.fingerprint,
        total: Number(g.total),
        firstSeen: g.first_seen,
        lastSeen: g.last_seen,
        userCount: Number(g.user_count),
        sampleMessage: g.sample_message,
        sampleErrorName: g.sample_error_name,
        platforms: g.platforms,
        releases: g.releases,
      })),
    },
  });
});

// ============================================================
//  GET /admin/diagnostics/error-events/:fingerprint
//  Detail view — recent 50 events + trend + breakdown.
// ============================================================
diagnosticsAdminRouter.get('/error-events/:fingerprint', async (req, res) => {
  const fingerprint = req.params.fingerprint;
  if (!fingerprint || !/^[a-f0-9]{32}$/i.test(fingerprint)) {
    throw BadRequest('Fingerprint tidak valid (harus md5 hex 32 chars).');
  }

  const recent = await prisma.diagnosticsErrorEvent.findMany({
    where: { fingerprint },
    orderBy: { timestamp: 'desc' },
    take: 50,
  });

  if (recent.length === 0) throw NotFound('Fingerprint tidak ditemukan.');

  // Trend chart — count per hari, last 7 days.
  const trend = await prisma.$queryRaw<Array<{ day: Date; count: bigint }>>`
    SELECT
      DATE_TRUNC('day', timestamp) AS day,
      COUNT(*)::bigint AS count
    FROM diagnostics_error_event
    WHERE fingerprint = ${fingerprint}
      AND timestamp > NOW() - INTERVAL '7 days'
    GROUP BY day
    ORDER BY day ASC
  `;

  // Breakdown by platform + release.
  const breakdown = await prisma.diagnosticsErrorEvent.groupBy({
    by: ['platform', 'release'],
    where: { fingerprint },
    _count: { _all: true },
  });

  res.json({
    success: true,
    data: {
      fingerprint,
      total: recent.length, // up to 50, untuk count yang akurat pakai separate query
      recent: recent.map((e) => ({
        id: e.id,
        timestamp: e.timestamp,
        receivedAt: e.receivedAt,
        type: e.type,
        release: e.release,
        platform: e.platform,
        osVersion: e.osVersion,
        appVersion: e.appVersion,
        userNoHp: e.userNoHp,
        message: e.message,
        stack: e.stack,
        errorName: e.errorName,
        context: e.context,
        breadcrumbs: e.breadcrumbs,
      })),
      trend: trend.map((t) => ({ day: t.day, count: Number(t.count) })),
      breakdown: breakdown.map((b) => ({
        platform: b.platform,
        release: b.release,
        count: b._count._all,
      })),
    },
  });
});
