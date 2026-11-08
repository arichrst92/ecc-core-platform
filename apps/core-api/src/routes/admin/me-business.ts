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
import { prisma, Prisma } from '@ecc/database';
import {
  createLocalBusinessSchema,
  updateLocalBusinessSchema,
  browseLocalMarketQuerySchema,
  createLocalItemSchema,
  updateLocalItemSchema,
  socialUsernamesToLinks,
  type SocialUsernames,
} from '@ecc/shared-types';
import { z } from 'zod';
import { serializeItem, publicItemsOf, localMarketMaxItems, hitView } from '../../lib/local-market.js';
import { BadRequest, Forbidden, NotFound, Unauthorized } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { flexImageUpload } from '../../lib/image-upload.js';
import { flexPdfUpload } from '../../lib/pdf-upload.js';
import {
  saveBusinessHero,
  deleteBusinessHero,
  saveBusinessLogo,
  deleteBusinessLogo,
  saveBusinessProfilePdf,
  deleteBusinessProfilePdf,
  saveLocalItemPhoto,
  deleteLocalItemPhoto,
} from '../../lib/storage.js';

/** WA admin (E.164) → link wa.me (dipakai app lama & web sebagai whatsappUrl). */
const waLink = (n: string | null | undefined) => (n ? `https://wa.me/${n.replace(/\D/g, '')}` : null);

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
      whatsappUrl: input.waAdmin ? waLink(input.waAdmin) : input.whatsappUrl,
      socialLinks: input.socialUsernames ? socialUsernamesToLinks(input.socialUsernames as SocialUsernames) : input.socialLinks ?? [],
      waAdmin: input.waAdmin ?? null,
      email: input.email ?? null,
      socialUsernames: input.socialUsernames ?? undefined,
      marketplaceLinks: input.marketplaceLinks && Object.keys(input.marketplaceLinks).length ? input.marketplaceLinks : undefined,
      mapsUrl: input.mapsUrl ?? null,
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
  // 2.4.7 — kontak admin & username sosmed (URL sosmed + link WA disinkronkan untuk app lama).
  if (input.waAdmin !== undefined) {
    data.waAdmin = input.waAdmin;
    data.whatsappUrl = waLink(input.waAdmin);
  }
  if (input.email !== undefined) data.email = input.email;
  if (input.marketplaceLinks !== undefined) {
    data.marketplaceLinks = Object.keys(input.marketplaceLinks).length ? input.marketplaceLinks : Prisma.DbNull;
  }
  if (input.mapsUrl !== undefined) data.mapsUrl = input.mapsUrl;
  if (input.socialUsernames !== undefined) {
    data.socialUsernames = input.socialUsernames;
    data.socialLinks = socialUsernamesToLinks(input.socialUsernames as SocialUsernames);
  }

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
  if (biz.logoUrl) {
    await deleteBusinessLogo(biz.id).catch(() => undefined);
  }
  if (biz.companyProfileUrl) {
    await deleteBusinessProfilePdf(biz.id).catch(() => undefined);
  }
  const items = await prisma.localBusinessItem.findMany({ where: { businessId: biz.id }, select: { fotoUrls: true } });
  for (const it of items) for (const u of (it.fotoUrls as string[]) ?? []) await deleteLocalItemPhoto(u).catch(() => undefined);
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
  // Note: dengan middleware di chain, TS infer req.params.id = string|undefined
  // (ParamsDictionary), beda dengan handler tanpa middleware yg dapat string.
  const id = req.params.id;
  if (!id) throw BadRequest('Path param :id wajib.');
  const biz = await findMyBusinessOrThrow(id, jemaatId);
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
//  Logo upload / clear — auto crop ke square 512x512.
// ============================================================
meBusinessRouter.post('/:id/logo', flexImageUpload(), async (req, res) => {
  const jemaatId = assertJemaatId(req);
  const id = req.params.id;
  if (!id) throw BadRequest('Path param :id wajib.');
  const biz = await findMyBusinessOrThrow(id, jemaatId);
  if (!req.file) throw BadRequest('File logo wajib (multipart).');

  const logoUrl = await saveBusinessLogo(biz.id, req.file.buffer);
  const updated = await prisma.localBusiness.update({
    where: { id: biz.id },
    data: { logoUrl },
    select: { id: true, logoUrl: true },
  });
  audit(req, {
    action: 'UPLOAD_PHOTO',
    resource: 'local_business',
    resourceId: biz.id,
    resourceLabel: `${biz.nama} (logo)`,
    metadata: { kind: 'local-business-logo' },
  });
  res.json({ success: true, data: updated });
});

meBusinessRouter.delete('/:id/logo', async (req, res) => {
  const jemaatId = assertJemaatId(req);
  const biz = await findMyBusinessOrThrow(req.params.id, jemaatId);
  if (!biz.logoUrl) {
    return res.status(204).end();
  }
  await deleteBusinessLogo(biz.id);
  await prisma.localBusiness.update({
    where: { id: biz.id },
    data: { logoUrl: null },
  });
  audit(req, {
    action: 'DELETE',
    resource: 'local_business',
    resourceId: biz.id,
    resourceLabel: `${biz.nama} (logo cleared)`,
  });
  res.status(204).end();
});

// ============================================================
//  Company profile PDF upload / clear
// ============================================================
meBusinessRouter.post('/:id/profile-pdf', flexPdfUpload(), async (req, res) => {
  const jemaatId = assertJemaatId(req);
  // Note: dengan middleware di chain, TS infer req.params.id = string|undefined.
  const id = req.params.id;
  if (!id) throw BadRequest('Path param :id wajib.');
  const biz = await findMyBusinessOrThrow(id, jemaatId);
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

  // isActive=true → bisnis aktif. owner.isActive=true → jangan tampilkan
  // bisnis dari owner yg sudah self-deactivate (consistent dgn delete-account).
  const where: any = { isActive: true, owner: { isActive: true } };
  if (q.cabangId) {
    // Merge owner filter dengan cabang filter.
    where.owner = { isActive: true, cabangId: q.cabangId };
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

// Public detail. Hanya yg isActive=true (+ owner aktif) visible — kecuali
// caller adalah owner sendiri.
meLocalMarketRouter.get('/:id', async (req, res) => {
  if (!req.user) throw Unauthorized();
  const biz = await prisma.localBusiness.findUnique({
    where: { id: req.params.id },
    include: { owner: { select: ownerLite } },
  });
  if (!biz) throw NotFound('Bisnis tidak ditemukan');
  const isOwner = biz.ownerJemaatId === req.user.jemaatId;
  // Cek owner.isActive — Prisma return owner relation, butuh refetch atau
  // include `isActive`. Sementara owner select tidak include isActive,
  // pakai query terpisah ringan.
  const ownerActive = await prisma.jemaat.findUnique({
    where: { id: biz.ownerJemaatId },
    select: { isActive: true },
  });
  const hidden = !biz.isActive || ownerActive?.isActive === false;
  if (hidden && !isOwner) {
    throw NotFound('Bisnis tidak ditemukan'); // sembunyikan keberadaannya
  }
  if (!isOwner && req.user.jemaatId) void hitView('biz', biz.id, `j:${req.user.jemaatId}`);
  res.json({ success: true, data: { ...biz, items: await publicItemsOf(biz.id) } });
});

// POST /admin/me/local-market/:id/item/:itemId/view — hitung kunjungan item (app 2.4.7).
meLocalMarketRouter.post('/:id/item/:itemId/view', async (req, res) => {
  if (!req.user) throw Unauthorized();
  const { id = '', itemId = '' } = req.params as { id?: string; itemId?: string };
  const item = await prisma.localBusinessItem.findFirst({
    where: { id: itemId, businessId: id },
    select: { id: true, business: { select: { ownerJemaatId: true } } },
  });
  if (!item) throw NotFound('Item tidak ditemukan');
  if (item.business.ownerJemaatId !== req.user.jemaatId && req.user.jemaatId) {
    await hitView('item', item.id, `j:${req.user.jemaatId}`);
  }
  res.json({ success: true, data: { ok: true } });
});

// ============================================================
//  KATALOG (2.4.7) — /admin/me/businesses/:id/items…
// ============================================================
const ITEM_FOTO_MAX = 4;

async function findMyItemOrThrow(bizId: string, itemId: string, jemaatId: string) {
  await findMyBusinessOrThrow(bizId, jemaatId);
  const item = await prisma.localBusinessItem.findFirst({ where: { id: itemId, businessId: bizId } });
  if (!item) throw NotFound('Item tidak ditemukan');
  return item;
}

meBusinessRouter.get('/:id/items', async (req, res) => {
  const jemaatId = assertJemaatId(req);
  const biz = await findMyBusinessOrThrow(req.params.id, jemaatId);
  const [rows, max] = await Promise.all([
    prisma.localBusinessItem.findMany({ where: { businessId: biz.id }, orderBy: [{ urutan: 'asc' }, { createdAt: 'asc' }] }),
    localMarketMaxItems(),
  ]);
  res.json({ success: true, data: { items: rows.map(serializeItem), max } });
});

meBusinessRouter.post('/:id/items', async (req, res) => {
  const jemaatId = assertJemaatId(req);
  const biz = await findMyBusinessOrThrow(req.params.id, jemaatId);
  const input = createLocalItemSchema.parse(req.body ?? {});
  const [count, max, last] = await Promise.all([
    prisma.localBusinessItem.count({ where: { businessId: biz.id } }),
    localMarketMaxItems(),
    prisma.localBusinessItem.findFirst({ where: { businessId: biz.id }, orderBy: { urutan: 'desc' }, select: { urutan: true } }),
  ]);
  if (count >= max) throw BadRequest(`Katalog sudah mencapai batas ${max} item.`);
  const created = await prisma.localBusinessItem.create({
    data: {
      businessId: biz.id,
      jenis: input.jenis,
      nama: input.nama,
      deskripsi: input.deskripsi ?? null,
      hargaTipe: input.hargaTipe,
      harga: input.hargaTipe === 'NEGO' ? null : input.harga ?? null,
      mataUang: input.mataUang,
      satuan: input.hargaTipe === 'NEGO' ? null : input.satuan ?? null,
      isActive: input.isActive ?? true,
      ...(input.marketplaceLinks && Object.keys(input.marketplaceLinks).length ? { marketplaceLinks: input.marketplaceLinks } : {}),
      urutan: (last?.urutan ?? 0) + 1,
    },
  });
  audit(req, { action: 'CREATE', resource: 'local_business_item', resourceId: created.id, resourceLabel: `${biz.nama} — ${created.nama}` });
  res.status(201).json({ success: true, data: serializeItem(created) });
});

meBusinessRouter.patch('/:id/items/:itemId', async (req, res) => {
  const jemaatId = assertJemaatId(req);
  const before = await findMyItemOrThrow(req.params.id, req.params.itemId, jemaatId);
  const input = updateLocalItemSchema.parse(req.body ?? {});
  const tipe = input.hargaTipe ?? before.hargaTipe;
  const harga = input.harga !== undefined ? input.harga : before.harga == null ? null : Number(before.harga);
  if (tipe !== 'NEGO' && !(harga != null && harga > 0)) throw BadRequest('Isi harga, atau pilih "By agreement".');
  const updated = await prisma.localBusinessItem.update({
    where: { id: before.id },
    data: {
      ...(input.jenis !== undefined ? { jenis: input.jenis } : {}),
      ...(input.nama !== undefined ? { nama: input.nama } : {}),
      ...(input.deskripsi !== undefined ? { deskripsi: input.deskripsi } : {}),
      hargaTipe: tipe,
      harga: tipe === 'NEGO' ? null : harga,
      ...(input.mataUang !== undefined ? { mataUang: input.mataUang } : {}),
      ...(tipe === 'NEGO' ? { satuan: null } : input.satuan !== undefined ? { satuan: input.satuan } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.marketplaceLinks !== undefined
        ? { marketplaceLinks: Object.keys(input.marketplaceLinks).length ? input.marketplaceLinks : Prisma.DbNull }
        : {}),
    },
  });
  audit(req, { action: 'UPDATE', resource: 'local_business_item', resourceId: updated.id, resourceLabel: updated.nama, before, after: updated });
  res.json({ success: true, data: serializeItem(updated) });
});

meBusinessRouter.delete('/:id/items/:itemId', async (req, res) => {
  const jemaatId = assertJemaatId(req);
  const item = await findMyItemOrThrow(req.params.id, req.params.itemId, jemaatId);
  await prisma.localBusinessItem.delete({ where: { id: item.id } });
  for (const u of (item.fotoUrls as string[]) ?? []) await deleteLocalItemPhoto(u).catch(() => undefined);
  audit(req, { action: 'DELETE', resource: 'local_business_item', resourceId: item.id, resourceLabel: item.nama, before: item });
  res.json({ success: true, data: { id: item.id } });
});

// Urutan katalog: { ids: [itemId…] } (urutan baru dari atas).
meBusinessRouter.put('/:id/items-order', async (req, res) => {
  const jemaatId = assertJemaatId(req);
  const biz = await findMyBusinessOrThrow(req.params.id, jemaatId);
  const { ids } = z.object({ ids: z.array(z.string().uuid()).max(500) }).parse(req.body ?? {});
  await prisma.$transaction(
    ids.map((id, i) => prisma.localBusinessItem.updateMany({ where: { id, businessId: biz.id }, data: { urutan: i + 1 } })),
  );
  res.json({ success: true, data: { ok: true } });
});

// Foto item: tambah (maks. 4, dipotong 3:2) & hapus per URL.
meBusinessRouter.post('/:id/items/:itemId/foto', flexImageUpload(), async (req, res) => {
  const jemaatId = assertJemaatId(req);
  const { id = '', itemId = '' } = req.params as { id?: string; itemId?: string };
  const item = await findMyItemOrThrow(id, itemId, jemaatId);
  if (!req.file) throw BadRequest('File foto wajib (multipart).');
  const urls = ((item.fotoUrls as string[]) ?? []).slice();
  if (urls.length >= ITEM_FOTO_MAX) throw BadRequest(`Maksimal ${ITEM_FOTO_MAX} foto per item.`);
  urls.push(await saveLocalItemPhoto(item.id, req.file.buffer));
  const updated = await prisma.localBusinessItem.update({ where: { id: item.id }, data: { fotoUrls: urls } });
  res.json({ success: true, data: serializeItem(updated) });
});

meBusinessRouter.delete('/:id/items/:itemId/foto', async (req, res) => {
  const jemaatId = assertJemaatId(req);
  const item = await findMyItemOrThrow(req.params.id, req.params.itemId, jemaatId);
  const { url } = z.object({ url: z.string().min(1).max(500) }).parse(req.query);
  const urls = ((item.fotoUrls as string[]) ?? []).filter((u) => u !== url);
  const updated = await prisma.localBusinessItem.update({ where: { id: item.id }, data: { fotoUrls: urls } });
  await deleteLocalItemPhoto(url).catch(() => undefined);
  res.json({ success: true, data: serializeItem(updated) });
});
