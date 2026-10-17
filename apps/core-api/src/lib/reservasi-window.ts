/**
 * Reservasi mandiri jemaat (mobile) — logika murni (tanpa DB).
 *
 * Aturan:
 *   - Bisa reservasi pertemuan ibadah terjadwal dari hari ini s.d.
 *     RESERVE_DAYS_AHEAD hari ke depan (WIB), yang tidak dibatalkan.
 *   - Reservasi & pembatalan ditutup saat jam mulai ibadah (WIB). Setelah
 *     itu pakai self check-in / scan usher.
 *   - Ibadah anak: hanya untuk anak ≤ KIDS_MAX_AGE tahun (atau tanggungan
 *     tanpa tanggal lahir).
 */
import { generateOccurrences, type IbadahForOccurrence } from './ibadah-occurrences.js';
import { todayWib } from './last-attendance.js';
import { hhmmToMin } from './self-checkin.js';

export const RESERVE_DAYS_AHEAD = 30;
export const KIDS_MAX_AGE = 13;
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Instant UTC jam mulai pertemuan `tanggal` (YYYY-MM-DD, WIB). */
export function occurrenceStart(tanggal: string, jamMulai: string): Date {
  const day = new Date(`${tanggal}T00:00:00.000Z`);
  return new Date(day.getTime() + (hhmmToMin(jamMulai) ?? 0) * 60_000 - WIB_OFFSET_MS);
}

export interface ReservableOccurrence {
  tanggal: string;
  startsAt: string;
  cancelled: boolean;
  /** Masih bisa reservasi / batal (belum lewat jam mulai, tidak dibatalkan). */
  open: boolean;
}

export function reservableOccurrences(
  ibadah: IbadahForOccurrence & { jamMulai: string },
  cancelledDates: string[],
  now: Date = new Date(),
): ReservableOccurrence[] {
  const today = todayWib(now);
  const to = new Date(today.getTime() + RESERVE_DAYS_AHEAD * DAY_MS);
  return generateOccurrences(ibadah, today, to).map((d) => {
    const tanggal = d.toISOString().slice(0, 10);
    const startsAt = occurrenceStart(tanggal, ibadah.jamMulai);
    const cancelled = cancelledDates.includes(tanggal);
    return { tanggal, startsAt: startsAt.toISOString(), cancelled, open: !cancelled && now < startsAt };
  }).filter((o) => o.open || o.cancelled);
}

/** Masih boleh batal: status RESERVE dan belum lewat jam mulai. */
export function canCancelReservasi(
  r: { status: string; tanggalIbadah: Date },
  jamMulai: string,
  now: Date = new Date(),
): boolean {
  return r.status === 'RESERVE' && now < occurrenceStart(r.tanggalIbadah.toISOString().slice(0, 10), jamMulai);
}

/** Usia penuh (tahun) per tanggal WIB hari ini; null kalau tanggal lahir kosong. */
export function ageYears(tanggalLahir: Date | null, now: Date = new Date()): number | null {
  if (!tanggalLahir) return null;
  const t = todayWib(now);
  let age = t.getUTCFullYear() - tanggalLahir.getUTCFullYear();
  const m = t.getUTCMonth() - tanggalLahir.getUTCMonth();
  if (m < 0 || (m === 0 && t.getUTCDate() < tanggalLahir.getUTCDate())) age--;
  return age;
}

/** Boleh ikut ibadah anak: ≤ 13 tahun, atau tanggungan tanpa tanggal lahir. */
export function eligibleForKids(p: { tanggalLahir: Date | null; isDependent: boolean }, now: Date = new Date()): boolean {
  const age = ageYears(p.tanggalLahir, now);
  if (age === null) return p.isDependent;
  return age >= 0 && age <= KIDS_MAX_AGE;
}
