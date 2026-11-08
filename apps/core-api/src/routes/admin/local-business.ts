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
import { z } from 'zod';
import { NotFound } from '../../lib/errors.js';
import { requireMenu } from '../../middleware/require-menu.js';
import { localMarketMaxItems, serializeItem } from '../../lib/local-market.js';
import { audit } from '../../lib/audit.js';
import {
  deleteBusinessHero,
  deleteBusinessLogo,
  deleteBusinessProfilePdf,
  deleteLocalItemPhoto,
} from '../../lib/storage.js';

export const localBusinessRouter = Router();
// Portal saja: wajib menu "Local Market" (sebelumnya terbuka untuk semua yang login).
localBusinessRouter.use(requireMenu('local-business'));

// ===== Pengaturan katalog (2.4.7): batas item per usaha (global) =====
localBusinessRouter.get('/config', async (_req, res) => {
  res.json({ success: true, data: { maxItems: await localMarketMaxItems() } });
});

localBusinessRouter.put('/config', requireMenu('local-business', 'write'), async (req, res) => {
  const { maxItems } = z.object({ maxItems: z.coerce.number().int().min(1).max(500) }).parse(req.body ?? {});
  await prisma.appConfig.upsert({
    where: { id: 'global' },
    create: { id: 'global', localMarketMaxItems: maxItems },
    update: { localMarketMaxItems: maxItems },
  });
  audit(req, { action: 'UPDATE', resource: 'app_config', resourceId: 'global', resourceLabel: `Local Market: batas ${maxItems} item per usaha` });
  res.json({ success: true, data: { maxItems } });
});

// ===== Katalog per usaha (lihat + sembunyikan / tampilkan) =====
localBusinessRouter.get('/:id/items', async (req, res) => {
  const rows = await prisma.localBusinessItem.findMany({
    where: { businessId: req.params.id },
    orderBy: [{ urutan: 'asc' }, { createdAt: 'asc' }],
  });
  res.json({ success: true, data: rows.map(serializeItem) });
});

localBusinessRouter.patch('/items/:itemId', requireMenu('local-business', 'write'), async (req, res) => {
  const { isHiddenByAdmin } = z.object({ isHiddenByAdmin: z.boolean() }).parse(req.body ?? {});
  const before = await prisma.localBusinessItem.findUnique({ where: { id: req.params.itemId } });
  if (!before) throw NotFound('Item tidak ditemukan');
  const updated = await prisma.localBusinessItem.update({ where: { id: before.id }, data: { isHiddenByAdmin } });
  audit(req, {
    action: 'UPDATE',
    resource: 'local_business_item',
    resourceId: updated.id,
    resourceLabel: `[moderation] ${updated.nama} ${isHiddenByAdmin ? 'disembunyikan' : 'ditampilkan'}`,
  });
  res.json({ success: true, data: serializeItem(updated) });
});

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
      include: {
        owner: { select: ownerLite },
        // 2.4.7 — partner yang sudah menerima undangan
        partners: { where: { status: 'ACCEPTED' }, select: { jemaat: { select: ownerLite } } },
      },
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
localBusinessRouter.delete('/:id', requireMenu('local-business', 'delete'), async (req, res) => {
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
  const items = await prisma.localBusinessItem.findMany({ where: { businessId: before.id }, select: { fotoUrls: true } });
  for (const it of items) for (const u of (it.fotoUrls as string[]) ?? []) await deleteLocalItemPhoto(u).catch(() => undefined);
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
