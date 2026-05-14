import { Router } from 'express';
import { prisma } from '@ecc/database';
import {
  createTipeRelasiSchema,
  updateTipeRelasiSchema,
  createJemaatRelasiSchema,
} from '@ecc/shared-types';

export const keluargaRouter = Router();

// ===== Tipe Relasi Keluarga (master) =====
keluargaRouter.get('/tipe', async (_req, res) => {
  const data = await prisma.tipeRelasiKeluarga.findMany({ orderBy: { nama: 'asc' } });
  res.json({ success: true, data });
});

keluargaRouter.post('/tipe', async (req, res) => {
  const input = createTipeRelasiSchema.parse(req.body);
  const created = await prisma.tipeRelasiKeluarga.create({ data: input });
  res.status(201).json({ success: true, data: created });
});

keluargaRouter.patch('/tipe/:id', async (req, res) => {
  const input = updateTipeRelasiSchema.parse(req.body);
  const updated = await prisma.tipeRelasiKeluarga.update({ where: { id: req.params.id }, data: input });
  res.json({ success: true, data: updated });
});

keluargaRouter.delete('/tipe/:id', async (req, res) => {
  await prisma.tipeRelasiKeluarga.delete({ where: { id: req.params.id } });
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
  const created = await prisma.jemaatRelasi.create({ data: input });
  res.status(201).json({ success: true, data: created });
});

keluargaRouter.delete('/relasi/:id', async (req, res) => {
  await prisma.jemaatRelasi.delete({ where: { id: req.params.id } });
  res.status(204).end();
});
