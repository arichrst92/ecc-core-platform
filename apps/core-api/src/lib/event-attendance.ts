/** Jumlah hadir & waktu buka check-in event — kartu app & website (2026-11). */
import { prisma } from '@ecc/database';
import { type CheckinCfg, selfCheckinOpensAt } from './self-checkin.js';
import { calendarDateOf } from './tz.js';

/**
 * Kartu peserta di app (2026-11): sebelum `checkinOpensAt` app menulis
 * "N terdaftar dari kuota", sesudahnya "N hadir dari kuota" (hadirCount).
 * Event tanpa pencatatan kehadiran → null (app tetap menulis terdaftar).
 */
export function attendanceInfo(
  ev: { tanggalMulai: Date; jamMulai: string | null; butuhKehadiran: boolean } & CheckinCfg,
  tz: string,
  hadir: number,
) {
  if (!ev.butuhKehadiran) return { hadirCount: null, checkinOpensAt: null };
  return { hadirCount: hadir, checkinOpensAt: selfCheckinOpensAt(calendarDateOf(ev.tanggalMulai, tz), ev.jamMulai, tz, ev).toISOString() };
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

/**
 * Status partisipasi saya per event (kartu event di app, 2026-11):
 *   status  DAFTAR / MENUNGGU_VERIFIKASI / BAYAR / HADIR
 *   payment LUNAS / MENUNGGU / BELUM_BAYAR / null (gratis)
 *   total   nominal yang sudah diverifikasi (pembayaran di pendaftaran + donasi)
 * Hanya partisipasi diri sendiri; BATAL tidak dikirim.
 */
export async function myEventStatusMap(
  jemaatId: string,
  events: Array<{ id: string; tipeBayar: string }>,
): Promise<Map<string, { status: string; payment: 'LUNAS' | 'MENUNGGU' | 'BELUM_BAYAR' | null; total: number }>> {
  const out = new Map<string, { status: string; payment: 'LUNAS' | 'MENUNGGU' | 'BELUM_BAYAR' | null; total: number }>();
  if (!events.length) return out;
  const tipe = new Map(events.map((e) => [e.id, e.tipeBayar]));
  const rows = await prisma.eventParticipation.findMany({
    where: { jemaatId, eventId: { in: events.map((e) => e.id) }, status: { not: 'BATAL' } },
    select: {
      eventId: true,
      status: true,
      nominalBayar: true,
      donations: { where: { status: 'BAYAR' }, select: { nominalBayar: true, tambahan: true } },
    },
  });
  for (const r of rows) {
    const paidEvent = tipe.get(r.eventId) !== 'GRATIS';
    const lunas = r.status === 'BAYAR' || r.status === 'HADIR';
    const hasPrimary = r.donations.some((d) => !d.tambahan);
    const total =
      (lunas && !hasPrimary ? Number(r.nominalBayar ?? 0) : 0) + r.donations.reduce((a, d) => a + Number(d.nominalBayar), 0);
    out.set(r.eventId, {
      status: r.status,
      payment: !paidEvent ? null : lunas ? 'LUNAS' : r.status === 'MENUNGGU_VERIFIKASI' ? 'MENUNGGU' : 'BELUM_BAYAR',
      total,
    });
  }
  return out;
}
