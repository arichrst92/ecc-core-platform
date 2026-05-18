import { Router } from 'express';
import { prisma } from '@ecc/database';
import {
  createPelayananSchema,
  updatePelayananSchema,
  createPelayananRoleSchema,
  updatePelayananRoleSchema,
  assignJemaatPelayananSchema,
  updateJemaatPelayananSchema,
  linkIbadahPelayananSchema,
  assignPetugasSchema,
  updatePetugasSchema,
  paginationQuerySchema,
} from '@ecc/shared-types';
import { NotFound, BadRequest } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';

export const pelayananRouter = Router();

// ===== Pelayanan (master) =====

pelayananRouter.get('/', async (req, res) => {
  const q = paginationQuerySchema.parse(req.query);
  const where = q.search
    ? { nama: { contains: q.search, mode: 'insensitive' as const } }
    : {};
  const [data, total] = await Promise.all([
    prisma.pelayanan.findMany({
      where,
      skip: (q.page - 1) * q.limit,
      take: q.limit,
      orderBy: { [q.sortBy ?? 'nama']: q.sortOrder },
      include: {
        roles: { orderBy: { level: 'desc' } },
        _count: { select: { jemaatPelayanan: true, ibadahPelayanan: true } },
      },
    }),
    prisma.pelayanan.count({ where }),
  ]);
  res.json({
    success: true,
    data,
    meta: { page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit) },
  });
});

pelayananRouter.get('/:id', async (req, res) => {
  const item = await prisma.pelayanan.findUnique({
    where: { id: req.params.id },
    include: {
      roles: { orderBy: { level: 'desc' } },
      jemaatPelayanan: {
        where: { isActive: true },
        include: {
          jemaat: { select: { id: true, namaLengkap: true, fotoUrl: true } },
          pelayananRole: true,
        },
      },
      ibadahPelayanan: {
        include: { ibadah: { select: { id: true, nama: true, hari: true, jamMulai: true } } },
      },
    },
  });
  if (!item) throw NotFound('Pelayanan tidak ditemukan');
  res.json({ success: true, data: item });
});

pelayananRouter.post('/', async (req, res) => {
  const input = createPelayananSchema.parse(req.body);
  const created = await prisma.pelayanan.create({ data: input });
  audit(req, {
    action: 'CREATE',
    resource: 'pelayanan',
    resourceId: created.id,
    resourceLabel: created.nama,
    after: created,
  });
  res.status(201).json({ success: true, data: created });
});

pelayananRouter.patch('/:id', async (req, res) => {
  const input = updatePelayananSchema.parse(req.body);
  const before = await prisma.pelayanan.findUnique({ where: { id: req.params.id } });
  if (!before) throw NotFound('Pelayanan tidak ditemukan');
  const updated = await prisma.pelayanan.update({ where: { id: req.params.id }, data: input });
  audit(req, {
    action: 'UPDATE',
    resource: 'pelayanan',
    resourceId: updated.id,
    resourceLabel: updated.nama,
    before,
    after: updated,
  });
  res.json({ success: true, data: updated });
});

pelayananRouter.delete('/:id', async (req, res) => {
  const before = await prisma.pelayanan.findUnique({ where: { id: req.params.id } });
  if (!before) throw NotFound('Pelayanan tidak ditemukan');
  await prisma.pelayanan.delete({ where: { id: req.params.id } });
  audit(req, {
    action: 'DELETE',
    resource: 'pelayanan',
    resourceId: before.id,
    resourceLabel: before.nama,
    before,
  });
  res.status(204).end();
});

// ===== PelayananRole (per-pelayanan) =====

// Flat list semua role lintas pelayanan (untuk page Role Pelayanan).
// Filter: pelayananId (opsional)
pelayananRouter.get('/role', async (req, res) => {
  const q = paginationQuerySchema.parse(req.query);
  const pelayananId = typeof req.query.pelayananId === 'string' ? req.query.pelayananId : undefined;
  const where: any = {};
  if (pelayananId) where.pelayananId = pelayananId;
  if (q.search) where.nama = { contains: q.search, mode: 'insensitive' };

  const [data, total] = await Promise.all([
    prisma.pelayananRole.findMany({
      where,
      skip: (q.page - 1) * q.limit,
      take: q.limit,
      orderBy: [{ pelayanan: { nama: 'asc' } }, { level: 'desc' }, { nama: 'asc' }],
      include: { pelayanan: { select: { id: true, nama: true } } },
    }),
    prisma.pelayananRole.count({ where }),
  ]);
  res.json({
    success: true,
    data,
    meta: { page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit) },
  });
});

pelayananRouter.post('/role', async (req, res) => {
  const input = createPelayananRoleSchema.parse(req.body);
  const created = await prisma.pelayananRole.create({
    data: input,
    include: { pelayanan: { select: { nama: true } } },
  });
  audit(req, {
    action: 'CREATE',
    resource: 'pelayanan_role',
    resourceId: created.id,
    resourceLabel: `${created.pelayanan.nama}:${created.nama}`,
    after: created,
  });
  res.status(201).json({ success: true, data: created });
});

pelayananRouter.patch('/role/:id', async (req, res) => {
  const input = updatePelayananRoleSchema.parse(req.body);
  const before = await prisma.pelayananRole.findUnique({
    where: { id: req.params.id },
    include: { pelayanan: { select: { nama: true } } },
  });
  if (!before) throw NotFound('Pelayanan role tidak ditemukan');
  const updated = await prisma.pelayananRole.update({ where: { id: req.params.id }, data: input });
  audit(req, {
    action: 'UPDATE',
    resource: 'pelayanan_role',
    resourceId: updated.id,
    resourceLabel: `${before.pelayanan.nama}:${updated.nama}`,
    before,
    after: updated,
  });
  res.json({ success: true, data: updated });
});

pelayananRouter.delete('/role/:id', async (req, res) => {
  const before = await prisma.pelayananRole.findUnique({
    where: { id: req.params.id },
    include: { pelayanan: { select: { nama: true } } },
  });
  if (!before) throw NotFound('Pelayanan role tidak ditemukan');
  await prisma.pelayananRole.delete({ where: { id: req.params.id } });
  audit(req, {
    action: 'DELETE',
    resource: 'pelayanan_role',
    resourceId: before.id,
    resourceLabel: `${before.pelayanan.nama}:${before.nama}`,
    before,
  });
  res.status(204).end();
});

// ===== Assign jemaat ke pelayanan =====

// List penugasan untuk 1 jemaat (semua active + history)
pelayananRouter.get('/assign/jemaat/:jemaatId', async (req, res) => {
  const data = await prisma.jemaatPelayanan.findMany({
    where: { jemaatId: req.params.jemaatId },
    orderBy: [{ isActive: 'desc' }, { tanggalMulai: 'desc' }],
    include: {
      pelayanan: { select: { id: true, nama: true } },
      pelayananRole: { select: { id: true, nama: true, level: true } },
    },
  });
  res.json({ success: true, data });
});

pelayananRouter.post('/assign', async (req, res) => {
  const input = assignJemaatPelayananSchema.parse(req.body);
  // Validasi: role harus belong ke pelayanan yang sama
  const role = await prisma.pelayananRole.findUnique({ where: { id: input.pelayananRoleId } });
  if (!role || role.pelayananId !== input.pelayananId) {
    throw BadRequest('Role tidak terkait dengan pelayanan yang dipilih');
  }
  const data = {
    ...input,
    tanggalMulai: input.tanggalMulai ? new Date(input.tanggalMulai) : new Date(),
  };
  const created = await prisma.jemaatPelayanan.create({
    data,
    include: {
      jemaat: { select: { namaLengkap: true } },
      pelayanan: { select: { nama: true } },
      pelayananRole: { select: { nama: true } },
    },
  });
  const label = `${created.jemaat.namaLengkap} as ${created.pelayanan.nama}:${created.pelayananRole.nama}`;
  audit(req, {
    action: 'CREATE',
    resource: 'jemaat_pelayanan',
    resourceId: created.id,
    resourceLabel: label,
    after: created,
  });
  res.status(201).json({ success: true, data: created });
});

pelayananRouter.patch('/assign/:id', async (req, res) => {
  const input = updateJemaatPelayananSchema.parse(req.body);
  const before = await prisma.jemaatPelayanan.findUnique({
    where: { id: req.params.id },
    include: {
      jemaat: { select: { namaLengkap: true } },
      pelayanan: { select: { nama: true } },
    },
  });
  if (!before) throw NotFound('Penugasan tidak ditemukan');
  const data = {
    ...input,
    tanggalSelesai: input.tanggalSelesai ? new Date(input.tanggalSelesai) : undefined,
  };
  const updated = await prisma.jemaatPelayanan.update({ where: { id: req.params.id }, data });
  const label = `${before.jemaat.namaLengkap} as ${before.pelayanan.nama}`;
  audit(req, {
    action: 'UPDATE',
    resource: 'jemaat_pelayanan',
    resourceId: updated.id,
    resourceLabel: label,
    before,
    after: updated,
  });
  res.json({ success: true, data: updated });
});

pelayananRouter.delete('/assign/:id', async (req, res) => {
  const before = await prisma.jemaatPelayanan.findUnique({
    where: { id: req.params.id },
    include: {
      jemaat: { select: { namaLengkap: true } },
      pelayanan: { select: { nama: true } },
    },
  });
  if (!before) throw NotFound('Penugasan tidak ditemukan');
  await prisma.jemaatPelayanan.delete({ where: { id: req.params.id } });
  audit(req, {
    action: 'DELETE',
    resource: 'jemaat_pelayanan',
    resourceId: before.id,
    resourceLabel: `${before.jemaat.namaLengkap} as ${before.pelayanan.nama}`,
    before,
  });
  res.status(204).end();
});

// ===== Link pelayanan ke ibadah =====

// List pelayanan yang melayani di 1 ibadah
pelayananRouter.get('/ibadah-link/ibadah/:ibadahId', async (req, res) => {
  const data = await prisma.ibadahPelayanan.findMany({
    where: { ibadahId: req.params.ibadahId },
    include: { pelayanan: { select: { id: true, nama: true, deskripsi: true } } },
    orderBy: { pelayanan: { nama: 'asc' } },
  });
  res.json({ success: true, data });
});

pelayananRouter.post('/ibadah-link', async (req, res) => {
  const input = linkIbadahPelayananSchema.parse(req.body);
  const created = await prisma.ibadahPelayanan.create({
    data: input,
    include: {
      pelayanan: { select: { nama: true } },
      ibadah: { select: { nama: true } },
    },
  });
  audit(req, {
    action: 'CREATE',
    resource: 'ibadah_pelayanan',
    resourceId: created.id,
    resourceLabel: `${created.pelayanan.nama} → ${created.ibadah.nama}`,
    after: created,
  });
  res.status(201).json({ success: true, data: created });
});

pelayananRouter.delete('/ibadah-link/:id', async (req, res) => {
  const before = await prisma.ibadahPelayanan.findUnique({
    where: { id: req.params.id },
    include: {
      pelayanan: { select: { nama: true } },
      ibadah: { select: { nama: true } },
    },
  });
  if (!before) throw NotFound('Link tidak ditemukan');
  await prisma.ibadahPelayanan.delete({ where: { id: req.params.id } });
  audit(req, {
    action: 'DELETE',
    resource: 'ibadah_pelayanan',
    resourceId: before.id,
    resourceLabel: `${before.pelayanan.nama} → ${before.ibadah.nama}`,
    before,
  });
  res.status(204).end();
});

// ===== Petugas (jemaat yang bertugas di ibadah-pelayanan specific) =====

// List petugas untuk 1 ibadah-pelayanan link
pelayananRouter.get('/ibadah-link/:id/petugas', async (req, res) => {
  const data = await prisma.ibadahPelayananPetugas.findMany({
    where: { ibadahPelayananId: req.params.id },
    orderBy: [{ pelayananRole: { level: 'desc' } }, { jemaat: { namaLengkap: 'asc' } }],
    include: {
      jemaat: { select: { id: true, namaLengkap: true, fotoUrl: true, noHp: true } },
      pelayananRole: { select: { id: true, nama: true, level: true } },
    },
  });
  res.json({ success: true, data });
});

// Assign petugas
pelayananRouter.post('/petugas', async (req, res) => {
  const input = assignPetugasSchema.parse(req.body);

  // Validasi: pelayananRoleId harus belong ke pelayanan dari ibadahPelayanan
  const link = await prisma.ibadahPelayanan.findUnique({
    where: { id: input.ibadahPelayananId },
    include: { pelayanan: { select: { id: true, nama: true } }, ibadah: { select: { nama: true } } },
  });
  if (!link) throw NotFound('Ibadah-pelayanan link tidak ditemukan');

  const role = await prisma.pelayananRole.findUnique({ where: { id: input.pelayananRoleId } });
  if (!role) throw NotFound('Role tidak ditemukan');
  if (role.pelayananId !== link.pelayananId) {
    throw BadRequest(`Role "${role.nama}" bukan milik pelayanan ${link.pelayanan.nama}`);
  }

  const created = await prisma.ibadahPelayananPetugas.create({
    data: input,
    include: {
      jemaat: { select: { namaLengkap: true } },
      pelayananRole: { select: { nama: true } },
    },
  });
  const label = `${created.jemaat.namaLengkap} (${created.pelayananRole.nama}) — ${link.pelayanan.nama} @ ${link.ibadah.nama}`;
  audit(req, {
    action: 'CREATE',
    resource: 'ibadah_pelayanan_petugas',
    resourceId: created.id,
    resourceLabel: label,
    after: created,
  });
  res.status(201).json({ success: true, data: created });
});

// Update petugas (mis. ganti role)
pelayananRouter.patch('/petugas/:id', async (req, res) => {
  const input = updatePetugasSchema.parse(req.body);
  const before = await prisma.ibadahPelayananPetugas.findUnique({
    where: { id: req.params.id },
    include: {
      jemaat: { select: { namaLengkap: true } },
      ibadahPelayanan: {
        include: { pelayanan: { select: { id: true, nama: true } } },
      },
    },
  });
  if (!before) throw NotFound('Petugas tidak ditemukan');

  if (input.pelayananRoleId) {
    const role = await prisma.pelayananRole.findUnique({ where: { id: input.pelayananRoleId } });
    if (!role || role.pelayananId !== before.ibadahPelayanan.pelayananId) {
      throw BadRequest(`Role tidak terkait dengan pelayanan ${before.ibadahPelayanan.pelayanan.nama}`);
    }
  }

  const updated = await prisma.ibadahPelayananPetugas.update({
    where: { id: req.params.id },
    data: input,
  });
  audit(req, {
    action: 'UPDATE',
    resource: 'ibadah_pelayanan_petugas',
    resourceId: updated.id,
    resourceLabel: `${before.jemaat.namaLengkap} @ ${before.ibadahPelayanan.pelayanan.nama}`,
    before,
    after: updated,
  });
  res.json({ success: true, data: updated });
});

// Delete petugas
pelayananRouter.delete('/petugas/:id', async (req, res) => {
  const before = await prisma.ibadahPelayananPetugas.findUnique({
    where: { id: req.params.id },
    include: {
      jemaat: { select: { namaLengkap: true } },
      ibadahPelayanan: {
        include: {
          pelayanan: { select: { nama: true } },
          ibadah: { select: { nama: true } },
        },
      },
    },
  });
  if (!before) throw NotFound('Petugas tidak ditemukan');
  await prisma.ibadahPelayananPetugas.delete({ where: { id: req.params.id } });
  const label = `${before.jemaat.namaLengkap} — ${before.ibadahPelayanan.pelayanan.nama} @ ${before.ibadahPelayanan.ibadah.nama}`;
  audit(req, {
    action: 'DELETE',
    resource: 'ibadah_pelayanan_petugas',
    resourceId: before.id,
    resourceLabel: label,
    before,
  });
  res.status(204).end();
});
