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
import { Unauthorized } from '../../lib/errors.js';
import { familyOf } from '../../lib/family.js';
import { eventSelfCheckinWindow, venueInfo, venuePoint } from '../../lib/self-checkin.js';
import { tzOr } from '../../lib/tz.js';

export const meEventTiketRouter = Router();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function me(req: Request) {
  if (!req.user) throw Unauthorized();
  return req.user;
}

meEventTiketRouter.get('/', async (req, res) => {
  const u = me(req);
  const scope = req.query.scope === 'history' ? 'history' : 'upcoming';
  const eventId = typeof req.query.eventId === 'string' && UUID_RE.test(req.query.eventId) ? req.query.eventId : undefined;

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
          cabang: { select: { nama: true, timezone: true, latitude: true, longitude: true } },
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
      const relasi = r.jemaat.id === u.jemaatId ? null : (fam.get(r.jemaat.id) ?? (r.jemaat.isTamu ? 'Tamu' : null));
      return {
        id: r.id,
        status: r.status,
        registeredAt: r.registeredAt,
        attendedAt: r.attendedAt,
        checkinMethod: r.checkinMethod,
        payment,
        totalBayar,
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
          mapsUrl: ev.mapsUrl,
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
