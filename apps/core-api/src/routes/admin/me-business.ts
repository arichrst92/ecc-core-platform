/**
 * Movement — Local Business (mobile self-service).
 *
 * Sub-router yang di-mount di /admin/me/businesses (CRUD owner) +
 * /admin/me/local-market (browse). Semua endpoint pakai JWT auth via
 * meRouter (req.user.jemaatId).
 *
 * Cakupan:
 *   - GET    /admin/me/businesses                       → list bisnis saya
 *   - POST   /admin/me/businesses                       → create
 *   - GET    /admin/me/businesses/:id                   → detail (owner only)
 *   - PATCH  /admin/me/businesses/:id                   → update (owner only)
 *   - DELETE /admin/me/businesses/:id                   → hard delete + cleanup files
 *   - POST   /admin/me/businesses/:id/hero              → upload banner image
 *   - DELETE /admin/me/businesses/:id/hero              → clear banner
 *   - POST   /admin/me/businesses/:id/profile-pdf       → upload company profile
 *   - DELETE /admin/me/businesses/:id/profile-pdf       → clear company profile
 *
 *   - GET    /admin/me/local-market                     → browse public (filter cabang/industri/tipe/search)
 *   - GET    /admin/me/local-market/:id                 → detail public (sembunyikan isActive=false)
 */
import { Router } from 'express';
import { prisma } from '@ecc/database';
import {
  createLocalBusinessSchema,
  updateLocalBusinessSchema,
  browseLocalMarketQuerySchema,
} from '@ecc/shared-types';
import { BadRequest, Forbidden, NotFound, Unauthorized } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { flexImageUpload } from '../../lib/image-upload.js';
import { flexPdfUpload } from '../../lib/pdf-upload.js';
import {
  saveBusinessHero,
  deleteBusinessHero,
  saveBusinessProfilePdf,
  deleteBusinessProfilePdf,
} from '../../lib/storage.js';

export const meBusinessRouter = Router();
export const meLocalMarketRouter = Router();

const ownerLite = {
  id: true,
  namaLengkap: true,
  fotoUrl: true,
  cabang: { select: { id: true, nama: true } },
} as const;

function assertJemaatId(req: Parameters<Parameters<typeof meBusinessRouter.get>[1]>[0]): string {
  if (!req.user) throw Unauthorized();
  return req.user.jemaatId;
}

async function findMyBusinessOrThrow(id: string, jemaatId: string) {
  const biz = await prisma.localBusiness.findUnique({
    where: { id },
    include: { owner: { select: ownerLite } },
  });
  if (!biz) throw NotFound('Bisnis tidak ditemukan');
  if (biz.ownerJemaatId !== jemaatId) throw Forbidden('Bukan owner bisnis ini');
  return biz;
}

// ============================================================
//  OWNER LIST — bisnis saya (semua, termasuk isActive=false)
// ============================================================
meBusinessRouter.get('/', async (req, res) => {
  const jemaatId = assertJemaatId(req);
  const rows = await prisma.localBusiness.findMany({
    where: { ownerJemaatId: jemaatId },
    orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
    include: { owner: { select: ownerLite } },
  });
  res.json({ success: true, data: rows });
});

// ============================================================
//  CREATE
// ============================================================
meBusinessRouter.post('/', async (req, res) => {
  const jemaatId = assertJemaatId(req);
  const input = createLocalBusinessSchema.parse(req.body);

  const created = await prisma.localBusiness.create({
    data: {
      ownerJemaatId: jemaatId,
      nama: input.nama,
      deskripsi: input.deskripsi,
      industri: input.industri,
      tipeBisnis: input.tipeBisnis,
      isOnline: input.isOnline,
      lokasi: input.lokasi,
      websiteUrl: input.websiteUrl,
      whatsappUrl: input.whatsappUrl,
      socialLinks: input.socialLinks ?? [],
    },
    include: { owner: { select: ownerLite } },
  });

  audit(req, {
    action: 'CREATE',
    resource: 'local_business',
    resourceId: created.id,
    resourceLabel: `${created.owner.namaLengkap} — ${created.nama}`,
    after: created,
  });
  res.status(201).json({ success: true, data: created });
});

// ============================================================
//  GET DETAIL (owner)
// ============================================================
meBusinessRouter.get('/:id', async (req, res) => {
  const jemaatId = assertJemaatId(req);
  const biz = await findMyBusinessOrThrow(req.params.id, jemaatId);
  res.json({ success: true, data: biz });
});

// ============================================================
//  UPDATE (owner)
// ============================================================
meBusinessRouter.patch('/:id', async (req, res) => {
  const jemaatId = assertJemaatId(req);
  const input = updateLocalBusinessSchema.parse(req.body);
  const before = await findMyBusinessOrThrow(req.params.id, jemaatId);

  const data: any = {};
  if (input.nama !== undefined) data.nama = input.nama;
  if (input.deskripsi !== undefined) data.deskripsi = input.deskripsi;
  if (input.industri !== undefined) data.industri = input.industri;
  if (input.tipeBisnis !== undefined) data.tipeBisnis = input.tipeBisnis;
  if (input.isOnline !== undefined) data.isOnline = input.isOnline;
  if (input.lokasi !== undefined) data.lokasi = input.lokasi;
  if (input.websiteUrl !== undefined) data.websiteUrl = input.websiteUrl;
  if (input.whatsappUrl !== undefined) data.whatsappUrl = input.whatsappUrl;
  if (input.socialLinks !== undefined) data.socialLinks = input.socialLinks;
  if (input.isActive !== undefined) data.isActive = input.isActive;

  if (Object.keys(data).length === 0) {
    throw BadRequest('Tidak ada field yang diubah.');
  }

  const updated = await prisma.localBusiness.update({
    where: { id: before.id },
    data,
    include: { owner: { select: ownerLite } },
  });
  audit(req, {
    action: 'UPDATE',
    resource: 'local_business',
    resourceId: updated.id,
    resourceLabel: `${updated.owner.namaLengkap} — ${updated.nama}`,
    before,
    after: updated,
  });
  res.json({ success: true, data: updated });
});

// ============================================================
//  DELETE (owner)
//  Hapus files terkait juga supaya tidak orphan.
// ============================================================
meBusinessRouter.delete('/:id', async (req, res) => {
  const jemaatId = assertJemaatId(req);
  const biz = await findMyBusinessOrThrow(req.params.id, jemaatId);

  // Cleanup files first (best effort)
  if (biz.heroImageUrl) {
    await deleteBusinessHero(biz.id).catch(() => undefined);
  }
  if (biz.companyProfileUrl) {
    await deleteBusinessProfilePdf(biz.id).catch(() => undefined);
  }
  await prisma.localBusiness.delete({ where: { id: biz.id } });
  audit(req, {
    action: 'DELETE',
    resource: 'local_business',
    resourceId: biz.id,
    resourceLabel: `${biz.owner.namaLengkap} — ${biz.nama}`,
    before: biz,
  });
  res.status(204).end();
});

// ============================================================
//  Hero image upload / clear
// ============================================================
meBusinessRouter.post('/:id/hero', flexImageUpload(), async (req, res) => {
  const jemaatId = assertJemaatId(req);
  const biz = await findMyBusinessOrThrow(req.params.id, jemaatId);
  if (!req.file) throw BadRequest('File foto wajib (multipart).');

  const heroImageUrl = await saveBusinessHero(biz.id, req.file.buffer);
  const updated = await prisma.localBusiness.update({
    where: { id: biz.id },
    data: { heroImageUrl },
    select: { id: true, heroImageUrl: true },
  });
  audit(req, {
    action: 'UPLOAD_PHOTO',
    resource: 'local_business',
    resourceId: biz.id,
    resourceLabel: `${biz.nama} (hero)`,
    metadata: { kind: 'local-business-hero' },
  });
  res.json({ success: true, data: updated });
});

meBusinessRouter.delete('/:id/hero', async (req, res) => {
  const jemaatId = assertJemaatId(req);
  const biz = await findMyBusinessOrThrow(req.params.id, jemaatId);
  if (!biz.heroImageUrl) {
    return res.status(204).end();
  }
  await deleteBusinessHero(biz.id);
  await prisma.localBusiness.update({
    where: { id: biz.id },
    data: { heroImageUrl: null },
  });
  audit(req, {
    action: 'DELETE',
    resource: 'local_business',
    resourceId: biz.id,
    resourceLabel: `${biz.nama} (hero cleared)`,
  });
  res.status(204).end();
});

// ============================================================
//  Company profile PDF upload / clear
// ============================================================
meBusinessRouter.post('/:id/profile-pdf', flexPdfUpload(), async (req, res) => {
  const jemaatId = assertJemaatId(req);
  const biz = await findMyBusinessOrThrow(req.params.id, jemaatId);
  if (!req.file) throw BadRequest('File PDF wajib (multipart).');

  const companyProfileUrl = await saveBusinessProfilePdf(biz.id, req.file.buffer);
  const updated = await prisma.localBusiness.update({
    where: { id: biz.id },
    data: { companyProfileUrl },
    select: { id: true, companyProfileUrl: true },
  });
  audit(req, {
    action: 'UPLOAD_PHOTO',
    resource: 'local_business',
    resourceId: biz.id,
    resourceLabel: `${biz.nama} (profile pdf)`,
    metadata: { kind: 'local-business-profile-pdf' },
  });
  res.json({ success: true, data: updated });
});

meBusinessRouter.delete('/:id/profile-pdf', async (req, res) => {
  const jemaatId = assertJemaatId(req);
  const biz = await findMyBusinessOrThrow(req.params.id, jemaatId);
  if (!biz.companyProfileUrl) {
    return res.status(204).end();
  }
  await deleteBusinessProfilePdf(biz.id);
  await prisma.localBusiness.update({
    where: { id: biz.id },
    data: { companyProfileUrl: null },
  });
  audit(req, {
    action: 'DELETE',
    resource: 'local_business',
    resourceId: biz.id,
    resourceLabel: `${biz.nama} (profile pdf cleared)`,
  });
  res.status(204).end();
});

// ============================================================
//  BROWSE — Local Market (public, filter by cabang/industri/tipe/search)
//  Hanya tampilkan bisnis isActive=true.
// ============================================================
meLocalMarketRouter.get('/', async (req, res) => {
  // Pastikan caller terotentikasi (sama dengan endpoint /me lain).
  if (!req.user) throw Unauthorized();
  const q = browseLocalMarketQuerySchema.parse(req.query);

  const where: any = { isActive: true };
  if (q.cabangId) {
    where.owner = { cabangId: q.cabangId };
  }
  if (q.industri) {
    where.industri = { contains: q.industri, mode: 'insensitive' };
  }
  if (q.tipeBisnis) where.tipeBisnis = q.tipeBisnis;
  if (q.isOnline !== undefined) where.isOnline = q.isOnline;

  if (q.search) {
    const searchClause = {
      OR: [
        { nama: { contains: q.search, mode: 'insensitive' as const } },
        { deskripsi: { contains: q.search, mode: 'insensitive' as const } },
        { industri: { contains: q.search, mode: 'insensitive' as const } },
        { owner: { namaLengkap: { contains: q.search, mode: 'insensitive' as const } } },
      ],
    };
    Object.assign(where, searchClause);
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

// Public detail. Hanya yg isActive=true visible (kecuali caller adalah owner).
meLocalMarketRouter.get('/:id', async (req, res) => {
  if (!req.user) throw Unauthorized();
  const biz = await prisma.localBusiness.findUnique({
    where: { id: req.params.id },
    include: { owner: { select: ownerLite } },
  });
  if (!biz) throw NotFound('Bisnis tidak ditemukan');
  const isOwner = biz.ownerJemaatId === req.user.jemaatId;
  if (!biz.isActive && !isOwner) {
    throw NotFound('Bisnis tidak ditemukan'); // sembunyikan keberadaannya
  }
  res.json({ success: true, data: biz });
});
