/**
 * Analitik Els App — portal (menu: analitik) — /admin/analytics
 *
 *   GET /pages/summary?periode=7d|30d|90d&platform=all|ios|android|web&mode=all|login|tamu
 *   GET /pages?…                      daftar halaman: dibuka, pengunjung, durasi, retensi 7/30 hari, aktif sekarang
 *   GET /pages/detail?route=&…        pengunjung harian + kohort mingguan satu halaman
 *   GET /live                         aktif sekarang (presence di memori)
 *   GET /api?periode=&platform=       performa API: latency & success rate
 *   GET /export?periode=&platform=&mode=   laporan PDF (print view) untuk pimpinan / non-IT
 *
 * Semua anonim: tidak ada data jemaat. Retensi dihitung per perangkat (installId).
 */
import { Router, type Request } from 'express';
import { prisma, Prisma } from '@ecc/database';
import { requireMenu } from '../../middleware/require-menu.js';
import { DEFAULT_TZ, addDays, todayInTz } from '../../lib/tz.js';
import { LATENCY_EDGES, pendingRows, percentileFromHist, recentRpm } from '../../lib/api-metrics.js';
import { activePresence, presenceHistory } from '../../lib/telemetry.js';
import { renderAnalyticsReportHtml } from '../../lib/analytics-report-html.js';

export const analyticsRouter = Router();
analyticsRouter.use(requireMenu('analitik'));

const NB = LATENCY_EDGES.length + 1;
const DAYS = { '7d': 7, '30d': 30, '90d': 90 } as const;
type PeriodeKey = keyof typeof DAYS;

function filterOf(req: Request) {
  const q = req.query as Record<string, string | undefined>;
  const periode: PeriodeKey = q.periode === '7d' || q.periode === '90d' ? q.periode : '30d';
  const platform = q.platform === 'ios' || q.platform === 'android' || q.platform === 'web' ? q.platform : 'all';
  const mode = q.mode === 'login' || q.mode === 'tamu' ? q.mode : 'all';
  const days = DAYS[periode];
  const end = todayInTz(DEFAULT_TZ);
  const start = addDays(end, -(days - 1));
  return { periode, platform, mode, days, start, end } as const;
}
type F = ReturnType<typeof filterOf>;

/** Kondisi WHERE untuk page_view_daily (tanpa rentang tanggal). */
function pvFilter(f: F) {
  const parts: Prisma.Sql[] = [];
  if (f.platform !== 'all') parts.push(Prisma.sql`platform = ${f.platform}`);
  if (f.mode !== 'all') parts.push(Prisma.sql`mode = ${f.mode}`);
  return parts.length ? Prisma.sql`AND ${Prisma.join(parts, ' AND ')}` : Prisma.empty;
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const n = (v: unknown) => Number(v ?? 0);

// ------------------------------------------------------------------ halaman: ringkasan

export async function computePageSummary(f: F) {

  const w = pvFilter(f);
  const prevStart = addDays(f.start, -f.days);
  const prevEnd = addDays(f.start, -1);

  const [cur] = await prisma.$queryRaw<{ users: bigint; views: bigint; dur: bigint; userdays: bigint }[]>`
    SELECT COUNT(DISTINCT install_id) AS users, COALESCE(SUM(views),0) AS views, COALESCE(SUM(duration_sec),0) AS dur,
           COUNT(DISTINCT (install_id, date)) AS userdays
    FROM page_view_daily WHERE date BETWEEN ${f.start}::date AND ${f.end}::date ${w}`;
  const [prev] = await prisma.$queryRaw<{ users: bigint }[]>`
    SELECT COUNT(DISTINCT install_id) AS users FROM page_view_daily
    WHERE date BETWEEN ${prevStart}::date AND ${prevEnd}::date ${w}`;
  const byMode = await prisma.$queryRaw<{ mode: string; dur: bigint; userdays: bigint }[]>`
    SELECT mode, COALESCE(SUM(duration_sec),0) AS dur, COUNT(DISTINCT (install_id, date)) AS userdays
    FROM page_view_daily WHERE date BETWEEN ${f.start}::date AND ${f.end}::date ${w} GROUP BY mode`;
  const byPlatform = await prisma.$queryRaw<{ platform: string; users: bigint }[]>`
    SELECT platform, COUNT(DISTINCT install_id) AS users
    FROM page_view_daily WHERE date BETWEEN ${f.start}::date AND ${f.end}::date ${w} GROUP BY platform`;
  // Retensi app: perangkat yang kembali (hari lain) dalam 7 hari setelah kunjungan pertamanya di periode.
  const [ret] = await prisma.$queryRaw<{ eligible: bigint; returned: bigint }[]>`
    WITH firsts AS (
      SELECT install_id, MIN(date) AS d0 FROM page_view_daily
      WHERE date BETWEEN ${f.start}::date AND ${f.end}::date ${w} GROUP BY install_id
    )
    SELECT COUNT(*) FILTER (WHERE d0 <= ${addDays(f.end, -7)}::date) AS eligible,
           COUNT(*) FILTER (WHERE d0 <= ${addDays(f.end, -7)}::date AND EXISTS (
             SELECT 1 FROM page_view_daily p WHERE p.install_id = firsts.install_id
               AND p.date > firsts.d0 AND p.date <= firsts.d0 + 7)) AS returned
    FROM firsts`;

  const users = n(cur?.users);
  const avg = (rows: { dur: bigint; userdays: bigint }[]) => {
    const d = rows.reduce((a, r) => a + n(r.dur), 0);
    const u = rows.reduce((a, r) => a + n(r.userdays), 0);
    return u ? Math.round(d / u) : 0;
  };
  const plat = { android: 0, ios: 0, web: 0 } as Record<string, number>;
  const platTot = byPlatform.reduce((a, r) => a + n(r.users), 0);
  for (const r of byPlatform) plat[r.platform] = platTot ? Math.round((n(r.users) / platTot) * 100) : 0;

  return {
      activeUsers: users,
      activeUsersDeltaPct: n(prev?.users) ? Math.round(((users - n(prev?.users)) / n(prev?.users)) * 100) : null,
      views: n(cur?.views),
      return7: n(ret?.eligible) ? Math.round((n(ret?.returned) / n(ret?.eligible)) * 100) : null,
      avgSessionSec: avg(cur ? [{ dur: cur.dur, userdays: cur.userdays }] : []),
      avgSessionLoginSec: avg(byMode.filter((r) => r.mode === 'login')),
      avgSessionTamuSec: avg(byMode.filter((r) => r.mode === 'tamu')),
      platform: { android: plat.android ?? 0, ios: plat.ios ?? 0, web: plat.web ?? 0 },
  };
}

analyticsRouter.get('/pages/summary', async (req, res) => {
  res.json({ success: true, data: await computePageSummary(filterOf(req)) });
});

// ------------------------------------------------------------------ halaman: daftar

export async function computePages(f: F) {

  const w = pvFilter(f);
  const rows = await prisma.$queryRaw<{ route: string; views: bigint; visitors: bigint; dur: bigint }[]>`
    SELECT route, SUM(views) AS views, COUNT(DISTINCT install_id) AS visitors, SUM(duration_sec) AS dur
    FROM page_view_daily WHERE date BETWEEN ${f.start}::date AND ${f.end}::date ${w}
    GROUP BY route ORDER BY views DESC LIMIT 200`;
  const ret = await prisma.$queryRaw<{ route: string; e7: bigint; r7: bigint; e30: bigint; r30: bigint }[]>`
    WITH firsts AS (
      SELECT route, install_id, MIN(date) AS d0 FROM page_view_daily
      WHERE date BETWEEN ${f.start}::date AND ${f.end}::date ${w} GROUP BY route, install_id
    ), flagged AS (
      SELECT f.route, f.d0,
        EXISTS (SELECT 1 FROM page_view_daily p WHERE p.route = f.route AND p.install_id = f.install_id
                AND p.date > f.d0 AND p.date <= f.d0 + 7) AS back7,
        EXISTS (SELECT 1 FROM page_view_daily p WHERE p.route = f.route AND p.install_id = f.install_id
                AND p.date > f.d0 AND p.date <= f.d0 + 30) AS back30
      FROM firsts f
    )
    SELECT route,
      COUNT(*) FILTER (WHERE d0 <= ${addDays(f.end, -7)}::date) AS e7,
      COUNT(*) FILTER (WHERE d0 <= ${addDays(f.end, -7)}::date AND back7) AS r7,
      COUNT(*) FILTER (WHERE d0 <= ${addDays(f.end, -30)}::date) AS e30,
      COUNT(*) FILTER (WHERE d0 <= ${addDays(f.end, -30)}::date AND back30) AS r30
    FROM flagged GROUP BY route`;
  const retMap = new Map(ret.map((r) => [r.route, r]));
  const live = new Map<string, number>();
  for (const p of activePresence()) {
    if (f.platform !== 'all' && p.platform !== f.platform) continue;
    if (f.mode !== 'all' && p.mode !== f.mode) continue;
    if (p.route) live.set(p.route, (live.get(p.route) ?? 0) + 1);
  }
  const pct = (a: bigint | undefined, b: bigint | undefined) => (n(b) ? Math.round((n(a) / n(b)) * 100) : null);
  return rows.map((r) => {
      const rt = retMap.get(r.route);
      return {
        route: r.route,
        views: n(r.views),
        visitors: n(r.visitors),
        avgDurationSec: n(r.views) ? Math.round(n(r.dur) / n(r.views)) : 0,
        return7: pct(rt?.r7, rt?.e7),
        return30: pct(rt?.r30, rt?.e30),
        activeNow: live.get(r.route) ?? 0,
      };
    });
}

analyticsRouter.get('/pages', async (req, res) => {
  res.json({ success: true, data: await computePages(filterOf(req)) });
});

// ------------------------------------------------------------------ halaman: detail

analyticsRouter.get('/pages/detail', async (req, res) => {
  const f = filterOf(req);
  const w = pvFilter(f);
  const route = typeof req.query.route === 'string' ? req.query.route.slice(0, 160) : '/';
  const daily = await prisma.$queryRaw<{ date: Date; visitors: bigint }[]>`
    SELECT date, COUNT(DISTINCT install_id) AS visitors FROM page_view_daily
    WHERE route = ${route} AND date BETWEEN ${f.start}::date AND ${f.end}::date ${w}
    GROUP BY date ORDER BY date`;
  const byDate = new Map(daily.map((d) => [ymd(d.date), n(d.visitors)]));
  const days = Array.from({ length: f.days }, (_, i) => ymd(addDays(f.start, i)));

  // Kohort 6 minggu terakhir (minggu mulai Senin): minggu kunjungan pertama → % kembali di minggu ke-k.
  const cohortStart = addDays(f.end, -41);
  const coh = await prisma.$queryRaw<{ wk: Date; k: number; users: bigint }[]>`
    WITH v AS (
      SELECT install_id, date_trunc('week', date)::date AS wk FROM page_view_daily
      WHERE route = ${route} AND date BETWEEN ${cohortStart}::date AND ${f.end}::date ${w}
      GROUP BY install_id, date_trunc('week', date)
    ), firsts AS (SELECT install_id, MIN(wk) AS c FROM v GROUP BY install_id)
    SELECT firsts.c AS wk, ((v.wk - firsts.c) / 7)::int AS k, COUNT(*) AS users
    FROM v JOIN firsts USING (install_id) GROUP BY firsts.c, k ORDER BY firsts.c, k`;
  const weeks = [...new Set(coh.map((c) => ymd(c.wk)))].sort();
  const lastWeek = weeks.length ? weeks[weeks.length - 1]! : null;
  const cohorts = weeks.map((wk) => {
    const rows = coh.filter((c) => ymd(c.wk) === wk);
    const size = n(rows.find((r) => r.k === 0)?.users);
    const span = lastWeek ? Math.round((new Date(lastWeek).getTime() - new Date(wk).getTime()) / (7 * 86_400_000)) : 0;
    return {
      week: wk,
      size,
      pct: Array.from({ length: 6 }, (_, k) => {
        if (k > span) return null;
        if (k === 0) return size ? 100 : null;
        const u = n(rows.find((r) => r.k === k)?.users);
        return size ? Math.round((u / size) * 100) : null;
      }),
    };
  });
  res.json({ success: true, data: { route, daily: days.map((d) => ({ date: d, visitors: byDate.get(d) ?? 0 })), cohorts } });
});

// ------------------------------------------------------------------ aktif sekarang

analyticsRouter.get('/live', (_req, res) => {
  const act = activePresence();
  const pages = new Map<string, number>();
  const platform = { android: 0, ios: 0, web: 0 };
  let tamu = 0;
  for (const p of act) {
    platform[p.platform]++;
    if (p.mode === 'tamu') tamu++;
    if (p.route) pages.set(p.route, (pages.get(p.route) ?? 0) + 1);
  }
  const sorted = [...pages.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, 8).map(([route, c]) => ({ route, n: c }));
  const rest = sorted.slice(8).reduce((a, [, c]) => a + c, 0);
  const hist = presenceHistory(30);
  res.json({
    success: true,
    data: {
      at: new Date().toISOString(),
      total: act.length,
      platform,
      login: act.length - tamu,
      tamu,
      pages: rest ? [...top, { route: '*', n: rest }] : top,
      last30: [...hist, act.length],
    },
  });
});

// ------------------------------------------------------------------ performa API

/** Alur penting → pola endpoint (method + route ternormalisasi). */
const FLOWS: { key: string; label: string; match: [string, string][]; note?: string }[] = [
  { key: 'login', label: 'Login (OTP)', match: [['POST', '/auth/otp/verify']], note: '4xx (kode salah) tidak dihitung gagal' },
  {
    key: 'checkin',
    label: 'Check-in ibadah',
    match: [
      ['POST', '/admin/me/ibadah/:id/self-checkin'],
      ['POST', '/admin/reservasi/checkin'],
      ['POST', '/admin/ibadah/:id/checkin'],
    ],
    note: 'Di luar radius / sudah check-in = 4xx, tidak dihitung gagal',
  },
  { key: 'reservasi', label: 'Reservasi ibadah', match: [['POST', '/admin/me/ibadah/:id/reservasi']] },
  { key: 'event', label: 'Daftar event', match: [['POST', '/admin/event/:id/peserta']] },
  {
    key: 'absen-hc',
    label: 'Absen homecell',
    match: [
      ['POST', '/admin/homecell/:id/schedule/:id/attendance'],
      ['POST', '/admin/homecell/:id/schedule/:id/attendance/bulk'],
    ],
  },
  {
    key: 'join-hc',
    label: 'Minta gabung homecell',
    match: [
      ['POST', '/admin/me/homecell/:id/join-request'],
      ['POST', '/public/homecell/:id/guest-request'],
    ],
  },
];

interface Agg {
  count: number;
  c2xx: number;
  c4xx: number;
  c5xx: number;
  cNet: number;
  hist: number[];
}
const emptyAgg = (): Agg => ({ count: 0, c2xx: 0, c4xx: 0, c5xx: 0, cNet: 0, hist: new Array(NB).fill(0) });
const addAgg = (a: Agg, r: { count: number; c2xx: number; c4xx: number; c5xx: number; cNet: number; hist: number[] }) => {
  a.count += r.count;
  a.c2xx += r.c2xx;
  a.c4xx += r.c4xx;
  a.c5xx += r.c5xx;
  a.cNet += r.cNet;
  r.hist.forEach((v, i) => (a.hist[i] = (a.hist[i] ?? 0) + (v ?? 0)));
};
/** Sukses = bukan 5xx & bukan gagal jaringan (4xx = ditolak wajar). */
const successPct = (a: Agg) => (a.count ? Math.round(((a.count - a.c5xx - a.cNet) / a.count) * 10000) / 100 : null);

export async function computeApiPerformance(f: F) {

  const since = new Date(Date.now() - f.days * 86_400_000);
  const appPlatform = f.platform === 'all' ? undefined : f.platform;

  const dbRows = await prisma.apiMetric.findMany({
    where: {
      bucket: { gte: since },
      OR: [{ source: 'server' }, { source: 'app', ...(appPlatform ? { platform: appPlatform } : {}) }],
    },
    select: { bucket: true, source: true, platform: true, method: true, route: true, count: true, c2xx: true, c4xx: true, c5xx: true, cNet: true, hist: true },
  });
  const mem = pendingRows()
    .filter((r) => r.source === 'server' || !appPlatform || r.platform === appPlatform)
    .map((r) => ({ ...r, bucket: new Date(r.bucket) }));
  const all = [...dbRows, ...mem];

  const server = emptyAgg();
  const app = emptyAgg();
  const perEndpoint = new Map<string, { method: string; route: string; server: Agg; app: Agg }>();
  const perBucket = new Map<number, number>();
  const lastErr = new Map<string, { code: string; method: string; route: string; count: number; last: number }>();
  const todayStart = new Date(`${ymd(todayInTz(DEFAULT_TZ))}T00:00:00+07:00`).getTime();

  for (const r of all) {
    const target = r.source === 'server' ? server : app;
    addAgg(target, r);
    const key = `${r.method} ${r.route}`;
    let e = perEndpoint.get(key);
    if (!e) perEndpoint.set(key, (e = { method: r.method, route: r.route, server: emptyAgg(), app: emptyAgg() }));
    addAgg(r.source === 'server' ? e.server : e.app, r);
    const bt = r.bucket.getTime();
    if (r.source === 'server') perBucket.set(bt, (perBucket.get(bt) ?? 0) + r.count);
    if (bt >= todayStart) {
      const errs: [string, number][] = r.source === 'server' ? [['5xx', r.c5xx]] : [['jaringan', r.cNet]];
      for (const [code, c] of errs) {
        if (!c) continue;
        const k = `${code}|${key}`;
        const cur = lastErr.get(k) ?? { code, method: r.method, route: r.route, count: 0, last: 0 };
        cur.count += c;
        cur.last = Math.max(cur.last, bt + 5 * 60_000);
        lastErr.set(k, cur);
      }
    }
  }

  // Puncak request/menit (per ember 5 menit).
  let peak = 0;
  let peakAt = 0;
  for (const [bt, c] of perBucket) if (c / 5 > peak) (peak = c / 5), (peakAt = bt);
  const rpmLast = recentRpm(15);
  const fmtWib = (ms: number) =>
    new Date(ms).toLocaleString('id-ID', { weekday: 'long', hour: '2-digit', minute: '2-digit', timeZone: DEFAULT_TZ });

  // Per jam, 24 jam terakhir.
  const hourMs = 3_600_000;
  const h0 = Math.floor(Date.now() / hourMs) * hourMs - 23 * hourMs;
  const hours = Array.from({ length: 24 }, (_, i) => ({ t: h0 + i * hourMs, server: emptyAgg(), app: emptyAgg() }));
  for (const r of all) {
    const i = Math.floor((r.bucket.getTime() - h0) / hourMs);
    if (i < 0 || i > 23) continue;
    addAgg(r.source === 'server' ? hours[i]!.server : hours[i]!.app, r);
  }

  const flows = FLOWS.map((fl) => {
    const a = emptyAgg();
    const s = emptyAgg();
    for (const [m, rt] of fl.match) {
      const e = perEndpoint.get(`${m} ${rt}`);
      if (e) {
        addAgg(a, e.app);
        addAgg(s, e.server);
      }
    }
    // Pakai angka sisi app bila cukup sampel (mencakup gagal jaringan), selain itu sisi server.
    const use = a.count >= 20 ? a : s;
    return { key: fl.key, label: fl.label, success: successPct(use), attempts: s.count || a.count, note: fl.note };
  });

  const endpoints = [...perEndpoint.values()]
    .filter((e) => e.server.count > 0 && e.route !== '(tidak dikenal)')
    .sort((a, b) => b.server.count - a.server.count)
    .slice(0, 60)
    .map((e) => {
      const mixSrc = e.app.count >= 20 ? e.app : e.server;
      const pct = (v: number) => (mixSrc.count ? Math.round((v / mixSrc.count) * 10000) / 100 : 0);
      return {
        method: e.method,
        path: e.route,
        count: e.server.count,
        p50: percentileFromHist(e.server.hist, 0.5) ?? 0,
        p95: percentileFromHist(e.server.hist, 0.95) ?? 0,
        success: successPct(mixSrc) ?? 100,
        mix: { ok: pct(mixSrc.c2xx), c4xx: pct(mixSrc.c4xx), c5xx: pct(mixSrc.c5xx), network: pct(mixSrc.cNet) },
      };
    });

  return {
      summary: {
        successApp: successPct(app),
        successServer: successPct(server),
        networkFailPct: app.count ? Math.round((app.cNet / app.count) * 1000) / 10 : null,
        err5xx: server.c5xx,
        total: server.count,
        p50Server: percentileFromHist(server.hist, 0.5),
        p95Server: percentileFromHist(server.hist, 0.95),
        p50App: percentileFromHist(app.hist, 0.5),
        p95App: percentileFromHist(app.hist, 0.95),
        rpm: Math.round(rpmLast.reduce((x, y) => x + y, 0) / rpmLast.length),
        peakRpm: Math.round(peak),
        peakAt: peakAt ? fmtWib(peakAt) : '—',
      },
      hourly: hours.map((h) => ({
        hour: new Date(h.t).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: DEFAULT_TZ }),
        p95App: percentileFromHist(h.app.hist, 0.95),
        p95Server: percentileFromHist(h.server.hist, 0.95),
        requests: h.server.count,
      })),
      flows,
      endpoints,
      topErrors: [...lastErr.values()]
        .sort((a, b) => b.count - a.count)
        .slice(0, 8)
        .map((e) => ({
          code: e.code,
          method: e.method,
          path: e.route,
          count: e.count,
          last: new Date(e.last).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: DEFAULT_TZ }),
        })),
  };
}

analyticsRouter.get('/api', async (req, res) => {
  res.json({ success: true, data: await computeApiPerformance(filterOf(req)) });
});

// ------------------------------------------------------------------ export PDF (print view)

const PERIODE_LABEL: Record<string, string> = { '7d': '7 hari terakhir', '30d': '30 hari terakhir', '90d': '90 hari terakhir' };
const PLATFORM_LABEL: Record<string, string> = { all: 'Semua platform (iOS, Android, web)', ios: 'iPhone (iOS)', android: 'Android', web: 'Els App web' };
const MODE_LABEL: Record<string, string> = { all: 'Jemaat login & mode tamu', login: 'Jemaat login', tamu: 'Mode tamu' };

analyticsRouter.get('/export', async (req, res) => {
  const f = filterOf(req);
  const w = pvFilter(f);
  const [summary, pages, api, daily] = await Promise.all([
    computePageSummary(f),
    computePages(f),
    computeApiPerformance(f),
    prisma.$queryRaw<{ date: Date; users: bigint; views: bigint }[]>`
      SELECT date, COUNT(DISTINCT install_id) AS users, SUM(views) AS views FROM page_view_daily
      WHERE date BETWEEN ${f.start}::date AND ${f.end}::date ${w} GROUP BY date ORDER BY date`,
  ]);
  const byDate = new Map(daily.map((d) => [ymd(d.date), d]));
  const ua = (req.get('user-agent') ?? '').toLowerCase();
  const html = renderAnalyticsReportHtml({
    periodeLabel: PERIODE_LABEL[f.periode] ?? f.periode,
    from: ymd(f.start),
    to: ymd(f.end),
    platformLabel: PLATFORM_LABEL[f.platform] ?? f.platform,
    modeLabel: MODE_LABEL[f.mode] ?? f.mode,
    isMobileUa: /mobi|android|iphone|ipad|ipod/.test(ua),
    summary,
    pages,
    daily: Array.from({ length: f.days }, (_, i) => {
      const d = ymd(addDays(f.start, i));
      const r = byDate.get(d);
      return { date: d, users: n(r?.users), views: n(r?.views) };
    }),
    api: { summary: api.summary, flows: api.flows },
  });
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});
