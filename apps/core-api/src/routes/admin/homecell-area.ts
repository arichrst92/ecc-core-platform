import { Router } from 'express';
import { prisma, type Prisma } from '@ecc/database';
import {
  createHomecellAreaSchema,
  updateHomecellAreaSchema,
  paginationQuerySchema,
} from '@ecc/shared-types';
import { BadRequest, NotFound } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { assertPenggembalaanRole, PENGGEMBALAAN } from '../../lib/homecell-pic.js';

export const homecellAreaRouter = Router();

// ===== List =====
homecellAreaRouter.get('/', async (req, res) => {
  const q = paginationQuerySchema.parse(req.query);
  const cabangId = typeof req.query.cabangId === 'string' ? req.query.cabangId : undefined;
  const sinodeId = typeof req.query.sinodeId === 'string' ? req.query.sinodeId : undefined;

  const where: Prisma.HomecellAreaWhereInput = {};
  if (q.search) where.nama = { contains: q.search, mode: 'insensitive' };
  if (cabangId) where.cabangId = cabangId;
  if (sinodeId) where.cabang = { sinodeId };

  const [rows, total] = await Promise.all([
    prisma.homecellArea.findMany({
      where,
      skip: (q.page - 1) * q.limit,
      take: q.limit,
      orderBy: { [q.sortBy ?? 'nama']: q.sortOrder },
      include: {
        cabang: { select: { id: true, nama: true, kode: true } },
        picJemaat: { select: { id: true, namaLengkap: true, fotoUrl: true } },
        _count: { select: { homecells: true } },
      },
    }),
    prisma.homecellArea.count({ where }),
  ]);

  const data = rows.map((r) => ({
    ...r,
    homecellCount: r._count.homecells,
  }));

  res.json({
    success: true,
    data,
    meta: { page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit) },
  });
});

// ============================================================
// List homecells per area — mobile PIC area flow.
// ============================================================
// Mobile PIC area buka detail area → tampil SEMUA homecell di area itu,
// termasuk yang user-nya bukan PIC homecell-nya. Endpoint detail area
// (GET /:id) sudah include `homecells[]` tapi response shape-nya lebih
// untuk admin (include sinodeId di cabang, dll). Endpoint ini khusus
// untuk list homecells per area dengan shape yang ringkas untuk mobile.
//
// Authorization: PIC area atau admin. Saat ini permissive — semua user
// yang punya akses /admin/* di-allow (RBAC strict via menu access nanti).
homecellAreaRouter.get('/:id/homecells', async (req, res) => {
  const area = await prisma.homecellArea.findUnique({
    where: { id: req.params.id },
    select: { id: true },
  });
  if (!area) throw NotFound('Homecell Area tidak ditemukan');

  const data = await prisma.homecell.findMany({
    where: { areaId: area.id, isActive: true },
    orderBy: { nama: 'asc' },
    include: {
      picJemaat: { select: { id: true, namaLengkap: true, fotoUrl: true, noHp: true } },
      _count: { select: { members: { where: { isActive: true } } } },
    },
  });

  const result = data.map((hc) => ({
    id: hc.id,
    nama: hc.nama,
    alamat: hc.alamat,
    hari: hc.hari,
    jam: hc.jam,
    isActive: hc.isActive,
    picJemaat: hc.picJemaat,
    memberCount: hc._count.members,
  }));

  res.json({ success: true, data: result });
});

// ===== Detail =====
homecellAreaRouter.get('/:id', async (req, res) => {
  const item = await prisma.homecellArea.findUnique({
    where: { id: req.params.id },
    include: {
      cabang: { select: { id: true, nama: true, kode: true, sinodeId: true } },
      picJemaat: { select: { id: true, namaLengkap: true, fotoUrl: true, noHp: true } },
      homecells: {
        orderBy: { nama: 'asc' },
        include: {
          picJemaat: { select: { id: true, namaLengkap: true } },
          _count: { select: { members: { where: { isActive: true } } } },
        },
      },
    },
  });
  if (!item) throw NotFound('Homecell Area tidak ditemukan');
  res.json({ success: true, data: item });
});

// ===== Create =====
homecellAreaRouter.post('/', async (req, res) => {
  const input = createHomecellAreaSchema.parse(req.body);
  // Validasi PIC: harus Zone Leader
  if (input.picJemaatId) {
    await assertPenggembalaanRole(input.picJemaatId, PENGGEMBALAAN.ZONE_LEADER);
  }
  const created = await prisma.homecellArea.create({ data: input });
  audit(req, {
    action: 'CREATE',
    resource: 'homecell_area',
    resourceId: created.id,
    resourceLabel: created.nama,
    after: created,
  });
  res.status(201).json({ success: true, data: created });
});

// ===== Update =====
homecellAreaRouter.patch('/:id', async (req, res) => {
  const input = updateHomecellAreaSchema.parse(req.body);
  if (input.picJemaatId) {
    await assertPenggembalaanRole(input.picJemaatId, PENGGEMBALAAN.ZONE_LEADER);
  }
  const before = await prisma.homecellArea.findUnique({ where: { id: req.params.id } });
  if (!before) throw NotFound('Homecell Area tidak ditemukan');
  const updated = await prisma.homecellArea.update({ where: { id: req.params.id }, data: input });
  audit(req, {
    action: 'UPDATE',
    resource: 'homecell_area',
    resourceId: updated.id,
    resourceLabel: updated.nama,
    before,
    after: updated,
  });
  res.json({ success: true, data: updated });
});

// ===== Delete =====
homecellAreaRouter.delete('/:id', async (req, res) => {
  const before = await prisma.homecellArea.findUnique({
    where: { id: req.params.id },
    include: { _count: { select: { homecells: true } } },
  });
  if (!before) throw NotFound('Homecell Area tidak ditemukan');
  if (before._count.homecells > 0) {
    throw BadRequest(`Area masih punya ${before._count.homecells} homecell — hapus dulu`);
  }
  await prisma.homecellArea.delete({ where: { id: req.params.id } });
  audit(req, {
    action: 'DELETE',
    resource: 'homecell_area',
    resourceId: before.id,
    resourceLabel: before.nama,
    before,
  });
  res.status(204).end();
});
