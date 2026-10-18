/**
 * Utilitas tanggal yang aman zona waktu.
 *
 * Kolom tanggal saja (@db.Date: tanggal lahir, bergabung, ibadah, dst.)
 * dikirim API sebagai "2026-09-29T00:00:00.000Z". `new Date(...)` membacanya
 * sebagai jam 00:00 UTC — di browser zona UTC- (Amerika) tampil mundur 1 hari.
 * Dan `new Date().toISOString().slice(0, 10)` memberi tanggal UTC — di WIB
 * sebelum jam 07:00 masih "kemarin".
 *
 * Pakai helper ini untuk tanggal kalender; biarkan `new Date(...)` untuk
 * waktu kejadian (createdAt, scannedAt, dll.).
 */

/** Date lokal → "YYYY-MM-DD" (tanpa konversi UTC). */
export function toYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Hari ini (zona waktu browser) "YYYY-MM-DD". */
export const todayYmd = () => toYmd(new Date());

/** N hari lalu (zona waktu browser) "YYYY-MM-DD". */
export function daysAgoYmd(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toYmd(d);
}

/** "YYYY-MM-DD" / "YYYY-MM-DDT00:00:00.000Z" → Date lokal tanggal yang sama (jam 00:00). */
export function parseYmd(v: string | Date | null | undefined): Date {
  if (!v) return new Date(NaN);
  if (v instanceof Date) return v;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (!m) return new Date(v);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** Nilai berbentuk tanggal saja (tanpa jam / jam 00:00 UTC)? */
export function isDateOnly(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}(T00:00:00(\.000)?Z)?$/.test(v);
}

/** Format tanggal kalender, default "29 Sep 2019". */
export function fmtYmd(
  v: string | Date | null | undefined,
  opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' },
): string {
  const d = parseYmd(v);
  return isNaN(d.getTime()) ? '-' : d.toLocaleDateString('id-ID', opts);
}
