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
import { homecellScheduleRouter } from './homecell-schedule.js';

export const homecellRouter = Router();

// Sub-router: /:homecellId/schedule/* — jadwal pertemuan + QR attendance.
// Lihat docs/backend-request-homecell-schedule-attendance.md (2026-05-24).
homecellRouter.use('/:homecellId/schedule', homecellScheduleRouter);

// ===== List =====
homecellRouter.get('/', async (req, res) => {
  const q = paginationQuerySchema.parse(req.query);
  const areaId = typeof req.query.areaId === 'string' ? req.query.areaId : undefined;
  const cabangId = typeof req.query.cabangId === 'string' ? req.query.cabangId : undefined;
  const sinodeId = typeof req.query.sinodeId === 'string' ? req.query.sinodeId : undefined;

  const where: Prisma.HomecellWhereInput = {};
  if (q.search) where.nama = { contains: q.search, mode: 'insensitive' };
  if (areaId) where.areaId = areaId;
  // area filter — gabungkan cabang & sinode kalau keduanya disebut.
  const areaFilter: Prisma.HomecellAreaWhereInput = {};
  if (cabangId) areaFilter.cabangId = cabangId;
  if (sinodeId) areaFilter.cabang = { sinodeId };
  if (Object.keys(areaFilter).length > 0) where.area = areaFilter;

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
          // pic Area juga di-include supaya mobile bisa check area-PIC authorization
          picJemaatId: true,
          cabang: { select: { id: true, nama: true, kode: true } },
        },
      },
      picJemaat: { select: { id: true, namaLengkap: true, fotoUrl: true, noHp: true } },
      members: {
        orderBy: [{ isActive: 'desc' }, { tanggalBergabung: 'desc' }],
        include: {
          jemaat: {
            // Field tambahan (kode, jenisKelamin) per request mobile M9.
            select: {
              id: true,
              namaLengkap: true,
              kode: true,
              fotoUrl: true,
              noHp: true,
              jenisKelamin: true,
            },
          },
        },
      },
      _count: { select: { schedules: true } },
      // Last schedule untuk display "Last meeting" di header detail page.
      // Pakai take:1 + orderBy desc.
      schedules: {
        orderBy: { tanggal: 'desc' },
        take: 1,
        select: {
          id: true,
          tanggal: true,
          lokasi: true,
          _count: { select: { attendances: true } },
        },
      },
    },
  });
  if (!item) throw NotFound('Homecell tidak ditemukan');

  // Flatten _count + lastSchedule untuk response yang clean.
  const { _count, schedules, ...rest } = item;
  const lastSchedule = schedules[0]
    ? {
        id: schedules[0].id,
        tanggal: schedules[0].tanggal,
        lokasi: schedules[0].lokasi,
        attendanceCount: schedules[0]._count.attendances,
      }
    : null;

  res.json({
    success: true,
    data: {
      ...rest,
      scheduleCount: _count.schedules,
      lastSchedule,
    },
  });
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

// Add member by jemaatId
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

// Add member by kode jemaat (scan QR di mobile PIC homecell)
homecellRouter.post('/:id/members/by-kode', async (req, res) => {
  const homecellId = req.params.id;
  const kode = typeof req.body?.kode === 'string' ? req.body.kode.toUpperCase().trim() : '';
  if (!kode) throw BadRequest('Field "kode" wajib');

  const homecell = await prisma.homecell.findUnique({ where: { id: homecellId } });
  if (!homecell) throw NotFound('Homecell tidak ditemukan');

  const jemaat = await prisma.jemaat.findUnique({
    where: { kode },
    select: { id: true, namaLengkap: true },
  });
  if (!jemaat) throw NotFound(`Kode jemaat "${kode}" tidak ditemukan`);

  try {
    const created = await prisma.homecellMember.create({
      data: {
        homecellId,
        jemaatId: jemaat.id,
        isActive: true,
      },
      include: { jemaat: { select: { namaLengkap: true, kode: true, fotoUrl: true } } },
    });
    audit(req, {
      action: 'CREATE',
      resource: 'homecell_member',
      resourceId: created.id,
      resourceLabel: `${created.jemaat.namaLengkap} → ${homecell.nama} (via QR)`,
      after: created,
      metadata: { kind: 'homecell-add-by-kode' },
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

// ============================================================
// Soft-remove member by jemaatId — mobile PIC homecell flow.
// ============================================================
// Berbeda dengan DELETE /:memberId di bawah (hard delete by member row ID,
// untuk admin portal). Endpoint ini:
//   - Lookup by jemaatId (yang mobile punya dari list members)
//   - SOFT delete (set isActive=false + tanggalKeluar=today)
//   - Idempotent: kalau sudah isActive=false, return existing dengan
//     meta.alreadyRemoved=true
//
// Authorization: PIC homecell-nya, atau PIC area parent-nya, atau admin
// (RBAC strict via menu access nanti). Saat ini permissive — semua user
// yang lewat /admin/* di-allow (sama dengan endpoint admin lain). Mobile
// authorization di-enforce via filter di list endpoint.
homecellRouter.delete('/:id/members/by-jemaat/:jemaatId', async (req, res) => {
  const before = await prisma.homecellMember.findFirst({
    where: { homecellId: req.params.id, jemaatId: req.params.jemaatId },
    include: { jemaat: { select: { namaLengkap: true } }, homecell: { select: { nama: true } } },
  });
  if (!before) throw NotFound('Member tidak ditemukan di homecell ini.');

  // Idempotent — sudah dikeluarkan, return existing.
  if (!before.isActive) {
    return res.json({
      success: true,
      data: before,
      meta: { alreadyRemoved: true },
    });
  }

  const updated = await prisma.homecellMember.update({
    where: { id: before.id },
    data: {
      isActive: false,
      tanggalKeluar: new Date(),
    },
  });
  audit(req, {
    action: 'UPDATE',
    resource: 'homecell_member',
    resourceId: updated.id,
    resourceLabel: `Remove ${before.jemaat.namaLengkap} from ${before.homecell.nama}`,
    before,
    after: updated,
    metadata: { kind: 'homecell-member-soft-remove' },
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
