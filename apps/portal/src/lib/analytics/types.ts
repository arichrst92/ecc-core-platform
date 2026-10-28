/**
 * Bentuk data menu Analitik (portal). Dipakai bersama oleh data contoh
 * (mock.ts) dan nanti respons API core-api — jadi saat backend siap, cukup
 * ganti sumber data di use-analytics.ts tanpa mengubah tampilan.
 */

export type Periode = '7d' | '30d' | '90d';
export type PlatformFilter = 'all' | 'ios' | 'android' | 'web';
export type ModeFilter = 'all' | 'login' | 'tamu';

export interface AnalyticsFilter {
  periode: Periode;
  platform: PlatformFilter;
  mode: ModeFilter;
}

// ---------------------------------------------------------------- Halaman

export interface PageSummary {
  activeUsers: number;
  activeUsersDeltaPct: number;
  views: number;
  /** % pengguna yang kembali ke app dalam 7 hari. */
  return7: number;
  avgSessionSec: number;
  avgSessionLoginSec: number;
  avgSessionTamuSec: number;
  platform: { android: number; ios: number; web: number };
}

export interface PageRow {
  /** Pola route yang sudah dinormalkan, mis. /event/[id]. */
  route: string;
  label: string;
  views: number;
  visitors: number;
  avgDurationSec: number;
  return7: number;
  return30: number;
  activeNow: number;
}

export interface CohortRow {
  /** Senin awal minggu, YYYY-MM-DD. */
  week: string;
  size: number;
  /** % kembali di minggu ke-0..n; null = belum terjadi. */
  pct: (number | null)[];
}

export interface PageDetail {
  route: string;
  daily: { date: string; visitors: number }[];
  cohorts: CohortRow[];
}

// ---------------------------------------------------------------- Aktif sekarang

export interface LiveSnapshot {
  at: string;
  total: number;
  platform: { android: number; ios: number; web: number };
  login: number;
  tamu: number;
  pages: { route: string; label: string; n: number }[];
  /** Jumlah aktif per menit, 30 menit terakhir (lama → baru). */
  last30: number[];
}

// ---------------------------------------------------------------- Performa API

export interface ApiSummary {
  successApp: number;
  successServer: number;
  networkFailPct: number;
  err5xx: number;
  total: number;
  p50Server: number;
  p95Server: number;
  p50App: number;
  p95App: number;
  rpm: number;
  peakRpm: number;
  peakAt: string;
}

export interface ApiHourly {
  hour: string;
  p95App: number;
  p95Server: number;
  active: number;
}

export interface FlowRate {
  key: string;
  label: string;
  success: number;
  attempts: number;
  note?: string;
}

export interface EndpointRow {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: string;
  count: number;
  p50: number;
  p95: number;
  success: number;
  /** Persentase per kelas status; total ≈ 100. */
  mix: { ok: number; c4xx: number; c5xx: number; network: number };
}

export interface TopError {
  code: string;
  method: string;
  path: string;
  count: number;
  last: string;
  note?: string;
}

export interface ApiPerformance {
  summary: ApiSummary;
  hourly: ApiHourly[];
  flows: FlowRate[];
  endpoints: EndpointRow[];
  topErrors: TopError[];
}
