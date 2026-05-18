import { Router } from 'express';
import { prisma } from '@ecc/database';
import { checkinByKodeSchema } from '@ecc/shared-types';
import { requireApiKey } from '../../middleware/require-api-key.js';
import { BadRequest, NotFound } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';

/**
 * Public/consumer endpoints — dipakai aplikasi lain di ekosistem ECC
 * (mobile app, attendance system, dst). Auth via API key, di-scope per sinode.
 *
 * Default: read-only. Belum expose write operations sampai use case spesifik
 * memang membutuhkannya.
 */
export const publicRouter = Router();

publicRouter.use(requireApiKey);

publicRouter.get('/cabang', async (req, res) => {
  const data = await prisma.cabangGereja.findMany({
    where: { sinodeId: req.apiKey!.sinodeId, isActive: true },
    select: { id: true, nama: true, kode: true, alamat: true, kontak: true },
  });
  res.json({ success: true, data });
});

publicRouter.get('/ibadah', async (req, res) => {
  const data = await prisma.ibadah.findMany({
    where: { cabang: { sinodeId: req.apiKey!.sinodeId }, isActive: true },
    include: {
      cabang: { select: { id: true, nama: true } },
      kategoriIbadah: { select: { id: true, nama: true } },
    },
  });
  res.json({ success: true, data });
});

publicRouter.get('/jemaat/:id', async (req, res) => {
  const data = await prisma.jemaat.findFirst({
    where: { id: req.params.id, cabang: { sinodeId: req.apiKey!.sinodeId } },
    select: {
      id: true,
      namaLengkap: true,
      email: true,
      noHp: true,
      fotoUrl: true,
      cabang: { select: { id: true, nama: true } },
    },
  });
  if (!data) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND' } });
    return;
  }
  res.json({ success: true, data });
});

// ===================================================================
//  Reservasi / Kehadiran — endpoint untuk mobile attendance app
// ===================================================================

/**
 * GET /api/v1/reservasi/by-kode/:kode
 * Lookup reservasi by kode (scan dari QR/barcode).
 * Return data jemaat + ibadah + status, untuk preview di mobile sebelum confirm checkin.
 */
publicRouter.get('/reservasi/by-kode/:kode', async (req, res) => {
  const item = await prisma.reservasi.findUnique({
    where: { kode: req.params.kode.toUpperCase() },
    include: {
      jemaat: { select: { id: true, namaLengkap: true, fotoUrl: true, noHp: true, cabang: { select: { sinodeId: true } } } },
      ibadah: { select: { id: true, nama: true, jamMulai: true, jamSelesai: true, cabang: { select: { sinodeId: true } } } },
    },
  });
  if (!item) throw NotFound('Kode reservasi tidak ditemukan');

  // Scoping: hanya ibadah di sinode API key
  if (item.ibadah.cabang.sinodeId !== req.apiKey!.sinodeId) {
    throw NotFound('Reservasi tidak ditemukan'); // sembunyikan keberadaannya
  }
  res.json({ success: true, data: item });
});

/**
 * POST /api/v1/reservasi/checkin
 * Body: { kode }
 * Set status JOIN. Idempotent — kalau sudah JOIN, return success dengan note.
 */
publicRouter.post('/reservasi/checkin', async (req, res) => {
  const { kode } = checkinByKodeSchema.parse(req.body);
  const item = await prisma.reservasi.findUnique({
    where: { kode: kode.toUpperCase() },
    include: {
      ibadah: { select: { cabang: { select: { sinodeId: true } } } },
      jemaat: { select: { namaLengkap: true } },
    },
  });
  if (!item) throw NotFound('Kode tidak ditemukan');
  if (item.ibadah.cabang.sinodeId !== req.apiKey!.sinodeId) {
    throw NotFound('Kode tidak ditemukan');
  }
  if (item.status === 'CANCEL') throw BadRequest('Reservasi sudah dibatalkan');
  if (item.status === 'JOIN') {
    return res.json({
      success: true,
      data: item,
      message: 'Sudah check-in sebelumnya',
    });
  }

  const updated = await prisma.reservasi.update({
    where: { id: item.id },
    data: { status: 'JOIN', joinedAt: new Date() },
  });
  audit(req, {
    action: 'UPDATE',
    resource: 'reservasi',
    resourceId: updated.id,
    resourceLabel: `Mobile scan: ${item.jemaat.namaLengkap}`,
    metadata: { method: 'mobile-scan', apiKeyId: req.apiKey!.id },
    before: item,
    after: updated,
  });
  res.json({ success: true, data: updated, message: 'Check-in berhasil' });
});

/**
 * POST /api/v1/reservasi/cancel
 * Body: { kode }
 * Self-cancel via mobile (jemaat sendiri yang batalkan).
 */
// ===================================================================
//  News & Renungan (mobile broadcast)
// ===================================================================

/**
 * Helper: list published konten by tipe, scoped sinode dari API key.
 * Filter `cabangId` opsional (kalau set, only cabang itu; kalau tidak,
 * return konten yang target = global, sinode-wide, atau cabang manapun di sinode tsb).
 */
async function listPublishedKonten(
  req: import('express').Request,
  tipe: 'NEWS' | 'RENUNGAN',
) {
  const sinodeId = req.apiKey!.sinodeId;
  const cabangId = typeof req.query.cabangId === 'string' ? req.query.cabangId : undefined;
  const limit = Math.min(Number(req.query.limit ?? 20), 100);
  const page = Math.max(Number(req.query.page ?? 1), 1);

  // Audience filter:
  // - cabangId match (kalau di-set di query), OR
  // - sinode-wide untuk sinode user, OR
  // - global (no target)
  const where: any = {
    tipe,
    isPublished: true,
    OR: [
      { sinodeId: null, cabangId: null }, // global
      { sinodeId, cabangId: null }, // sinode-wide
      ...(cabangId ? [{ cabangId }] : [{ sinodeId, cabangId: { not: null } }]),
    ],
  };

  const [data, total] = await Promise.all([
    prisma.konten.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: [{ publishedAt: 'desc' }],
      select: {
        id: true,
        tipe: true,
        judul: true,
        slug: true,
        ringkasan: true,
        heroImageUrl: true,
        tanggal: true,
        ayatAlkitab: true,
        tags: true,
        publishedAt: true,
        viewCount: true,
        sinode: { select: { id: true, nama: true } },
        cabang: { select: { id: true, nama: true } },
        author: { select: { jemaat: { select: { namaLengkap: true, fotoUrl: true } } } },
      },
    }),
    prisma.konten.count({ where }),
  ]);
  return { data, page, limit, total };
}

publicRouter.get('/news', async (req, res) => {
  const r = await listPublishedKonten(req, 'NEWS');
  res.json({
    success: true,
    data: r.data,
    meta: { page: r.page, limit: r.limit, total: r.total, totalPages: Math.ceil(r.total / r.limit) },
  });
});

publicRouter.get('/renungan', async (req, res) => {
  const r = await listPublishedKonten(req, 'RENUNGAN');
  res.json({
    success: true,
    data: r.data,
    meta: { page: r.page, limit: r.limit, total: r.total, totalPages: Math.ceil(r.total / r.limit) },
  });
});

/**
 * Detail by slug — return konten lengkap (dengan body markdown).
 * Increment view count (fire-and-forget).
 */
publicRouter.get('/news/:slug', async (req, res) => {
  const item = await prisma.konten.findFirst({
    where: { tipe: 'NEWS', slug: req.params.slug, isPublished: true },
    include: {
      sinode: { select: { id: true, nama: true } },
      cabang: { select: { id: true, nama: true } },
      author: { select: { jemaat: { select: { namaLengkap: true, fotoUrl: true } } } },
    },
  });
  if (!item) throw NotFound('News tidak ditemukan');
  // Sinode scoping
  if (item.sinodeId && item.sinodeId !== req.apiKey!.sinodeId) throw NotFound('News tidak ditemukan');

  // Fire-and-forget increment view count
  prisma.konten.update({ where: { id: item.id }, data: { viewCount: { increment: 1 } } }).catch(() => {});

  res.json({ success: true, data: item });
});

publicRouter.get('/renungan/:slug', async (req, res) => {
  const item = await prisma.konten.findFirst({
    where: { tipe: 'RENUNGAN', slug: req.params.slug, isPublished: true },
    include: {
      sinode: { select: { id: true, nama: true } },
      cabang: { select: { id: true, nama: true } },
      author: { select: { jemaat: { select: { namaLengkap: true, fotoUrl: true } } } },
    },
  });
  if (!item) throw NotFound('Renungan tidak ditemukan');
  if (item.sinodeId && item.sinodeId !== req.apiKey!.sinodeId) throw NotFound('Renungan tidak ditemukan');

  prisma.konten.update({ where: { id: item.id }, data: { viewCount: { increment: 1 } } }).catch(() => {});

  res.json({ success: true, data: item });
});

publicRouter.post('/reservasi/cancel', async (req, res) => {
  const { kode } = checkinByKodeSchema.parse(req.body);
  const item = await prisma.reservasi.findUnique({
    where: { kode: kode.toUpperCase() },
    include: {
      ibadah: { select: { cabang: { select: { sinodeId: true } } } },
      jemaat: { select: { namaLengkap: true } },
    },
  });
  if (!item) throw NotFound('Kode tidak ditemukan');
  if (item.ibadah.cabang.sinodeId !== req.apiKey!.sinodeId) {
    throw NotFound('Kode tidak ditemukan');
  }
  if (item.status === 'JOIN') throw BadRequest('Sudah check-in, tidak bisa cancel');

  const updated = await prisma.reservasi.update({
    where: { id: item.id },
    data: { status: 'CANCEL', cancelledAt: new Date() },
  });
  audit(req, {
    action: 'UPDATE',
    resource: 'reservasi',
    resourceId: updated.id,
    resourceLabel: `Mobile cancel: ${item.jemaat.namaLengkap}`,
    metadata: { method: 'mobile-cancel', apiKeyId: req.apiKey!.id },
    before: item,
    after: updated,
  });
  res.json({ success: true, data: updated, message: 'Reservasi dibatalkan' });
});
