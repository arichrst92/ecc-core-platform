/**
 * Reservasi mandiri jemaat (mobile) — logika murni (tanpa DB).
 *
 * Aturan:
 *   - Bisa reservasi pertemuan ibadah terjadwal dari hari ini s.d.
 *     RESERVE_DAYS_AHEAD hari ke depan (zona waktu cabang), yang tidak dibatalkan.
 *   - Reservasi ditutup saat jam mulai ibadah (zona cabang) — atau
 *     `registrasiTutupMenit` sebelum/sesudah mulai bila diatur per ibadah.
 *     Pembatalan: sampai jam mulai (atau batas reservasi bila lebih lambat).
 *     Setelah itu pakai self check-in / scan usher.
 *   - Ibadah anak: hanya untuk anak ≤ KIDS_MAX_AGE tahun (atau tanggungan
 *     tanpa tanggal lahir).
 */
import { generateOccurrences, type IbadahForOccurrence } from './ibadah-occurrences.js';
import { DEFAULT_TZ, todayInTz, wallToInstant } from './tz.js';
import { type CheckinCfg, cfgRegCloseMin, hhmmToMin, regCloseRuleText, registrationClosesAt, selfCheckinClosesAt } from './self-checkin.js';

export const RESERVE_DAYS_AHEAD = 30;
export const KIDS_MAX_AGE = 13;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Instant UTC jam mulai pertemuan `tanggal` (YYYY-MM-DD) di zona cabang. */
export function occurrenceStart(tanggal: string, jamMulai: string, tz: string = DEFAULT_TZ): Date {
  return wallToInstant(tanggal, hhmmToMin(jamMulai) ?? 0, tz);
}

/** Batas reservasi & pembatalan pertemuan `tanggal` (mulai − registrasiTutupMenit). */
export function reservasiClosesAt(tanggal: string, jamMulai: string, tz: string = DEFAULT_TZ, cfg?: CheckinCfg | null): Date {
  return registrationClosesAt(occurrenceStart(tanggal, jamMulai, tz), cfg);
}

export function reservasiClosedMessage(cfg?: CheckinCfg | null): string {
  if (cfgRegCloseMin(cfg) === 0) return 'Reservasi sudah ditutup karena ibadah sudah dimulai.';
  return `Reservasi sudah ditutup (batasnya ${regCloseRuleText(cfg, 'ibadah')}). Silakan self check-in / scan usher di lokasi.`;
}

export interface ReservableOccurrence {
  tanggal: string;
  startsAt: string;
  cancelled: boolean;
  /** Masih bisa reservasi / batal (belum lewat batas reservasi, tidak dibatalkan). */
  open: boolean;
  /** Batas reservasi (ISO) — sama dengan startsAt kecuali diatur per ibadah. */
  closesAt: string;
}

export function reservableOccurrences(
  ibadah: IbadahForOccurrence & { jamMulai: string } & CheckinCfg,
  cancelledDates: string[],
  now: Date = new Date(),
  tz: string = DEFAULT_TZ,
): ReservableOccurrence[] {
  const today = todayInTz(tz, now);
  const to = new Date(today.getTime() + RESERVE_DAYS_AHEAD * DAY_MS);
  return generateOccurrences(ibadah, today, to).map((d) => {
    const tanggal = d.toISOString().slice(0, 10);
    const startsAt = occurrenceStart(tanggal, ibadah.jamMulai, tz);
    const closes = registrationClosesAt(startsAt, ibadah);
    const cancelled = cancelledDates.includes(tanggal);
    return { tanggal, startsAt: startsAt.toISOString(), closesAt: closes.toISOString(), cancelled, open: !cancelled && now < closes };
  }).filter((o) => o.open || o.cancelled);
}

/** Masih boleh batal: status RESERVE dan belum lewat jam mulai (atau batas reservasi bila diatur sesudah mulai). */
export function canCancelReservasi(
  r: { status: string; tanggalIbadah: Date },
  jamMulai: string,
  now: Date = new Date(),
  tz: string = DEFAULT_TZ,
  cfg?: CheckinCfg | null,
): boolean {
  const ymd = r.tanggalIbadah.toISOString().slice(0, 10);
  const start = occurrenceStart(ymd, jamMulai, tz);
  const reg = reservasiClosesAt(ymd, jamMulai, tz, cfg);
  return r.status === 'RESERVE' && now < (reg > start ? reg : start);
}

/** Usia penuh (tahun) per tanggal WIB hari ini; null kalau tanggal lahir kosong. */
export function ageYears(tanggalLahir: Date | null, now: Date = new Date(), tz: string = DEFAULT_TZ): number | null {
  if (!tanggalLahir) return null;
  const t = todayInTz(tz, now);
  let age = t.getUTCFullYear() - tanggalLahir.getUTCFullYear();
  const m = t.getUTCMonth() - tanggalLahir.getUTCMonth();
  if (m < 0 || (m === 0 && t.getUTCDate() < tanggalLahir.getUTCDate())) age--;
  return age;
}

/** Boleh ikut ibadah anak: ≤ 13 tahun, atau tanggungan tanpa tanggal lahir. */
export function eligibleForKids(
  p: { tanggalLahir: Date | null; isDependent: boolean },
  now: Date = new Date(),
  tz: string = DEFAULT_TZ,
): boolean {
  const age = ageYears(p.tanggalLahir, now, tz);
  if (age === null) return p.isDependent;
  return age >= 0 && age <= KIDS_MAX_AGE;
}

/** Instant UTC jam selesai pertemuan (jamSelesai ≤ jamMulai → akhir hari). */
export function occurrenceEnd(tanggal: string, jamMulai: string, jamSelesai: string | null, tz: string = DEFAULT_TZ): Date {
  const start = hhmmToMin(jamMulai) ?? 0;
  let end = hhmmToMin(jamSelesai) ?? 24 * 60 - 1;
  if (end <= start) end = 24 * 60 - 1;
  return wallToInstant(tanggal, end, tz);
}

/**
 * Self check-in boleh dibatalkan (salah input) oleh jemaat yang melakukannya:
 * status JOIN, cara SELF, dilakukan oleh user ini (atau milik jemaat ini),
 * bukan ibadah anak / sudah check-out / punya kode jemput, dan ibadah belum selesai.
 */
export function canCancelCheckin(
  r: {
    status: string;
    checkinMethod: string | null;
    checkedInBy: string | null;
    jemaatId: string;
    tanggalIbadah: Date;
    checkedOutAt?: Date | null;
    pickupCode?: string | null;
  },
  ibadah: { jamMulai: string; jamSelesai: string | null; isKidsIbadah?: boolean | null } & CheckinCfg,
  me: { userId: string; jemaatId: string },
  now: Date = new Date(),
  tz: string = DEFAULT_TZ,
): boolean {
  if (r.status !== 'JOIN' || r.checkinMethod !== 'SELF') return false;
  if (r.checkedInBy !== me.userId && r.jemaatId !== me.jemaatId) return false;
  if (ibadah.isKidsIbadah || r.checkedOutAt || r.pickupCode) return false;
  // Sama dengan penutupan self check-in (bawaan 30 menit setelah selesai; bisa diatur per ibadah).
  const closes = selfCheckinClosesAt(r.tanggalIbadah, ibadah.jamMulai, ibadah.jamSelesai, tz, ibadah);
  return now.getTime() < closes.getTime();
}
