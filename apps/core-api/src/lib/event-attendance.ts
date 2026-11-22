/** Jumlah hadir & waktu buka check-in event — kartu app & website (2026-11). */
import { prisma } from '@ecc/database';
import { selfCheckinOpensAt } from './self-checkin.js';
import { calendarDateOf } from './tz.js';

/**
 * Kartu peserta di app (2026-11): sebelum `checkinOpensAt` app menulis
 * "N terdaftar dari kuota", sesudahnya "N hadir dari kuota" (hadirCount).
 * Event tanpa pencatatan kehadiran → null (app tetap menulis terdaftar).
 */
export function attendanceInfo(ev: { tanggalMulai: Date; jamMulai: string | null; butuhKehadiran: boolean }, tz: string, hadir: number) {
  if (!ev.butuhKehadiran) return { hadirCount: null, checkinOpensAt: null };
  return { hadirCount: hadir, checkinOpensAt: selfCheckinOpensAt(calendarDateOf(ev.tanggalMulai, tz), ev.jamMulai, tz).toISOString() };
}

export async function hadirCountByEvent(ids: string[]): Promise<Map<string, number>> {
  if (!ids.length) return new Map();
  const g = await prisma.eventParticipation.groupBy({
    by: ['eventId'],
    where: { eventId: { in: ids }, status: 'HADIR' },
    _count: { _all: true },
  });
  return new Map(g.map((x) => [x.eventId, x._count._all]));
}
