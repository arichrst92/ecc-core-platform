/**
 * Forecast — Pertumbuhan Jemaat (Portal, menu "forecast"). /admin/forecast
 *
 *   GET  /?cabangId=&horizon=6..60   data halaman (riwayat, prediksi, cabang, platform, tamu,
 *                                    homecell & event, kapasitas ibadah, kesiapan data, simulasi)
 *   GET  /settings                   batas data minimal
 *   PUT  /settings                   ubah batas (akses Ubah)
 *   GET  /export?cabangId=&horizon=  laporan cetak (slide 16:9 → Simpan sebagai PDF)
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@ecc/database';
import { requireMenu } from '../../middleware/require-menu.js';
import { audit } from '../../lib/audit.js';
import { FORECAST_DEFAULTS, buildForecast, getForecastSettings, type Forecast } from '../../lib/forecast.js';
import { renderForecastPdf } from '../../lib/forecast-pdf.js';

export const forecastRouter = Router();

// Hasil dihitung ulang paling sering tiap 5 menit per (cabang, horizon) — perhitungan cukup berat.
const cache = new Map<string, { at: number; data: Forecast }>();
async function cached(cabangId: string | undefined, horizon: number) {
  const key = `${cabangId ?? '*'}|${horizon}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.data;
  const data = await buildForecast({ cabangId, horizon });
  cache.set(key, { at: Date.now(), data });
  if (cache.size > 100) cache.clear();
  return data;
}
const q = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
const horizonOf = (v: unknown) => Math.min(60, Math.max(6, Number(v) || 60));

forecastRouter.get('/', requireMenu('forecast', 'read'), async (req, res) => {
  res.json({ success: true, data: await cached(q(req.query.cabangId), horizonOf(req.query.horizon)) });
});

forecastRouter.get('/settings', requireMenu('forecast', 'read'), async (_req, res) => {
  res.json({ success: true, data: { settings: await getForecastSettings(), defaults: FORECAST_DEFAULTS } });
});

const intField = (max: number) => z.number().int().min(0).max(max);
const settingsSchema = z.object({
  trendMinMonths: intField(120),
  seasonMinMonths: intField(120),
  cabangMinMonths: intField(120),
  cabangMinActive: intField(100_000),
  platformMinMonths: intField(120),
  tamuMinMonths: intField(120),
  occMinMeetings: intField(100),
  homecellMinMonths: intField(120),
  eventMinEvents: intField(1000),
  homecellIdeal: z.number().int().min(2).max(100),
  homecellMax: z.number().int().min(2).max(200),
  belowMin: z.enum(['label', 'hide']),
});

forecastRouter.put('/settings', requireMenu('forecast', 'write'), async (req, res) => {
  const input = settingsSchema.parse(req.body ?? {});
  const before = await getForecastSettings();
  await prisma.appConfig.upsert({
    where: { id: 'global' },
    create: { id: 'global', forecastSettings: input },
    update: { forecastSettings: input },
  });
  cache.clear();
  audit(req, { action: 'UPDATE', resource: 'forecast_settings', resourceLabel: 'Pengaturan Forecast', before, after: input });
  res.json({ success: true, data: input });
});

forecastRouter.get('/export', requireMenu('forecast', 'read'), async (req, res) => {
  const d = await cached(q(req.query.cabangId), horizonOf(req.query.horizon));
  const cabang = d.cabangId ? ((await prisma.cabangGereja.findUnique({ where: { id: d.cabangId }, select: { nama: true } }))?.nama ?? null) : null;
  const isMobileUa = /mobi|android|iphone|ipad|ipod/.test((req.get('user-agent') ?? '').toLowerCase());
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(renderForecastPdf(d, { cabang, isMobileUa, portalUrl: (process.env.PORTAL_URL ?? 'https://portal.eccchurch.global').replace(/\/$/, '') }));
});
