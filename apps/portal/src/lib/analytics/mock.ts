/**
 * DATA CONTOH untuk menu Analitik — dipakai selama backend (pencatatan
 * halaman, aktif sekarang, performa API) belum dibangun. Deterministik
 * (seeded) supaya render server & browser sama.
 */
import type {
  AnalyticsFilter,
  ApiPerformance,
  LiveSnapshot,
  PageDetail,
  PageRow,
  PageSummary,
} from './types';

function seeded(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);

const PAGES: Omit<PageRow, 'activeNow'>[] = [
  { route: '/', label: 'Beranda', views: 41200, visitors: 2310, avgDurationSec: 48, return7: 71, return30: 83 },
  { route: '/reservasi', label: 'Tiket (Reservasi)', views: 12650, visitors: 1480, avgDurationSec: 35, return7: 54, return30: 76 },
  { route: '/bible365', label: 'Bible 365', views: 9840, visitors: 612, avgDurationSec: 260, return7: 68, return30: 61 },
  { route: '/bible/[kitab]/[bab]', label: 'Alkitab — baca pasal', views: 8920, visitors: 880, avgDurationSec: 312, return7: 49, return30: 58 },
  { route: '/content/renungan/[slug]', label: 'Renungan', views: 6110, visitors: 1240, avgDurationSec: 165, return7: 41, return30: 55 },
  { route: '/event/[id]', label: 'Event — detail', views: 5730, visitors: 1610, avgDurationSec: 52, return7: 22, return30: 37 },
  { route: '/worship', label: 'ECC Worship', views: 4380, visitors: 540, avgDurationSec: 410, return7: 46, return30: 52 },
  { route: '/tiket', label: 'Tiket — tampilan penuh', views: 3870, visitors: 1150, avgDurationSec: 28, return7: 51, return30: 72 },
  { route: '/homecell/[id]', label: 'Homecell', views: 2950, visitors: 430, avgDurationSec: 95, return7: 38, return30: 57 },
  { route: '/content/news/[slug]', label: 'Berita — detail', views: 2410, visitors: 960, avgDurationSec: 70, return7: 15, return30: 26 },
  { route: '/doa', label: 'Prayer Request', views: 1320, visitors: 410, avgDurationSec: 88, return7: 27, return30: 40 },
  { route: '/homecell/guest', label: 'Cari homecell (tamu)', views: 640, visitors: 310, avgDurationSec: 120, return7: 12, return30: 18 },
];

const PERIODE_MULT = { '7d': 0.25, '30d': 1, '90d': 2.9 } as const;
const PLATFORM_MULT = { all: 1, android: 0.52, ios: 0.39, web: 0.09 } as const;
const MODE_MULT = { all: 1, login: 0.82, tamu: 0.18 } as const;

const scale = (f: AnalyticsFilter) => PERIODE_MULT[f.periode] * PLATFORM_MULT[f.platform] * MODE_MULT[f.mode];

export function mockPageSummary(f: AnalyticsFilter): PageSummary {
  const m = scale(f);
  return {
    activeUsers: Math.round(2650 * Math.min(1.6, m * 1.1 + 0.2) * PLATFORM_MULT[f.platform] ** 0.1),
    activeUsersDeltaPct: 8,
    views: Math.round(PAGES.reduce((a, p) => a + p.views, 0) * m),
    return7: f.mode === 'tamu' ? 21 : 58,
    avgSessionSec: f.mode === 'tamu' ? 110 : f.mode === 'login' ? 280 : 252,
    avgSessionLoginSec: 280,
    avgSessionTamuSec: 110,
    platform: { android: 52, ios: 39, web: 9 },
  };
}

export function mockPages(f: AnalyticsFilter): PageRow[] {
  const m = scale(f);
  const rnd = seeded(7);
  return PAGES.map((p) => ({
    ...p,
    views: Math.round(p.views * m),
    visitors: Math.round(p.visitors * Math.min(1.4, m + 0.2)),
    return7: f.mode === 'tamu' ? Math.round(p.return7 * 0.45) : p.return7,
    return30: f.mode === 'tamu' ? Math.round(p.return30 * 0.45) : p.return30,
    activeNow: Math.round((p.visitors / 60) * (0.5 + rnd())),
  }));
}

export function mockPageDetail(route: string, f: AnalyticsFilter): PageDetail {
  const p = PAGES.find((x) => x.route === route) ?? PAGES[0]!;
  const days = f.periode === '7d' ? 7 : f.periode === '30d' ? 30 : 90;
  const rnd = seeded(route.length * 97 + days);
  const base = p.visitors / 9;
  const end = new Date(Date.UTC(2026, 9, 28));
  const daily = Array.from({ length: days }, (_, i) => {
    const d = new Date(end);
    d.setUTCDate(end.getUTCDate() - (days - 1 - i));
    const sunday = d.getUTCDay() === 0 ? 0.9 : 0;
    return { date: ymd(d), visitors: Math.round(base * (0.75 + 0.3 * rnd() + sunday + i / (days * 3))) };
  });
  const cohorts = Array.from({ length: 6 }, (_, wi) => {
    const d = new Date(Date.UTC(2026, 8, 21 + wi * 7));
    const size = Math.round((p.visitors / 4) * (0.85 + rnd() * 0.3));
    const pct = Array.from({ length: 6 }, (_, k) => {
      if (k > 5 - wi) return null;
      if (k === 0) return 100;
      return Math.max(4, Math.round(p.return7 * Math.pow(0.87, k - 1) - wi + rnd() * 4));
    });
    return { week: ymd(d), size, pct };
  });
  return { route: p.route, daily, cohorts };
}

export function mockLive(tick: number): LiveSnapshot {
  const rnd = seeded(1000 + tick);
  const pages = [
    { route: '/reservasi', label: 'Tiket (Reservasi)', n: 84 },
    { route: '/', label: 'Beranda', n: 71 },
    { route: '/bible/[kitab]/[bab]', label: 'Alkitab — baca pasal', n: 41 },
    { route: '/tiket', label: 'Tiket — tampilan penuh', n: 33 },
    { route: '/content/renungan/[slug]', label: 'Renungan', n: 22 },
    { route: '/worship', label: 'ECC Worship', n: 12 },
    { route: '/event/[id]', label: 'Event — detail', n: 9 },
  ].map((x) => ({ ...x, n: Math.max(2, x.n + Math.round((rnd() - 0.45) * 6 + Math.sin(tick / 4) * 4)) }));
  const lainnya = 38 + Math.round(rnd() * 6);
  const total = pages.reduce((a, x) => a + x.n, 0) + lainnya;
  const last30 = Array.from({ length: 30 }, (_, i) => Math.round(total * (0.62 + (i / 29) * 0.38) + Math.sin((i + tick) / 3) * 12));
  last30[29] = total;
  const tamu = Math.round(total * 0.18);
  const android = Math.round(total * 0.53);
  const ios = Math.round(total * 0.38);
  return {
    at: new Date().toISOString(),
    total,
    platform: { android, ios, web: total - android - ios },
    login: total - tamu,
    tamu,
    pages: [...pages, { route: '*', label: 'Lainnya', n: lainnya }],
    last30,
  };
}

export function mockApiPerformance(f: AnalyticsFilter): ApiPerformance {
  const rnd = seeded(f.periode.length * 31 + f.platform.length);
  const active = Array.from({ length: 24 }, (_, h) =>
    Math.round(h < 5 ? 15 : h < 7 ? 120 : h < 10 ? 620 - (h - 8) * 40 : h < 17 ? 180 + Math.sin(h) * 40 : h < 21 ? 260 : 90),
  );
  const netMult = f.platform === 'web' ? 0.7 : f.platform === 'android' ? 1.15 : 1;
  return {
    summary: {
      successApp: 98.7,
      successServer: 99.94,
      networkFailPct: 1.1,
      err5xx: 38,
      total: 61230,
      p50Server: 42,
      p95Server: 180,
      p50App: Math.round(380 * netMult),
      p95App: Math.round(1400 * netMult),
      rpm: 42,
      peakRpm: 310,
      peakAt: 'Minggu 07.45',
    },
    hourly: active.map((a, h) => ({
      hour: `${String(h).padStart(2, '0')}:00`,
      active: a,
      p95App: Math.round((700 + a * 1.3 + rnd() * 150) * netMult),
      p95Server: Math.round(90 + a * 0.18 + rnd() * 20),
    })),
    flows: [
      { key: 'login', label: 'Login (OTP)', success: 96.2, attempts: 2140, note: 'Di bawah 98% — cek pengiriman WhatsApp' },
      { key: 'checkin', label: 'Self check-in', success: 99.1, attempts: 8420, note: 'Di luar radius dihitung terpisah' },
      { key: 'reservasi', label: 'Reservasi ibadah', success: 99.7, attempts: 5310 },
      { key: 'event', label: 'Daftar event', success: 99.6, attempts: 1180 },
      { key: 'absen-hc', label: 'Absen homecell', success: 99.8, attempts: 940 },
      { key: 'join-hc', label: 'Minta gabung homecell', success: 100, attempts: 64 },
    ],
    endpoints: [
      { method: 'POST', path: '/admin/me/checkin', count: 8420, p50: 210, p95: 640, success: 98.9, mix: { ok: 96.4, c4xx: 2.5, c5xx: 0.03, network: 1.07 } },
      { method: 'GET', path: '/admin/me/event-tiket', count: 12310, p50: 120, p95: 410, success: 99.85, mix: { ok: 99.2, c4xx: 0.65, c5xx: 0.1, network: 0.05 } },
      { method: 'GET', path: '/admin/me/reservasi', count: 15880, p50: 70, p95: 220, success: 99.97, mix: { ok: 99.6, c4xx: 0.37, c5xx: 0.01, network: 0.02 } },
      { method: 'POST', path: '/auth/otp/verify', count: 1920, p50: 140, p95: 310, success: 99.9, mix: { ok: 88.4, c4xx: 11.5, c5xx: 0, network: 0.1 } },
      { method: 'POST', path: '/auth/otp/request', count: 2140, p50: 820, p95: 1850, success: 97.6, mix: { ok: 95.1, c4xx: 2.5, c5xx: 1.4, network: 1.0 } },
      { method: 'GET', path: '/public/homecell/browse', count: 960, p50: 60, p95: 150, success: 99.6, mix: { ok: 99.6, c4xx: 0, c5xx: 0.4, network: 0 } },
      { method: 'GET', path: '/admin/me/bible365', count: 7210, p50: 55, p95: 160, success: 99.98, mix: { ok: 99.9, c4xx: 0.08, c5xx: 0, network: 0.02 } },
      { method: 'POST', path: '/telemetry', count: 41300, p50: 4, p95: 12, success: 99.99, mix: { ok: 99.99, c4xx: 0, c5xx: 0, network: 0.01 } },
    ],
    topErrors: [
      { code: '500', method: 'GET', path: '/admin/me/event-tiket', count: 12, last: '09.14' },
      { code: 'timeout', method: 'POST', path: '/admin/me/checkin', count: 31, last: '07.52', note: '87% dari Android' },
      { code: '502', method: 'GET', path: '/public/homecell/browse', count: 4, last: '07.02', note: 'saat restart server' },
    ],
  };
}
