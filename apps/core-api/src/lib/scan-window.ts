/**
 * Jendela scan check-in petugas (2026-11):
 *   - Dibuka 30 menit SEBELUM ibadah/event dimulai, ditutup 30 menit SETELAH dimulai.
 *   - Tanggal = tanggal SERVER di zona waktu cabang (bukan jam HP petugas).
 *   - Admin Kehadiran / pengelola event / Fulltimer boleh di luar jendela (koreksi Portal).
 * Checkout & jemput anak tidak dibatasi jendela ini.
 */
import { prisma } from '@ecc/database';
import { ApiError } from './errors.js';
import { generateOccurrences } from './ibadah-occurrences.js';
import { hhmmToMin } from './self-checkin.js';
import { calendarDateOf, todayInTz, tzOr, wallToInstant } from './tz.js';

export const SCAN_BEFORE_MIN = 30;
export const SCAN_AFTER_MIN = 30;

const hhmm = (d: Date, tz: string) =>
  new Intl.DateTimeFormat('id-ID', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(d).replace('.', ':');

export type ScanWindow = {
  /** Tanggal kalender (UTC midnight) menurut zona cabang — dipakai sebagai tanggal ibadah. */
  tanggal: Date;
  tz: string;
  opens: Date;
  closes: Date;
  /** null = boleh scan sekarang. */
  closedReason: string | null;
};

function windowAround(day: Date, jamMulai: string | null, tz: string, now: Date) {
  const min = hhmmToMin(jamMulai);
  if (min === null) {
    // Tanpa jam mulai → sepanjang hari itu.
    return { opens: wallToInstant(day, 0, tz), closes: wallToInstant(day, 24 * 60 - 1, tz), start: null as Date | null };
  }
  const start = wallToInstant(day, min, tz);
  return {
    opens: new Date(start.getTime() - SCAN_BEFORE_MIN * 60_000),
    closes: new Date(start.getTime() + SCAN_AFTER_MIN * 60_000),
    start,
  };
  void now;
}

/** Jendela scan ibadah hari ini (zona cabang). */
export async function ibadahScanWindow(ibadahId: string, now: Date = new Date()): Promise<ScanWindow | null> {
  const ib = await prisma.ibadah.findUnique({
    where: { id: ibadahId },
    select: {
      nama: true,
      tipeJadwal: true,
      tanggalMulai: true,
      hari: true,
      mingguKe: true,
      jamMulai: true,
      cabang: { select: { timezone: true } },
    },
  });
  if (!ib) return null;
  const tz = tzOr(ib.cabang?.timezone);
  const today = todayInTz(tz, now);
  const { opens, closes, start } = windowAround(today, ib.jamMulai, tz, now);
  let closedReason: string | null = null;
  if (generateOccurrences(ib, today, today).length === 0) {
    closedReason = `Hari ini tidak ada jadwal ibadah "${ib.nama}".`;
  } else if (
    await prisma.ibadahOccurrenceStatus.findFirst({ where: { ibadahId, tanggalIbadah: today, status: 'CANCELLED' }, select: { id: true } })
  ) {
    closedReason = `Ibadah "${ib.nama}" hari ini dibatalkan.`;
  } else if (now < opens) {
    closedReason = `Check-in dibuka ${SCAN_BEFORE_MIN} menit sebelum ibadah dimulai (mulai pukul ${hhmm(opens, tz)}).`;
  } else if (now > closes) {
    closedReason = `Check-in sudah ditutup — hanya sampai ${SCAN_AFTER_MIN} menit setelah ibadah dimulai${start ? ` (pukul ${hhmm(closes, tz)})` : ''}.`;
  }
  return { tanggal: today, tz, opens, closes, closedReason };
}

/** Jendela scan event hari ini (event beberapa hari → tiap hari pada jam mulai). */
export function eventScanWindow(
  ev: { tanggalMulai: Date; tanggalSelesai: Date | null; jamMulai: string | null },
  tz: string,
  now: Date = new Date(),
): ScanWindow {
  const today = todayInTz(tz, now);
  const first = calendarDateOf(ev.tanggalMulai, tz);
  const last = ev.tanggalSelesai ? calendarDateOf(ev.tanggalSelesai, tz) : first;
  const day = today < first ? first : today > last ? last : today;
  const { opens, closes, start } = windowAround(day, ev.jamMulai, tz, now);
  let closedReason: string | null = null;
  if (today < first || now < opens) {
    closedReason = `Check-in dibuka ${SCAN_BEFORE_MIN} menit sebelum event dimulai (${opens.toLocaleDateString('id-ID', { timeZone: tz, day: 'numeric', month: 'short' })} pukul ${hhmm(opens, tz)}).`;
  } else if (today > last || now > closes) {
    closedReason = `Check-in sudah ditutup — hanya sampai ${SCAN_AFTER_MIN} menit setelah event dimulai${start ? ` (pukul ${hhmm(closes, tz)})` : ''}.`;
  }
  return { tanggal: today, tz, opens, closes, closedReason };
}

/** Lempar 400 CHECKIN_CLOSED bila di luar jendela (kecuali `bypass`). */
export function assertScanOpen(w: ScanWindow | null, bypass: boolean): void {
  if (!w || bypass || !w.closedReason) return;
  throw new ApiError(400, 'CHECKIN_CLOSED', w.closedReason);
}
