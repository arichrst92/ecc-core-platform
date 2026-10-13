/** Helper murni kehadiran terakhir homecell (tanpa DB) — mudah di-test. */

const DAY_MS = 86_400_000;
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

/**
 * Selisih hari antara `tanggal` (kolom @db.Date → UTC midnight) dan hari ini
 * (tanggal WIB). Tidak pernah negatif.
 */
export function daysSince(tanggal: Date, now: Date = new Date()): number {
  const wib = new Date(now.getTime() + WIB_OFFSET_MS);
  const todayUtcMidnight = Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate());
  const d = Date.UTC(tanggal.getUTCFullYear(), tanggal.getUTCMonth(), tanggal.getUTCDate());
  return Math.max(0, Math.round((todayUtcMidnight - d) / DAY_MS));
}

export interface LastAttendance {
  lastAttendedAt: Date;
  lastAttendedDaysAgo: number;
}

/** Tambahkan field kehadiran terakhir (null kalau belum pernah hadir). */
export function withLastAttendance<T>(jemaatId: string, row: T, map: Map<string, LastAttendance>) {
  const la = map.get(jemaatId);
  return {
    ...row,
    lastAttendedAt: la ? la.lastAttendedAt.toISOString().slice(0, 10) : null,
    lastAttendedDaysAgo: la ? la.lastAttendedDaysAgo : null,
  };
}

// ============================================================
// Periode filter laporan homecell (tanggal WIB, minggu mulai Senin)
// ============================================================

export type PeriodPreset =
  | 'last_7d'
  | 'this_week'
  | 'last_week'
  | 'last_30d'
  | 'this_month'
  | 'last_month'
  | 'custom';

export const PERIOD_PRESETS: PeriodPreset[] = [
  'last_7d',
  'this_week',
  'last_week',
  'last_30d',
  'this_month',
  'last_month',
  'custom',
];

/** Tanggal hari ini (WIB) sebagai UTC midnight. */
export function todayWib(now: Date = new Date()): Date {
  const wib = new Date(now.getTime() + WIB_OFFSET_MS);
  return new Date(Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate()));
}

const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY_MS);
const parseYmd = (s: string | undefined): Date | null => {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * Preset → rentang tanggal inklusif {from, to} (UTC midnight, cocok dengan
 * kolom @db.Date). null kalau preset tidak dikenal / custom tidak valid.
 */
export function resolvePeriod(
  preset: string | undefined,
  fromStr?: string,
  toStr?: string,
  now: Date = new Date(),
): { from: Date; to: Date } | null {
  const today = todayWib(now);
  const dow = (today.getUTCDay() + 6) % 7; // Senin = 0
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  switch (preset) {
    case 'last_7d':
      return { from: addDays(today, -6), to: today };
    case 'last_30d':
      return { from: addDays(today, -29), to: today };
    case 'this_week':
      return { from: addDays(today, -dow), to: today };
    case 'last_week': {
      const thisMon = addDays(today, -dow);
      return { from: addDays(thisMon, -7), to: addDays(thisMon, -1) };
    }
    case 'this_month':
      return { from: new Date(Date.UTC(y, m, 1)), to: today };
    case 'last_month':
      return { from: new Date(Date.UTC(y, m - 1, 1)), to: new Date(Date.UTC(y, m, 0)) };
    case 'custom': {
      const f = parseYmd(fromStr);
      const t = parseYmd(toStr);
      if (!f && !t) return null;
      const from = f ?? new Date(Date.UTC(2000, 0, 1));
      const to = t ?? today;
      return from <= to ? { from, to } : { from: to, to: from };
    }
    default:
      return null;
  }
}

export const ymd = (d: Date) => d.toISOString().slice(0, 10);
