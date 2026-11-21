/**
 * Jendela absensi pertemuan homecell (2026-11): absen (scan QR, tandai hadir
 * massal, tamu hadir) hanya boleh SAAT pertemuan dimulai atau SETELAHNYA.
 * Waktu mulai = tanggal + jamMulai (jam dinding cabang homecell); tanpa jam
 * → mulai pukul 00.00 hari itu. Membatalkan / menghapus absen tidak dibatasi.
 */
import { prisma } from '@ecc/database';
import { ApiError } from './errors.js';
import { eventStartsAt } from './event-time.js';
import { instantInTzLabel, tzOr } from './tz.js';

export function homecellScheduleStartsAt(s: { tanggal: Date; jamMulai: string | null }, tz: string | null | undefined): Date {
  return eventStartsAt({ tanggalMulai: s.tanggal, jamMulai: s.jamMulai }, tzOr(tz));
}

/** Info untuk app/Portal: kapan absen dibuka & apakah sudah dibuka. */
export function absenInfo(s: { tanggal: Date; jamMulai: string | null }, tz: string | null | undefined, now = new Date()) {
  const mulai = homecellScheduleStartsAt(s, tz);
  return { absenDibukaAt: mulai.toISOString(), absenDibuka: now.getTime() >= mulai.getTime() };
}

/** Lempar 400 ABSEN_BELUM_DIBUKA bila pertemuan belum dimulai. */
export async function assertAbsenDibuka(scheduleId: string) {
  const s = await prisma.homecellSchedule.findUnique({
    where: { id: scheduleId },
    select: { tanggal: true, jamMulai: true, homecell: { select: { area: { select: { cabang: { select: { timezone: true } } } } } } },
  });
  if (!s) return; // ditangani pemanggil (404)
  const tz = s.homecell.area.cabang.timezone;
  const mulai = homecellScheduleStartsAt(s, tz);
  if (Date.now() < mulai.getTime()) {
    throw new ApiError(
      400,
      'ABSEN_BELUM_DIBUKA',
      `Absensi dibuka saat pertemuan dimulai (${instantInTzLabel(mulai, tz)}). Silakan absen saat atau setelah pertemuan dimulai.`,
      { absenDibukaAt: mulai.toISOString() },
    );
  }
}
