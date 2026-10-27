/**
 * Bahasa laporan HTML/PDF homecell & area (id / en). Render bersifat sinkron,
 * jadi bahasa aktif disimpan di variabel modul selama satu render.
 */
export type ReportLang = 'id' | 'en';
let current: ReportLang = 'id';

export const setReportLang = (l: ReportLang | undefined) => {
  current = l === 'en' ? 'en' : 'id';
};
export const reportLang = () => current;

/** Teks sesuai bahasa aktif. */
export const L = (id: string, en: string) => (current === 'en' ? en : id);

/** Tanggal "27 Okt 2026" / "27 Oct 2026" dari YYYY-MM-DD. */
export const fmtTglL = (ymd: string | null | undefined) =>
  ymd
    ? new Date(`${ymd.slice(0, 10)}T00:00:00Z`).toLocaleDateString(current === 'en' ? 'en-GB' : 'id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      })
    : '—';

/** Waktu dibuat (Jakarta). */
export const generatedAt = () =>
  new Date().toLocaleString(current === 'en' ? 'en-GB' : 'id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' });

/** Satuan tahun. */
export const yrs = () => (current === 'en' ? 'yrs' : 'th');

/** "20–30 th" / "20–30 yrs". */
export function usiaLabelL(min?: number | null, max?: number | null): string | null {
  const u = yrs();
  if (min != null && max != null) return min === max ? `${min} ${u}` : `${min}–${max} ${u}`;
  if (min != null) return `≥ ${min} ${u}`;
  if (max != null) return `≤ ${max} ${u}`;
  return null;
}

export const PERIOD_LABEL_L: Record<string, [string, string]> = {
  last_7d: ['7 hari terakhir', 'Last 7 days'],
  this_week: ['Minggu ini', 'This week'],
  last_week: ['Minggu lalu', 'Last week'],
  last_30d: ['30 hari terakhir', 'Last 30 days'],
  this_month: ['Bulan ini', 'This month'],
  last_month: ['Bulan lalu', 'Last month'],
  custom: ['Rentang tanggal', 'Date range'],
};
export const periodName = (preset: string | undefined) => {
  const p = PERIOD_LABEL_L[preset ?? ''];
  return p ? L(p[0], p[1]) : L('Periode', 'Period');
};
