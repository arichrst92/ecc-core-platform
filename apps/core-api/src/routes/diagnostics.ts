/**
 * Diagnostics — public (no-auth) endpoints untuk mobile fire-and-forget push.
 *
 * Mount di app.ts sebagai `/diagnostics/*`.
 *
 * Endpoints:
 *   - POST /diagnostics/error — runtime error report dari production mobile build
 *
 * Pattern: fire-and-forget. Mobile tidak retry, BE tidak guarantee delivery.
 * Async insert OK untuk pilot scale (<100 users).
 *
 * Privacy: noHp optional. Right-to-delete propagate dari DELETE /admin/me
 * handler (cascade ke diagnostics_error_event).
 */
import { Router } from 'express';
import { prisma, Prisma } from '@ecc/database';
import { diagnosticsErrorInputSchema } from '@ecc/shared-types';
import { diagnosticsErrorLimiter } from '../middleware/rate-limit.js';
import { logger } from '../lib/logger.js';

export const diagnosticsRouter = Router();

// ============================================================
//  POST /diagnostics/error — mobile push runtime error
//  Fire-and-forget. Return 200 cepat tanpa heavy processing.
// ============================================================
diagnosticsRouter.post('/error', diagnosticsErrorLimiter, async (req, res) => {
  // Defensive parse — kalau invalid, return 200 OK supaya mobile tidak retry.
  // Log warning untuk debug kalau ada client send invalid payload sistemik.
  const parsed = diagnosticsErrorInputSchema.safeParse(req.body);
  if (!parsed.success) {
    logger.warn(
      { errors: parsed.error.flatten() },
      '[diagnostics/error] Invalid payload, dropping silently',
    );
    return res.json({ success: true, data: { received: true, dropped: true } });
  }
  const input = parsed.data;

  // Cek app_config — kalau errorReportingEnabled=false (kill switch saat
  // incident), drop event tanpa write ke DB.
  const config = await prisma.appConfig.findUnique({ where: { id: 'global' } });
  if (config && !config.errorReportingEnabled) {
    return res.json({ success: true, data: { received: true, disabled: true } });
  }

  // Insert async — tidak await pada response (true fire-and-forget). Kalau
  // insert gagal di-log tapi mobile sudah dapat 200.
  prisma.diagnosticsErrorEvent
    .create({
      data: {
        type: input.type,
        release: input.release,
        platform: input.device.platform,
        osVersion: input.device.osVersion ?? null,
        appVersion: input.device.appVersion ?? null,
        userNoHp: input.user?.noHp ?? null,
        message: input.message,
        stack: input.stack ?? null,
        errorName: input.name ?? null,
        // Cast via `as Prisma.InputJsonValue` — zod `z.record(z.unknown())` /
        // `z.array(...)` return type tidak match dengan Prisma narrow JSON type
        // (recursive `InputJsonValue`). Safe karena Prisma akan JSON.stringify
        // pas insert ke kolom JSONB.
        context: input.context
          ? (input.context as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        breadcrumbs: input.breadcrumbs
          ? (input.breadcrumbs as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        timestamp: input.timestamp,
      },
    })
    .catch((err: unknown) => {
      logger.error({ err }, '[diagnostics/error] DB insert failed');
    });

  res.json({ success: true, data: { received: true } });
});
