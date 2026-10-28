/**
 * POST /telemetry — kiriman analitik anonim dari Els App (iOS/Android/web).
 * Tanpa login (mode tamu juga dihitung). Body: lib/telemetry.ts → telemetrySchema.
 * Selalu cepat & tidak pernah membuat app error: data tidak valid → 400,
 * gagal simpan → tetap 202 (dicatat di log).
 */
import { Router } from 'express';
import { appTelemetryLimiter } from '../middleware/rate-limit.js';
import { ingestTelemetry, telemetrySchema } from '../lib/telemetry.js';
import { logger } from '../lib/logger.js';

export const telemetryRouter = Router();

telemetryRouter.post('/', appTelemetryLimiter, async (req, res) => {
  const parsed = telemetrySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ success: false, error: { code: 'INVALID_TELEMETRY', message: 'Data telemetri tidak valid.' } });
    return;
  }
  try {
    await ingestTelemetry(parsed.data);
  } catch (e) {
    logger.warn({ err: e }, 'telemetry: gagal menyimpan');
  }
  res.status(202).json({ success: true });
});
