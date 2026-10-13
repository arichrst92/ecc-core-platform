/**
 * Homecell untuk SEMUA jemaat (mobile) — /admin/me/homecell/*
 *
 *   GET    /                         ringkasan: homecell yang dipimpin, homecell saya, request pending
 *   GET    /browse?cabangId&lat&lng&q=        daftar homecell di cabang aktif (+ jarak kalau lat/lng dikirim)
 *   GET    /nearest?cabangId&lat&lng&limit=3  rekomendasi terdekat di cabang aktif (hanya yang punya lokasi)
 *   (cabangId = cabang aktif di app; default cabang asal jemaat)
 *   GET    /join-requests            [leader] permintaan bergabung PENDING di homecell yang saya pimpin
 *   POST   /join-requests/:reqId/approve   [leader] terima → otomatis jadi anggota
 *   POST   /join-requests/:reqId/reject    [leader] tolak { reason? }
 *   GET    /:id                      detail read-only (+ anggota kalau saya anggota / leader)
 *   POST   /:id/join-request         minta bergabung { pesan? }
 *   DELETE /:id/join-request         batalkan permintaan saya
 *   PATCH  /:id/lokasi               [leader] set lokasi dari link/koordinat Google Maps { mapsUrl }
 *
 * Aturan: 1 jemaat hanya boleh punya 1 homecell aktif & 1 permintaan PENDING.
 */
import { Router, type Request } from 'express';
import { prisma, type Prisma } from '@ecc/database';
import { z } from 'zod';
import { ApiError, BadRequest, Forbidden, NotFound, Unauthorized } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { createNotification } from '../../lib/notification.js';
import { sendWaIfEnabled } from '../../lib/wa-notif.js';
import { distanceKm, resolveMapsLocation, type LatLng } from '../../lib/geo.js';
import { scheduleFileSelect } from './homecell-schedule.js';

export const meHomecellRouter = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function me(req: Request) {
  if (!req.user) throw Unauthorized();
  return req.user;
}

function parseLatLng(q: Record<string, unknown>): LatLng | null {
  const lat = Number(q.lat);
  const lng = Number(q.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || q.lat === undefined || q.lng === undefined) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

const listSelect = {
  id: true,
  nama: true,
  deskripsi: true,
  alamat: true,
  hari: true,
  jam: true,
  latitude: true,
  longitude: true,
  mapsUrl: true,
  area: { select: { id: true, nama: true, cabang: { select: { id: true, nama: true } } } },
  picJemaat: { select: { id: true, namaLengkap: true, fotoUrl: true } },
  _count: { select: { members: { where: { isActive: true } } } },
} satisfies Prisma.HomecellSelect;

type ListRow = Prisma.HomecellGetPayload<{ select: typeof listSelect }>;

function toListItem(r: ListRow, from: LatLng | null, myStatus: Map<string, 'MEMBER' | 'PENDING' | 'LEADER'>) {
  const { _count, latitude, longitude, ...rest } = r;
  const hasLocation = latitude != null && longitude != null;
  return {
    ...rest,
    latitude,
    longitude,
    hasLocation,
    memberCount: _count.members,
    distanceKm:
      from && hasLocation
        ? Math.round(distanceKm(from, { lat: latitude!, lng: longitude! }) * 10) / 10
        : null,
    myStatus: myStatus.get(r.id) ?? null,
  };
}

/** Status saya per homecell (anggota / pending / leader). */
async function myStatusMap(jemaatId: string) {
  const [members, pending, led] = await Promise.all([
    prisma.homecellMember.findMany({ where: { jemaatId, isActive: true }, select: { homecellId: true } }),
    prisma.homecellJoinRequest.findMany({
      where: { jemaatId, status: 'PENDING' },
      select: { homecellId: true },
    }),
    prisma.homecell.findMany({ where: { picJemaatId: jemaatId }, select: { id: true } }),
  ]);
  const m = new Map<string, 'MEMBER' | 'PENDING' | 'LEADER'>();
  for (const p of pending) m.set(p.homecellId, 'PENDING');
  for (const x of members) m.set(x.homecellId, 'MEMBER');
  for (const l of led) m.set(l.id, 'LEADER');
  return m;
}

/**
 * Cabang untuk daftar homecell: `?cabangId=` (cabang aktif yang dipilih di
 * app) kalau valid, selain itu cabang asal jemaat.
 */
async function targetCabangId(req: Request, jemaatId: string): Promise<string> {
  const q = typeof req.query.cabangId === 'string' ? req.query.cabangId : '';
  if (UUID_RE.test(q)) {
    const c = await prisma.cabangGereja.findFirst({ where: { id: q, isActive: true }, select: { id: true } });
    if (c) return c.id;
  }
  const j = await prisma.jemaat.findUnique({ where: { id: jemaatId }, select: { cabangId: true } });
  if (!j) throw NotFound('Jemaat tidak ditemukan');
  return j.cabangId;
}

/** Leader = PIC homecell (Fulltimer boleh juga, mis. pastor/admin). */
async function assertLeaderOf(req: Request, homecellId: string) {
  const u = me(req);
  if (u.isFulltimer) return;
  const hc = await prisma.homecell.findUnique({ where: { id: homecellId }, select: { picJemaatId: true } });
  if (!hc) throw NotFound('Homecell tidak ditemukan');
  if (hc.picJemaatId !== u.jemaatId) throw Forbidden('Hanya pemimpin homecell ini yang dapat melakukan aksi ini.');
}

// ------------------------------------------------------------------ ringkasan

meHomecellRouter.get('/', async (req, res) => {
  const jemaatId = me(req).jemaatId;
  const [jemaat, managed, memberships, pending] = await Promise.all([
    prisma.jemaat.findUnique({ where: { id: jemaatId }, select: { cabang: { select: { id: true, nama: true } } } }),
    prisma.homecell.findMany({
      where: { picJemaatId: jemaatId, isActive: true },
      select: { ...listSelect, _count: { select: { members: { where: { isActive: true } }, joinRequests: { where: { status: 'PENDING' } } } } },
      orderBy: { nama: 'asc' },
    }),
    prisma.homecellMember.findMany({
      where: { jemaatId, isActive: true, homecell: { isActive: true } },
      select: { tanggalBergabung: true, homecell: { select: listSelect } },
      orderBy: { tanggalBergabung: 'desc' },
    }),
    prisma.homecellJoinRequest.findMany({
      where: { jemaatId, status: 'PENDING' },
      select: { id: true, createdAt: true, pesan: true, homecell: { select: { id: true, nama: true } } },
    }),
  ]);
  const status = await myStatusMap(jemaatId);
  // Pertemuan berikutnya per homecell (untuk kartu Homecell di beranda/profil).
  const hcIds = [...managed.map((h) => h.id), ...memberships.map((m) => m.homecell.id)];
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const upcoming = hcIds.length
    ? await prisma.homecellSchedule.findMany({
        where: { homecellId: { in: hcIds }, tanggal: { gte: today } },
        orderBy: { tanggal: 'asc' },
        select: { id: true, homecellId: true, tanggal: true, lokasi: true, catatan: true },
      })
    : [];
  const nextByHc = new Map<string, (typeof upcoming)[number]>();
  for (const sc of upcoming) if (!nextByHc.has(sc.homecellId)) nextByHc.set(sc.homecellId, sc);
  const next = (id: string) => {
    const sc = nextByHc.get(id);
    return sc ? { id: sc.id, tanggal: sc.tanggal, lokasi: sc.lokasi, catatan: sc.catatan } : null;
  };
  res.json({
    success: true,
    data: {
      role: managed.length > 0 ? 'LEADER' : memberships.length > 0 ? 'MEMBER' : 'NONE',
      cabang: jemaat?.cabang ?? null,
      managed: managed.map((h) => ({
        ...toListItem(h as unknown as ListRow, null, status),
        pendingJoinCount: h._count.joinRequests,
        nextSchedule: next(h.id),
      })),
      memberships: memberships.map((m) => ({
        tanggalBergabung: m.tanggalBergabung,
        homecell: { ...toListItem(m.homecell, null, status), nextSchedule: next(m.homecell.id) },
      })),
      pendingRequests: pending,
    },
  });
});

// ------------------------------------------------------------------ daftar & terdekat

meHomecellRouter.get('/browse', async (req, res) => {
  const jemaatId = me(req).jemaatId;
  const from = parseLatLng(req.query as Record<string, unknown>);
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const cabangId = await targetCabangId(req, jemaatId);
  const rows = await prisma.homecell.findMany({
    where: {
      isActive: true,
      area: { cabangId, isActive: true },
      ...(q
        ? {
            OR: [
              { nama: { contains: q, mode: 'insensitive' } },
              { alamat: { contains: q, mode: 'insensitive' } },
              { area: { nama: { contains: q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    },
    select: listSelect,
    orderBy: { nama: 'asc' },
    take: 300,
  });
  const status = await myStatusMap(jemaatId);
  const items = rows.map((r) => toListItem(r, from, status));
  if (from) {
    items.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity) || a.nama.localeCompare(b.nama));
  }
  res.json({ success: true, data: items });
});

meHomecellRouter.get('/nearest', async (req, res) => {
  const jemaatId = me(req).jemaatId;
  const from = parseLatLng(req.query as Record<string, unknown>);
  if (!from) throw BadRequest('Lokasi (lat, lng) wajib dikirim.');
  const limit = Math.min(10, Math.max(1, Number(req.query.limit) || 3));
  const cabangId = await targetCabangId(req, jemaatId);
  const rows = await prisma.homecell.findMany({
    where: { isActive: true, area: { cabangId, isActive: true } },
    select: listSelect,
  });
  const status = await myStatusMap(jemaatId);
  const withLoc = rows.filter((r) => r.latitude != null && r.longitude != null);
  const items = withLoc
    .map((r) => toListItem(r, from, status))
    .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity))
    .slice(0, limit);
  res.json({
    success: true,
    // withoutLocation: mobile tampilkan info kalau sebagian homecell belum punya lokasi.
    data: { items, totalInCabang: rows.length, withoutLocation: rows.length - withLoc.length },
  });
});

// ------------------------------------------------------------------ leader: permintaan bergabung

meHomecellRouter.get('/join-requests', async (req, res) => {
  const u = me(req);
  const rows = await prisma.homecellJoinRequest.findMany({
    where: { status: 'PENDING', homecell: { picJemaatId: u.jemaatId } },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      createdAt: true,
      pesan: true,
      homecell: { select: { id: true, nama: true } },
      jemaat: {
        select: {
          id: true,
          namaLengkap: true,
          kode: true,
          fotoUrl: true,
          noHp: true,
          jenisKelamin: true,
          tanggalLahir: true,
          alamat: true,
        },
      },
    },
  });
  res.json({ success: true, data: rows });
});

const rejectSchema = z.object({
  reason: z.string().trim().max(300).optional().transform((v) => (v ? v : undefined)),
});

async function loadRequest(reqId: string) {
  const r = await prisma.homecellJoinRequest.findUnique({
    where: { id: reqId },
    include: {
      jemaat: { select: { id: true, namaLengkap: true, noHp: true } },
      homecell: { select: { id: true, nama: true } },
    },
  });
  if (!r) throw NotFound('Permintaan tidak ditemukan.');
  return r;
}

meHomecellRouter.post('/join-requests/:reqId/approve', async (req, res) => {
  const u = me(req);
  const request = await loadRequest(req.params.reqId);
  await assertLeaderOf(req, request.homecellId);

  const member = await prisma.$transaction(async (tx) => {
    const claimed = await tx.homecellJoinRequest.updateMany({
      where: { id: request.id, status: 'PENDING' },
      data: { status: 'APPROVED', reviewedById: u.jemaatId, reviewedAt: new Date() },
    });
    if (claimed.count === 0) {
      throw new ApiError(409, 'JOIN_REQUEST_NOT_PENDING', 'Permintaan ini sudah diproses.');
    }
    const existing = await tx.homecellMember.findUnique({
      where: { homecellId_jemaatId: { homecellId: request.homecellId, jemaatId: request.jemaatId } },
    });
    if (existing) {
      return tx.homecellMember.update({
        where: { id: existing.id },
        data: { isActive: true, tanggalKeluar: null, tanggalBergabung: existing.isActive ? undefined : new Date() },
      });
    }
    return tx.homecellMember.create({
      data: { homecellId: request.homecellId, jemaatId: request.jemaatId, catatan: request.pesan },
    });
  });

  audit(req, {
    action: 'UPDATE',
    resource: 'homecell_join_request',
    resourceId: request.id,
    resourceLabel: `Approve join homecell: ${request.jemaat.namaLengkap} @ ${request.homecell.nama}`,
    metadata: { memberId: member.id },
  });
  void createNotification({
    jemaatId: request.jemaat.id,
    type: 'HOMECELL_JOIN_APPROVED',
    title: `Selamat bergabung di ${request.homecell.nama}`,
    body: 'Permintaan bergabung Anda diterima oleh pemimpin homecell.',
    actionUrl: `/homecell/view/${request.homecell.id}`,
    metadata: { homecellId: request.homecell.id },
  });
  void sendWaIfEnabled('HOMECELL_JOIN_APPROVED', request.jemaat.noHp, {
    nama: request.jemaat.namaLengkap,
    homecell_nama: request.homecell.nama,
  });
  res.json({ success: true, data: { requestId: request.id, status: 'APPROVED', memberId: member.id } });
});

meHomecellRouter.post('/join-requests/:reqId/reject', async (req, res) => {
  const u = me(req);
  const { reason } = rejectSchema.parse(req.body ?? {});
  const request = await loadRequest(req.params.reqId);
  await assertLeaderOf(req, request.homecellId);

  const claimed = await prisma.homecellJoinRequest.updateMany({
    where: { id: request.id, status: 'PENDING' },
    data: { status: 'REJECTED', rejectReason: reason ?? null, reviewedById: u.jemaatId, reviewedAt: new Date() },
  });
  if (claimed.count === 0) {
    throw new ApiError(409, 'JOIN_REQUEST_NOT_PENDING', 'Permintaan ini sudah diproses.');
  }
  audit(req, {
    action: 'UPDATE',
    resource: 'homecell_join_request',
    resourceId: request.id,
    resourceLabel: `Reject join homecell: ${request.jemaat.namaLengkap} @ ${request.homecell.nama}`,
    metadata: { reason: reason ?? null },
  });
  void createNotification({
    jemaatId: request.jemaat.id,
    type: 'HOMECELL_JOIN_REJECTED',
    title: `Permintaan bergabung ke ${request.homecell.nama}`,
    body: `Permintaan Anda belum dapat diterima.${reason ? ` Alasan: ${reason}` : ''} Anda bisa memilih homecell lain.`,
    actionUrl: '/homecell',
    metadata: { homecellId: request.homecell.id },
  });
  void sendWaIfEnabled('HOMECELL_JOIN_REJECTED', request.jemaat.noHp, {
    nama: request.jemaat.namaLengkap,
    homecell_nama: request.homecell.nama,
    alasan: reason ? `\nAlasan: ${reason}` : '',
  });
  res.json({ success: true, data: { requestId: request.id, status: 'REJECTED' } });
});

// ------------------------------------------------------------------ detail (read-only)

meHomecellRouter.get('/:id', async (req, res) => {
  const jemaatId = me(req).jemaatId;
  if (!UUID_RE.test(req.params.id)) throw NotFound('Homecell tidak ditemukan');
  const hc = await prisma.homecell.findFirst({
    where: { id: req.params.id, isActive: true },
    select: listSelect,
  });
  if (!hc) throw NotFound('Homecell tidak ditemukan');
  const status = await myStatusMap(jemaatId);
  const myStatus = status.get(hc.id) ?? null;
  const isInside = myStatus === 'MEMBER' || myStatus === 'LEADER';

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const [schedules, members, pic, myPending] = await Promise.all([
    prisma.homecellSchedule.findMany({
      where: { homecellId: hc.id, tanggal: { gte: today } },
      orderBy: { tanggal: 'asc' },
      take: 5,
      select: { id: true, tanggal: true, lokasi: true, catatan: true },
    }),
    // Daftar anggota hanya untuk anggota / leader (privasi).
    isInside
      ? prisma.homecellMember.findMany({
          where: { homecellId: hc.id, isActive: true },
          orderBy: { jemaat: { namaLengkap: 'asc' } },
          select: { jemaat: { select: { id: true, namaLengkap: true, fotoUrl: true } } },
        })
      : Promise.resolve([]),
    // Kontak pemimpin hanya untuk anggota.
    hc.picJemaat && isInside
      ? prisma.jemaat.findUnique({ where: { id: hc.picJemaat.id }, select: { noHp: true } })
      : Promise.resolve(null),
    prisma.homecellJoinRequest.findFirst({
      where: { jemaatId, homecellId: hc.id, status: 'PENDING' },
      select: { id: true, createdAt: true },
    }),
  ]);
  const item = toListItem(hc, null, status);
  res.json({
    success: true,
    data: {
      ...item,
      picJemaat: hc.picJemaat ? { ...hc.picJemaat, noHp: pic?.noHp ?? null } : null,
      upcomingSchedules: schedules,
      members: members.map((m) => m.jemaat),
      myPendingRequest: myPending,
    },
  });
});

// ------------------------------------------------------------------ materi pertemuan

/**
 * GET /:id/materi — jadwal (berikutnya + 10 terakhir) yang punya file materi.
 * Hanya anggota / pemimpin homecell (dan admin).
 */
meHomecellRouter.get('/:id/materi', async (req, res) => {
  const u = me(req);
  if (!UUID_RE.test(req.params.id)) throw NotFound('Homecell tidak ditemukan');
  const status = (await myStatusMap(u.jemaatId)).get(req.params.id);
  if (status !== 'MEMBER' && status !== 'LEADER' && !u.isFulltimer) {
    throw Forbidden('Materi hanya bisa dilihat anggota homecell ini.');
  }
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const select = {
    id: true,
    tanggal: true,
    lokasi: true,
    catatan: true,
    files: { orderBy: { createdAt: 'asc' as const }, select: scheduleFileSelect },
  };
  const [upcoming, past] = await Promise.all([
    prisma.homecellSchedule.findMany({
      where: { homecellId: req.params.id, tanggal: { gte: today }, files: { some: {} } },
      orderBy: { tanggal: 'asc' },
      take: 5,
      select,
    }),
    prisma.homecellSchedule.findMany({
      where: { homecellId: req.params.id, tanggal: { lt: today }, files: { some: {} } },
      orderBy: { tanggal: 'desc' },
      take: 10,
      select,
    }),
  ]);
  res.json({ success: true, data: { upcoming, past } });
});

// ------------------------------------------------------------------ jemaat: minta bergabung

const joinSchema = z.object({
  pesan: z.string().trim().max(500).optional().transform((v) => (v ? v : undefined)),
});

meHomecellRouter.post('/:id/join-request', async (req, res) => {
  const jemaatId = me(req).jemaatId;
  const { pesan } = joinSchema.parse(req.body ?? {});
  const hc = await prisma.homecell.findFirst({
    where: { id: req.params.id, isActive: true },
    select: { id: true, nama: true, picJemaat: { select: { id: true, namaLengkap: true, noHp: true } } },
  });
  if (!hc) throw NotFound('Homecell tidak ditemukan');

  const active = await prisma.homecellMember.findFirst({
    where: { jemaatId, isActive: true, homecell: { isActive: true } },
    select: { homecell: { select: { nama: true } } },
  });
  if (active) {
    throw new ApiError(409, 'ALREADY_IN_HOMECELL', `Anda sudah tergabung di homecell ${active.homecell.nama}.`);
  }
  const pending = await prisma.homecellJoinRequest.findFirst({
    where: { jemaatId, status: 'PENDING' },
    select: { homecell: { select: { nama: true } } },
  });
  if (pending) {
    throw new ApiError(
      409,
      'JOIN_REQUEST_PENDING',
      `Anda masih punya permintaan bergabung ke ${pending.homecell.nama}. Batalkan dulu kalau ingin memilih homecell lain.`,
    );
  }

  const created = await prisma.homecellJoinRequest.create({
    data: { homecellId: hc.id, jemaatId, pesan },
    include: { jemaat: { select: { namaLengkap: true } } },
  });
  audit(req, {
    action: 'CREATE',
    resource: 'homecell_join_request',
    resourceId: created.id,
    resourceLabel: `Request join homecell: ${created.jemaat.namaLengkap} @ ${hc.nama}`,
  });
  if (hc.picJemaat) {
    void createNotification({
      jemaatId: hc.picJemaat.id,
      type: 'HOMECELL_JOIN_REQUESTED',
      title: `Permintaan bergabung: ${hc.nama}`,
      body: `${created.jemaat.namaLengkap} ingin bergabung ke homecell Anda.${pesan ? ` Pesan: ${pesan}` : ''}`,
      actionUrl: '/homecell/requests',
      metadata: { homecellId: hc.id, requestId: created.id },
    });
    void sendWaIfEnabled('HOMECELL_JOIN_REQUESTED', hc.picJemaat.noHp, {
      nama: hc.picJemaat.namaLengkap,
      pemohon: created.jemaat.namaLengkap,
      homecell_nama: hc.nama,
    });
  }
  res.status(201).json({
    success: true,
    data: { requestId: created.id, status: 'PENDING', homecell: { id: hc.id, nama: hc.nama } },
    message: `Permintaan bergabung ke ${hc.nama} terkirim. Menunggu persetujuan pemimpin homecell.`,
  });
});

meHomecellRouter.delete('/:id/join-request', async (req, res) => {
  const jemaatId = me(req).jemaatId;
  const pending = await prisma.homecellJoinRequest.findFirst({
    where: { jemaatId, homecellId: req.params.id, status: 'PENDING' },
    select: { id: true },
  });
  if (!pending) throw NotFound('Tidak ada permintaan bergabung yang menunggu.');
  await prisma.homecellJoinRequest.update({
    where: { id: pending.id },
    data: { status: 'CANCELLED', reviewedAt: new Date() },
  });
  audit(req, {
    action: 'UPDATE',
    resource: 'homecell_join_request',
    resourceId: pending.id,
    resourceLabel: 'Cancel join homecell (self)',
  });
  res.json({ success: true, data: { id: pending.id, status: 'CANCELLED' } });
});

// ------------------------------------------------------------------ leader: lokasi

const lokasiSchema = z.object({ mapsUrl: z.string().trim().max(2000).nullable() });

meHomecellRouter.patch('/:id/lokasi', async (req, res) => {
  await assertLeaderOf(req, req.params.id);
  const { mapsUrl } = lokasiSchema.parse(req.body ?? {});
  let data: { mapsUrl: string | null; latitude: number | null; longitude: number | null };
  if (!mapsUrl) {
    data = { mapsUrl: null, latitude: null, longitude: null };
  } else {
    const loc = await resolveMapsLocation(mapsUrl);
    if (!loc) {
      throw BadRequest(
        'Koordinat tidak ditemukan di link tersebut. Buka Google Maps, tekan lama titik lokasi, lalu salin koordinat (mis. -6.2088, 106.8456) atau tautan "Bagikan".',
      );
    }
    data = { mapsUrl, latitude: loc.lat, longitude: loc.lng };
  }
  const updated = await prisma.homecell.update({
    where: { id: req.params.id },
    data,
    select: { id: true, nama: true, mapsUrl: true, latitude: true, longitude: true },
  });
  audit(req, {
    action: 'UPDATE',
    resource: 'homecell',
    resourceId: updated.id,
    resourceLabel: `Lokasi homecell ${updated.nama}`,
    after: updated,
  });
  res.json({ success: true, data: updated });
});
