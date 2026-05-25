/**
 * Homecell Schedule + Attendance endpoints.
 *
 * Mount sebagai SUB-router di homecell.ts:
 *   homecellRouter.use('/:homecellId/schedule', homecellScheduleRouter)
 *
 * Pattern URL:
 *   POST   /admin/homecell/:homecellId/schedule              — create
 *   GET    /admin/homecell/:homecellId/schedule              — list
 *   GET    /admin/homecell/:homecellId/schedule/:scheduleId  — detail + attendances
 *   POST   /admin/homecell/:homecellId/schedule/:scheduleId/attendance   — scan QR
 *   DELETE /admin/homecell/:homecellId/schedule/:scheduleId/attendance/:attendanceId
 *   DELETE /admin/homecell/:homecellId/schedule/:scheduleId  — delete schedule
 *
 * Auth: PIC homecell / PIC area parent / admin fulltimer (via assertCanManageHomecell).
 *
 * Lihat docs/backend-request-homecell-schedule-attendance.md (2026-05-24).
 */
import { Router } from 'express';
import { prisma } from '@ecc/database';
import {
  createHomecellScheduleSchema,
  listHomecellSchedulesQuerySchema,
  scanHomecellAttendanceSchema,
} from '@ecc/shared-types';
import { ApiError, BadRequest, NotFound } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import {
  assertCanManageHomecell,
  getJemaatIdForUser,
} from '../../lib/homecell-pic.js';

// mergeParams: true supaya :homecellId di parent router accessible di sini.
export const homecellScheduleRouter = Router({ mergeParams: true });

/** Helper — extract userJemaatId + isFulltimer dari req, throw 401 kalau missing. */
async function getRequester(req: Express.Request) {
  const userSub = req.user?.sub;
  if (!userSub) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Auth required.');
  }
  const isFulltimer = req.user?.isFulltimer === true;
  const jemaatId = await getJemaatIdForUser(userSub);
  if (!jemaatId) {
    throw new ApiError(401, 'UNAUTHORIZED', 'User tidak punya jemaat profile.');
  }
  return { jemaatId, isFulltimer };
}

// ============================================================
// POST /admin/homecell/:homecellId/schedule — create jadwal
// ============================================================
homecellScheduleRouter.post('/', async (req, res) => {
  const homecellId = (req.params as { homecellId?: string }).homecellId ?? '';
  if (!homecellId) throw BadRequest('homecellId required di path.');

  const requester = await getRequester(req);
  await assertCanManageHomecell(homecellId, requester.jemaatId, requester.isFulltimer);

  const input = createHomecellScheduleSchema.parse(req.body);

  const created = await prisma.homecellSchedule.create({
    data: {
      homecellId,
      tanggal: new Date(input.tanggal),
      lokasi: input.lokasi,
      catatan: input.catatan ?? null,
      createdBy: requester.jemaatId,
    },
    include: { _count: { select: { attendances: true } } },
  });

  audit(req, {
    action: 'CREATE',
    resource: 'homecell_schedule',
    resourceId: created.id,
    resourceLabel: `${created.tanggal.toISOString().slice(0, 10)} — ${created.lokasi}`,
    after: created,
  });

  res.status(201).json({
    success: true,
    data: {
      ...created,
      attendanceCount: created._count.attendances,
      _count: undefined,
    },
  });
});

// ============================================================
// GET /admin/homecell/:homecellId/schedule — list jadwal
// ============================================================
homecellScheduleRouter.get('/', async (req, res) => {
  const homecellId = (req.params as { homecellId?: string }).homecellId ?? '';
  if (!homecellId) throw BadRequest('homecellId required di path.');

  const requester = await getRequester(req);
  await assertCanManageHomecell(homecellId, requester.jemaatId, requester.isFulltimer);

  const q = listHomecellSchedulesQuerySchema.parse(req.query);

  const where: {
    homecellId: string;
    tanggal?: { gte?: Date; lte?: Date };
  } = { homecellId };
  if (q.from || q.to) {
    where.tanggal = {};
    if (q.from) where.tanggal.gte = new Date(q.from);
    if (q.to) where.tanggal.lte = new Date(q.to);
  }

  const [rows, total] = await Promise.all([
    prisma.homecellSchedule.findMany({
      where,
      orderBy: { tanggal: 'desc' },
      take: q.limit,
      include: {
        _count: { select: { attendances: true } },
        creator: { select: { id: true, namaLengkap: true } },
      },
    }),
    prisma.homecellSchedule.count({ where }),
  ]);

  res.json({
    success: true,
    data: rows.map((r) => ({
      id: r.id,
      tanggal: r.tanggal,
      lokasi: r.lokasi,
      catatan: r.catatan,
      createdBy: r.createdBy,
      creator: r.creator,
      createdAt: r.createdAt,
      attendanceCount: r._count.attendances,
    })),
    meta: { total, limit: q.limit },
  });
});

// ============================================================
// GET /admin/homecell/:homecellId/schedule/:scheduleId — detail + attendances + missing
// ============================================================
homecellScheduleRouter.get('/:scheduleId', async (req, res) => {
  const homecellId = (req.params as { homecellId?: string }).homecellId ?? '';
  const scheduleId = req.params.scheduleId;
  if (!homecellId || !scheduleId) throw BadRequest('homecellId + scheduleId required.');

  const requester = await getRequester(req);
  await assertCanManageHomecell(homecellId, requester.jemaatId, requester.isFulltimer);

  const schedule = await prisma.homecellSchedule.findFirst({
    where: { id: scheduleId, homecellId },
    include: {
      creator: { select: { id: true, namaLengkap: true } },
      attendances: {
        orderBy: { scannedAt: 'asc' },
        include: {
          jemaat: {
            select: { id: true, namaLengkap: true, kode: true, fotoUrl: true },
          },
          scanner: { select: { id: true, namaLengkap: true } },
        },
      },
    },
  });
  if (!schedule) throw NotFound('Schedule tidak ditemukan di homecell ini.');

  // Get active members homecell → identify yg tidak hadir
  const members = await prisma.homecellMember.findMany({
    where: { homecellId, isActive: true },
    select: {
      jemaat: { select: { id: true, namaLengkap: true, kode: true } },
    },
  });
  const attendedIds = new Set(schedule.attendances.map((a) => a.jemaatId));
  const missingMembers = members
    .filter((m) => !attendedIds.has(m.jemaat.id))
    .map((m) => ({
      jemaatId: m.jemaat.id,
      namaLengkap: m.jemaat.namaLengkap,
      kode: m.jemaat.kode,
    }));

  res.json({
    success: true,
    data: {
      id: schedule.id,
      homecellId: schedule.homecellId,
      tanggal: schedule.tanggal,
      lokasi: schedule.lokasi,
      catatan: schedule.catatan,
      creator: schedule.creator,
      createdBy: schedule.createdBy,
      createdAt: schedule.createdAt,
      attendanceCount: schedule.attendances.length,
      memberCount: members.length,
      attendances: schedule.attendances,
      missingMembers,
    },
  });
});

// ============================================================
// POST /admin/homecell/:homecellId/schedule/:scheduleId/attendance — scan QR
// Idempotent — re-scan same member return existing dengan alreadyAttended:true
// ============================================================
homecellScheduleRouter.post('/:scheduleId/attendance', async (req, res) => {
  const homecellId = (req.params as { homecellId?: string }).homecellId ?? '';
  const scheduleId = req.params.scheduleId;
  if (!homecellId || !scheduleId) throw BadRequest('homecellId + scheduleId required.');

  const requester = await getRequester(req);
  await assertCanManageHomecell(homecellId, requester.jemaatId, requester.isFulltimer);

  const { kode } = scanHomecellAttendanceSchema.parse(req.body);

  // Verify schedule exists di homecell ini
  const schedule = await prisma.homecellSchedule.findFirst({
    where: { id: scheduleId, homecellId },
    select: { id: true },
  });
  if (!schedule) throw NotFound('Schedule tidak ditemukan di homecell ini.');

  // Resolve kode → jemaatId
  const jemaat = await prisma.jemaat.findUnique({
    where: { kode },
    select: { id: true, namaLengkap: true, kode: true, fotoUrl: true, isActive: true },
  });
  if (!jemaat) {
    throw new ApiError(404, 'KODE_NOT_FOUND', `Kode jemaat "${kode}" tidak ditemukan.`);
  }
  if (!jemaat.isActive) {
    throw new ApiError(
      400,
      'NOT_HOMECELL_MEMBER',
      `Jemaat ${jemaat.namaLengkap} sudah nonaktif.`,
    );
  }

  // Verify jemaat adalah active member homecell ini
  const membership = await prisma.homecellMember.findFirst({
    where: { homecellId, jemaatId: jemaat.id, isActive: true },
    select: { id: true },
  });
  if (!membership) {
    throw new ApiError(
      400,
      'NOT_HOMECELL_MEMBER',
      `Jemaat ${jemaat.namaLengkap} bukan anggota aktif homecell ini.`,
    );
  }

  // Upsert attendance — idempotent. Re-scan return existing.
  const existing = await prisma.homecellAttendance.findUnique({
    where: { scheduleId_jemaatId: { scheduleId, jemaatId: jemaat.id } },
  });

  let attendance;
  let alreadyAttended = false;
  if (existing) {
    attendance = existing;
    alreadyAttended = true;
  } else {
    attendance = await prisma.homecellAttendance.create({
      data: {
        scheduleId,
        jemaatId: jemaat.id,
        scannedBy: requester.jemaatId,
        source: 'QR_SCAN',
      },
    });
    audit(req, {
      action: 'CREATE',
      resource: 'homecell_attendance',
      resourceId: attendance.id,
      resourceLabel: `${jemaat.namaLengkap} → schedule ${scheduleId}`,
      after: attendance,
    });
  }

  const total = await prisma.homecellAttendance.count({ where: { scheduleId } });

  res.json({
    success: true,
    data: {
      id: attendance.id,
      scheduleId: attendance.scheduleId,
      jemaatId: attendance.jemaatId,
      jemaat,
      scannedAt: attendance.scannedAt,
      alreadyAttended,
      attendanceCount: total,
    },
  });
});

// ============================================================
// DELETE attendance — correction
// ============================================================
homecellScheduleRouter.delete(
  '/:scheduleId/attendance/:attendanceId',
  async (req, res) => {
    const homecellId = (req.params as { homecellId?: string }).homecellId ?? '';
    const { scheduleId, attendanceId } = req.params;
    if (!homecellId || !scheduleId || !attendanceId) {
      throw BadRequest('homecellId + scheduleId + attendanceId required.');
    }

    const requester = await getRequester(req);
    await assertCanManageHomecell(homecellId, requester.jemaatId, requester.isFulltimer);

    const before = await prisma.homecellAttendance.findFirst({
      where: { id: attendanceId, scheduleId },
    });
    if (!before) throw NotFound('Attendance tidak ditemukan.');

    await prisma.homecellAttendance.delete({ where: { id: attendanceId } });

    audit(req, {
      action: 'DELETE',
      resource: 'homecell_attendance',
      resourceId: attendanceId,
      resourceLabel: `attendance ${attendanceId} di schedule ${scheduleId}`,
      before,
    });

    res.json({ success: true, data: { deleted: true } });
  },
);

// ============================================================
// DELETE schedule — hanya kalau attendanceCount = 0 (safety)
// ============================================================
homecellScheduleRouter.delete('/:scheduleId', async (req, res) => {
  const homecellId = (req.params as { homecellId?: string }).homecellId ?? '';
  const scheduleId = req.params.scheduleId;
  if (!homecellId || !scheduleId) throw BadRequest('homecellId + scheduleId required.');

  const requester = await getRequester(req);
  await assertCanManageHomecell(homecellId, requester.jemaatId, requester.isFulltimer);

  const before = await prisma.homecellSchedule.findFirst({
    where: { id: scheduleId, homecellId },
    include: { _count: { select: { attendances: true } } },
  });
  if (!before) throw NotFound('Schedule tidak ditemukan.');

  if (before._count.attendances > 0) {
    throw new ApiError(
      400,
      'HAS_ATTENDANCE',
      `Schedule punya ${before._count.attendances} attendance. ` +
        `Hapus attendance satu per satu dulu, baru delete schedule.`,
    );
  }

  await prisma.homecellSchedule.delete({ where: { id: scheduleId } });

  audit(req, {
    action: 'DELETE',
    resource: 'homecell_schedule',
    resourceId: scheduleId,
    resourceLabel: `${before.tanggal.toISOString().slice(0, 10)} — ${before.lokasi}`,
    before,
  });

  res.json({ success: true, data: { deleted: true } });
});
