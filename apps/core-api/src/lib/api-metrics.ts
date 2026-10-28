/**
 * Metrik API (latency & success rate) — dikumpulkan di memori lalu ditulis
 * ke tabel api_metric per ember 5 menit.
 *
 *   source 'server' : diukur middleware core-api (waktu proses server).
 *   source 'app'    : dikirim Els App/web lewat /telemetry (termasuk jaringan).
 *
 * Hanya pola endpoint (ID diganti :id), method, status & durasi — tanpa isi
 * request/response maupun identitas pengguna. core-api berjalan 1 proses
 * (pm2 fork), jadi akumulator di memori aman; restart hanya kehilangan
 * ember yang belum ditulis (maks. ±1 menit).
 */
import type { RequestHandler } from 'express';
import { randomUUID } from 'node:crypto';
import { prisma } from '@ecc/database';
import { logger } from './logger.js';

/** Batas atas ember latency (ms). Ember terakhir = di atas 10 dtk. */
export const LATENCY_EDGES = [25, 50, 100, 200, 300, 500, 750, 1000, 1500, 2000, 3000, 5000, 10000] as const;
const NB = LATENCY_EDGES.length + 1;
const BUCKET_MS = 5 * 60 * 1000;

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** Ganti segmen dinamis (UUID, angka, token panjang, kode) dengan :id. */
export function normalizeApiPath(path: string): string {
  const clean = path.split('?')[0]!.split('#')[0]!;
  const segs = clean
    .replace(UUID_RE, ':id')
    .split('/')
    .map((s) => {
      // Parameter Express (:scheduleId, :idOrSlug, …) disamakan → :id, supaya
      // pola server cocok dengan path yang dinormalkan di app.
      if (s.startsWith(':')) return ':id';
      if (!s) return s;
      // Slug panjang (mis. judul-event-natal-2026) → :id
      if (s.length > 30 || (s.match(/-/g) ?? []).length >= 3) return ':id';
      if (/^\d+$/.test(s)) return ':id';
      // Token/slug panjang ber-angka (mis. kode reservasi, token link) → :id
      if (s.length >= 20 && /\d/.test(s)) return ':id';
      if (/^[A-Z0-9]{6,12}$/.test(s) && /\d/.test(s)) return ':id';
      return s;
    });
  const out = segs.join('/').replace(/\/+$/, '') || '/';
  return out.length > 160 ? out.slice(0, 160) : out;
}

export const latencyBucket = (ms: number) => {
  for (let i = 0; i < LATENCY_EDGES.length; i++) if (ms <= LATENCY_EDGES[i]!) return i;
  return NB - 1;
};

/** Persentil (ms) dari histogram ember — interpolasi linier di dalam ember. */
export function percentileFromHist(hist: number[], p: number): number | null {
  const total = hist.reduce((a, b) => a + b, 0);
  if (!total) return null;
  const target = total * p;
  let acc = 0;
  for (let i = 0; i < hist.length; i++) {
    const n = hist[i] ?? 0;
    if (acc + n >= target && n > 0) {
      const lo = i === 0 ? 0 : LATENCY_EDGES[i - 1]!;
      const hi = i < LATENCY_EDGES.length ? LATENCY_EDGES[i]! : 15000;
      return Math.round(lo + ((target - acc) / n) * (hi - lo));
    }
    acc += n;
  }
  return LATENCY_EDGES[LATENCY_EDGES.length - 1]!;
}

export type Outcome = 'ok' | '4xx' | '5xx' | 'net';
export const outcomeOf = (status: number): Outcome =>
  status <= 0 ? 'net' : status >= 500 ? '5xx' : status >= 400 ? '4xx' : 'ok';

interface Acc {
  bucket: number;
  source: 'server' | 'app';
  platform: string;
  method: string;
  route: string;
  count: number;
  sumMs: number;
  c2xx: number;
  c4xx: number;
  c5xx: number;
  cNet: number;
  hist: number[];
}

const acc = new Map<string, Acc>();

/** Request per menit (server) — 60 menit terakhir, untuk ringkasan langsung. */
const perMinute = new Map<number, number>();

export function recordApi(
  source: 'server' | 'app',
  platform: string,
  method: string,
  route: string,
  ms: number,
  status: number,
  at = Date.now(),
) {
  const bucket = Math.floor(at / BUCKET_MS) * BUCKET_MS;
  const key = `${bucket}|${source}|${platform}|${method}|${route}`;
  let a = acc.get(key);
  if (!a) {
    a = { bucket, source, platform, method, route, count: 0, sumMs: 0, c2xx: 0, c4xx: 0, c5xx: 0, cNet: 0, hist: new Array(NB).fill(0) };
    acc.set(key, a);
  }
  const o = outcomeOf(status);
  a.count++;
  a.sumMs += Math.max(0, Math.round(ms));
  if (o === 'ok') a.c2xx++;
  else if (o === '4xx') a.c4xx++;
  else if (o === '5xx') a.c5xx++;
  else a.cNet++;
  if (o !== 'net') a.hist[latencyBucket(ms)]!++;
  if (source === 'server') {
    const m = Math.floor(at / 60000);
    perMinute.set(m, (perMinute.get(m) ?? 0) + 1);
  }
}

/** Request server per menit, `n` menit terakhir (lama → baru). */
export function recentRpm(n = 60): number[] {
  const now = Math.floor(Date.now() / 60000);
  for (const k of perMinute.keys()) if (k < now - 120) perMinute.delete(k);
  return Array.from({ length: n }, (_, i) => perMinute.get(now - (n - 1) + i) ?? 0);
}

/** Ember 5 menit yang sedang berjalan (belum ditulis) — untuk data "hari ini" yang segar. */
export function pendingRows() {
  return [...acc.values()];
}

/** Tulis ember yang sudah lewat (atau semua bila `all`) ke DB, tambahkan ke baris yang ada. */
export async function flushApiMetrics(all = false) {
  const cur = Math.floor(Date.now() / BUCKET_MS) * BUCKET_MS;
  const rows = [...acc.entries()].filter(([, a]) => all || a.bucket < cur);
  if (!rows.length) return 0;
  for (const [k] of rows) acc.delete(k);
  try {
    for (const [, a] of rows) {
      await prisma.$executeRaw`
        INSERT INTO api_metric (id, bucket, source, platform, method, route, count, sum_ms, c_2xx, c_4xx, c_5xx, c_net, hist)
        VALUES (${randomUUID()}::uuid, ${new Date(a.bucket)}, ${a.source}, ${a.platform}, ${a.method}, ${a.route}, ${a.count},
                ${a.sumMs}, ${a.c2xx}, ${a.c4xx}, ${a.c5xx}, ${a.cNet}, ${a.hist}::int[])
        ON CONFLICT (bucket, source, platform, method, route) DO UPDATE SET
          count = api_metric.count + EXCLUDED.count,
          sum_ms = api_metric.sum_ms + EXCLUDED.sum_ms,
          c_2xx = api_metric.c_2xx + EXCLUDED.c_2xx,
          c_4xx = api_metric.c_4xx + EXCLUDED.c_4xx,
          c_5xx = api_metric.c_5xx + EXCLUDED.c_5xx,
          c_net = api_metric.c_net + EXCLUDED.c_net,
          hist = (SELECT array_agg(COALESCE(x.a, 0) + COALESCE(x.b, 0) ORDER BY x.i)
                  FROM unnest(api_metric.hist, EXCLUDED.hist) WITH ORDINALITY AS x(a, b, i))`;
    }
  } catch (e) {
    logger.warn({ err: e, rows: rows.length }, 'api-metrics: gagal menulis metrik');
  }
  return rows.length;
}

/** Path yang tidak diukur: streaming/unduhan panjang, upload, file statis, health. */
const SKIP = [/^\/worship-media/, /^\/upload/, /^\/uploads/, /^\/health/, /^\/docs/, /^\/favicon/];

/** Middleware: ukur waktu proses setiap request API (dipasang sebelum router). */
export const apiMetricsMiddleware: RequestHandler = (req, res, next) => {
  if (req.method === 'OPTIONS' || SKIP.some((re) => re.test(req.path))) return next();
  const t0 = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    // Pola route dari Express (mis. /admin/me/homecell/:id). Tanpa route
    // terdaftar (404) → dikelompokkan supaya tidak membanjiri tabel.
    const routePath = (req.route as { path?: unknown } | undefined)?.path;
    // Saat error diteruskan ke error handler, Express sudah mengembalikan
    // req.baseUrl → pakai URL asli yang dinormalkan supaya tidak jadi "/:id".
    const route =
      res.statusCode === 404 && typeof routePath !== 'string'
        ? '(tidak dikenal)'
        : typeof routePath === 'string' && req.baseUrl
          ? normalizeApiPath(`${req.baseUrl}${routePath === '/' ? '' : routePath}`)
          : normalizeApiPath(req.originalUrl);
    recordApi('server', 'server', req.method, route, ms, res.statusCode);
  });
  next();
};
