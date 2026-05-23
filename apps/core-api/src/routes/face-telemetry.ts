/**
 * Face Telemetry — public (no-auth) endpoint untuk mobile fire-and-forget push.
 *
 * Mount di authRouter sebagai `/auth/face/telemetry` (logical grouping
 * dengan endpoint face lain), tapi tidak butuh JWT — sampling event sebelum
 * + selama login flow termasuk dari user yg belum auth.
 *
 * Sampling control: di-respect via app_config.telemetrySamplingRate. Mobile
 * decide sampling client-side berdasarkan config dari /public/app-config.
 *
 * Right-to-delete: cascade dari DELETE /admin/me.
 */
import { Router } from 'express';
import { prisma } from '@ecc/database';
import { faceTelemetryEventInputSchema } from '@ecc/shared-types';
import { telemetryLimiter } from '../middleware/rate-limit.js';
import { logger } from '../lib/logger.js';

export const faceTelemetryRouter = Router();

// ============================================================
//  POST /telemetry — mobile push event saat face login/enroll flow
//  Mount di authRouter sebagai /auth/face/telemetry.
// ============================================================
faceTelemetryRouter.post('/telemetry', telemetryLimiter, async (req, res) => {
  // Defensive — kalau invalid, return 200 + drop (jangan bikin mobile retry).
  const parsed = faceTelemetryEventInputSchema.safeParse(req.body);
  if (!parsed.success) {
    logger.warn(
      { errors: parsed.error.flatten() },
      '[face/telemetry] Invalid payload, dropping silently',
    );
    return res.json({ success: true, data: { received: true, dropped: true } });
  }
  const input = parsed.data;

  // Fire-and-forget insert. Tidak block response.
  prisma.faceTelemetryEvent
    .create({
      data: {
        sessionId: input.sessionId,
        noHp: input.noHp ?? null,
        event: input.event,
        flow: input.flow ?? null,
        outcome: input.outcome,
        failureReason: input.failureReason ?? null,
        confidence: input.confidence ?? null,
        durationMs: input.durationMs ?? undefined,
        device: input.device ?? undefined,
        timestamp: input.timestamp,
      },
    })
    .catch((err: unknown) => {
      logger.error({ err }, '[face/telemetry] DB insert failed');
    });

  res.json({ success: true, data: { received: true } });
});
