/**
 * Layar monitor tanpa login — portal /monitor (banyak monitor di semua cabang).
 *
 *   POST /public/monitor/unlock            { code } → { token, expiresAt }   (kode = env MONITOR_ACCESS_CODE)
 *   — berikut wajib header X-Monitor-Token —
 *   GET  /public/monitor/cabang            daftar cabang aktif
 *   GET  /public/monitor/ibadah/options?cabangId=   ibadah hari ini
 *   GET  /public/monitor/ibadah?ibadahId=&cabangId= ringkasan ibadah
 *   GET  /public/monitor/event/options?cabangId=    event kemarin s/d 7 hari ke depan
 *   GET  /public/monitor/event?eventId=             ringkasan event
 *
 * Hanya angka & nama petugas scan — tanpa no HP / alamat / data anak.
 */
import { Router, type RequestHandler } from 'express';
import { prisma } from '@ecc/database';
import { z } from 'zod';
import { ApiError, BadRequest } from '../lib/errors.js';
import { audit } from '../lib/audit.js';
import { checkMonitorCode, createMonitorToken, monitorCode, verifyMonitorToken } from '../lib/monitor-access.js';
import { buildEventMonitor, buildEventOptions } from '../lib/event-monitor.js';
import { buildIbadahMonitor, buildIbadahOptions } from '../lib/ibadah-monitor.js';
import { monitorLimiter, monitorUnlockLimiter } from '../middleware/rate-limit.js';

export const publicMonitorRouter = Router();
publicMonitorRouter.use(monitorLimiter);

publicMonitorRouter.post('/unlock', monitorUnlockLimiter, (req, res) => {
  if (!monitorCode()) {
    throw new ApiError(503, 'MONITOR_NOT_CONFIGURED', 'Kode akses monitor belum diatur di server (.env MONITOR_ACCESS_CODE). Hubungi tim IT.');
  }
  const { code } = z.object({ code: z.string().trim().min(1).max(200) }).parse(req.body ?? {});
  if (!checkMonitorCode(code)) {
    audit(req, { action: 'LOGIN', resource: 'monitor_unlock', resourceLabel: 'Kode akses monitor salah', metadata: { kind: 'monitor-unlock-failed' } });
    throw new ApiError(401, 'MONITOR_CODE_INVALID', 'Kode akses salah.');
  }
  audit(req, { action: 'LOGIN', resource: 'monitor_unlock', resourceLabel: 'Monitor dibuka', metadata: { kind: 'monitor-unlock' } });
  res.json({ success: true, data: createMonitorToken() });
});

const requireMonitorToken: RequestHandler = (req, _res, next) => {
  if (!verifyMonitorToken(req.header('X-Monitor-Token'))) {
    throw new ApiError(401, 'MONITOR_TOKEN_INVALID', 'Akses monitor berakhir. Masukkan kode akses lagi.');
  }
  next();
};
publicMonitorRouter.use(requireMonitorToken);

const str = (v: unknown) => (typeof v === 'string' && v ? v : null);

publicMonitorRouter.get('/cabang', async (_req, res) => {
  const rows = await prisma.cabangGereja.findMany({ where: { isActive: true }, orderBy: { nama: 'asc' }, select: { id: true, nama: true } });
  res.json({ success: true, data: rows });
});

publicMonitorRouter.get('/ibadah/options', async (req, res) => {
  const data = await buildIbadahOptions(str(req.query.cabangId));
  if (!data) throw BadRequest('Pilih cabang.');
  res.json({ success: true, data });
});

publicMonitorRouter.get('/ibadah', async (req, res) => {
  res.json({
    success: true,
    data: await buildIbadahMonitor({
      ibadahId: str(req.query.ibadahId),
      cabangId: str(req.query.cabangId),
      tanggal: str(req.query.tanggal),
      lang: str(req.query.lang),
    }),
  });
});

publicMonitorRouter.get('/event/options', async (req, res) => {
  res.json({ success: true, data: await buildEventOptions(str(req.query.cabangId)) });
});

publicMonitorRouter.get('/event', async (req, res) => {
  res.json({ success: true, data: await buildEventMonitor(str(req.query.eventId), str(req.query.lang)) });
});
