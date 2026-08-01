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
import { requireFulltimer } from '../../middleware/require-auth.js';
import { BadRequest, NotFound } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';

export const hadiahRouter = Router();
hadiahRouter.use(requireFulltimer);

// ============================================================
// GET /admin/hadiah — list dengan filter cabang + isActive
// ============================================================
hadiahRouter.get('/', async (req, res) => {
  const q = paginationQuerySchema.parse(req.query);
  const cabangId = typeof req.query.cabangId === 'string' ? req.query.cabangId : undefined;
  const isActive =
    typeof req.query.isActive === 'string'
      ? req.query.isActive === 'true'
      : undefined;
  const search = typeof req.query.search === 'string' ? req.query.search : undefined;

  const where: Prisma.HadiahKatalogWhereInput = {};
  if (cabangId) where.cabangId = cabangId;
  if (isActive !== undefined) where.isActive = isActive;
  if (search) where.nama = { contains: search, mode: 'insensitive' };

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
  if (!before) throw NotFound('Hadiah tidak ditemukan');

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
// DELETE /admin/hadiah/:id — soft delete via isActive=false (hard delete
// blocked karena FK redeem)
// ============================================================
hadiahRouter.delete('/:id', async (req, res) => {
  const before = await prisma.hadiahKatalog.findUnique({ where: { id: req.params.id } });
  if (!before) throw NotFound('Hadiah tidak ditemukan');
  const updated = await prisma.hadiahKatalog.update({
    where: { id: req.params.id },
    data: { isActive: false },
  });
  audit(req, {
    action: 'DELETE',
    resource: 'hadiah_katalog',
    resourceId: updated.id,
    resourceLabel: `[deactivate] ${updated.nama}`,
    before,
    after: updated,
  });
  res.json({ success: true, data: updated });
});
