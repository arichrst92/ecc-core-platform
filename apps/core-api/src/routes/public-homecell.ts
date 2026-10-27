/**
 * Homecell untuk MODE TAMU (tanpa akun) — /public/homecell/*
 *
 *   GET  /browse?cabangId&lat&lng&q&kategori   daftar homecell aktif di cabang (+ jarak)
 *   GET  /nearest?cabangId&lat&lng&limit=3     rekomendasi terdekat (yang punya lokasi)
 *   POST /:id/guest-request                    minta bergabung sebagai tamu
 *        { nama, noHp, jenisKelamin?, usia?, pesan? } → { token, request }
 *   POST /guest-request/status   { tokens: string[] }  status permintaan saya
 *   POST /guest-request/cancel   { token }             batalkan (PENDING)
 *
 * Privasi: homecell bertemu di rumah jemaat → alamat, link Maps, koordinat &
 * kontak PIC TIDAK dibuka ke publik. Baru dikirim lewat /status setelah
 * permintaan diterima PIC. Jarak dibulatkan 0,1 km.
 *
 * Token: string acak yang disimpan app di perangkat; server hanya menyimpan
 * SHA-256-nya. Tanpa token, status tidak bisa dibaca orang lain.
 */
import { createHash, randomBytes } from 'node:crypto';
import { Router } from 'express';
import { prisma, type Prisma } from '@ecc/database';
import { noHpSchema } from '@ecc/shared-types';
import { z } from 'zod';
import { ApiError, BadRequest, NotFound } from '../lib/errors.js';
import { distanceKm, type LatLng } from '../lib/geo.js';
import { getLastMeetingMap, lastMeetingOf } from '../lib/homecell-last-attendance.js';
import { createNotification } from '../lib/notification.js';
import { logger } from '../lib/logger.js';
import { guestJoinLimiter, publicBrowseLimiter } from '../middleware/rate-limit.js';

export const publicHomecellRouter = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const hashGuestToken = (t: string) => createHash('sha256').update(t).digest('hex');

function parseLatLng(q: Record<string, unknown>): LatLng | null {
  if (q.lat === undefined || q.lng === undefined) return null;
  const lat = Number(q.lat);
  const lng = Number(q.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

async function cabangFromQuery(q: Record<string, unknown>): Promise<string> {
  const id = typeof q.cabangId === 'string' ? q.cabangId : '';
  if (!UUID_RE.test(id)) throw BadRequest('cabangId wajib diisi.');
  const c = await prisma.cabangGereja.findFirst({ where: { id, isActive: true }, select: { id: true } });
  if (!c) throw NotFound('Cabang tidak ditemukan.');
  return c.id;
}

const publicSelect = {
  id: true,
  nama: true,
  deskripsi: true,
  hari: true,
  jam: true,
  kategori: true,
  usiaMin: true,
  usiaMax: true,
  latitude: true,
  longitude: true,
  area: { select: { id: true, nama: true, cabang: { select: { id: true, nama: true } } } },
  _count: { select: { members: { where: { isActive: true } } } },
} satisfies Prisma.HomecellSelect;
type PublicRow = Prisma.HomecellGetPayload<{ select: typeof publicSelect }>;

function toPublicItem(r: PublicRow, from: LatLng | null) {
  const { _count, latitude, longitude, ...rest } = r;
  const hasLocation = latitude != null && longitude != null;
  return {
    ...rest,
    hasLocation,
    memberCount: _count.members,
    distanceKm: from && hasLocation ? Math.round(distanceKm(from, { lat: latitude!, lng: longitude! }) * 10) / 10 : null,
  };
}

const activeWhere = (cabangId: string): Prisma.HomecellWhereInput => ({ isActive: true, area: { cabangId, isActive: true } });

// ------------------------------------------------------------------ daftar & terdekat

publicHomecellRouter.get('/browse', publicBrowseLimiter, async (req, res) => {
  const q = req.query as Record<string, unknown>;
  const cabangId = await cabangFromQuery(q);
  const from = parseLatLng(q);
  const search = typeof q.q === 'string' ? q.q.trim().slice(0, 100) : '';
  const kat = q.kategori;
  const rows = await prisma.homecell.findMany({
    where: {
      ...activeWhere(cabangId),
      ...(kat === 'SINGLE' || kat === 'COUPLE' ? { kategori: kat } : {}),
      ...(search
        ? {
            OR: [
              { nama: { contains: search, mode: 'insensitive' } },
              { area: { nama: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    },
    select: publicSelect,
    orderBy: { nama: 'asc' },
    take: 300,
  });
  const lastMap = await getLastMeetingMap(rows.map((r) => r.id));
  const items = rows.map((r) => ({ ...toPublicItem(r, from), ...lastMeetingOf(r.id, lastMap) }));
  if (from) items.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity) || a.nama.localeCompare(b.nama));
  res.json({ success: true, data: items });
});

publicHomecellRouter.get('/nearest', publicBrowseLimiter, async (req, res) => {
  const q = req.query as Record<string, unknown>;
  const cabangId = await cabangFromQuery(q);
  const from = parseLatLng(q);
  if (!from) throw BadRequest('Lokasi (lat, lng) wajib dikirim.');
  const limit = Math.min(10, Math.max(1, Number(q.limit) || 3));
  const rows = await prisma.homecell.findMany({ where: activeWhere(cabangId), select: publicSelect });
  const withLoc = rows.filter((r) => r.latitude != null && r.longitude != null);
  const nearest = withLoc
    .map((r) => toPublicItem(r, from))
    .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity))
    .slice(0, limit);
  const lastMap = await getLastMeetingMap(nearest.map((x) => x.id));
  res.json({
    success: true,
    data: {
      items: nearest.map((x) => ({ ...x, ...lastMeetingOf(x.id, lastMap) })),
      totalInCabang: rows.length,
      withoutLocation: rows.length - withLoc.length,
    },
  });
});

// ------------------------------------------------------------------ minta bergabung

const guestRequestSchema = z.object({
  nama: z.string().trim().min(2, 'Nama minimal 2 karakter').max(255),
  noHp: noHpSchema,
  jenisKelamin: z.enum(['L', 'P']).optional(),
  usia: z.coerce.number().int().min(5).max(110).optional(),
  pesan: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => (v ? v : undefined)),
});

const statusSelect = {
  id: true,
  status: true,
  nama: true,
  createdAt: true,
  reviewedAt: true,
  rejectReason: true,
  homecell: {
    select: {
      id: true,
      nama: true,
      hari: true,
      jam: true,
      alamat: true,
      mapsUrl: true,
      latitude: true,
      longitude: true,
      area: { select: { nama: true, cabang: { select: { nama: true } } } },
      picJemaat: { select: { namaLengkap: true, noHp: true } },
    },
  },
} satisfies Prisma.HomecellGuestRequestSelect;
type StatusRow = Prisma.HomecellGuestRequestGetPayload<{ select: typeof statusSelect }>;

/** Detail lokasi & kontak hanya untuk permintaan yang sudah DITERIMA. */
function toStatus(r: StatusRow) {
  const h = r.homecell;
  const approved = r.status === 'APPROVED';
  return {
    id: r.id,
    status: r.status,
    nama: r.nama,
    createdAt: r.createdAt,
    reviewedAt: r.reviewedAt,
    rejectReason: r.status === 'REJECTED' ? r.rejectReason : null,
    homecell: {
      id: h.id,
      nama: h.nama,
      hari: h.hari,
      jam: h.jam,
      area: h.area.nama,
      cabang: h.area.cabang.nama,
      ...(approved
        ? {
            alamat: h.alamat,
            mapsUrl: h.mapsUrl,
            latitude: h.latitude,
            longitude: h.longitude,
            pic: h.picJemaat ? { nama: h.picJemaat.namaLengkap, noHp: h.picJemaat.noHp } : null,
          }
        : {}),
    },
  };
}

publicHomecellRouter.post('/:id/guest-request', guestJoinLimiter, async (req, res) => {
  const homecellId = String(req.params.id ?? '');
  if (!UUID_RE.test(homecellId)) throw NotFound('Homecell tidak ditemukan.');
  const input = guestRequestSchema.parse(req.body ?? {});

  const hc = await prisma.homecell.findFirst({
    where: { id: homecellId, isActive: true, area: { isActive: true } },
    select: { id: true, nama: true, picJemaatId: true, area: { select: { picJemaatId: true } } },
  });
  if (!hc) throw NotFound('Homecell tidak ditemukan.');

  // No HP milik anggota terdaftar → minta masuk ke Els App (alur anggota).
  const owner = await prisma.jemaat.findUnique({ where: { noHp: input.noHp }, select: { isTamu: true } });
  if (owner && !owner.isTamu) {
    throw new ApiError(
      409,
      'PHONE_IS_MEMBER',
      'Nomor ini sudah terdaftar di Els App. Silakan masuk dengan akun Anda untuk meminta bergabung ke homecell.',
    );
  }

  const token = randomBytes(24).toString('base64url');
  const tokenHash = hashGuestToken(token);

  // 1 permintaan menunggu per nomor HP.
  const pending = await prisma.homecellGuestRequest.findFirst({
    where: { noHp: input.noHp, status: 'PENDING' },
    select: { id: true, homecellId: true, homecell: { select: { nama: true } } },
  });
  let id: string;
  if (pending && pending.homecellId !== hc.id) {
    throw new ApiError(
      409,
      'GUEST_REQUEST_PENDING',
      `Nomor ini masih menunggu persetujuan di homecell ${pending.homecell.nama}. Batalkan dulu untuk memilih homecell lain.`,
    );
  } else if (pending) {
    // Kirim ulang ke homecell yang sama (mis. ganti HP / app di-install ulang) → perbarui data & token.
    await prisma.homecellGuestRequest.update({
      where: { id: pending.id },
      data: { nama: input.nama, jenisKelamin: input.jenisKelamin ?? null, usia: input.usia ?? null, pesan: input.pesan ?? null, tokenHash },
    });
    id = pending.id;
  } else {
    const created = await prisma.homecellGuestRequest.create({
      data: {
        homecellId: hc.id,
        nama: input.nama,
        noHp: input.noHp,
        jenisKelamin: input.jenisKelamin ?? null,
        usia: input.usia ?? null,
        pesan: input.pesan ?? null,
        tokenHash,
      },
      select: { id: true },
    });
    id = created.id;
    const leader = hc.picJemaatId ?? hc.area.picJemaatId;
    if (leader) {
      void createNotification({
        jemaatId: leader,
        type: 'HOMECELL_JOIN_REQUESTED',
        title: `Tamu ingin bergabung ke ${hc.nama}`,
        body: `${input.nama} (mode tamu Els App) meminta bergabung ke homecell. Buka untuk menerima atau menolak.`,
        actionUrl: '/homecell/requests',
        metadata: { homecellId: hc.id, guestRequestId: id },
      });
    }
    logger.info({ homecellId: hc.id, guestRequestId: id }, 'homecell: permintaan tamu baru');
  }

  const row = await prisma.homecellGuestRequest.findUniqueOrThrow({ where: { id }, select: statusSelect });
  res.status(201).json({ success: true, data: { token, request: toStatus(row) } });
});

const tokensSchema = z.object({ tokens: z.array(z.string().min(16).max(100)).min(1).max(10) });

publicHomecellRouter.post('/guest-request/status', publicBrowseLimiter, async (req, res) => {
  const { tokens } = tokensSchema.parse(req.body ?? {});
  const hashes = tokens.map(hashGuestToken);
  const rows = await prisma.homecellGuestRequest.findMany({
    where: { tokenHash: { in: hashes } },
    select: { ...statusSelect, tokenHash: true },
  });
  const byHash = new Map(rows.map((r) => [r.tokenHash, r]));
  // Urut sesuai token yang dikirim; token tidak dikenal → null (app boleh menghapusnya).
  res.json({
    success: true,
    data: tokens.map((t, i) => {
      const r = byHash.get(hashes[i]!);
      return { token: t, request: r ? toStatus(r) : null };
    }),
  });
});

publicHomecellRouter.post('/guest-request/cancel', publicBrowseLimiter, async (req, res) => {
  const { token } = z.object({ token: z.string().min(16).max(100) }).parse(req.body ?? {});
  const r = await prisma.homecellGuestRequest.updateMany({
    where: { tokenHash: hashGuestToken(token), status: 'PENDING' },
    data: { status: 'CANCELLED' },
  });
  if (r.count === 0) throw new ApiError(409, 'GUEST_REQUEST_NOT_PENDING', 'Permintaan ini sudah diproses atau tidak ditemukan.');
  res.json({ success: true, data: { cancelled: true } });
});
