/**
 * Admin portal — Local Business (Movement) read-only + moderation delete.
 *
 * Tidak ada create/edit dari portal. Aktivitas CRUD oleh jemaat owner di
 * mobile app. Portal admin:
 *   - GET    /admin/local-business       → paginated list dengan filter
 *   - GET    /admin/local-business/:id   → detail
 *   - DELETE /admin/local-business/:id   → moderation delete (cleanup files
 *                                          + audit logged)
 */
import { Router } from 'express';
import { prisma } from '@ecc/database';
import { adminLocalBusinessQuerySchema } from '@ecc/shared-types';
import { NotFound } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import {
  deleteBusinessHero,
  deleteBusinessLogo,
  deleteBusinessProfilePdf,
} from '../../lib/storage.js';

export const localBusinessRouter = Router();

const ownerLite = {
  id: true,
  namaLengkap: true,
  fotoUrl: true,
  noHp: true,
  cabang: { select: { id: true, nama: true } },
} as const;

// ============================================================
//  LIST
// ============================================================
localBusinessRouter.get('/', async (req, res) => {
  const q = adminLocalBusinessQuerySchema.parse(req.query);

  const where: any = {};
  if (q.cabangId) where.owner = { cabangId: q.cabangId };
  if (q.ownerJemaatId) where.ownerJemaatId = q.ownerJemaatId;
  if (q.industri) where.industri = { contains: q.industri, mode: 'insensitive' };
  if (q.tipeBisnis) where.tipeBisnis = q.tipeBisnis;
  if (q.isActive !== undefined) where.isActive = q.isActive;

  if (q.search) {
    where.OR = [
      { nama: { contains: q.search, mode: 'insensitive' as const } },
      { deskripsi: { contains: q.search, mode: 'insensitive' as const } },
      { industri: { contains: q.search, mode: 'insensitive' as const } },
      { owner: { namaLengkap: { contains: q.search, mode: 'insensitive' as const } } },
    ];
  }

  const orderBy = { [q.sortBy ?? 'createdAt']: q.sortOrder ?? 'desc' };

  const [rows, total] = await Promise.all([
    prisma.localBusiness.findMany({
      where,
      skip: (q.page - 1) * q.limit,
      take: q.limit,
      orderBy,
      include: { owner: { select: ownerLite } },
    }),
    prisma.localBusiness.count({ where }),
  ]);

  res.json({
    success: true,
    data: rows,
    meta: { page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit) },
  });
});

// ============================================================
//  DETAIL
// ============================================================
localBusinessRouter.get('/:id', async (req, res) => {
  const biz = await prisma.localBusiness.findUnique({
    where: { id: req.params.id },
    include: { owner: { select: ownerLite } },
  });
  if (!biz) throw NotFound('Bisnis tidak ditemukan');
  res.json({ success: true, data: biz });
});

// ============================================================
//  DELETE (moderation)
// ============================================================
localBusinessRouter.delete('/:id', async (req, res) => {
  const before = await prisma.localBusiness.findUnique({
    where: { id: req.params.id },
    include: { owner: { select: { namaLengkap: true } } },
  });
  if (!before) throw NotFound('Bisnis tidak ditemukan');

  if (before.heroImageUrl) {
    await deleteBusinessHero(before.id).catch(() => undefined);
  }
  if (before.logoUrl) {
    await deleteBusinessLogo(before.id).catch(() => undefined);
  }
  if (before.companyProfileUrl) {
    await deleteBusinessProfilePdf(before.id).catch(() => undefined);
  }
  await prisma.localBusiness.delete({ where: { id: before.id } });
  audit(req, {
    action: 'DELETE',
    resource: 'local_business',
    resourceId: before.id,
    resourceLabel: `[moderation] ${before.owner.namaLengkap} — ${before.nama}`,
    before,
  });
  res.status(204).end();
});
