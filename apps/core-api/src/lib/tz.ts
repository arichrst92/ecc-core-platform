/**
 * Zona waktu (IANA, mis. "Asia/Jakarta", "Australia/Sydney") — tiap cabang
 * punya zona waktunya sendiri (`cabang_gereja.timezone`). Jam jadwal
 * ibadah/event ("09:00") adalah jam dinding di zona cabang tersebut.
 *
 * Semua tanggal kalender disimpan sebagai UTC midnight (@db.Date). Helper di
 * sini mengubah "tanggal + jam dinding di zona X" ↔ instant UTC, aman DST.
 */
export const DEFAULT_TZ = 'Asia/Jakarta';

const DAY_MS = 24 * 60 * 60 * 1000;
const fmtCache = new Map<string, Intl.DateTimeFormat>();

function fmt(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    fmtCache.set(tz, f);
  }
  return f;
}

export function isValidTz(tz: string | null | undefined): tz is string {
  if (!tz) return false;
  try {
    fmt(tz);
    return true;
  } catch {
    return false;
  }
}

/** Zona valid atau default (Asia/Jakarta). */
export const tzOr = (tz: string | null | undefined): string => (isValidTz(tz) ? tz : DEFAULT_TZ);

/** Komponen jam dinding `at` di zona `tz`. */
function parts(at: Date, tz: string) {
  const p: Record<string, number> = {};
  for (const x of fmt(tz).formatToParts(at)) if (x.type !== 'literal') p[x.type] = Number(x.value);
  const n = (k: string) => p[k] ?? 0;
  return { y: n('year'), m: n('month'), d: n('day'), h: n('hour') === 24 ? 0 : n('hour'), mi: n('minute'), s: n('second') };
}

/** Selisih zona `tz` terhadap UTC (ms) pada instant `at`. WIB = +7 jam. */
export function tzOffsetMs(tz: string, at: Date = new Date()): number {
  const p = parts(at, tz);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s);
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** "Hari ini" di zona `tz` sebagai UTC midnight (cocok dengan kolom @db.Date). */
export function todayInTz(tz: string, now: Date = new Date()): Date {
  const p = parts(now, tz);
  return new Date(Date.UTC(p.y, p.m - 1, p.d));
}

/** Tanggal kalender (UTC midnight) dari instant `d` menurut zona `tz`. */
export function dateInTz(d: Date, tz: string): Date {
  return todayInTz(tz, d);
}

/**
 * Instant UTC dari tanggal kalender (UTC midnight / "YYYY-MM-DD") + menit
 * sejak 00:00 jam dinding di zona `tz`. Dua iterasi → benar di sekitar DST.
 */
export function wallToInstant(day: Date | string, minutes: number, tz: string): Date {
  const base = (typeof day === 'string' ? new Date(`${day.slice(0, 10)}T00:00:00.000Z`) : day).getTime() + minutes * 60_000;
  let guess = base - tzOffsetMs(tz, new Date(base));
  guess = base - tzOffsetMs(tz, new Date(guess));
  return new Date(guess);
}

/**
 * Tanggal kalender event dari kolom DateTime. Portal mengirim "YYYY-MM-DD"
 * (tersimpan UTC midnight) → pakai tanggal UTC apa adanya; data lama yang
 * tersimpan sebagai jam lokal (mis. 17:00Z = 00:00 WIB) → tanggal di zona.
 */
export function calendarDateOf(d: Date, tz: string): Date {
  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0) {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }
  return dateInTz(d, tz);
}

export const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY_MS);

const TZ_CITY_ID: Record<string, string> = {
  'Asia/Jakarta': 'Jakarta',
  'Asia/Pontianak': 'Pontianak',
  'Asia/Makassar': 'Makassar',
  'Asia/Jayapura': 'Jayapura',
  'Asia/Kuala_Lumpur': 'Kuala Lumpur',
  'Asia/Kuching': 'Kuching',
  'Asia/Singapore': 'Singapura',
};

/** "Waktu Kuala Lumpur" — label zona cabang untuk pesan/laporan. */
export function tzZoneLabel(tz: string | null | undefined): string {
  const key = tzOr(tz);
  const city = TZ_CITY_ID[key] ?? (key.split('/').pop() ?? key).replace(/_/g, ' ');
  return `Waktu ${city}`;
}

/** "10.00 - 12.00 Waktu Kuala Lumpur" dari jam dinding cabang. */
export function jamWithZone(jamMulai: string | null | undefined, jamSelesai: string | null | undefined, tz: string | null | undefined): string {
  const f = (s: string) => s.slice(0, 5).replace(':', '.');
  if (!jamMulai) return tzZoneLabel(tz);
  return `${f(jamMulai)}${jamSelesai && jamSelesai !== jamMulai ? ` - ${f(jamSelesai)}` : ''} ${tzZoneLabel(tz)}`;
}

/** "Sab, 26 Okt 2026 10.05 Waktu Kuala Lumpur" — instant di zona cabang. */
export function instantInTzLabel(at: Date, tz: string | null | undefined, withDate = true): string {
  const z = tzOr(tz);
  const time = at.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: z });
  const date = withDate ? `${at.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: z })} ` : '';
  return `${date}${time} ${tzZoneLabel(z)}`;
}

/** Tanggal kalender event (zona cabang) → "26 Okt 2026". */
export function eventDateLabel(tanggalMulai: Date, tz: string | null | undefined): string {
  return calendarDateOf(tanggalMulai, tzOr(tz)).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}
