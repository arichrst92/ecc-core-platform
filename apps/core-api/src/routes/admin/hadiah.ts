/**
 * Hadiah Katalog CRUD — untuk portal admin master data.
 *
 * Modul 28. Scope: per cabang. Foto pakai upload endpoint standar
 * (upload dulu ke /uploads/... via existing helper, kirim fotoUrl aja).
 */
import { Router } from 'express';
import { prisma, type Prisma } from '@ecc/database';
import {
  createHadiahSchema,
  updateHadiahSchema,
  paginationQuerySchema,
} from '@ecc/shared-types';
import { requireCkids } from '../../middleware/require-menu.js';
import { BadRequest, NotFound } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { flexImageUpload } from '../../lib/image-upload.js';
import { saveHadiahPhoto, deleteHadiahPhoto } from '../../lib/storage.js';

export const hadiahRouter = Router();

// ============================================================
// GET /admin/hadiah — list dengan filter cabang + isActive
// ============================================================
// Terbuka untuk semua user login: app CKids (orang tua) menampilkan katalog
// hadiah cabang anak. Non-fulltimer hanya melihat hadiah AKTIF dari cabang
// yang diminta (read-only). Endpoint lain (CRUD) tetap khusus Fulltimer.
hadiahRouter.get('/', async (req, res) => {
  const isAdmin = req.user?.isFulltimer === true;
  const q = paginationQuerySchema.parse(req.query);
  const cabangId = typeof req.query.cabangId === 'string' ? req.query.cabangId : undefined;
  // `status=aktif|nonaktif` (filter portal) atau `isActive=true|false`.
  const isActive =
    req.query.status === 'aktif'
      ? true
      : req.query.status === 'nonaktif'
        ? false
        : typeof req.query.isActive === 'string'
          ? req.query.isActive === 'true'
          : undefined;
  const search = typeof req.query.search === 'string' ? req.query.search : undefined;

  const where: Prisma.HadiahKatalogWhereInput = { deletedAt: null };
  if (cabangId) where.cabangId = cabangId;
  if (isActive !== undefined) where.isActive = isActive;
  if (!isAdmin) {
    // Jemaat/orang tua: wajib per cabang, hanya hadiah aktif.
    if (!cabangId) {
      res.json({ success: true, data: [], meta: { page: 1, limit: 0, total: 0, totalPages: 0 } });
      return;
    }
    where.isActive = true;
  }
  if (search) where.nama = { contains: search, mode: 'insensitive' };
  // Filter stok: habis (0) · menipis (1–4) · tersedia (>0)
  const stok = typeof req.query.stok === 'string' ? req.query.stok : '';
  if (stok === 'habis') where.stock = { lte: 0 };
  else if (stok === 'menipis') where.stock = { gt: 0, lt: 5 };
  else if (stok === 'tersedia') where.stock = { gt: 0 };
  // Filter harga point
  const minPoint = Number(req.query.minPoint);
  const maxPoint = Number(req.query.maxPoint);
  if (Number.isFinite(minPoint) && minPoint > 0) where.pointCost = { ...(where.pointCost as object), gte: minPoint };
  if (Number.isFinite(maxPoint) && maxPoint > 0) where.pointCost = { ...(where.pointCost as object), lte: maxPoint };

  const page = q.page ?? 1;
  const limit = Math.min(q.limit ?? 20, 100);

  const [items, total] = await Promise.all([
    prisma.hadiahKatalog.findMany({
      where,
      include: { cabang: { select: { id: true, nama: true, kode: true } } },
      orderBy: [{ isActive: 'desc' }, { pointCost: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.hadiahKatalog.count({ where }),
  ]);

  res.json({
    success: true,
    data: items,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

// Endpoint di bawah: Fulltimer, atau menu "Gift Stall (CKids)" —
// lihat detail = read, tambah/ubah/hapus hadiah & foto = write.
const hadiahRead = requireCkids('any', { alsoMenus: ['hadiah'] });
// Tulis: Gift Stall (Ubah), menu portal Katalog Hadiah (Ubah), atau Akses CKids "Kelola Hadiah".
const hadiahWrite = requireCkids(['katalog'], { manage: true, alsoMenus: ['hadiah'] });
hadiahRouter.use((req, res, next) => (req.method === 'GET' ? hadiahRead : hadiahWrite)(req, res, next));

// ============================================================
// GET /admin/hadiah/:id — detail
// ============================================================
hadiahRouter.get('/:id', async (req, res) => {
  const item = await prisma.hadiahKatalog.findUnique({
    where: { id: req.params.id },
    include: {
      cabang: { select: { id: true, nama: true } },
      _count: { select: { redeems: true } },
    },
  });
  if (!item) throw NotFound('Hadiah tidak ditemukan');
  res.json({ success: true, data: item });
});

// ============================================================
// POST /admin/hadiah — create
// ============================================================
hadiahRouter.post('/', async (req, res) => {
  const input = createHadiahSchema.parse(req.body);
  const cabang = await prisma.cabangGereja.findUnique({
    where: { id: input.cabangId },
    select: { id: true, nama: true, isActive: true },
  });
  if (!cabang || !cabang.isActive) throw BadRequest('Cabang tidak valid');

  const created = await prisma.hadiahKatalog.create({ data: input });
  audit(req, {
    action: 'CREATE',
    resource: 'hadiah_katalog',
    resourceId: created.id,
    resourceLabel: `${created.nama} (${created.pointCost} pts, cabang ${cabang.nama})`,
    after: created,
  });
  res.status(201).json({ success: true, data: created });
});

// ============================================================
// PATCH /admin/hadiah/:id — update (kecuali cabangId + stock; stock via /add-stock)
// ============================================================
hadiahRouter.patch('/:id', async (req, res) => {
  const input = updateHadiahSchema.parse(req.body);
  const before = await prisma.hadiahKatalog.findUnique({ where: { id: req.params.id } });
  if (!before || before.deletedAt) throw NotFound('Hadiah tidak ditemukan');

  const updated = await prisma.hadiahKatalog.update({
    where: { id: req.params.id },
    data: input,
  });
  audit(req, {
    action: 'UPDATE',
    resource: 'hadiah_katalog',
    resourceId: updated.id,
    resourceLabel: updated.nama,
    before,
    after: updated,
  });
  res.json({ success: true, data: updated });
});

// ============================================================
// POST /admin/hadiah/:id/photo — upload foto hadiah
// Body: multipart/form-data field 'foto' (or any image field name)
// Return updated hadiah dengan fotoUrl baru.
// ============================================================
hadiahRouter.post('/:id/photo', flexImageUpload(), async (req, res) => {
  const hadiah = await prisma.hadiahKatalog.findUnique({ where: { id: req.params.id } });
  if (!hadiah) throw NotFound('Hadiah tidak ditemukan');
  if (!req.file) throw BadRequest('Upload file foto (field: foto)');

  const fotoUrl = await saveHadiahPhoto(hadiah.id, req.file.buffer);
  const updated = await prisma.hadiahKatalog.update({
    where: { id: hadiah.id },
    data: { fotoUrl },
  });

  audit(req, {
    action: 'UPDATE',
    resource: 'hadiah_katalog',
    resourceId: hadiah.id,
    resourceLabel: `[photo] ${hadiah.nama}`,
    metadata: { fotoUrl, sizeBytes: req.file.size },
  });

  res.json({ success: true, data: updated });
});

// ============================================================
// DELETE /admin/hadiah/:id/photo — hapus foto (kosongkan fotoUrl)
// ============================================================
hadiahRouter.delete('/:id/photo', async (req, res) => {
  const hadiah = await prisma.hadiahKatalog.findUnique({ where: { id: req.params.id } });
  if (!hadiah) throw NotFound('Hadiah tidak ditemukan');

  await deleteHadiahPhoto(hadiah.id);
  const updated = await prisma.hadiahKatalog.update({
    where: { id: hadiah.id },
    data: { fotoUrl: null },
  });

  audit(req, {
    action: 'DELETE',
    resource: 'hadiah_katalog',
    resourceId: hadiah.id,
    resourceLabel: `[photo-delete] ${hadiah.nama}`,
  });

  res.json({ success: true, data: updated });
});

// ============================================================
// DELETE /admin/hadiah/:id — hapus dari katalog.
//   - belum pernah di-redeem → hapus permanen (+ file foto)
//   - punya riwayat redeem   → deletedAt + nonaktif (riwayat point tetap utuh,
//     FK redeem Restrict). Tidak muncul lagi di daftar mana pun.
// Nonaktif sementara tetap lewat toggle Status Aktif.
// ============================================================
hadiahRouter.delete('/:id', async (req, res) => {
  const before = await prisma.hadiahKatalog.findUnique({ where: { id: req.params.id } });
  if (!before || before.deletedAt) throw NotFound('Hadiah tidak ditemukan');
  const redeemCount = await prisma.hadiahRedeem.count({ where: { hadiahId: before.id } });
  if (redeemCount === 0) {
    await prisma.hadiahKatalog.delete({ where: { id: before.id } });
    if (before.fotoUrl) await deleteHadiahPhoto(before.id).catch(() => {});
    audit(req, {
      action: 'DELETE',
      resource: 'hadiah_katalog',
      resourceId: before.id,
      resourceLabel: before.nama,
      before,
    });
    res.json({ success: true, data: { id: before.id, permanent: true }, message: 'Hadiah dihapus' });
    return;
  }
  const updated = await prisma.hadiahKatalog.update({
    where: { id: before.id },
    data: { isActive: false, deletedAt: new Date() },
  });
  audit(req, {
    action: 'DELETE',
    resource: 'hadiah_katalog',
    resourceId: updated.id,
    resourceLabel: `${updated.nama} (riwayat ${redeemCount} redeem disimpan)`,
    before,
    after: updated,
  });
  res.json({ success: true, data: { id: updated.id, permanent: false }, message: 'Hadiah dihapus dari katalog' });
});
