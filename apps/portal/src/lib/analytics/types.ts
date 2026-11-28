/** Bentuk data menu Analitik & Monitor Ibadah — sama dengan respons core-api /admin/analytics & /admin/ibadah-monitor. */

export type Periode = 'today' | '7d' | '30d' | '90d';
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
  activeUsersDeltaPct: number | null;
  views: number;
  /** % pengguna yang kembali ke app dalam 7 hari. */
  return7: number | null;
  avgSessionSec: number;
  avgSessionLoginSec: number;
  avgSessionTamuSec: number;
  platform: { android: number; ios: number; web: number };
}

export interface PageRow {
  /** Pola route yang sudah dinormalkan, mis. /event/[id]. Label: lib/analytics/labels.ts */
  route: string;
  views: number;
  visitors: number;
  avgDurationSec: number;
  return7: number | null;
  return30: number | null;
  activeNow: number;
  /** Jam (0–23, WIB) halaman ini paling sering dibuka + porsinya (null = belum ada data per jam). */
  peakHour?: { jam: number; persen: number; opens: number } | null;
}

/** Jam ramai 24 jam (GET /admin/analytics/pages/hours). */
export interface HoursData {
  timezone: string;
  /** Awal data per jam dikumpulkan (ISO) — null = belum ada. */
  sejak: string | null;
  hariData: number;
  total: number;
  jam: { jam: number; opens: number; avgUsers: number }[];
  /** [hari 0=Minggu … 6=Sabtu][jam 0–23] = halaman dibuka. */
  heat: number[][];
  puncak: { jam: number; opens: number; persen: number } | null;
  top3: { jam: number; opens: number; persen: number }[];
  tersepi: { jam: number; opens: number } | null;
  jendela3: { dari: number; sampai: number; persen: number } | null;
  bagian: { key: string; label: string; dari: number; sampai: number; opens: number; persen: number }[];
  hariTeramai: number | null;
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
  pages: { route: string; n: number }[];
  /** Jumlah aktif per menit, 30 menit terakhir (lama → baru). */
  last30: number[];
}

// ---------------------------------------------------------------- Performa API

export interface ApiSummary {
  successApp: number | null;
  successServer: number | null;
  networkFailPct: number | null;
  err5xx: number;
  total: number;
  p50Server: number | null;
  p95Server: number | null;
  p50App: number | null;
  p95App: number | null;
  rpm: number;
  peakRpm: number;
  peakAt: string;
}

export interface ApiHourly {
  hour: string;
  p95App: number | null;
  p95Server: number | null;
  /** Jumlah request server pada jam itu. */
  requests: number;
}

export interface FlowRate {
  key: string;
  label: string;
  success: number | null;
  attempts: number;
  failed?: number;
  samples?: number;
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
  /** Request gagal (5xx + jaringan) dan jumlah sampel dasar persentase. */
  failed?: number;
  samples?: number;
  basis?: 'app' | 'server';
}

export interface TopError {
  code: string;
  method: string;
  path: string;
  count: number;
  last: string;
}

export interface ApiPerformance {
  summary: ApiSummary;
  hourly: ApiHourly[];
  flows: FlowRate[];
  endpoints: EndpointRow[];
  topErrors: TopError[];
}

// ---------------------------------------------------------------- Monitor Ibadah

export type IbadahStatus = 'BELUM' | 'BERLANGSUNG' | 'SELESAI';

export interface IbadahMonitorOptions {
  tanggal: string;
  cabang?: { id: string; nama: string };
  items: { id: string; nama: string; jamMulai: string; jamSelesai: string; isKidsIbadah: boolean; status: IbadahStatus }[];
}

export interface IbadahMonitorData {
  empty: false;
  updatedAt: string;
  tz: string;
  tanggal: string;
  ibadah: {
    id: string;
    nama: string;
    cabang: { id: string; nama: string };
    lokasi: string | null;
    jamMulai: string;
    jamSelesai: string;
    kapasitasSeat: number | null;
    isKidsIbadah: boolean;
    linkOnline: string | null;
  };
  status: IbadahStatus;
  startAt: string;
  endAt: string;
  kehadiran: { hadir: number; reservasi: number; belumDatang: number; batal: number; tamu: number; last15m: number };
  arrival: { t: string; n: number; cum: number }[];
  methods: Record<string, number>;
  scanners: { nama: string; n: number }[];
  tamu: { total: number; diundang: number; walkIn: number; homecell: number; pertamaKali: number };
  lastWeek: { tanggal: string; hadir: number; hadirSaatIni: number; reservasi: number } | null;
  ckids: { id: string; nama: string; jamMulai: string; jamSelesai: string; hadir: number; belumDijemput: number; menitSejakSelesai: number | null }[];
  app: { aktif: number; tiket: number; alkitab: number; worship: number };
  system: { requests15m: number; successPct: number | null; p95Ms: number | null; checkinSuccessPct: number | null };
  alerts: { level: 'danger' | 'warning' | 'info'; text: string }[];
}

export type IbadahMonitor = IbadahMonitorData | { empty: true; cabang: { id: string; nama: string }; tanggal: string };

// ---------------------------------------------------------------- Monitor Event (layar /monitor)

export interface EventMonitorOptions {
  items: { id: string; judul: string; tanggal: string; tanggalSelesai: string; jamMulai: string | null; jamSelesai: string | null; cabang: string; status: IbadahStatus }[];
}

export interface EventMonitorData {
  updatedAt: string;
  tz: string;
  event: {
    id: string;
    judul: string;
    cabang: string;
    lokasi: string | null;
    tanggal: string;
    tanggalSelesai: string;
    jamMulai: string | null;
    jamSelesai: string | null;
    quota: number | null;
    berbayar: boolean;
  };
  status: IbadahStatus;
  startAt: string;
  endAt: string;
  kehadiran: { hadir: number; terdaftar: number; belumDatang: number; batal: number; sudahBayar: number | null; last15m: number };
  arrival: { t: string; n: number; cum: number }[];
  methods: Record<string, number>;
  tamu: { total: number; diundang: number; walkIn: number; pertamaKali: number };
  app: { aktif: number; tiket: number; alkitab: number; worship: number; event: number };
  system: { requests15m: number; successPct: number | null; p95Ms: number | null; checkinSuccessPct: number | null };
  alerts: { level: 'danger' | 'warning' | 'info'; text: string }[];
}
