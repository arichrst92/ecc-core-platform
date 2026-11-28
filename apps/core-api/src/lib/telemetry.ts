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
  /** ID kiriman (app ≥ 2.4.9). Kiriman ulang dengan ID sama tidak dihitung dua kali. */
  batchId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/).optional(),
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

/**
 * Kiriman yang sudah disimpan (installId:batchId → waktu). App mengirim ulang
 * batch yang sama bila jawaban server tidak sampai (jaringan putus setelah
 * server menyimpan) → tanpa ini kunjungan terhitung dua kali. Cukup di memori:
 * core-api 1 proses; app mengulang dalam hitungan menit–jam.
 */
const seenBatches = new Map<string, number>();
const SEEN_TTL_MS = 48 * 3_600_000;
const SEEN_MAX = 200_000;
let seenInserts = 0;
function pruneSeen(now: number) {
  if (++seenInserts % 1000 !== 0 && seenBatches.size <= SEEN_MAX) return;
  // Map berurutan sesuai waktu masuk → hapus dari yang tertua.
  for (const [k, t] of seenBatches) {
    if (now - t <= SEEN_TTL_MS && seenBatches.size <= SEEN_MAX) break;
    seenBatches.delete(k);
  }
}

export async function ingestTelemetry(input: TelemetryInput) {
  touchPresence(input.installId, { route: input.route ?? null, platform: input.platform, mode: input.mode });

  const batchKey = input.batchId ? `${input.installId}:${input.batchId}` : null;
  if (batchKey && seenBatches.has(batchKey)) return; // kiriman ulang — sudah dihitung

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

  // Per jam (2026-11): halaman dibuka + perangkat unik per jam. Gagal → abaikan.
  try {
    await recordHourly(input);
  } catch {
    /* tabel belum ada / sibuk — jangan ganggu telemetri utama */
  }

  if (batchKey) {
    const now = Date.now();
    seenBatches.set(batchKey, now);
    pruneSeen(now);
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

// ------------------------------------------------------------------ per jam

/** Perangkat yang sudah dihitung pada (jam, halaman) — supaya users = perangkat unik. */
const seenHourly = new Set<string>();
let seenHourlyAt = 0;
const HOUR_MS = 3_600_000;

/**
 * Catat ke page_view_hourly pada jam diterima (UTC, dibulatkan ke bawah).
 *  - opens: kunjungan baru di kiriman ini (count) — hanya untuk tanggal hari ini/kemarin
 *    supaya kiriman tertunda lama (offline) tidak masuk ke jam yang salah.
 *  - users: perangkat unik per jam per halaman, dan per jam untuk semua halaman (route '*').
 */
async function recordHourly(input: TelemetryInput) {
  const now = Date.now();
  const hourStart = new Date(Math.floor(now / HOUR_MS) * HOUR_MS);
  const hKey = hourStart.getTime();
  if (hKey !== seenHourlyAt) {
    // Jam berganti → kosongkan penanda (cukup jam berjalan).
    seenHourly.clear();
    seenHourlyAt = hKey;
  }
  const d0 = new Date(now).toISOString().slice(0, 10);
  const d1 = new Date(now - 86_400_000).toISOString().slice(0, 10);
  const d2 = new Date(now + 86_400_000).toISOString().slice(0, 10);
  const opens = new Map<string, number>();
  const touched = new Set<string>();
  for (const v of input.views) {
    if (v.count > 0 && (v.date === d0 || v.date === d1 || v.date === d2)) opens.set(v.route, (opens.get(v.route) ?? 0) + v.count);
    if (v.count > 0 || v.durSec > 0) touched.add(v.route);
  }
  if (input.route) touched.add(input.route);
  if (!touched.size && !opens.size) return;
  const newUser = (route: string) => {
    const k = `${route}|${input.installId}`;
    if (seenHourly.has(k)) return 0;
    if (seenHourly.size < 500_000) seenHourly.add(k);
    return 1;
  };
  const rows = new Map<string, { opens: number; users: number }>();
  for (const r of new Set([...touched, ...opens.keys()])) rows.set(r, { opens: opens.get(r) ?? 0, users: newUser(r) });
  rows.set('*', { opens: [...opens.values()].reduce((a, b) => a + b, 0), users: newUser('*') });
  for (const [route, v] of rows) {
    if (!v.opens && !v.users) continue;
    await prisma.$executeRaw`
      INSERT INTO page_view_hourly (hour, route, platform, mode, opens, users)
      VALUES (${hourStart}, ${route}, ${input.platform}, ${input.mode}, ${v.opens}, ${v.users})
      ON CONFLICT (hour, route, platform, mode) DO UPDATE SET
        opens = page_view_hourly.opens + EXCLUDED.opens,
        users = page_view_hourly.users + EXCLUDED.users`;
  }
}
