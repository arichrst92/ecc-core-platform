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
  setMenuAccessSchema,
  updateCanAccessPortalSchema,
  MENU_CATALOG,
} from '@ecc/shared-types';
import { BadRequest, NotFound } from '../../lib/errors.js';
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

// ============================================================
//  Menu Access (RBAC)
// ============================================================
// Endpoint untuk halaman /dashboard/role-access:
//   GET  /admin/role/access/matrix     — list semua role+subrole dgn akses-nya
//   PATCH /admin/role/:id/access/portal  — set canAccessPortal Role
//   PATCH /admin/role/sub/:id/access/portal — set canAccessPortal SubRole
//   PUT  /admin/role/:id/access/menu     — upsert menu access (Role-level)
//   PUT  /admin/role/sub/:id/access/menu — upsert menu access (SubRole-level)

// Full matrix: untuk UI manage page
roleRouter.get('/access/matrix', async (_req, res) => {
  const roles = await prisma.role.findMany({
    orderBy: { nama: 'asc' },
    include: {
      menuAccesses: true,
      subRoles: {
        orderBy: { nama: 'asc' },
        include: { menuAccesses: true },
      },
    },
  });
  res.json({
    success: true,
    data: { roles, menuCatalog: MENU_CATALOG },
  });
});

// PATCH /admin/role/:id/access/portal — toggle canAccessPortal Role
roleRouter.patch('/:id/access/portal', async (req, res) => {
  const input = updateCanAccessPortalSchema.parse(req.body);
  const value = input.canAccessPortal ?? false; // Role tidak nullable, treat null = false
  const before = await prisma.role.findUnique({ where: { id: req.params.id } });
  if (!before) throw NotFound('Role tidak ditemukan');
  const updated = await prisma.role.update({
    where: { id: before.id },
    data: { canAccessPortal: value },
  });
  audit(req, {
    action: 'UPDATE',
    resource: 'role',
    resourceId: updated.id,
    resourceLabel: `${updated.nama} canAccessPortal=${value}`,
    before,
    after: updated,
  });
  res.json({ success: true, data: updated });
});

// PATCH /admin/role/sub/:id/access/portal — SubRole canAccessPortal (nullable)
roleRouter.patch('/sub/:id/access/portal', async (req, res) => {
  const input = updateCanAccessPortalSchema.parse(req.body);
  const before = await prisma.subRole.findUnique({ where: { id: req.params.id } });
  if (!before) throw NotFound('SubRole tidak ditemukan');
  const updated = await prisma.subRole.update({
    where: { id: before.id },
    data: { canAccessPortal: input.canAccessPortal },
  });
  audit(req, {
    action: 'UPDATE',
    resource: 'sub_role',
    resourceId: updated.id,
    resourceLabel: `${updated.nama} canAccessPortal=${input.canAccessPortal}`,
    before,
    after: updated,
  });
  res.json({ success: true, data: updated });
});

// PUT /admin/role/:id/access/menu — upsert RoleMenuAccess
roleRouter.put('/:id/access/menu', async (req, res) => {
  const input = setMenuAccessSchema.parse(req.body);
  const role = await prisma.role.findUnique({ where: { id: req.params.id } });
  if (!role) throw NotFound('Role tidak ditemukan');

  const existing = await prisma.roleMenuAccess.findUnique({
    where: { roleId_menuKey: { roleId: role.id, menuKey: input.menuKey } },
  });

  // Kalau semua level false → hapus row (tidak perlu storage).
  const canRead = input.canRead ?? existing?.canRead ?? false;
  const canWrite = input.canWrite ?? existing?.canWrite ?? false;
  const canDelete = input.canDelete ?? existing?.canDelete ?? false;

  if (!canRead && !canWrite && !canDelete) {
    if (existing) {
      await prisma.roleMenuAccess.delete({ where: { id: existing.id } });
      audit(req, {
        action: 'DELETE',
        resource: 'role_menu_access',
        resourceId: existing.id,
        resourceLabel: `${role.nama}:${input.menuKey}`,
        before: existing,
      });
    }
    res.json({ success: true, data: null });
    return;
  }

  const upserted = await prisma.roleMenuAccess.upsert({
    where: { roleId_menuKey: { roleId: role.id, menuKey: input.menuKey } },
    create: { roleId: role.id, menuKey: input.menuKey, canRead, canWrite, canDelete },
    update: { canRead, canWrite, canDelete },
  });
  audit(req, {
    action: existing ? 'UPDATE' : 'CREATE',
    resource: 'role_menu_access',
    resourceId: upserted.id,
    resourceLabel: `${role.nama}:${input.menuKey} r=${canRead} w=${canWrite} d=${canDelete}`,
    before: existing,
    after: upserted,
  });
  res.json({ success: true, data: upserted });
});

// PUT /admin/role/sub/:id/access/menu — upsert SubRoleMenuAccess
roleRouter.put('/sub/:id/access/menu', async (req, res) => {
  const input = setMenuAccessSchema.parse(req.body);
  const subRole = await prisma.subRole.findUnique({ where: { id: req.params.id } });
  if (!subRole) throw NotFound('SubRole tidak ditemukan');

  const existing = await prisma.subRoleMenuAccess.findUnique({
    where: { subRoleId_menuKey: { subRoleId: subRole.id, menuKey: input.menuKey } },
  });
  const canRead = input.canRead ?? existing?.canRead ?? false;
  const canWrite = input.canWrite ?? existing?.canWrite ?? false;
  const canDelete = input.canDelete ?? existing?.canDelete ?? false;

  if (!canRead && !canWrite && !canDelete) {
    if (existing) {
      await prisma.subRoleMenuAccess.delete({ where: { id: existing.id } });
      audit(req, {
        action: 'DELETE',
        resource: 'sub_role_menu_access',
        resourceId: existing.id,
        resourceLabel: `${subRole.nama}:${input.menuKey}`,
        before: existing,
      });
    }
    res.json({ success: true, data: null });
    return;
  }

  const upserted = await prisma.subRoleMenuAccess.upsert({
    where: { subRoleId_menuKey: { subRoleId: subRole.id, menuKey: input.menuKey } },
    create: { subRoleId: subRole.id, menuKey: input.menuKey, canRead, canWrite, canDelete },
    update: { canRead, canWrite, canDelete },
  });
  audit(req, {
    action: existing ? 'UPDATE' : 'CREATE',
    resource: 'sub_role_menu_access',
    resourceId: upserted.id,
    resourceLabel: `${subRole.nama}:${input.menuKey} r=${canRead} w=${canWrite} d=${canDelete}`,
    before: existing,
    after: upserted,
  });
  res.json({ success: true, data: upserted });
});

