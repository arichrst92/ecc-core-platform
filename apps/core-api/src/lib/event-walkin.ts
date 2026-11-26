/**
 * Event "tidak wajib daftar" (2026-11) — jemaat boleh langsung datang: self
 * check-in (app) dan scan usher membuat partisipasi HADIR tanpa pendaftaran.
 *
 * Berlaku hanya bila: event mencatat kehadiran (butuhKehadiran), admin mematikan
 * "Wajib daftar", dan event tidak mensyaratkan pembayaran (requiresPayment:
 * GRATIS / sukarela tanpa minimum). Event berbayar tetap wajib daftar & lunas.
 * Kuota tidak membatasi kehadiran (pendataan saja); syarat peserta & grup sesi
 * tetap berlaku.
 */
import { prisma } from '@ecc/database';
import { ApiError } from './errors.js';
import { requiresPayment } from './event-payment.js';
import { assertEventEligible, syncEventRoleForStatus } from './event-role.js';
import { sesiConflict, sesiMessage } from './event-sesi.js';

type WalkInEvent = {
  id: string;
  butuhKehadiran: boolean;
  wajibDaftar: boolean;
  tipeBayar: string;
  nominal?: unknown;
  grupSesi?: string | null;
};

export function walkInAllowed(e: Pick<WalkInEvent, 'butuhKehadiran' | 'wajibDaftar' | 'tipeBayar' | 'nominal'>): boolean {
  return e.butuhKehadiran && e.wajibDaftar === false && !requiresPayment(e);
}

/**
 * Catat hadir tanpa pendaftaran: buat partisipasi HADIR (atau aktifkan lagi
 * baris BATAL). Lempar ApiError bila tidak memenuhi syarat / bentrok sesi.
 * `method`: 'SELF' (self check-in) | 'WALK_IN' (scan usher).
 */
export async function createWalkInParticipation(
  event: WalkInEvent,
  jemaatId: string,
  method: 'SELF' | 'WALK_IN',
  opts: { checkedInBy?: string | null; who?: string } = {},
) {
  if (!walkInAllowed(event)) throw new ApiError(400, 'REGISTRATION_REQUIRED', 'Event ini wajib daftar terlebih dahulu.');
  await assertEventEligible(event.id, jemaatId, opts.who);
  const c = await sesiConflict({ id: event.id, grupSesi: event.grupSesi ?? null }, jemaatId);
  if (c) throw new ApiError(409, 'SESI_CONFLICT', `${opts.who ? `${opts.who}: ` : ''}${sesiMessage(c)}`);
  const now = new Date();
  const data = {
    status: 'HADIR' as const,
    attendedAt: now,
    cancelledAt: null,
    cancelReason: null,
    checkinMethod: method,
    checkedInBy: opts.checkedInBy ?? null,
  };
  const where = { eventId_jemaatId: { eventId: event.id, jemaatId } };
  let already = false;
  let p;
  try {
    p = await prisma.eventParticipation.upsert({
      where,
      create: { eventId: event.id, jemaatId, registeredAt: now, ...data },
      update: data,
    });
  } catch (e) {
    // Dua scan / self check-in bersamaan → baris dibuat duluan oleh yang lain
    // (unique eventId+jemaatId). Jangan gagal: pakai baris yang ada.
    if ((e as { code?: string }).code !== 'P2002') throw e;
    const cur = await prisma.eventParticipation.findUniqueOrThrow({ where });
    if (cur.status === 'HADIR') {
      already = true;
      p = cur;
    } else {
      p = await prisma.eventParticipation.update({ where, data });
    }
  }
  if (!already) await syncEventRoleForStatus(event, jemaatId, 'HADIR');
  return { participation: p, already };
}
