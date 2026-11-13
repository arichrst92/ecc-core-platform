/**
 * Batalkan otomatis tiket yang tidak dipakai (no-show).
 *
 * Aturan sama dengan jendela self check-in: tiket dianggap hangus saat
 * self check-in DITUTUP, yaitu CLOSE_AFTER_MIN (30) menit setelah ibadah /
 * event selesai (jam dinding zona cabang). Sebelum itu jemaat masih bisa
 * self check-in, jadi tiket tidak boleh dibatalkan lebih awal.
 *
 *   - Reservasi ibadah  : RESERVE → CANCEL (cancelReason = NO_SHOW)
 *   - Partisipasi event : DAFTAR / MENUNGGU_VERIFIKASI / BAYAR → BATAL (NO_SHOW),
 *                         hanya event yang mencatat kehadiran (butuhKehadiran).
 *
 * Petugas tetap bisa check-in tiket yang sudah dibatalkan (scan kode / ubah
 * status di portal) bila ternyata jemaat hadir.
 */
import { prisma } from '@ecc/database';
import { CLOSE_AFTER_MIN, hhmmToMin } from './self-checkin.js';
import { DEFAULT_TZ, addDays, calendarDateOf, todayInTz, wallToInstant } from './tz.js';

export const NO_SHOW = 'NO_SHOW';
const BATCH = 2000;

/** Instant saat self check-in ditutup untuk occurrence `day` (UTC midnight, kalender zona cabang). */
function closesAt(day: Date, jamMulai: string | null, jamSelesai: string | null, tz: string, multiDay = false): Date {
  const start = hhmmToMin(jamMulai) ?? 0;
  let end = hhmmToMin(jamSelesai) ?? 24 * 60 - 1;
  if (!multiDay && end <= start) end = 24 * 60 - 1; // lewat tengah malam → sampai akhir hari
  return wallToInstant(day, end + CLOSE_AFTER_MIN, tz);
}

export async function autoCancelNoShowReservasi(now = new Date()): Promise<number> {
  // Zona paling timur (UTC+14) → tanggal kalender terbesar yang mungkin sudah lewat.
  const maxDay = todayInTz('Pacific/Kiritimati', now);
  // 1) Tunggakan lama (≥ 2 hari lalu di zona mana pun) — pasti sudah lewat, langsung massal.
  const old = await prisma.reservasi.updateMany({
    where: { status: 'RESERVE', tanggalIbadah: { lt: addDays(todayInTz('Etc/GMT+12', now), -1) } },
    data: { status: 'CANCEL', cancelledAt: now, cancelReason: NO_SHOW },
  });
  // 2) Kemarin & hari ini — cek jam selesai per ibadah.
  const rows = await prisma.reservasi.findMany({
    where: { status: 'RESERVE', tanggalIbadah: { lte: maxDay } },
    select: {
      id: true,
      tanggalIbadah: true,
      ibadah: { select: { jamMulai: true, jamSelesai: true, cabang: { select: { timezone: true } } } },
    },
    orderBy: { tanggalIbadah: 'asc' },
    take: BATCH,
  });
  const ids = rows
    .filter((r) => now > closesAt(r.tanggalIbadah, r.ibadah.jamMulai, r.ibadah.jamSelesai, r.ibadah.cabang?.timezone || DEFAULT_TZ))
    .map((r) => r.id);
  let recent = 0;
  if (ids.length) {
    const res = await prisma.reservasi.updateMany({
      where: { id: { in: ids }, status: 'RESERVE' },
      data: { status: 'CANCEL', cancelledAt: now, cancelReason: NO_SHOW },
    });
    recent = res.count;
  }
  return old.count + recent;
}

export async function autoCancelNoShowEvent(now = new Date()): Promise<number> {
  // Event yang (paling lambat) berakhir sebelum besok dan masih punya tiket belum hadir.
  const events = await prisma.event.findMany({
    where: {
      butuhKehadiran: true,
      OR: [
        { tanggalSelesai: { lte: addDays(now, 1) } },
        { tanggalSelesai: null, tanggalMulai: { lte: addDays(now, 1) } },
      ],
      partisipasi: { some: { status: { in: ['DAFTAR', 'MENUNGGU_VERIFIKASI', 'BAYAR'] } } },
    },
    select: {
      id: true,
      tanggalMulai: true,
      tanggalSelesai: true,
      jamMulai: true,
      jamSelesai: true,
      cabang: { select: { timezone: true } },
    },
    take: 500,
  });
  let total = 0;
  for (const ev of events) {
    const tz = ev.cabang?.timezone || DEFAULT_TZ;
    const endDay = calendarDateOf(ev.tanggalSelesai ?? ev.tanggalMulai, tz);
    if (now <= closesAt(endDay, ev.jamMulai, ev.jamSelesai, tz, !!ev.tanggalSelesai)) continue;
    const res = await prisma.eventParticipation.updateMany({
      where: { eventId: ev.id, status: { in: ['DAFTAR', 'MENUNGGU_VERIFIKASI', 'BAYAR'] } },
      data: { status: 'BATAL', cancelledAt: now, cancelReason: NO_SHOW },
    });
    total += res.count;
  }
  return total;
}
