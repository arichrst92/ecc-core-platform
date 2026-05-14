import { Router } from 'express';
import { prisma } from '@ecc/database';
import {
  createRoleSchema,
  updateRoleSchema,
  createSubRoleSchema,
  updateSubRoleSchema,
  createSubRoleStatusSchema,
  updateSubRoleStatusSchema,
  assignJemaatRoleSchema,
  updateJemaatRoleSchema,
} from '@ecc/shared-types';
import { NotFound } from '../../lib/errors.js';

export const roleRouter = Router();

// ===== Role =====
roleRouter.get('/', async (_req, res) => {
  const data = await prisma.role.findMany({
    include: { subRoles: { include: { statuses: true } } },
    orderBy: { nama: 'asc' },
  });
  res.json({ success: true, data });
});

roleRouter.post('/', async (req, res) => {
  const input = createRoleSchema.parse(req.body);
  const created = await prisma.role.create({ data: input });
  res.status(201).json({ success: true, data: created });
});

roleRouter.patch('/:id', async (req, res) => {
  const input = updateRoleSchema.parse(req.body);
  const updated = await prisma.role.update({ where: { id: req.params.id }, data: input });
  res.json({ success: true, data: updated });
});

roleRouter.delete('/:id', async (req, res) => {
  await prisma.role.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

// ===== Sub Role =====
roleRouter.post('/sub-role', async (req, res) => {
  const input = createSubRoleSchema.parse(req.body);
  const created = await prisma.subRole.create({ data: input });
  res.status(201).json({ success: true, data: created });
});

roleRouter.patch('/sub-role/:id', async (req, res) => {
  const input = updateSubRoleSchema.parse(req.body);
  const updated = await prisma.subRole.update({ where: { id: req.params.id }, data: input });
  res.json({ success: true, data: updated });
});

roleRouter.delete('/sub-role/:id', async (req, res) => {
  await prisma.subRole.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

// ===== Sub Role Status =====
roleRouter.post('/sub-role-status', async (req, res) => {
  const input = createSubRoleStatusSchema.parse(req.body);
  const created = await prisma.subRoleStatus.create({ data: input });
  res.status(201).json({ success: true, data: created });
});

roleRouter.patch('/sub-role-status/:id', async (req, res) => {
  const input = updateSubRoleStatusSchema.parse(req.body);
  const updated = await prisma.subRoleStatus.update({ where: { id: req.params.id }, data: input });
  res.json({ success: true, data: updated });
});

roleRouter.delete('/sub-role-status/:id', async (req, res) => {
  await prisma.subRoleStatus.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

// ===== Assignment ke jemaat =====
roleRouter.post('/assign', async (req, res) => {
  const input = assignJemaatRoleSchema.parse(req.body);
  const data = {
    ...input,
    tanggalMulai: input.tanggalMulai ? new Date(input.tanggalMulai) : new Date(),
    subRoleStatusId: input.subRoleStatusId ?? null,
  };
  const created = await prisma.jemaatRole.create({ data });
  res.status(201).json({ success: true, data: created });
});

roleRouter.patch('/assign/:id', async (req, res) => {
  const input = updateJemaatRoleSchema.parse(req.body);
  const data = {
    ...input,
    tanggalSelesai: input.tanggalSelesai ? new Date(input.tanggalSelesai) : undefined,
  };
  const existing = await prisma.jemaatRole.findUnique({ where: { id: req.params.id } });
  if (!existing) throw NotFound('Penugasan tidak ditemukan');
  const updated = await prisma.jemaatRole.update({ where: { id: req.params.id }, data });
  res.json({ success: true, data: updated });
});

roleRouter.delete('/assign/:id', async (req, res) => {
  await prisma.jemaatRole.delete({ where: { id: req.params.id } });
  res.status(204).end();
});
