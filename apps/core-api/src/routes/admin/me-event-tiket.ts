/**
 * Tiket event saya (mobile "Reservasi Saya" → tab Event) — /admin/me/event-tiket
 *
 *   GET /?scope=upcoming|history[&eventId=]
 *     Pendaftaran event milik saya, keluarga/tanggungan, dan tamu saya
 *     (lintas event), satu baris = satu tiket (satu orang).
 *     upcoming : belum BATAL dan event belum selesai (zona waktu cabang)
 *     history  : event sudah selesai atau pendaftaran BATAL (100 terbaru)
 *
 * QR tiket = kode jemaat peserta (sama dengan kartu QR; dipindai usher).
 * Check-in mandiri per tiket memakai POST /admin/me/event-checkin/:eventId.
 */
import { Router, type Request } from 'express';
import { prisma } from '@ecc/database';
import { BadRequest, NotFound, Unauthorized } from '../../lib/errors.js';
import { familyOf } from '../../lib/family.js';
import { eventSelfCheckinWindow, venueInfo, venuePoint } from '../../lib/self-checkin.js';
import { calendarDateOf, tzOr, wallToInstant } from '../../lib/tz.js';
import { revokeEventRole } from '../../lib/event-role.js';
import { audit } from '../../lib/audit.js';

export const meEventTiketRouter = Router();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Mulai event (jam dinding cabang) → instant. Tanpa jam = 00:00. */
function eventStartsAt(ev: { tanggalMulai: Date; jamMulai: string | null }, tz: string): Date {
  const m = /^(\d{1,2}):(\d{2})/.exec(ev.jamMulai ?? '');
  const min = m ? Number(m[1]) * 60 + Number(m[2]) : 0;
  return wallToInstant(calendarDateOf(ev.tanggalMulai, tz), min, tz);
}

/**
 * Boleh dibatalkan sendiri dari tiket: belum hadir/batal, belum ada uang
 * (gratis atau belum bayar — yang lunas / menunggu verifikasi lewat admin),
 * dan event belum dimulai.
 */
function canCancelTicket(
  status: string,
  payment: 'GRATIS' | 'LUNAS' | 'MENUNGGU' | 'BELUM_BAYAR',
  startsAt: Date,
  now: Date,
): boolean {
  if (status === 'HADIR' || status === 'BATAL' || status === 'BAYAR') return false;
  if (payment !== 'GRATIS' && payment !== 'BELUM_BAYAR') return false;
  return now < startsAt;
}

function me(req: Request) {
  if (!req.user) throw Unauthorized();
  return req.user;
}

meEventTiketRouter.get('/', async (req, res) => {
  const u = me(req);
  const scope = req.query.scope === 'history' ? 'history' : 'upcoming';
  // eventId boleh UUID atau slug (halaman event app dibuka via slug). Bila
  // parameter dikirim tapi event tidak ditemukan → daftar kosong, JANGAN
  // jatuh ke "semua tiket" (dulu slug diabaikan → semua event tampil).
  const rawEventId = typeof req.query.eventId === 'string' ? req.query.eventId.trim() : '';
  let eventId: string | undefined;
  if (rawEventId) {
    if (UUID_RE.test(rawEventId)) eventId = rawEventId;
    else {
      const ev = await prisma.event.findFirst({ where: { slug: rawEventId }, select: { id: true } });
      if (!ev) return res.json({ success: true, data: { tickets: [], serverNow: new Date().toISOString() } });
      eventId = ev.id;
    }
  }

  const fam = await familyOf(u.jemaatId);
  const ids = [u.jemaatId, ...fam.keys()];
  const rows = await prisma.eventParticipation.findMany({
    where: {
      OR: [{ jemaatId: { in: ids } }, { invitedByJemaatId: u.jemaatId }],
      ...(eventId ? { eventId } : {}),
      event: { isActive: true },
    },
    orderBy: [{ event: { tanggalMulai: scope === 'history' ? 'desc' : 'asc' } }, { registeredAt: 'asc' }],
    take: 300,
    select: {
      id: true,
      status: true,
      registeredAt: true,
      attendedAt: true,
      checkinMethod: true,
      jemaat: { select: { id: true, namaLengkap: true, kode: true, fotoUrl: true, isTamu: true, isActive: true } },
      donations: { select: { status: true, nominalBayar: true } },
      event: {
        select: {
          id: true,
          judul: true,
          slug: true,
          heroImageUrl: true,
          tanggalMulai: true,
          tanggalSelesai: true,
          jamMulai: true,
          jamSelesai: true,
          lokasi: true,
          mapsUrl: true,
          latitude: true,
          longitude: true,
          selfCheckinRadiusM: true,
          tipeBayar: true,
          nominal: true,
          isActive: true,
          butuhKehadiran: true,
          allowSelfCheckin: true,
          cabang: { select: { nama: true, timezone: true, latitude: true, longitude: true, mapsUrl: true } },
        },
      },
    },
  });

  const now = new Date();
  const data = rows
    .map((r) => {
      const ev = r.event;
      const tz = tzOr(ev.cabang?.timezone);
      const win = eventSelfCheckinWindow(ev, now, tz);
      const ended = !!win.closesAt && now > new Date(win.closesAt);
      const paid = ev.tipeBayar === 'GRATIS';
      const payment: 'GRATIS' | 'LUNAS' | 'MENUNGGU' | 'BELUM_BAYAR' = paid
        ? 'GRATIS'
        : r.status === 'BAYAR' || r.status === 'HADIR'
          ? 'LUNAS'
          : r.donations.some((d) => d.status === 'MENUNGGU_VERIFIKASI')
            ? 'MENUNGGU'
            : 'BELUM_BAYAR';
      const totalBayar = r.donations.filter((d) => d.status === 'BAYAR').reduce((a, d) => a + Number(d.nominalBayar), 0);
      const canCancel = ev.isActive && canCancelTicket(r.status, payment, eventStartsAt(ev, tz), now);
      const relasi = r.jemaat.id === u.jemaatId ? null : (fam.get(r.jemaat.id) ?? (r.jemaat.isTamu ? 'Tamu' : null));
      return {
        id: r.id,
        status: r.status,
        registeredAt: r.registeredAt,
        attendedAt: r.attendedAt,
        checkinMethod: r.checkinMethod,
        payment,
        totalBayar,
        canCancel,
        isSelf: r.jemaat.id === u.jemaatId,
        relasi,
        jemaat: { id: r.jemaat.id, namaLengkap: r.jemaat.namaLengkap, kode: r.jemaat.kode, fotoUrl: r.jemaat.fotoUrl, isTamu: r.jemaat.isTamu },
        event: {
          id: ev.id,
          judul: ev.judul,
          slug: ev.slug,
          heroImageUrl: ev.heroImageUrl,
          tanggalMulai: ev.tanggalMulai,
          tanggalSelesai: ev.tanggalSelesai,
          jamMulai: ev.jamMulai,
          jamSelesai: ev.jamSelesai,
          lokasi: ev.lokasi,
          // Petunjuk arah: link event → (bila event tanpa titik sendiri) link cabang.
          mapsUrl: ev.mapsUrl ?? (ev.latitude == null ? ev.cabang?.mapsUrl : null) ?? null,
          latitude: ev.latitude ?? ev.cabang?.latitude ?? null,
          longitude: ev.longitude ?? ev.cabang?.longitude ?? null,
          tipeBayar: ev.tipeBayar,
          nominal: ev.nominal != null ? Number(ev.nominal) : null,
          cabang: ev.cabang ? { nama: ev.cabang.nama } : null,
          timezone: tz,
        },
        // Check-in mandiri lewat tiket: hanya kalau event mengizinkan.
        selfCheckin: {
          enabled: ev.allowSelfCheckin && ev.butuhKehadiran,
          opensAt: win.opensAt,
          closesAt: win.closesAt,
          venue: venueInfo(ev.selfCheckinRadiusM, venuePoint(ev, ev.cabang)),
        },
        _ended: ended,
      };
    })
    .filter((t) =>
      eventId ? t.status !== 'BATAL' || scope === 'history' : scope === 'upcoming' ? t.status !== 'BATAL' && !t._ended : t.status === 'BATAL' || t._ended,
    )
    .slice(0, 100)
    .map(({ _ended, ...t }) => ({ ...t, ended: _ended }));

  // serverNow: app menghitung jendela check-in dengan jam server (bukan jam HP).
  res.json({ success: true, data: { tickets: data, serverNow: now.toISOString() } });
});

/**
 * POST /admin/me/event-tiket/:id/cancel — batalkan tiket event (diri sendiri,
 * keluarga, atau tamu yang saya undang). Aturan = canCancelTicket di atas.
 * Soft cancel (status BATAL) → kuota kembali tersedia.
 */
meEventTiketRouter.post('/:id/cancel', async (req, res) => {
  const u = me(req);
  if (!UUID_RE.test(req.params.id ?? '')) throw NotFound('Tiket tidak ditemukan');
  const p = await prisma.eventParticipation.findUnique({
    where: { id: req.params.id },
    select: {
      id: true,
      eventId: true,
      jemaatId: true,
      status: true,
      invitedByJemaatId: true,
      jemaat: { select: { namaLengkap: true } },
      donations: { select: { status: true } },
      event: {
        select: { judul: true, isActive: true, tipeBayar: true, tanggalMulai: true, jamMulai: true, cabang: { select: { timezone: true } } },
      },
    },
  });
  if (!p) throw NotFound('Tiket tidak ditemukan');
  const fam = await familyOf(u.jemaatId);
  if (p.jemaatId !== u.jemaatId && !fam.has(p.jemaatId) && p.invitedByJemaatId !== u.jemaatId) {
    throw NotFound('Tiket tidak ditemukan');
  }
  if (p.status === 'BATAL') return res.json({ success: true, data: { id: p.id, status: p.status }, meta: { alreadyCancelled: true } });

  const tz = tzOr(p.event.cabang?.timezone);
  const payment: 'GRATIS' | 'LUNAS' | 'MENUNGGU' | 'BELUM_BAYAR' =
    p.event.tipeBayar === 'GRATIS'
      ? 'GRATIS'
      : p.status === 'BAYAR' || p.status === 'HADIR'
        ? 'LUNAS'
        : p.donations.some((d) => d.status === 'MENUNGGU_VERIFIKASI')
          ? 'MENUNGGU'
          : 'BELUM_BAYAR';
  if (p.status === 'HADIR') throw BadRequest(`${p.jemaat.namaLengkap} sudah hadir — tiket tidak bisa dibatalkan.`);
  if (payment === 'LUNAS' || payment === 'MENUNGGU') {
    throw BadRequest('Tiket yang sudah dibayar / menunggu verifikasi pembayaran dibatalkan lewat admin event.');
  }
  if (!p.event.isActive || !canCancelTicket(p.status, payment, eventStartsAt(p.event, tz), new Date())) {
    throw BadRequest('Tiket tidak bisa dibatalkan karena event sudah dimulai.');
  }

  const updated = await prisma.eventParticipation.update({
    where: { id: p.id },
    data: { status: 'BATAL', cancelledAt: new Date() },
    select: { id: true, status: true, cancelledAt: true },
  });
  await revokeEventRole(p.eventId, p.jemaatId).catch(() => 0);
  audit(req, {
    action: 'UPDATE',
    resource: 'event_participation',
    resourceId: p.id,
    resourceLabel: `Batal tiket: ${p.jemaat.namaLengkap} @ ${p.event.judul}`,
    metadata: { kind: 'event-ticket-self-cancel', previousStatus: p.status },
  });
  res.json({ success: true, data: updated });
});
