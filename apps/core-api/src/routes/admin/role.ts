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
import { audit } from '../../lib/audit.js';

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
  audit(req, { action: 'CREATE', resource: 'role', resourceId: created.id, resourceLabel: created.nama, after: created });
  res.status(201).json({ success: true, data: created });
});

roleRouter.patch('/:id', async (req, res) => {
  const input = updateRoleSchema.parse(req.body);
  const before = await prisma.role.findUnique({ where: { id: req.params.id } });
  if (!before) throw NotFound('Role tidak ditemukan');
  const updated = await prisma.role.update({ where: { id: req.params.id }, data: input });
  audit(req, { action: 'UPDATE', resource: 'role', resourceId: updated.id, resourceLabel: updated.nama, before, after: updated });
  res.json({ success: true, data: updated });
});

roleRouter.delete('/:id', async (req, res) => {
  const before = await prisma.role.findUnique({ where: { id: req.params.id } });
  if (!before) throw NotFound('Role tidak ditemukan');
  await prisma.role.delete({ where: { id: req.params.id } });
  audit(req, { action: 'DELETE', resource: 'role', resourceId: before.id, resourceLabel: before.nama, before });
  res.status(204).end();
});

// ===== Sub Role =====
roleRouter.post('/sub-role', async (req, res) => {
  const input = createSubRoleSchema.parse(req.body);
  const created = await prisma.subRole.create({ data: input });
  audit(req, { action: 'CREATE', resource: 'sub_role', resourceId: created.id, resourceLabel: created.nama, after: created });
  res.status(201).json({ success: true, data: created });
});

roleRouter.patch('/sub-role/:id', async (req, res) => {
  const input = updateSubRoleSchema.parse(req.body);
  const before = await prisma.subRole.findUnique({ where: { id: req.params.id } });
  if (!before) throw NotFound('Sub-role tidak ditemukan');
  const updated = await prisma.subRole.update({ where: { id: req.params.id }, data: input });
  audit(req, { action: 'UPDATE', resource: 'sub_role', resourceId: updated.id, resourceLabel: updated.nama, before, after: updated });
  res.json({ success: true, data: updated });
});

roleRouter.delete('/sub-role/:id', async (req, res) => {
  const before = await prisma.subRole.findUnique({ where: { id: req.params.id } });
  if (!before) throw NotFound('Sub-role tidak ditemukan');
  await prisma.subRole.delete({ where: { id: req.params.id } });
  audit(req, { action: 'DELETE', resource: 'sub_role', resourceId: before.id, resourceLabel: before.nama, before });
  res.status(204).end();
});

// ===== Sub Role Status =====
roleRouter.post('/sub-role-status', async (req, res) => {
  const input = createSubRoleStatusSchema.parse(req.body);
  const created = await prisma.subRoleStatus.create({ data: input });
  audit(req, { action: 'CREATE', resource: 'sub_role_status', resourceId: created.id, resourceLabel: created.nama, after: created });
  res.status(201).json({ success: true, data: created });
});

roleRouter.patch('/sub-role-status/:id', async (req, res) => {
  const input = updateSubRoleStatusSchema.parse(req.body);
  const before = await prisma.subRoleStatus.findUnique({ where: { id: req.params.id } });
  if (!before) throw NotFound('Status tidak ditemukan');
  const updated = await prisma.subRoleStatus.update({ where: { id: req.params.id }, data: input });
  audit(req, { action: 'UPDATE', resource: 'sub_role_status', resourceId: updated.id, resourceLabel: updated.nama, before, after: updated });
  res.json({ success: true, data: updated });
});

roleRouter.delete('/sub-role-status/:id', async (req, res) => {
  const before = await prisma.subRoleStatus.findUnique({ where: { id: req.params.id } });
  if (!before) throw NotFound('Status tidak ditemukan');
  await prisma.subRoleStatus.delete({ where: { id: req.params.id } });
  audit(req, { action: 'DELETE', resource: 'sub_role_status', resourceId: before.id, resourceLabel: before.nama, before });
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
  const created = await prisma.jemaatRole.create({
    data,
    include: { jemaat: { select: { namaLengkap: true } }, role: true, subRole: true, subRoleStatus: true },
  });
  const label = `${created.jemaat.namaLengkap} as ${created.role.nama}:${created.subRole.nama}${created.subRoleStatus ? `:${created.subRoleStatus.nama}` : ''}`;
  audit(req, { action: 'CREATE', resource: 'jemaat_role', resourceId: created.id, resourceLabel: label, after: created });
  res.status(201).json({ success: true, data: created });
});

roleRouter.patch('/assign/:id', async (req, res) => {
  const input = updateJemaatRoleSchema.parse(req.body);
  const data = {
    ...input,
    tanggalSelesai: input.tanggalSelesai ? new Date(input.tanggalSelesai) : undefined,
  };
  const before = await prisma.jemaatRole.findUnique({
    where: { id: req.params.id },
    include: { jemaat: { select: { namaLengkap: true } }, role: true, subRole: true },
  });
  if (!before) throw NotFound('Penugasan tidak ditemukan');
  const updated = await prisma.jemaatRole.update({ where: { id: req.params.id }, data });
  const label = `${before.jemaat.namaLengkap} as ${before.role.nama}:${before.subRole.nama}`;
  audit(req, { action: 'UPDATE', resource: 'jemaat_role', resourceId: updated.id, resourceLabel: label, before, after: updated });
  res.json({ success: true, data: updated });
});

roleRouter.delete('/assign/:id', async (req, res) => {
  const before = await prisma.jemaatRole.findUnique({
    where: { id: req.params.id },
    include: { jemaat: { select: { namaLengkap: true } }, role: true, subRole: true },
  });
  if (!before) throw NotFound('Penugasan tidak ditemukan');
  await prisma.jemaatRole.delete({ where: { id: req.params.id } });
  const label = `${before.jemaat.namaLengkap} as ${before.role.nama}:${before.subRole.nama}`;
  audit(req, { action: 'DELETE', resource: 'jemaat_role', resourceId: before.id, resourceLabel: label, before });
  res.status(204).end();
});
