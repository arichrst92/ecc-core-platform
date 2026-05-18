import { Router } from 'express';
import { prisma, type Prisma } from '@ecc/database';
import {
  createHomecellSchema,
  updateHomecellSchema,
  addHomecellMemberSchema,
  updateHomecellMemberSchema,
  paginationQuerySchema,
} from '@ecc/shared-types';
import { BadRequest, NotFound } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { assertPenggembalaanRole, PENGGEMBALAAN } from '../../lib/homecell-pic.js';

export const homecellRouter = Router();

// ===== List =====
homecellRouter.get('/', async (req, res) => {
  const q = paginationQuerySchema.parse(req.query);
  const areaId = typeof req.query.areaId === 'string' ? req.query.areaId : undefined;
  const cabangId = typeof req.query.cabangId === 'string' ? req.query.cabangId : undefined;
  const sinodeId = typeof req.query.sinodeId === 'string' ? req.query.sinodeId : undefined;

  const where: Prisma.HomecellWhereInput = {};
  if (q.search) where.nama = { contains: q.search, mode: 'insensitive' };
  if (areaId) where.areaId = areaId;
  if (cabangId) where.area = { cabangId };
  if (sinodeId) where.area = { ...(where.area ?? {}), cabang: { sinodeId } };

  const [rows, total] = await Promise.all([
    prisma.homecell.findMany({
      where,
      skip: (q.page - 1) * q.limit,
      take: q.limit,
      orderBy: { [q.sortBy ?? 'nama']: q.sortOrder },
      include: {
        area: {
          select: {
            id: true,
            nama: true,
            cabang: { select: { id: true, nama: true } },
          },
        },
        picJemaat: { select: { id: true, namaLengkap: true, fotoUrl: true } },
        _count: { select: { members: { where: { isActive: true } } } },
      },
    }),
    prisma.homecell.count({ where }),
  ]);

  const data = rows.map((r) => ({
    ...r,
    memberCount: r._count.members,
  }));

  res.json({
    success: true,
    data,
    meta: { page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit) },
  });
});

// ===== Detail =====
homecellRouter.get('/:id', async (req, res) => {
  const item = await prisma.homecell.findUnique({
    where: { id: req.params.id },
    include: {
      area: {
        select: {
          id: true,
          nama: true,
          cabang: { select: { id: true, nama: true, kode: true } },
        },
      },
      picJemaat: { select: { id: true, namaLengkap: true, fotoUrl: true, noHp: true } },
      members: {
        orderBy: [{ isActive: 'desc' }, { tanggalBergabung: 'desc' }],
        include: {
          jemaat: {
            select: { id: true, namaLengkap: true, fotoUrl: true, noHp: true },
          },
        },
      },
    },
  });
  if (!item) throw NotFound('Homecell tidak ditemukan');
  res.json({ success: true, data: item });
});

// ===== Create =====
homecellRouter.post('/', async (req, res) => {
  const input = createHomecellSchema.parse(req.body);
  if (input.picJemaatId) {
    await assertPenggembalaanRole(input.picJemaatId, PENGGEMBALAAN.HOMECELL_LEADER);
  }
  const created = await prisma.homecell.create({ data: input });
  audit(req, {
    action: 'CREATE',
    resource: 'homecell',
    resourceId: created.id,
    resourceLabel: created.nama,
    after: created,
  });
  res.status(201).json({ success: true, data: created });
});

// ===== Update =====
homecellRouter.patch('/:id', async (req, res) => {
  const input = updateHomecellSchema.parse(req.body);
  if (input.picJemaatId) {
    await assertPenggembalaanRole(input.picJemaatId, PENGGEMBALAAN.HOMECELL_LEADER);
  }
  const before = await prisma.homecell.findUnique({ where: { id: req.params.id } });
  if (!before) throw NotFound('Homecell tidak ditemukan');
  const updated = await prisma.homecell.update({ where: { id: req.params.id }, data: input });
  audit(req, {
    action: 'UPDATE',
    resource: 'homecell',
    resourceId: updated.id,
    resourceLabel: updated.nama,
    before,
    after: updated,
  });
  res.json({ success: true, data: updated });
});

// ===== Delete =====
homecellRouter.delete('/:id', async (req, res) => {
  const before = await prisma.homecell.findUnique({ where: { id: req.params.id } });
  if (!before) throw NotFound('Homecell tidak ditemukan');
  await prisma.homecell.delete({ where: { id: req.params.id } }); // CASCADE members
  audit(req, {
    action: 'DELETE',
    resource: 'homecell',
    resourceId: before.id,
    resourceLabel: before.nama,
    before,
  });
  res.status(204).end();
});

// ============================================================
//  MEMBERS
// ============================================================

// Add member
homecellRouter.post('/:id/members', async (req, res) => {
  const homecellId = req.params.id;
  const input = addHomecellMemberSchema.parse(req.body);

  const homecell = await prisma.homecell.findUnique({ where: { id: homecellId } });
  if (!homecell) throw NotFound('Homecell tidak ditemukan');

  try {
    const created = await prisma.homecellMember.create({
      data: {
        homecellId,
        jemaatId: input.jemaatId,
        tanggalBergabung: input.tanggalBergabung ? new Date(input.tanggalBergabung) : undefined,
        catatan: input.catatan,
        isActive: true,
      },
      include: { jemaat: { select: { namaLengkap: true } } },
    });
    audit(req, {
      action: 'CREATE',
      resource: 'homecell_member',
      resourceId: created.id,
      resourceLabel: `${created.jemaat.namaLengkap} → ${homecell.nama}`,
      after: created,
    });
    res.status(201).json({ success: true, data: created });
  } catch (err: any) {
    if (err.code === 'P2002') {
      throw BadRequest('Jemaat sudah jadi member homecell ini');
    }
    throw err;
  }
});

// Update member (mark keluar / catatan)
homecellRouter.patch('/:id/members/:memberId', async (req, res) => {
  const input = updateHomecellMemberSchema.parse(req.body);
  const before = await prisma.homecellMember.findUnique({
    where: { id: req.params.memberId },
    include: { jemaat: { select: { namaLengkap: true } }, homecell: { select: { nama: true } } },
  });
  if (!before || before.homecellId !== req.params.id) throw NotFound('Member tidak ditemukan');

  const data: Prisma.HomecellMemberUpdateInput = {
    catatan: input.catatan,
    isActive: input.isActive,
    tanggalKeluar: input.tanggalKeluar ? new Date(input.tanggalKeluar) : undefined,
  };
  // Kalau di-mark non-aktif dan belum ada tanggalKeluar, set tanggal hari ini
  if (input.isActive === false && !before.tanggalKeluar && !input.tanggalKeluar) {
    data.tanggalKeluar = new Date();
  }
  // Kalau di-reactivate, clear tanggalKeluar
  if (input.isActive === true) {
    data.tanggalKeluar = null;
  }

  const updated = await prisma.homecellMember.update({
    where: { id: req.params.memberId },
    data,
  });
  audit(req, {
    action: 'UPDATE',
    resource: 'homecell_member',
    resourceId: updated.id,
    resourceLabel: `${before.jemaat.namaLengkap} @ ${before.homecell.nama}`,
    before,
    after: updated,
  });
  res.json({ success: true, data: updated });
});

// Remove member (hard delete)
homecellRouter.delete('/:id/members/:memberId', async (req, res) => {
  const before = await prisma.homecellMember.findUnique({
    where: { id: req.params.memberId },
    include: { jemaat: { select: { namaLengkap: true } }, homecell: { select: { nama: true } } },
  });
  if (!before || before.homecellId !== req.params.id) throw NotFound('Member tidak ditemukan');
  await prisma.homecellMember.delete({ where: { id: req.params.memberId } });
  audit(req, {
    action: 'DELETE',
    resource: 'homecell_member',
    resourceId: before.id,
    resourceLabel: `${before.jemaat.namaLengkap} @ ${before.homecell.nama}`,
    before,
  });
  res.status(204).end();
});
