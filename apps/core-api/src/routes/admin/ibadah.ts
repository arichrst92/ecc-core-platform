import { Router } from 'express';
import { prisma } from '@ecc/database';
import {
  createIbadahSchema,
  updateIbadahSchema,
  createKategoriIbadahSchema,
  updateKategoriIbadahSchema,
  paginationQuerySchema,
} from '@ecc/shared-types';
import { NotFound } from '../../lib/errors.js';

export const ibadahRouter = Router();

// ===== Kategori Ibadah =====
ibadahRouter.get('/kategori', async (_req, res) => {
  const data = await prisma.kategoriIbadah.findMany({ orderBy: { nama: 'asc' } });
  res.json({ success: true, data });
});

ibadahRouter.post('/kategori', async (req, res) => {
  const input = createKategoriIbadahSchema.parse(req.body);
  const created = await prisma.kategoriIbadah.create({ data: input });
  res.status(201).json({ success: true, data: created });
});

ibadahRouter.patch('/kategori/:id', async (req, res) => {
  const input = updateKategoriIbadahSchema.parse(req.body);
  const updated = await prisma.kategoriIbadah.update({ where: { id: req.params.id }, data: input });
  res.json({ success: true, data: updated });
});

ibadahRouter.delete('/kategori/:id', async (req, res) => {
  await prisma.kategoriIbadah.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

// ===== Ibadah =====
ibadahRouter.get('/', async (req, res) => {
  const q = paginationQuerySchema.parse(req.query);
  const where = q.search
    ? { nama: { contains: q.search, mode: 'insensitive' as const } }
    : {};
  const [data, total] = await Promise.all([
    prisma.ibadah.findMany({
      where,
      skip: (q.page - 1) * q.limit,
      take: q.limit,
      orderBy: { [q.sortBy ?? 'nama']: q.sortOrder },
      include: { cabang: { select: { id: true, nama: true } }, kategoriIbadah: true },
    }),
    prisma.ibadah.count({ where }),
  ]);
  res.json({
    success: true,
    data,
    meta: { page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit) },
  });
});

ibadahRouter.get('/:id', async (req, res) => {
  const item = await prisma.ibadah.findUnique({
    where: { id: req.params.id },
    include: { cabang: true, kategoriIbadah: true },
  });
  if (!item) throw NotFound('Ibadah tidak ditemukan');
  res.json({ success: true, data: item });
});

ibadahRouter.post('/', async (req, res) => {
  const input = createIbadahSchema.parse(req.body);
  const data = { ...input, tanggalMulai: new Date(input.tanggalMulai) };
  const created = await prisma.ibadah.create({ data });
  res.status(201).json({ success: true, data: created });
});

ibadahRouter.patch('/:id', async (req, res) => {
  const input = updateIbadahSchema.parse(req.body);
  const data = {
    ...input,
    tanggalMulai: input.tanggalMulai ? new Date(input.tanggalMulai) : undefined,
  };
  const updated = await prisma.ibadah.update({ where: { id: req.params.id }, data });
  res.json({ success: true, data: updated });
});

ibadahRouter.delete('/:id', async (req, res) => {
  await prisma.ibadah.delete({ where: { id: req.params.id } });
  res.status(204).end();
});
