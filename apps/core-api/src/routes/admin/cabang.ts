import { Router } from 'express';
import { prisma } from '@ecc/database';
import {
  createCabangSchema,
  updateCabangSchema,
  paginationQuerySchema,
} from '@ecc/shared-types';
import { NotFound } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';

export const cabangRouter = Router();

cabangRouter.get('/', async (req, res) => {
  const q = paginationQuerySchema.parse(req.query);
  const sinodeId = typeof req.query.sinodeId === 'string' ? req.query.sinodeId : undefined;
  const where: any = {};
  if (q.search) where.nama = { contains: q.search, mode: 'insensitive' };
  if (sinodeId) where.sinodeId = sinodeId;

  const [rows, total] = await Promise.all([
    prisma.cabangGereja.findMany({
      where,
      skip: (q.page - 1) * q.limit,
      take: q.limit,
      orderBy: { [q.sortBy ?? 'nama']: q.sortOrder },
      include: {
        sinode: { select: { id: true, nama: true, kode: true } },
        _count: { select: { jemaat: true, ibadah: true } },
      },
    }),
    prisma.cabangGereja.count({ where }),
  ]);
  // Flatten _count → jemaatCount / ibadahCount
  const data = rows.map((c) => {
    const { _count, ...rest } = c;
    return { ...rest, jemaatCount: _count.jemaat, ibadahCount: _count.ibadah };
  });
  res.json({
    success: true,
    data,
    meta: { page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit) },
  });
});

cabangRouter.get('/:id', async (req, res) => {
  const item = await prisma.cabangGereja.findUnique({
    where: { id: req.params.id },
    include: { sinode: true, _count: { select: { jemaat: true, ibadah: true } } },
  });
  if (!item) throw NotFound('Cabang tidak ditemukan');
  res.json({ success: true, data: item });
});

cabangRouter.post('/', async (req, res) => {
  const input = createCabangSchema.parse(req.body);
  const created = await prisma.cabangGereja.create({ data: input });
  audit(req, { action: 'CREATE', resource: 'cabang_gereja', resourceId: created.id, resourceLabel: created.nama, after: created });
  res.status(201).json({ success: true, data: created });
});

cabangRouter.patch('/:id', async (req, res) => {
  const input = updateCabangSchema.parse(req.body);
  const before = await prisma.cabangGereja.findUnique({ where: { id: req.params.id } });
  if (!before) throw NotFound('Cabang tidak ditemukan');
  const updated = await prisma.cabangGereja.update({ where: { id: req.params.id }, data: input });
  audit(req, { action: 'UPDATE', resource: 'cabang_gereja', resourceId: updated.id, resourceLabel: updated.nama, before, after: updated });
  res.json({ success: true, data: updated });
});

cabangRouter.delete('/:id', async (req, res) => {
  const before = await prisma.cabangGereja.findUnique({ where: { id: req.params.id } });
  if (!before) throw NotFound('Cabang tidak ditemukan');
  await prisma.cabangGereja.delete({ where: { id: req.params.id } });
  audit(req, { action: 'DELETE', resource: 'cabang_gereja', resourceId: before.id, resourceLabel: before.nama, before });
  res.status(204).end();
});
