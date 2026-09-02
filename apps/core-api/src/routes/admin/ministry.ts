/**
 * Ministry (Pelayanan) — mobile-friendly read-only endpoints.
 *
 * Berbeda dari /admin/pelayanan (admin CRUD), ini shape dioptimize untuk
 * mobile app halaman "Ministry":
 *   - GET /admin/ministry            → list semua Pelayanan + memberCount + leader proxy
 *   - GET /admin/ministry/:id        → detail Pelayanan + members + jadwal (later)
 *
 * **Patch 2026-05-22** per request mobile ministry-endpoints.md.
 *
 * Note: Pelayanan adalah master global (Multimedia, Worship, dll) — tidak
 * cabang-specific. Mobile request mention `?cabangId` filter, tapi semantic
 * yang reasonable: filter by `members aktif yang ada di cabang X`. Untuk MVP
 * skip filter ini (return semua), bisa ditambah belakangan.
 *
 * Leader proxy: tidak ada `leaderId` di schema Pelayanan. "Leader" di-derive
 * dari JemaatPelayanan yang punya role dengan level tertinggi. Kalau multiple
 * tied, ambil yang earliest tanggalMulai (paling lama menjabat).
 */
import { Router } from 'express';
import { prisma } from '@ecc/database';
import { ApiError, BadRequest, NotFound, Unauthorized } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { createNotification } from '../../lib/notification.js';

export const ministryRouter = Router();

ministryRouter.get('/', async (_req, res) => {
  const items = await prisma.pelayanan.findMany({
    where: { isActive: true },
    include: {
      roles: {
        where: { isActive: true },
        orderBy: { level: 'desc' },
        select: { id: true, nama: true, level: true },
      },
      _count: { select: { jemaatPelayanan: { where: { isActive: true } } } },
      // Untuk leader proxy: ambil 1 row aktif dengan role level tertinggi.
      jemaatPelayanan: {
        where: { isActive: true },
        orderBy: [{ pelayananRole: { level: 'desc' } }, { tanggalMulai: 'asc' }],
        take: 1,
        select: {
          jemaat: {
            select: { id: true, namaLengkap: true, fotoUrl: true },
          },
          pelayananRole: { select: { nama: true, level: true } },
        },
      },
    },
    orderBy: { nama: 'asc' },
  });

  const data = items.map((m) => ({
    id: m.id,
    nama: m.nama,
    deskripsi: m.deskripsi,
    memberCount: m._count.jemaatPelayanan,
    // Anggap selalu open untuk MVP. Kalau ke depan ada flag isOpen di schema,
    // tinggal tukar source.
    isOpen: m.isActive,
    leader: m.jemaatPelayanan[0]
      ? {
          jemaat: m.jemaatPelayanan[0].jemaat,
          role: m.jemaatPelayanan[0].pelayananRole.nama,
        }
      : null,
    roles: m.roles, // mobile bisa preview options sebelum join
  }));

  res.json({ success: true, data });
});

ministryRouter.get('/:id', async (req, res) => {
  const item = await prisma.pelayanan.findUnique({
    where: { id: req.params.id },
    include: {
      roles: {
        where: { isActive: true },
        orderBy: { level: 'desc' },
        select: { id: true, nama: true, level: true, deskripsi: true },
      },
      _count: { select: { jemaatPelayanan: { where: { isActive: true } } } },
      jemaatPelayanan: {
        where: { isActive: true },
        orderBy: [{ pelayananRole: { level: 'desc' } }, { tanggalMulai: 'asc' }],
        select: {
          id: true,
          tanggalMulai: true,
          jemaat: {
            select: {
              id: true,
              namaLengkap: true,
              fotoUrl: true,
              cabang: { select: { id: true, nama: true } },
            },
          },
          pelayananRole: { select: { id: true, nama: true, level: true } },
        },
      },
    },
  });
  if (!item) throw NotFound('Ministry tidak ditemukan');

  // Auth-aware: tandai myMembership kalau current user adalah member.
  const jemaatId = req.user?.jemaatId;
  const myMembership = jemaatId
    ? item.jemaatPelayanan.find((jp) => jp.jemaat.id === jemaatId)
    : undefined;

  res.json({
    success: true,
    data: {
      id: item.id,
      nama: item.nama,
      deskripsi: item.deskripsi,
      isOpen: item.isActive,
      memberCount: item._count.jemaatPelayanan,
      roles: item.roles,
      leader: item.jemaatPelayanan[0]
        ? {
            jemaat: item.jemaatPelayanan[0].jemaat,
            role: item.jemaatPelayanan[0].pelayananRole.nama,
          }
        : null,
      members: item.jemaatPelayanan.map((jp) => ({
        id: jp.id,
        jemaat: jp.jemaat,
        posisi: jp.pelayananRole.nama,
        sinceDate: jp.tanggalMulai,
      })),
      myMembership: myMembership
        ? {
            id: myMembership.id,
            posisi: myMembership.pelayananRole.nama,
            sinceDate: myMembership.tanggalMulai,
          }
        : null,
    },
  });
});

/**
 * POST /admin/ministry/:id/join — self-join ministry (Phase 2, simple version).
 *
 * Body: { roleId?: string, motivasi?: string }
 *   - roleId: pilih role dari ministry.roles. Kalau kosong, ambil level terendah
 *     (biasanya "Anggota" atau setara — safest default untuk join baru).
 *   - motivasi: optional catatan untuk leader.
 *
 * Behavior: langsung ACTIVE (skip approval flow — deferred karena butuh
 * design decision status enum). Notif ke ministry leader (kalau ada) sebagai
 * heads-up review.
 *
 * Guards: 409 ALREADY_MEMBER kalau JemaatPelayanan aktif exist; 400 kalau
 * ministry isActive=false.
 */
ministryRouter.post('/:id/join', async (req, res) => {
  if (!req.user) throw Unauthorized();
  const jemaatId = req.user.jemaatId;
  const roleId = typeof req.body?.roleId === 'string' ? req.body.roleId : null;
  const motivasi = typeof req.body?.motivasi === 'string' ? req.body.motivasi.trim() : null;

  const ministry = await prisma.pelayanan.findUnique({
    where: { id: req.params.id },
    include: {
      roles: {
        where: { isActive: true },
        orderBy: { level: 'asc' },
        select: { id: true, nama: true, level: true },
      },
    },
  });
  if (!ministry) throw NotFound('Ministry tidak ditemukan');
  if (!ministry.isActive) throw BadRequest('Ministry ini tidak buka untuk join');
  if (ministry.roles.length === 0) {
    throw BadRequest('Ministry belum punya role yang bisa di-assign');
  }

  // Pick role: user-supplied kalau valid, else fallback level terendah
  let targetRole = roleId ? ministry.roles.find((r) => r.id === roleId) : undefined;
  if (roleId && !targetRole) {
    throw BadRequest(`Role "${roleId}" tidak ditemukan di ministry ini`);
  }
  if (!targetRole) targetRole = ministry.roles[0];
  if (!targetRole) throw BadRequest('Ministry belum punya role');

  // Check existing membership
  const existing = await prisma.jemaatPelayanan.findFirst({
    where: { jemaatId, pelayananId: ministry.id, isActive: true },
    select: { id: true },
  });
  if (existing) throw new ApiError(409, 'ALREADY_MEMBER', 'Anda sudah member ministry ini');

  const created = await prisma.jemaatPelayanan.create({
    data: {
      jemaatId,
      pelayananId: ministry.id,
      pelayananRoleId: targetRole.id,
      tanggalMulai: new Date(),
      isActive: true,
    },
    include: {
      jemaat: { select: { namaLengkap: true } },
      pelayananRole: { select: { nama: true, level: true } },
    },
  });

  audit(req, {
    action: 'CREATE',
    resource: 'jemaat_pelayanan',
    resourceId: created.id,
    resourceLabel: `Join ministry: ${created.jemaat.namaLengkap} @ ${ministry.nama} (${targetRole.nama})`,
    metadata: { pelayananId: ministry.id, roleId: targetRole.id, motivasi, via: 'self-join' },
    after: created,
  });

  // Notif in-app ke leader ministry (kalau ada) — heads-up ada member baru
  const leaders = await prisma.jemaatPelayanan.findMany({
    where: {
      pelayananId: ministry.id,
      isActive: true,
      pelayananRole: { level: { gte: 5 } }, // asumsi level >=5 leader-tier
      jemaatId: { not: jemaatId },
    },
    select: { jemaatId: true },
    take: 5,
  });
  for (const l of leaders) {
    void createNotification({
      jemaatId: l.jemaatId,
      type: 'GROUP_MEMBER_ADDED', // reuse — semantic mirip
      title: `Member baru di ${ministry.nama}`,
      body: `${created.jemaat.namaLengkap} join sebagai ${targetRole.nama}.${motivasi ? ` Motivasi: ${motivasi}` : ''}`,
      actionUrl: `/ministry/${ministry.id}`,
      metadata: { ministryId: ministry.id, newMemberJemaatId: jemaatId, motivasi },
    });
  }

  res.status(201).json({
    success: true,
    data: {
      membershipId: created.id,
      status: 'ACTIVE',
      ministry: { id: ministry.id, nama: ministry.nama },
      posisi: targetRole.nama,
    },
    message: `Selamat datang di ${ministry.nama} sebagai ${targetRole.nama}`,
  });
});

// ============================================================
//  Ministry Schedule / Roster
//  Per backend-request-ministry-schedule-roster.md (2026-09-02).
// ============================================================

function parseWindow(fromRaw: unknown, toRaw: unknown): { from: Date; to: Date } {
  const from =
    typeof fromRaw === 'string' && fromRaw ? new Date(fromRaw) : new Date();
  const to =
    typeof toRaw === 'string' && toRaw
      ? new Date(toRaw)
      : new Date(Date.now() + 28 * 24 * 60 * 60 * 1000);
  if (isNaN(from.getTime())) throw BadRequest('Query `from` tidak valid (YYYY-MM-DD).');
  if (isNaN(to.getTime())) throw BadRequest('Query `to` tidak valid (YYYY-MM-DD).');
  // End-of-day inklusif
  to.setHours(23, 59, 59, 999);
  return { from, to };
}

// GET /admin/ministry/:id/schedule?from=&to=
ministryRouter.get('/:id/schedule', async (req, res) => {
  const pelayananId = req.params.id;
  const { from, to } = parseWindow(req.query.from, req.query.to);

  const ministry = await prisma.pelayanan.findUnique({
    where: { id: pelayananId },
    select: { id: true, nama: true, isActive: true },
  });
  if (!ministry) throw NotFound('Ministry tidak ditemukan');

  const rows = await prisma.pelayananSchedule.findMany({
    where: {
      pelayananId,
      tanggal: { gte: from, lte: to },
    },
    orderBy: { tanggal: 'asc' },
    include: {
      ibadah: {
        select: {
          id: true,
          judul: true,
          jamMulai: true,
          jamSelesai: true,
          lokasi: true,
        },
      },
      assignments: {
        include: {
          jemaat: { select: { id: true, namaLengkap: true, fotoUrl: true } },
          pelayananRole: { select: { id: true, nama: true, level: true } },
        },
        orderBy: [{ pelayananRole: { level: 'desc' } }, { createdAt: 'asc' }],
      },
    },
  });

  const schedules = rows.map((s) => ({
    id: s.id,
    tanggal: s.tanggal,
    ibadahId: s.ibadahId,
    ibadahNama: s.ibadah?.judul ?? null,
    ibadahJamMulai: s.ibadah?.jamMulai ?? null,
    ibadahJamSelesai: s.ibadah?.jamSelesai ?? null,
    ibadahLokasi: s.ibadah?.lokasi ?? null,
    catatan: s.catatan,
    assignments: s.assignments.map((a) => ({
      id: a.id,
      jemaatId: a.jemaatId,
      jemaatNama: a.jemaat.namaLengkap,
      jemaatFotoUrl: a.jemaat.fotoUrl,
      posisi: a.pelayananRole.nama,
      posisiLevel: a.pelayananRole.level,
      notes: a.notes,
    })),
  }));

  res.json({ success: true, data: { schedules } });
});

// POST /admin/ministry/:id/schedule
// Body: { tanggal, ibadahId?, catatan?, assignments: [{ jemaatId, pelayananRoleId, notes? }] }
ministryRouter.post('/:id/schedule', async (req, res) => {
  const pelayananId = req.params.id;
  const body = req.body ?? {};
  const tanggal = typeof body.tanggal === 'string' ? new Date(body.tanggal) : null;
  const ibadahId = typeof body.ibadahId === 'string' ? body.ibadahId : null;
  const catatan = typeof body.catatan === 'string' ? body.catatan : null;
  const assignmentsInput = Array.isArray(body.assignments) ? body.assignments : [];

  if (!tanggal || isNaN(tanggal.getTime())) {
    throw BadRequest('tanggal wajib (YYYY-MM-DD).');
  }
  for (const a of assignmentsInput) {
    if (!a || typeof a.jemaatId !== 'string' || typeof a.pelayananRoleId !== 'string') {
      throw BadRequest('Setiap assignment harus punya jemaatId + pelayananRoleId.');
    }
  }

  const ministry = await prisma.pelayanan.findUnique({
    where: { id: pelayananId },
    select: { id: true, nama: true },
  });
  if (!ministry) throw NotFound('Ministry tidak ditemukan');

  if (ibadahId) {
    const ib = await prisma.ibadah.findUnique({ where: { id: ibadahId }, select: { id: true } });
    if (!ib) throw BadRequest('ibadahId tidak valid.');
  }

  // Dedup jemaatId (cegah user submit duplicate → unique constraint error)
  const seen = new Set<string>();
  const dedupedAssignments = assignmentsInput.filter((a: any) => {
    if (seen.has(a.jemaatId)) return false;
    seen.add(a.jemaatId);
    return true;
  });

  const created = await prisma.pelayananSchedule.create({
    data: {
      pelayananId,
      ibadahId: ibadahId ?? undefined,
      tanggal,
      catatan: catatan ?? undefined,
      assignments: {
        create: dedupedAssignments.map((a: any) => ({
          jemaatId: a.jemaatId,
          pelayananRoleId: a.pelayananRoleId,
          notes: typeof a.notes === 'string' ? a.notes : null,
        })),
      },
    },
    include: {
      ibadah: { select: { id: true, judul: true, jamMulai: true, lokasi: true } },
      assignments: {
        include: {
          jemaat: { select: { id: true, namaLengkap: true, fotoUrl: true } },
          pelayananRole: { select: { id: true, nama: true, level: true } },
        },
      },
    },
  });

  audit(req, {
    action: 'CREATE',
    resource: 'pelayanan_schedule',
    resourceId: created.id,
    resourceLabel: `${ministry.nama} — ${created.tanggal.toISOString().slice(0, 10)}`,
    metadata: {
      kind: 'ministry-schedule-create',
      pelayananId,
      assignmentsCount: created.assignments.length,
    },
  });

  // Fire notif ke setiap jemaat yang di-assign
  for (const a of created.assignments) {
    void createNotification({
      jemaatId: a.jemaatId,
      type: 'GROUP_MEMBER_ADDED',
      title: `Anda dijadwalkan di ${ministry.nama}`,
      body: `Tanggal ${created.tanggal.toISOString().slice(0, 10)}, posisi ${a.pelayananRole.nama}.${a.notes ? ` Catatan: ${a.notes}` : ''}`,
      actionUrl: `/ministry/${ministry.id}`,
      metadata: {
        ministryId: ministry.id,
        scheduleId: created.id,
        posisi: a.pelayananRole.nama,
      },
    });
  }

  res.status(201).json({ success: true, data: created });
});

// PATCH /admin/ministry/:id/schedule/:scheduleId
// Body: { tanggal?, ibadahId?, catatan?, assignments? }
// Kalau assignments dikirim → REPLACE (delete all + create fresh). Kalau tidak → keep.
ministryRouter.patch('/:id/schedule/:scheduleId', async (req, res) => {
  const pelayananId = req.params.id;
  const scheduleId = req.params.scheduleId;
  const body = req.body ?? {};

  const before = await prisma.pelayananSchedule.findUnique({
    where: { id: scheduleId },
    include: { pelayanan: { select: { nama: true } } },
  });
  if (!before || before.pelayananId !== pelayananId) {
    throw NotFound('Schedule tidak ditemukan di ministry ini.');
  }

  const updateData: Record<string, unknown> = {};
  if (typeof body.tanggal === 'string') {
    const d = new Date(body.tanggal);
    if (isNaN(d.getTime())) throw BadRequest('tanggal invalid.');
    updateData.tanggal = d;
  }
  if (body.ibadahId === null) updateData.ibadahId = null;
  else if (typeof body.ibadahId === 'string') {
    const ib = await prisma.ibadah.findUnique({ where: { id: body.ibadahId }, select: { id: true } });
    if (!ib) throw BadRequest('ibadahId tidak valid.');
    updateData.ibadahId = body.ibadahId;
  }
  if (body.catatan === null || typeof body.catatan === 'string') {
    updateData.catatan = body.catatan;
  }

  await prisma.$transaction(async (tx) => {
    await tx.pelayananSchedule.update({ where: { id: scheduleId }, data: updateData });
    if (Array.isArray(body.assignments)) {
      await tx.pelayananScheduleAssignment.deleteMany({ where: { scheduleId } });
      const seen = new Set<string>();
      for (const a of body.assignments) {
        if (!a || typeof a.jemaatId !== 'string' || typeof a.pelayananRoleId !== 'string') continue;
        if (seen.has(a.jemaatId)) continue;
        seen.add(a.jemaatId);
        await tx.pelayananScheduleAssignment.create({
          data: {
            scheduleId,
            jemaatId: a.jemaatId,
            pelayananRoleId: a.pelayananRoleId,
            notes: typeof a.notes === 'string' ? a.notes : null,
          },
        });
      }
    }
  });

  const after = await prisma.pelayananSchedule.findUnique({
    where: { id: scheduleId },
    include: {
      ibadah: { select: { id: true, judul: true, jamMulai: true, lokasi: true } },
      assignments: {
        include: {
          jemaat: { select: { id: true, namaLengkap: true, fotoUrl: true } },
          pelayananRole: { select: { id: true, nama: true, level: true } },
        },
      },
    },
  });

  audit(req, {
    action: 'UPDATE',
    resource: 'pelayanan_schedule',
    resourceId: scheduleId,
    resourceLabel: `${before.pelayanan.nama} — ${before.tanggal.toISOString().slice(0, 10)}`,
    before,
    after,
    metadata: { kind: 'ministry-schedule-update' },
  });

  res.json({ success: true, data: after });
});

// DELETE /admin/ministry/:id/schedule/:scheduleId
ministryRouter.delete('/:id/schedule/:scheduleId', async (req, res) => {
  const pelayananId = req.params.id;
  const scheduleId = req.params.scheduleId;

  const before = await prisma.pelayananSchedule.findUnique({
    where: { id: scheduleId },
    include: { pelayanan: { select: { nama: true } } },
  });
  if (!before || before.pelayananId !== pelayananId) {
    throw NotFound('Schedule tidak ditemukan di ministry ini.');
  }

  await prisma.pelayananSchedule.delete({ where: { id: scheduleId } });

  audit(req, {
    action: 'DELETE',
    resource: 'pelayanan_schedule',
    resourceId: scheduleId,
    resourceLabel: `${before.pelayanan.nama} — ${before.tanggal.toISOString().slice(0, 10)}`,
    before,
    metadata: { kind: 'ministry-schedule-delete' },
  });

  res.status(204).end();
});
