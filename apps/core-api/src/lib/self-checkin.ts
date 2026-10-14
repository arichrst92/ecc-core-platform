/**
 * Self check-in ibadah — logika murni (tanpa DB) supaya mudah di-test.
 *
 * Aturan: self check-in hanya terbuka pada HARI ibadah dijadwalkan (sesuai
 * tipeJadwal/hari/tanggalMulai, tidak dibatalkan) dan pada JAM ibadah:
 * mulai OPEN_BEFORE_MIN (15) menit sebelum jamMulai sampai jamSelesai (WIB).
 */
import { generateOccurrences, type IbadahForOccurrence } from './ibadah-occurrences.js';
import { todayWib } from './last-attendance.js';

export const OPEN_BEFORE_MIN = 15;
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

export type SelfCheckinReason =
  | 'INACTIVE'
  | 'KIDS_IBADAH'
  | 'NOT_TODAY'
  | 'CANCELLED'
  | 'TOO_EARLY'
  | 'ENDED';

export interface SelfCheckinWindow {
  available: boolean;
  reason: SelfCheckinReason | null;
  /** Tanggal occurrence hari ini (YYYY-MM-DD, WIB). */
  tanggal: string;
  /** ISO — kapan self check-in dibuka / ditutup hari ini (kalau hari ibadah). */
  opensAt: string | null;
  closesAt: string | null;
}

/** "HH:mm" → menit sejak 00:00; null kalau format salah. */
export function hhmmToMin(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

export function selfCheckinWindow(
  ibadah: IbadahForOccurrence & {
    isActive: boolean;
    isKidsIbadah: boolean;
    jamMulai: string;
    jamSelesai: string;
  },
  cancelledDates: string[],
  now: Date = new Date(),
): SelfCheckinWindow {
  const today = todayWib(now);
  const tanggal = today.toISOString().slice(0, 10);
  const base = { tanggal, opensAt: null, closesAt: null };
  if (!ibadah.isActive) return { ...base, available: false, reason: 'INACTIVE' };
  if (ibadah.isKidsIbadah) return { ...base, available: false, reason: 'KIDS_IBADAH' };

  const occ = generateOccurrences(ibadah, today, today);
  if (occ.length === 0) return { ...base, available: false, reason: 'NOT_TODAY' };
  if (cancelledDates.includes(tanggal)) return { ...base, available: false, reason: 'CANCELLED' };

  const start = hhmmToMin(ibadah.jamMulai) ?? 0;
  let end = hhmmToMin(ibadah.jamSelesai) ?? 24 * 60 - 1;
  if (end <= start) end = 24 * 60 - 1; // jam selesai lewat tengah malam → sampai akhir hari
  // Waktu dinding WIB → instant UTC
  const atMin = (min: number) => new Date(today.getTime() + min * 60_000 - WIB_OFFSET_MS);
  const opens = atMin(Math.max(0, start - OPEN_BEFORE_MIN));
  const closes = atMin(end);
  const win = { tanggal, opensAt: opens.toISOString(), closesAt: closes.toISOString() };
  if (now < opens) return { ...win, available: false, reason: 'TOO_EARLY' };
  if (now > closes) return { ...win, available: false, reason: 'ENDED' };
  return { ...win, available: true, reason: null };
}

export const SELF_CHECKIN_REASON_TEXT: Record<SelfCheckinReason, string> = {
  INACTIVE: 'Ibadah ini tidak aktif.',
  KIDS_IBADAH: 'Check-in ibadah anak dilakukan di meja CKids.',
  NOT_TODAY: 'Hari ini tidak ada jadwal ibadah ini.',
  CANCELLED: 'Ibadah hari ini dibatalkan.',
  TOO_EARLY: `Self check-in dibuka ${OPEN_BEFORE_MIN} menit sebelum ibadah dimulai.`,
  ENDED: 'Ibadah hari ini sudah selesai.',
};
