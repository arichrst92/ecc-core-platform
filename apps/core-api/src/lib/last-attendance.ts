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
