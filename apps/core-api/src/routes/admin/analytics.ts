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
import { DEFAULT_TZ, addDays, todayInTz, wallToInstant } from '../../lib/tz.js';
import { LATENCY_EDGES, pendingRows, percentileFromHist, recentRpm } from '../../lib/api-metrics.js';
import { activePresence, presenceHistory } from '../../lib/telemetry.js';
import { renderAnalyticsReportHtml } from '../../lib/analytics-report-html.js';

export const analyticsRouter = Router();
analyticsRouter.use(requireMenu('analitik'));

const NB = LATENCY_EDGES.length + 1;
const DAYS = { today: 1, '7d': 7, '30d': 30, '90d': 90 } as const;
type PeriodeKey = keyof typeof DAYS;

function filterOf(req: Request) {
  const q = req.query as Record<string, string | undefined>;
  const periode: PeriodeKey =
    q.periode === 'today' || q.periode === '7d' || q.periode === '90d' ? q.periode : '30d';
  const platform = q.platform === 'ios' || q.platform === 'android' || q.platform === 'web' ? q.platform : 'all';
  const mode = q.mode === 'login' || q.mode === 'tamu' ? q.mode : 'all';
  const days = DAYS[periode];
  const end = todayInTz(DEFAULT_TZ);
  const start = addDays(end, -(days - 1));
  return { periode, platform, mode, days, start, end } as const;
}
type F = ReturnType<typeof filterOf>;

/**
 * Rute "penghubung" (deep link / tautan lama) yang langsung dialihkan ke layar
 * aslinya — tercatat sebagai kunjungan kedua untuk satu buka halaman, jadi
 * tidak dihitung (data lama pun ikut bersih).
 */
const REDIRECT_ROUTES = [
  '/news/[id]',
  '/renungan/[id]',
  '/event/[id]/pembayaran',
  '/local-market/[id]',
  '/local-market/[id]/item/[itemId]',
  '/worship/song/[id]',
];
/** Rute berbeda untuk layar yang sama → digabung jadi satu baris. */
const ROUTE_ALIAS: Record<string, string> = {
  '/resolution': '/resolusi', // tab menu bawah (2.4.9) = halaman Resolusi
};

/** page_view_daily dengan rute kanonik & tanpa rute penghubung. Pakai: FROM ${PV} pv */
const canonRoute = Prisma.sql`CASE route ${Prisma.join(
  Object.entries(ROUTE_ALIAS).map(([a, c]) => Prisma.sql`WHEN ${a} THEN ${c}`),
  ' ',
)} ELSE route END`;
const PV = Prisma.sql`(SELECT date, install_id, ${canonRoute} AS route, platform, mode, views, duration_sec
  FROM page_view_daily WHERE route NOT IN (${Prisma.join(REDIRECT_ROUTES)}))`;

/** page_view_hourly dengan rute kanonik & tanpa rute penghubung. Pakai: FROM ${PVH} ph */
const PVH = Prisma.sql`(SELECT hour, ${canonRoute} AS route, platform, mode, opens, users
  FROM page_view_hourly WHERE route NOT IN (${Prisma.join(REDIRECT_ROUTES)}))`;

/** Rentang jam (instant) untuk periode filter, jam dinding zona bawaan. */
function hourRange(f: F) {
  return { from: wallToInstant(f.start, 0, DEFAULT_TZ), to: wallToInstant(addDays(f.end, 1), 0, DEFAULT_TZ) };
}

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
    FROM ${PV} pv WHERE date BETWEEN ${f.start}::date AND ${f.end}::date ${w}`;
  const [prev] = await prisma.$queryRaw<{ users: bigint }[]>`
    SELECT COUNT(DISTINCT install_id) AS users FROM ${PV} pv
    WHERE date BETWEEN ${prevStart}::date AND ${prevEnd}::date ${w}`;
  const byMode = await prisma.$queryRaw<{ mode: string; dur: bigint; userdays: bigint }[]>`
    SELECT mode, COALESCE(SUM(duration_sec),0) AS dur, COUNT(DISTINCT (install_id, date)) AS userdays
    FROM ${PV} pv WHERE date BETWEEN ${f.start}::date AND ${f.end}::date ${w} GROUP BY mode`;
  const byPlatform = await prisma.$queryRaw<{ platform: string; users: bigint }[]>`
    SELECT platform, COUNT(DISTINCT install_id) AS users
    FROM ${PV} pv WHERE date BETWEEN ${f.start}::date AND ${f.end}::date ${w} GROUP BY platform`;
  // Retensi app: perangkat yang kembali (hari lain) dalam 7 hari setelah kunjungan pertamanya di periode.
  const [ret] = await prisma.$queryRaw<{ eligible: bigint; returned: bigint }[]>`
    WITH firsts AS (
      SELECT install_id, MIN(date) AS d0 FROM ${PV} pv
      WHERE date BETWEEN ${f.start}::date AND ${f.end}::date ${w} GROUP BY install_id
    )
    SELECT COUNT(*) FILTER (WHERE d0 <= ${addDays(f.end, -7)}::date) AS eligible,
           COUNT(*) FILTER (WHERE d0 <= ${addDays(f.end, -7)}::date AND EXISTS (
             SELECT 1 FROM ${PV} p WHERE p.install_id = firsts.install_id
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
      activeUsersDeltaPct: f.periode !== 'today' && n(prev?.users) ? Math.round(((users - n(prev?.users)) / n(prev?.users)) * 100) : null,
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
    FROM ${PV} pv WHERE date BETWEEN ${f.start}::date AND ${f.end}::date ${w}
    GROUP BY route ORDER BY views DESC LIMIT 200`;
  const ret = await prisma.$queryRaw<{ route: string; e7: bigint; r7: bigint; e30: bigint; r30: bigint }[]>`
    WITH firsts AS (
      SELECT route, install_id, MIN(date) AS d0 FROM ${PV} pv
      WHERE date BETWEEN ${f.start}::date AND ${f.end}::date ${w} GROUP BY route, install_id
    ), flagged AS (
      SELECT f.route, f.d0,
        EXISTS (SELECT 1 FROM ${PV} p WHERE p.route = f.route AND p.install_id = f.install_id
                AND p.date > f.d0 AND p.date <= f.d0 + 7) AS back7,
        EXISTS (SELECT 1 FROM ${PV} p WHERE p.route = f.route AND p.install_id = f.install_id
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
  // Jam paling sering dibuka per halaman (page_view_hourly, jam dinding zona bawaan).
  const hr = hourRange(f);
  const byHour = await prisma.$queryRaw<{ route: string; h: number; o: bigint }[]>`
    SELECT route, EXTRACT(HOUR FROM hour AT TIME ZONE ${DEFAULT_TZ})::int AS h, SUM(opens) AS o
    FROM ${PVH} ph WHERE hour >= ${hr.from} AND hour < ${hr.to} AND route <> '*' ${w}
    GROUP BY route, h`;
  const peak = new Map<string, { jam: number; opens: number; total: number }>();
  for (const r of byHour) {
    const cur = peak.get(r.route) ?? { jam: -1, opens: 0, total: 0 };
    cur.total += n(r.o);
    if (n(r.o) > cur.opens) {
      cur.opens = n(r.o);
      cur.jam = r.h;
    }
    peak.set(r.route, cur);
  }
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
        peakHour: (() => {
          const p = peak.get(r.route);
          return p && p.jam >= 0 && p.opens > 0 ? { jam: p.jam, persen: Math.round((p.opens / Math.max(1, p.total)) * 100), opens: p.opens } : null;
        })(),
      };
    });
}

analyticsRouter.get('/pages', async (req, res) => {
  res.json({ success: true, data: await computePages(filterOf(req)) });
});

// ------------------------------------------------------------------ halaman: jam ramai

/**
 * Jam ramai (prime hour) 24 jam — halaman dibuka & rata-rata pengguna aktif per jam,
 * peta panas hari × jam, jam tersibuk / tersepi, dan porsi per bagian hari.
 * ?route= → hanya satu halaman. Jam dinding zona bawaan (WIB).
 */
export async function computeHours(f: F, route?: string) {
  const w = pvFilter(f);
  const hr = hourRange(f);
  const r = route ? (ROUTE_ALIAS[route] ?? route) : '*';
  const rows = await prisma.$queryRaw<{ dow: number; h: number; d: Date; o: bigint; u: bigint }[]>`
    SELECT EXTRACT(DOW FROM hour AT TIME ZONE ${DEFAULT_TZ})::int AS dow,
           EXTRACT(HOUR FROM hour AT TIME ZONE ${DEFAULT_TZ})::int AS h,
           (hour AT TIME ZONE ${DEFAULT_TZ})::date AS d,
           SUM(opens) AS o, SUM(users) AS u
    FROM ${PVH} ph WHERE hour >= ${hr.from} AND hour < ${hr.to} AND route = ${r} ${w}
    GROUP BY dow, h, d`;
  const [first] = await prisma.$queryRaw<{ m: Date | null }[]>`SELECT MIN(hour) AS m FROM page_view_hourly`;
  const opens = Array.from({ length: 24 }, () => 0);
  const users = Array.from({ length: 24 }, () => 0);
  const heat = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  const days = new Set<string>();
  for (const x of rows) {
    opens[x.h]! += n(x.o);
    users[x.h]! += n(x.u);
    heat[x.dow]![x.h]! += n(x.o);
    days.add(ymd(x.d));
  }
  const nDays = Math.max(1, days.size);
  const total = opens.reduce((a, b) => a + b, 0);
  const order = opens.map((o, h) => ({ jam: h, opens: o })).sort((a, b) => b.opens - a.opens);
  const active = order.filter((x) => x.opens > 0);
  const BAGIAN = [
    { key: 'dini', label: 'Dini hari', from: 0, to: 5 },
    { key: 'pagi', label: 'Pagi', from: 5, to: 11 },
    { key: 'siang', label: 'Siang', from: 11, to: 15 },
    { key: 'sore', label: 'Sore', from: 15, to: 18 },
    { key: 'malam', label: 'Malam', from: 18, to: 24 },
  ];
  // Jendela 3 jam tersibuk (berurutan).
  let best3 = { jam: 0, opens: 0 };
  for (let h = 0; h < 24; h++) {
    const v = opens[h]! + opens[(h + 1) % 24]! + opens[(h + 2) % 24]!;
    if (v > best3.opens) best3 = { jam: h, opens: v };
  }
  const dowTotals = heat.map((row) => row.reduce((a, b) => a + b, 0));
  const topDow = dowTotals.indexOf(Math.max(...dowTotals));
  // Rentang ramai: jam berurutan di sekitar puncak dengan kunjungan ≥ 50% puncak.
  let ramai: { dari: number; sampai: number; persen: number } | null = null;
  if (active[0]) {
    const p = active[0].jam;
    const thr = active[0].opens * 0.5;
    let a = p;
    let b = p;
    while (a - 1 >= 0 && opens[a - 1]! >= thr) a--;
    while (b + 1 <= 23 && opens[b + 1]! >= thr) b++;
    const v = opens.slice(a, b + 1).reduce((x, y) => x + y, 0);
    ramai = { dari: a, sampai: (b + 1) % 24, persen: total ? Math.round((v / total) * 100) : 0 };
  }
  // Per platform & pembanding seluruh app (hanya bila satu halaman dipilih).
  let platform: Record<string, number> | null = null;
  let appPuncak: number | null = null;
  if (route) {
    const pr = await prisma.$queryRaw<{ platform: string; o: bigint }[]>`
      SELECT platform, SUM(opens) AS o FROM ${PVH} ph
      WHERE hour >= ${hr.from} AND hour < ${hr.to} AND route = ${r} ${w} GROUP BY platform`;
    platform = Object.fromEntries(pr.map((x) => [x.platform, n(x.o)]));
    const ap = await prisma.$queryRaw<{ h: number; o: bigint }[]>`
      SELECT EXTRACT(HOUR FROM hour AT TIME ZONE ${DEFAULT_TZ})::int AS h, SUM(opens) AS o FROM ${PVH} ph
      WHERE hour >= ${hr.from} AND hour < ${hr.to} AND route = '*' ${w} GROUP BY h ORDER BY o DESC LIMIT 1`;
    appPuncak = ap[0] && n(ap[0].o) > 0 ? ap[0].h : null;
  }
  const minggu = dowTotals[0] ?? 0;
  return {
    perHari: dowTotals,
    ramai,
    platform,
    appPuncak,
    porsiMinggu: total ? Math.round((minggu / total) * 100) : 0,
    timezone: DEFAULT_TZ,
    sejak: first?.m ? first.m.toISOString() : null,
    hariData: days.size,
    total,
    jam: opens.map((o, h) => ({ jam: h, opens: o, avgUsers: Math.round((users[h]! / nDays) * 10) / 10 })),
    heat,
    puncak: active[0] ? { jam: active[0].jam, opens: active[0].opens, persen: total ? Math.round((active[0].opens / total) * 100) : 0 } : null,
    top3: active.slice(0, 3).map((x) => ({ jam: x.jam, opens: x.opens, persen: total ? Math.round((x.opens / total) * 100) : 0 })),
    tersepi:
      total > 0
        ? (() => {
            // Jam tersepi di luar dini hari (05–23) — lebih berguna untuk jadwal pengumuman.
            const day = opens.map((o, h) => ({ jam: h, opens: o })).filter((x) => x.jam >= 5);
            return day.sort((a, b) => a.opens - b.opens)[0] ?? null;
          })()
        : null,
    jendela3: total ? { dari: best3.jam, sampai: (best3.jam + 3) % 24, persen: Math.round((best3.opens / total) * 100) } : null,
    bagian: BAGIAN.map((b) => {
      const v = opens.slice(b.from, b.to).reduce((a, c) => a + c, 0);
      return { key: b.key, label: b.label, dari: b.from, sampai: b.to, opens: v, persen: total ? Math.round((v / total) * 100) : 0 };
    }),
    hariTeramai: dowTotals[topDow] ? topDow : null,
  };
}

analyticsRouter.get('/pages/hours', async (req, res) => {
  const route = typeof req.query.route === 'string' && req.query.route ? req.query.route.slice(0, 160) : undefined;
  res.json({ success: true, data: await computeHours(filterOf(req), route) });
});

// ------------------------------------------------------------------ halaman: detail

analyticsRouter.get('/pages/detail', async (req, res) => {
  const f = filterOf(req);
  const w = pvFilter(f);
  const rawRoute = typeof req.query.route === 'string' ? req.query.route.slice(0, 160) : '/';
  const route = ROUTE_ALIAS[rawRoute] ?? rawRoute;
  const daily = await prisma.$queryRaw<{ date: Date; visitors: bigint }[]>`
    SELECT date, COUNT(DISTINCT install_id) AS visitors FROM ${PV} pv
    WHERE route = ${route} AND date BETWEEN ${f.start}::date AND ${f.end}::date ${w}
    GROUP BY date ORDER BY date`;
  const byDate = new Map(daily.map((d) => [ymd(d.date), n(d.visitors)]));
  const days = Array.from({ length: f.days }, (_, i) => ymd(addDays(f.start, i)));

  // Kohort 6 minggu terakhir (minggu mulai Senin): minggu kunjungan pertama → % kembali di minggu ke-k.
  const cohortStart = addDays(f.end, -41);
  const coh = await prisma.$queryRaw<{ wk: Date; k: number; users: bigint }[]>`
    WITH v AS (
      SELECT install_id, date_trunc('week', date)::date AS wk FROM ${PV} pv
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
  {
    key: 'login',
    label: 'Login (OTP / email)',
    match: [
      ['POST', '/auth/otp/verify'],
      ['POST', '/auth/email-otp/verify'],
      ['POST', '/auth/email/verify-magic-link'],
    ],
    note: '4xx (kode salah) tidak dihitung gagal',
  },
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

  // "Hari ini" = sejak 00:00 WIB (bukan 24 jam bergulir) — paling ringan dimuat.
  const todayStart = new Date(`${ymd(todayInTz(DEFAULT_TZ))}T00:00:00+07:00`).getTime();
  const since = f.periode === 'today' ? new Date(todayStart) : new Date(Date.now() - f.days * 86_400_000);
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
    return { key: fl.key, label: fl.label, success: successPct(use), attempts: s.count || a.count, failed: use.c5xx + use.cNet, samples: use.count, note: fl.note };
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
        // Jumlah mentah di balik persentase — supaya 2 gagal dari 32 sampel tidak terlihat seperti masalah besar.
        failed: mixSrc.c5xx + mixSrc.cNet,
        samples: mixSrc.count,
        basis: mixSrc === e.app ? ('app' as const) : ('server' as const),
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

const PERIODE_LABEL: Record<string, string> = { today: 'Hari ini', '7d': '7 hari terakhir', '30d': '30 hari terakhir', '90d': '90 hari terakhir' };
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
      SELECT date, COUNT(DISTINCT install_id) AS users, SUM(views) AS views FROM ${PV} pv
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
