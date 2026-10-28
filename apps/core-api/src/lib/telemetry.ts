/**
 * Telemetri anonim dari Els App (iOS/Android/web):
 *   - kunjungan halaman per hari (page_view_daily) → tab Halaman & retensi
 *   - "aktif sekarang" (presence di memori)        → tab Aktif sekarang & Monitor Ibadah
 *   - sampel latency API dari sisi app             → tab Performa API (source 'app')
 *
 * installId = ID acak buatan app, tidak terhubung ke akun / nama / no HP.
 */
import { prisma } from '@ecc/database';
import { z } from 'zod';
import { normalizeApiPath, recordApi } from './api-metrics.js';

export const PLATFORMS = ['ios', 'android', 'web'] as const;
export type Platform = (typeof PLATFORMS)[number];

const routeSchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(/^\//, 'route harus diawali /');

export const telemetrySchema = z.object({
  installId: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),
  platform: z.enum(PLATFORMS),
  appVersion: z.string().max(20).optional(),
  mode: z.enum(['login', 'tamu']),
  /** Halaman yang sedang dibuka; null = app di background (keluar dari "aktif"). */
  route: routeSchema.nullable().optional(),
  /** Kunjungan yang sudah diringkas app per (tanggal lokal, halaman). */
  views: z
    .array(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        route: routeSchema,
        count: z.number().int().min(0).max(500),
        durSec: z.number().int().min(0).max(86_400),
      }),
    )
    .max(100)
    .default([]),
  /** Sampel request API: method, path, ms, status (0 = gagal jaringan / timeout). */
  api: z
    .array(
      z.object({
        m: z.string().max(8),
        p: z.string().max(300),
        ms: z.number().min(0).max(120_000),
        s: z.number().int().min(0).max(599),
        t: z.number().optional(),
      }),
    )
    .max(200)
    .default([]),
});
export type TelemetryInput = z.infer<typeof telemetrySchema>;

// ------------------------------------------------------------------ presence

interface Presence {
  route: string | null;
  platform: Platform;
  mode: 'login' | 'tamu';
  lastSeen: number;
}

/** Dianggap aktif bila sinyal terakhir < 75 detik. */
export const PRESENCE_TTL_MS = 75_000;
const presence = new Map<string, Presence>();
/** Jumlah aktif per menit, 60 menit terakhir. */
const history: { at: number; n: number }[] = [];

export function touchPresence(installId: string, p: Omit<Presence, 'lastSeen'>) {
  if (!p.route) {
    presence.delete(installId); // app ke background → keluar dari hitungan
    return;
  }
  presence.set(installId, { ...p, lastSeen: Date.now() });
}

export function activePresence(now = Date.now()) {
  const out: Presence[] = [];
  for (const [k, v] of presence) {
    if (now - v.lastSeen > PRESENCE_TTL_MS) presence.delete(k);
    else out.push(v);
  }
  return out;
}

/** Dipanggil tiap menit (scheduled-jobs). */
export function samplePresence() {
  history.push({ at: Date.now(), n: activePresence().length });
  while (history.length > 60) history.shift();
}

export function presenceHistory(n = 30) {
  return history.slice(-n).map((h) => h.n);
}

// ------------------------------------------------------------------ ingest

export async function ingestTelemetry(input: TelemetryInput) {
  touchPresence(input.installId, { route: input.route ?? null, platform: input.platform, mode: input.mode });

  // Kunjungan halaman — tambahkan ke baris harian (satu INSERT … ON CONFLICT per baris).
  const today = new Date();
  for (const v of input.views) {
    const d = new Date(`${v.date}T00:00:00.000Z`);
    // Abaikan tanggal yang tidak masuk akal (jam HP salah): > 2 hari ke depan / > 35 hari lalu.
    if (d.getTime() > today.getTime() + 2 * 86_400_000 || d.getTime() < today.getTime() - 35 * 86_400_000) continue;
    await prisma.$executeRaw`
      INSERT INTO page_view_daily (date, install_id, route, platform, mode, app_version, views, duration_sec)
      VALUES (${d}::date, ${input.installId}, ${v.route}, ${input.platform}, ${input.mode}, ${input.appVersion ?? null}, ${v.count}, ${v.durSec})
      ON CONFLICT (date, install_id, route) DO UPDATE SET
        views = page_view_daily.views + EXCLUDED.views,
        duration_sec = LEAST(page_view_daily.duration_sec + EXCLUDED.duration_sec, 86400),
        mode = EXCLUDED.mode,
        platform = EXCLUDED.platform,
        app_version = COALESCE(EXCLUDED.app_version, page_view_daily.app_version)`;
  }

  for (const a of input.api) {
    const method = a.m.toUpperCase();
    if (!/^(GET|POST|PUT|PATCH|DELETE)$/.test(method)) continue;
    // Jangan ukur kiriman telemetri itu sendiri dari sisi app.
    const route = normalizeApiPath(a.p.replace(/^https?:\/\/[^/]+/, ''));
    if (route.startsWith('/telemetry')) continue;
    recordApi('app', input.platform, method, route, a.ms, a.s, a.t && Math.abs(Date.now() - a.t) < 10 * 60_000 ? a.t : Date.now());
  }
}
