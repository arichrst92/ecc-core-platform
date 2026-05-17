import { Router } from 'express';
import { prisma } from '@ecc/database';
import {
  createSinodeSchema,
  updateSinodeSchema,
  paginationQuerySchema,
} from '@ecc/shared-types';
import { NotFound } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';

export const sinodeRouter = Router();

sinodeRouter.get('/', async (req, res) => {
  const q = paginationQuerySchema.parse(req.query);
  const where = q.search
    ? { OR: [{ nama: { contains: q.search, mode: 'insensitive' as const } }, { kode: { contains: q.search.toUpperCase() } }] }
    : {};
  const [data, total] = await Promise.all([
    prisma.sinode.findMany({
      where,
      skip: (q.page - 1) * q.limit,
      take: q.limit,
      orderBy: { [q.sortBy ?? 'nama']: q.sortOrder },
    }),
    prisma.sinode.count({ where }),
  ]);
  res.json({
    success: true,
    data,
    meta: { page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit) },
  });
});

sinodeRouter.get('/:id', async (req, res) => {
  const item = await prisma.sinode.findUnique({
    where: { id: req.params.id },
    include: { cabangGereja: true },
  });
  if (!item) throw NotFound('Sinode tidak ditemukan');
  res.json({ success: true, data: item });
});

sinodeRouter.post('/', async (req, res) => {
  const input = createSinodeSchema.parse(req.body);
  const created = await prisma.sinode.create({ data: input });
  audit(req, { action: 'CREATE', resource: 'sinode', resourceId: created.id, resourceLabel: created.nama, after: created });
  res.status(201).json({ success: true, data: created });
});

sinodeRouter.patch('/:id', async (req, res) => {
  const input = updateSinodeSchema.parse(req.body);
  const before = await prisma.sinode.findUnique({ where: { id: req.params.id } });
  if (!before) throw NotFound('Sinode tidak ditemukan');
  const updated = await prisma.sinode.update({ where: { id: req.params.id }, data: input });
  audit(req, { action: 'UPDATE', resource: 'sinode', resourceId: updated.id, resourceLabel: updated.nama, before, after: updated });
  res.json({ success: true, data: updated });
});

sinodeRouter.delete('/:id', async (req, res) => {
  const before = await prisma.sinode.findUnique({ where: { id: req.params.id } });
  if (!before) throw NotFound('Sinode tidak ditemukan');
  await prisma.sinode.delete({ where: { id: req.params.id } });
  audit(req, { action: 'DELETE', resource: 'sinode', resourceId: before.id, resourceLabel: before.nama, before });
  res.status(204).end();
});
