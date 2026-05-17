import { Router } from 'express';
import { prisma } from '@ecc/database';
import {
  createTipeRelasiSchema,
  updateTipeRelasiSchema,
  createJemaatRelasiSchema,
  paginationQuerySchema,
} from '@ecc/shared-types';
import { NotFound } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';

export const keluargaRouter = Router();

// ===== Tipe Relasi Keluarga (master) =====
keluargaRouter.get('/tipe', async (req, res) => {
  const q = paginationQuerySchema.parse(req.query);
  const where = q.search
    ? { nama: { contains: q.search, mode: 'insensitive' as const } }
    : {};
  const [data, total] = await Promise.all([
    prisma.tipeRelasiKeluarga.findMany({
      where,
      skip: (q.page - 1) * q.limit,
      take: q.limit,
      orderBy: { [q.sortBy ?? 'nama']: q.sortOrder },
    }),
    prisma.tipeRelasiKeluarga.count({ where }),
  ]);
  res.json({
    success: true,
    data,
    meta: { page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit) },
  });
});

keluargaRouter.post('/tipe', async (req, res) => {
  const input = createTipeRelasiSchema.parse(req.body);
  const created = await prisma.tipeRelasiKeluarga.create({ data: input });
  audit(req, { action: 'CREATE', resource: 'tipe_relasi_keluarga', resourceId: created.id, resourceLabel: created.nama, after: created });
  res.status(201).json({ success: true, data: created });
});

keluargaRouter.patch('/tipe/:id', async (req, res) => {
  const input = updateTipeRelasiSchema.parse(req.body);
  const before = await prisma.tipeRelasiKeluarga.findUnique({ where: { id: req.params.id } });
  if (!before) throw NotFound('Tipe relasi tidak ditemukan');
  const updated = await prisma.tipeRelasiKeluarga.update({ where: { id: req.params.id }, data: input });
  audit(req, { action: 'UPDATE', resource: 'tipe_relasi_keluarga', resourceId: updated.id, resourceLabel: updated.nama, before, after: updated });
  res.json({ success: true, data: updated });
});

keluargaRouter.delete('/tipe/:id', async (req, res) => {
  const before = await prisma.tipeRelasiKeluarga.findUnique({ where: { id: req.params.id } });
  if (!before) throw NotFound('Tipe relasi tidak ditemukan');
  await prisma.tipeRelasiKeluarga.delete({ where: { id: req.params.id } });
  audit(req, { action: 'DELETE', resource: 'tipe_relasi_keluarga', resourceId: before.id, resourceLabel: before.nama, before });
  res.status(204).end();
});

// ===== Jemaat Relasi (assignment, satu arah, bisa di-delete) =====
keluargaRouter.get('/relasi/jemaat/:jemaatId', async (req, res) => {
  const data = await prisma.jemaatRelasi.findMany({
    where: { jemaatId: req.params.jemaatId },
    include: { jemaatTerkait: true, tipeRelasi: true },
  });
  res.json({ success: true, data });
});

keluargaRouter.post('/relasi', async (req, res) => {
  const input = createJemaatRelasiSchema.parse(req.body);
  const created = await prisma.jemaatRelasi.create({
    data: input,
    include: { jemaat: { select: { namaLengkap: true } }, jemaatTerkait: { select: { namaLengkap: true } }, tipeRelasi: true },
  });
  const label = `${created.jemaat.namaLengkap} → ${created.jemaatTerkait.namaLengkap} (${created.tipeRelasi.nama})`;
  audit(req, { action: 'CREATE', resource: 'jemaat_relasi', resourceId: created.id, resourceLabel: label, after: created });
  res.status(201).json({ success: true, data: created });
});

keluargaRouter.delete('/relasi/:id', async (req, res) => {
  const before = await prisma.jemaatRelasi.findUnique({
    where: { id: req.params.id },
    include: { jemaat: { select: { namaLengkap: true } }, jemaatTerkait: { select: { namaLengkap: true } }, tipeRelasi: true },
  });
  if (!before) throw NotFound('Relasi tidak ditemukan');
  await prisma.jemaatRelasi.delete({ where: { id: req.params.id } });
  const label = `${before.jemaat.namaLengkap} → ${before.jemaatTerkait.namaLengkap} (${before.tipeRelasi.nama})`;
  audit(req, { action: 'DELETE', resource: 'jemaat_relasi', resourceId: before.id, resourceLabel: label, before });
  res.status(204).end();
});
