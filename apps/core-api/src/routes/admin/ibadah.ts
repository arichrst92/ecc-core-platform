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
import { audit } from '../../lib/audit.js';

export const ibadahRouter = Router();

// ===== Kategori Ibadah =====
ibadahRouter.get('/kategori', async (req, res) => {
  const q = paginationQuerySchema.parse(req.query);
  const where = q.search
    ? { nama: { contains: q.search, mode: 'insensitive' as const } }
    : {};
  const [data, total] = await Promise.all([
    prisma.kategoriIbadah.findMany({
      where,
      skip: (q.page - 1) * q.limit,
      take: q.limit,
      orderBy: { [q.sortBy ?? 'nama']: q.sortOrder },
    }),
    prisma.kategoriIbadah.count({ where }),
  ]);
  res.json({
    success: true,
    data,
    meta: { page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit) },
  });
});

ibadahRouter.post('/kategori', async (req, res) => {
  const input = createKategoriIbadahSchema.parse(req.body);
  const created = await prisma.kategoriIbadah.create({ data: input });
  audit(req, { action: 'CREATE', resource: 'kategori_ibadah', resourceId: created.id, resourceLabel: created.nama, after: created });
  res.status(201).json({ success: true, data: created });
});

ibadahRouter.patch('/kategori/:id', async (req, res) => {
  const input = updateKategoriIbadahSchema.parse(req.body);
  const before = await prisma.kategoriIbadah.findUnique({ where: { id: req.params.id } });
  if (!before) throw NotFound('Kategori tidak ditemukan');
  const updated = await prisma.kategoriIbadah.update({ where: { id: req.params.id }, data: input });
  audit(req, { action: 'UPDATE', resource: 'kategori_ibadah', resourceId: updated.id, resourceLabel: updated.nama, before, after: updated });
  res.json({ success: true, data: updated });
});

ibadahRouter.delete('/kategori/:id', async (req, res) => {
  const before = await prisma.kategoriIbadah.findUnique({ where: { id: req.params.id } });
  if (!before) throw NotFound('Kategori tidak ditemukan');
  await prisma.kategoriIbadah.delete({ where: { id: req.params.id } });
  audit(req, { action: 'DELETE', resource: 'kategori_ibadah', resourceId: before.id, resourceLabel: before.nama, before });
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
  audit(req, { action: 'CREATE', resource: 'ibadah', resourceId: created.id, resourceLabel: created.nama, after: created });
  res.status(201).json({ success: true, data: created });
});

ibadahRouter.patch('/:id', async (req, res) => {
  const input = updateIbadahSchema.parse(req.body);
  const data = {
    ...input,
    tanggalMulai: input.tanggalMulai ? new Date(input.tanggalMulai) : undefined,
  };
  const before = await prisma.ibadah.findUnique({ where: { id: req.params.id } });
  if (!before) throw NotFound('Ibadah tidak ditemukan');
  const updated = await prisma.ibadah.update({ where: { id: req.params.id }, data });
  audit(req, { action: 'UPDATE', resource: 'ibadah', resourceId: updated.id, resourceLabel: updated.nama, before, after: updated });
  res.json({ success: true, data: updated });
});

ibadahRouter.delete('/:id', async (req, res) => {
  const before = await prisma.ibadah.findUnique({ where: { id: req.params.id } });
  if (!before) throw NotFound('Ibadah tidak ditemukan');
  await prisma.ibadah.delete({ where: { id: req.params.id } });
  audit(req, { action: 'DELETE', resource: 'ibadah', resourceId: before.id, resourceLabel: before.nama, before });
  res.status(204).end();
});
