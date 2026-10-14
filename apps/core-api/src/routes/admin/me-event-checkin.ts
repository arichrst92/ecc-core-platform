/**
 * Self check-in event (mobile) — /admin/me/event-checkin/*
 *
 *   GET  /:eventId   → jendela self check-in + saya & keluarga yang TERDAFTAR
 *                      di event ini, beserta status hadir
 *   POST /:eventId   → { jemaatIds } tandai HADIR (sama efeknya dengan scan
 *                      petugas: attendedAt, role otomatis, notifikasi)
 *
 * Syarat: event.allowSelfCheckin && event.butuhKehadiran, 15 menit sebelum
 * mulai s.d. selesai (WIB). Event berbayar: peserta harus sudah BAYAR.
 */
import { Router, type Request } from 'express';
import { prisma } from '@ecc/database';
import { z } from 'zod';
import { ApiError, BadRequest, NotFound, Unauthorized } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { createNotification } from '../../lib/notification.js';
import { sendWaIfEnabled } from '../../lib/wa-notif.js';
import { syncEventRoleForStatus } from '../../lib/event-role.js';
import { familyOf } from '../../lib/family.js';
import {
  EVENT_SELF_CHECKIN_REASON_TEXT,
  checkSelfCheckinRadius,
  eventSelfCheckinWindow,
  radiusErrorMessage,
  venueInfo,
  venuePoint,
} from '../../lib/self-checkin.js';

export const meEventCheckinRouter = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function me(req: Request) {
  if (!req.user) throw Unauthorized();
  return req.user;
}

async function loadEvent(eventId: string) {
  if (!UUID_RE.test(eventId)) throw NotFound('Event tidak ditemukan');
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      judul: true,
      lokasi: true,
      isActive: true,
      tipeBayar: true,
      butuhKehadiran: true,
      allowSelfCheckin: true,
      tanggalMulai: true,
      tanggalSelesai: true,
      jamMulai: true,
      jamSelesai: true,
      latitude: true,
      longitude: true,
      selfCheckinRadiusM: true,
      cabang: { select: { latitude: true, longitude: true } },
    },
  });
  if (!event) throw NotFound('Event tidak ditemukan');
  return { event, window: eventSelfCheckinWindow(event) };
}

/** Saya + keluarga yang terdaftar (bukan BATAL) di event ini. */
async function registeredMembers(jemaatId: string, event: { id: string; tipeBayar: string }) {
  const fam = await familyOf(jemaatId);
  const ids = [jemaatId, ...fam.keys()];
  const parts = await prisma.eventParticipation.findMany({
    where: { eventId: event.id, jemaatId: { in: ids }, status: { not: 'BATAL' } },
    select: {
      id: true,
      status: true,
      attendedAt: true,
      jemaat: { select: { id: true, namaLengkap: true, fotoUrl: true, noHp: true, isActive: true } },
    },
  });
  const paid = event.tipeBayar === 'GRATIS';
  return parts
    .filter((p) => p.jemaat.isActive)
    .sort((a, b) => (a.jemaat.id === jemaatId ? -1 : b.jemaat.id === jemaatId ? 1 : a.jemaat.namaLengkap.localeCompare(b.jemaat.namaLengkap)))
    .map((p) => ({
      participationId: p.id,
      partStatus: p.status,
      noHp: p.jemaat.noHp,
      member: {
        id: p.jemaat.id,
        namaLengkap: p.jemaat.namaLengkap,
        fotoUrl: p.jemaat.fotoUrl,
        isSelf: p.jemaat.id === jemaatId,
        relasi: p.jemaat.id === jemaatId ? null : (fam.get(p.jemaat.id) ?? null),
        status: (p.status === 'HADIR' ? 'JOIN' : 'NONE') as 'JOIN' | 'NONE',
        checkedInAt: p.attendedAt,
        // Event berbayar: belum lunas → tidak bisa self check-in.
        disabledReason:
          !paid && p.status !== 'BAYAR' && p.status !== 'HADIR' ? 'Pembayaran belum terverifikasi' : null,
      },
    }));
}

meEventCheckinRouter.get('/:eventId', async (req, res) => {
  const u = me(req);
  const { event, window } = await loadEvent(req.params.eventId);
  const rows = window.reason === 'DISABLED' ? [] : await registeredMembers(u.jemaatId, event);
  res.json({
    success: true,
    data: {
      ...window,
      // Tidak ada peserta terdaftar (saya/keluarga) → tidak ada yang bisa di-check-in.
      available: window.available && rows.length > 0,
      serverNow: new Date().toISOString(),
      reasonText: window.reason ? EVENT_SELF_CHECKIN_REASON_TEXT[window.reason] : null,
      event: {
        id: event.id,
        judul: event.judul,
        lokasi: event.lokasi,
        jamMulai: event.jamMulai,
        jamSelesai: event.jamSelesai,
      },
      members: rows.map((r) => r.member),
      // radiusM null = self check-in boleh di mana saja.
      venue: venueInfo(event.selfCheckinRadiusM, venuePoint(event, event.cabang)),
    },
  });
});

const bodySchema = z.object({
  jemaatIds: z.array(z.string().uuid()).min(1).max(20),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

meEventCheckinRouter.post('/:eventId', async (req, res) => {
  const u = me(req);
  const { jemaatIds, lat, lng } = bodySchema.parse(req.body ?? {});
  const { event, window } = await loadEvent(req.params.eventId);
  if (!window.available) {
    throw new ApiError(400, `SELF_CHECKIN_${window.reason}`, EVENT_SELF_CHECKIN_REASON_TEXT[window.reason!]);
  }
  // Radius sesuai pengaturan event (null = di mana saja), dari titik event
  // atau titik cabang. Di luar radius → arahkan ke usher (QR).
  const radius = checkSelfCheckinRadius(
    venuePoint(event, event.cabang),
    lat != null && lng != null ? { lat, lng } : null,
    event.selfCheckinRadiusM,
  );
  if (!radius.ok) {
    throw new ApiError(400, `SELF_CHECKIN_${radius.code}`, radiusErrorMessage(radius.code, 'event', radius.distanceM, event.selfCheckinRadiusM!), {
      distanceM: radius.distanceM,
      radiusM: event.selfCheckinRadiusM,
    });
  }
  const rows = await registeredMembers(u.jemaatId, event);
  const byId = new Map(rows.map((r) => [r.member.id, r]));
  const unique = [...new Set(jemaatIds)];
  if (unique.some((id) => !byId.has(id))) {
    throw BadRequest('Hanya bisa check-in untuk Anda dan keluarga yang terdaftar di event ini.');
  }

  const now = new Date();
  const results: { jemaatId: string; namaLengkap: string; result: 'CHECKED_IN' | 'ALREADY' | 'FAILED'; message?: string }[] = [];
  for (const id of unique) {
    const r = byId.get(id)!;
    const nama = r.member.namaLengkap;
    if (r.partStatus === 'HADIR') {
      results.push({ jemaatId: id, namaLengkap: nama, result: 'ALREADY' });
      continue;
    }
    if (r.member.disabledReason) {
      results.push({ jemaatId: id, namaLengkap: nama, result: 'FAILED', message: r.member.disabledReason });
      continue;
    }
    // Klaim atomik: hanya ubah kalau belum HADIR/BATAL (hindari dobel dgn scan petugas).
    const upd = await prisma.eventParticipation.updateMany({
      where: { id: r.participationId, status: { notIn: ['HADIR', 'BATAL'] } },
      data: { status: 'HADIR', attendedAt: now },
    });
    if (upd.count === 0) {
      results.push({ jemaatId: id, namaLengkap: nama, result: 'ALREADY' });
      continue;
    }
    await syncEventRoleForStatus(event, id, 'HADIR');
    void createNotification({
      jemaatId: id,
      type: 'EVENT_CHECKED_IN',
      title: `Kehadiran tercatat: ${event.judul}`,
      body: `Check-in mandiri di event "${event.judul}" berhasil. Terima kasih atas partisipasinya.`,
      actionUrl: `/event/${event.id}`,
      metadata: { eventId: event.id, eventJudul: event.judul, participationId: r.participationId, via: 'self-checkin' },
    });
    void sendWaIfEnabled('EVENT_CHECKED_IN', r.noHp, { nama, judul: event.judul });
    results.push({ jemaatId: id, namaLengkap: nama, result: 'CHECKED_IN' });
  }

  const ok = results.filter((x) => x.result === 'CHECKED_IN');
  if (ok.length) {
    audit(req, {
      action: 'UPDATE',
      resource: 'event_participation',
      resourceLabel: `Self check-in: ${ok.map((x) => x.namaLengkap).join(', ')} @ ${event.judul}`,
      metadata: { kind: 'event-self-checkin', eventId: event.id, jemaatIds: ok.map((x) => x.jemaatId) },
    });
  }
  res.json({
    success: true,
    data: { tanggal: window.tanggal, results },
    message: ok.length ? `Check-in berhasil untuk ${ok.length} orang.` : 'Tidak ada yang di-check-in.',
  });
});
