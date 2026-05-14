import { Router } from 'express';
import { prisma } from '@ecc/database';
import {
  createSinodeSchema,
  updateSinodeSchema,
  paginationQuerySchema,
} from '@ecc/shared-types';
import { NotFound } from '../../lib/errors.js';

export const sinodeRouter = Router();

// List dengan pagination
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
  res.status(201).json({ success: true, data: created });
});

sinodeRouter.patch('/:id', async (req, res) => {
  const input = updateSinodeSchema.parse(req.body);
  const updated = await prisma.sinode.update({ where: { id: req.params.id }, data: input });
  res.json({ success: true, data: updated });
});

sinodeRouter.delete('/:id', async (req, res) => {
  await prisma.sinode.delete({ where: { id: req.params.id } });
  res.status(204).end();
});
