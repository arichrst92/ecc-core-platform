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
import { Router, type Request } from 'express';
import { prisma } from '@ecc/database';
import { z } from 'zod';
import { ApiError, BadRequest, Forbidden, NotFound, Unauthorized } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { createNotification } from '../../lib/notification.js';
import { sendWaIfEnabled } from '../../lib/wa-notif.js';
import {
  canManageMinistry,
  checkCanRequestJoin,
  LEADER_MIN_LEVEL,
  pickMyJoinRequest,
} from '../../lib/ministry-access.js';

export const ministryRouter = Router();

/**
 * Ministry yang boleh di-manage requester (approve/reject join request).
 * 'ALL' untuk Fulltimer; selain itu set pelayananId di mana requester punya
 * membership aktif dengan role level >= LEADER_MIN_LEVEL.
 */
async function managedMinistryIds(req: Request): Promise<'ALL' | Set<string>> {
  if (!req.user) return new Set();
  if (req.user.isFulltimer) return 'ALL';
  const rows = await prisma.jemaatPelayanan.findMany({
    where: {
      jemaatId: req.user.jemaatId,
      isActive: true,
      pelayananRole: { level: { gte: LEADER_MIN_LEVEL } },
    },
    select: { pelayananId: true },
  });
  return new Set(rows.map((r) => r.pelayananId));
}

async function assertCanManage(req: Request, pelayananId: string): Promise<void> {
  const managed = await managedMinistryIds(req);
  if (!canManageMinistry(managed, pelayananId)) {
    throw Forbidden('Hanya leader ministry yang dapat mengelola permintaan bergabung.');
  }
}

ministryRouter.get('/', async (req, res) => {
  // ?cabangId= (cabang aktif di app): ministry belum terikat cabang, jadi
  // "ada di cabang" = punya anggota aktif dari cabang itu. Ministry yang belum
  // punya anggota sama sekali tetap tampil supaya bisa di-join. Jumlah anggota
  // & leader yang ditampilkan ikut dibatasi ke cabang tsb.
  const cabangIdRaw = typeof req.query.cabangId === 'string' ? req.query.cabangId : '';
  const cabangId = /^[0-9a-f-]{36}$/i.test(cabangIdRaw) ? cabangIdRaw : null;
  const memberWhere = {
    isActive: true,
    ...(cabangId ? { jemaat: { cabangId } } : {}),
  };
  const items = await prisma.pelayanan.findMany({
    where: {
      isActive: true,
      ...(cabangId
        ? {
            OR: [
              { jemaatPelayanan: { some: memberWhere } },
              { jemaatPelayanan: { none: { isActive: true } } },
            ],
          }
        : {}),
    },
    include: {
      roles: {
        where: { isActive: true },
        orderBy: { level: 'desc' },
        select: { id: true, nama: true, level: true },
      },
      _count: { select: { jemaatPelayanan: { where: memberWhere } } },
      // Untuk leader proxy: ambil 1 row aktif dengan role level tertinggi.
      jemaatPelayanan: {
        where: memberWhere,
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

  // Badge pending request — hanya untuk ministry yg bisa di-manage requester.
  const managed = await managedMinistryIds(req);
  const pendingByMinistry = new Map<string, number>();
  if (managed === 'ALL' || managed.size > 0) {
    const grouped = await prisma.pelayananJoinRequest.groupBy({
      by: ['pelayananId'],
      where: {
        status: 'PENDING',
        ...(managed === 'ALL' ? {} : { pelayananId: { in: [...managed] } }),
      },
      _count: { _all: true },
    });
    for (const g of grouped) pendingByMinistry.set(g.pelayananId, g._count._all);
  }

  const data = items.map((m) => ({
    id: m.id,
    nama: m.nama,
    deskripsi: m.deskripsi,
    memberCount: m._count.jemaatPelayanan,
    pendingRequestCount: pendingByMinistry.get(m.id) ?? 0,
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

/**
 * GET /admin/ministry/join-requests?pelayananId=
 * Gabungan permintaan bergabung PENDING dari semua ministry yang bisa
 * di-manage requester (Fulltimer: semua; leader: ministry yg dipimpin).
 * Opsional filter per ministry. Dipakai halaman portal "Permintaan Volunteer".
 *
 * HARUS didefinisikan sebelum GET /:id (kalau tidak, "join-requests" dianggap id).
 */
ministryRouter.get('/join-requests', async (req, res) => {
  if (!req.user) throw Unauthorized();
  const managed = await managedMinistryIds(req);
  const filterId = typeof req.query.pelayananId === 'string' ? req.query.pelayananId : undefined;

  if (managed !== 'ALL' && managed.size === 0) {
    return res.json({ success: true, data: { ministries: [], requests: [], canManageAny: false } });
  }
  if (filterId && !canManageMinistry(managed, filterId)) {
    throw Forbidden('Hanya leader ministry yang dapat mengelola permintaan bergabung.');
  }

  const scopeWhere = managed === 'ALL' ? {} : { pelayananId: { in: [...managed] } };

  // Ringkasan per ministry (untuk chip filter) — selalu seluruh scope.
  const grouped = await prisma.pelayananJoinRequest.groupBy({
    by: ['pelayananId'],
    where: { status: 'PENDING', ...scopeWhere },
    _count: { _all: true },
  });
  const ministryIds = managed === 'ALL' ? undefined : [...managed];
  const ministries = await prisma.pelayanan.findMany({
    where: { isActive: true, ...(ministryIds ? { id: { in: ministryIds } } : {}) },
    orderBy: { nama: 'asc' },
    select: {
      id: true,
      nama: true,
      roles: {
        where: { isActive: true },
        orderBy: { level: 'desc' },
        select: { id: true, nama: true, level: true },
      },
    },
  });
  const countById = new Map(grouped.map((g) => [g.pelayananId, g._count._all]));

  const requests = await prisma.pelayananJoinRequest.findMany({
    where: {
      status: 'PENDING',
      ...(filterId ? { pelayananId: filterId } : scopeWhere),
    },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      createdAt: true,
      motivasi: true,
      pelayanan: { select: { id: true, nama: true } },
      requestedRole: { select: { id: true, nama: true, level: true } },
      jemaat: {
        select: {
          id: true,
          namaLengkap: true,
          kode: true,
          fotoUrl: true,
          noHp: true,
          cabang: { select: { id: true, nama: true } },
        },
      },
    },
  });

  res.json({
    success: true,
    data: {
      canManageAny: true,
      ministries: ministries.map((m) => ({
        ...m,
        pendingRequestCount: countById.get(m.id) ?? 0,
      })),
      requests,
    },
  });
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

  // Join approval (2026-10-12): request terakhir user + hak kelola leader.
  const latestRequest = jemaatId
    ? await prisma.pelayananJoinRequest.findFirst({
        where: { jemaatId, pelayananId: item.id },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          status: true,
          motivasi: true,
          createdAt: true,
          rejectReason: true,
          requestedRole: { select: { id: true, nama: true, level: true } },
        },
      })
    : null;
  const myJoinRequest = pickMyJoinRequest(latestRequest, Boolean(myMembership));
  const canManageRequests = canManageMinistry(await managedMinistryIds(req), item.id);
  const pendingRequestCount = canManageRequests
    ? await prisma.pelayananJoinRequest.count({
        where: { pelayananId: item.id, status: 'PENDING' },
      })
    : 0;

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
      myJoinRequest,
      canManageRequests,
      pendingRequestCount,
    },
  });
});

/**
 * POST /admin/ministry/:id/join — ajukan bergabung (approval oleh leader).
 * Per backend-request-ministry-join-approval.md (2026-10-12).
 *
 * Body: { roleId?: string, motivasi?: string }
 *   - roleId: peran yang DIMINTA (leader boleh ganti saat approve). Kosong →
 *     role level terendah.
 *
 * Response: { membershipId (= id request), requestId, status: 'PENDING', ministry, posisi }
 * 409 ALREADY_MEMBER kalau sudah anggota aktif; 409 JOIN_REQUEST_PENDING kalau
 * masih ada request PENDING. Pernah REJECTED → boleh mengajukan lagi.
 * Notif MINISTRY_JOIN_REQUESTED ke leader (in-app + WA kalau aktif).
 */
ministryRouter.post('/:id/join', async (req, res) => {
  if (!req.user) throw Unauthorized();
  const jemaatId = req.user.jemaatId;
  const roleId = typeof req.body?.roleId === 'string' ? req.body.roleId : null;
  const motivasiRaw = typeof req.body?.motivasi === 'string' ? req.body.motivasi.trim() : '';
  const motivasi = motivasiRaw ? motivasiRaw.slice(0, 1000) : null;

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

  let targetRole = roleId ? ministry.roles.find((r) => r.id === roleId) : undefined;
  if (roleId && !targetRole) {
    throw BadRequest(`Role "${roleId}" tidak ditemukan di ministry ini`);
  }
  if (!targetRole) targetRole = ministry.roles[0];
  if (!targetRole) throw BadRequest('Ministry belum punya role');

  const [activeMembership, pendingRequest] = await Promise.all([
    prisma.jemaatPelayanan.findFirst({
      where: { jemaatId, pelayananId: ministry.id, isActive: true },
      select: { id: true },
    }),
    prisma.pelayananJoinRequest.findFirst({
      where: { jemaatId, pelayananId: ministry.id, status: 'PENDING' },
      select: { id: true },
    }),
  ]);
  const decision = checkCanRequestJoin({
    hasActiveMembership: Boolean(activeMembership),
    hasPendingRequest: Boolean(pendingRequest),
  });
  if (!decision.ok) throw new ApiError(409, decision.code, decision.message);

  let created;
  try {
    created = await prisma.pelayananJoinRequest.create({
      data: {
        pelayananId: ministry.id,
        jemaatId,
        requestedRoleId: targetRole.id,
        motivasi,
      },
      include: { jemaat: { select: { namaLengkap: true } } },
    });
  } catch (err) {
    // Unique partial index (1 PENDING per jemaat+ministry) — double submit.
    if ((err as { code?: string }).code === 'P2002') {
      throw new ApiError(409, 'JOIN_REQUEST_PENDING', 'Permintaan Anda masih menunggu persetujuan');
    }
    throw err;
  }

  audit(req, {
    action: 'CREATE',
    resource: 'pelayanan_join_request',
    resourceId: created.id,
    resourceLabel: `Request join: ${created.jemaat.namaLengkap} @ ${ministry.nama} (${targetRole.nama})`,
    metadata: { pelayananId: ministry.id, roleId: targetRole.id, motivasi },
  });

  // Notif ke leader ministry
  const leaders = await prisma.jemaatPelayanan.findMany({
    where: {
      pelayananId: ministry.id,
      isActive: true,
      pelayananRole: { level: { gte: LEADER_MIN_LEVEL } },
      jemaatId: { not: jemaatId },
    },
    select: { jemaat: { select: { id: true, namaLengkap: true, noHp: true } } },
    take: 10,
  });
  for (const l of leaders) {
    void createNotification({
      jemaatId: l.jemaat.id,
      type: 'MINISTRY_JOIN_REQUESTED',
      title: `Permintaan bergabung: ${ministry.nama}`,
      body: `${created.jemaat.namaLengkap} ingin bergabung sebagai ${targetRole.nama}.${motivasi ? ` Motivasi: ${motivasi}` : ''}`,
      actionUrl: `/ministry/${ministry.id}`,
      metadata: { ministryId: ministry.id, requestId: created.id },
    });
    void sendWaIfEnabled('MINISTRY_JOIN_REQUESTED', l.jemaat.noHp, {
      nama: l.jemaat.namaLengkap,
      pemohon: created.jemaat.namaLengkap,
      ministry_nama: ministry.nama,
      posisi: targetRole.nama,
    });
  }

  res.status(201).json({
    success: true,
    data: {
      membershipId: created.id,
      requestId: created.id,
      status: 'PENDING',
      ministry: { id: ministry.id, nama: ministry.nama },
      posisi: targetRole.nama,
    },
    message: `Permintaan bergabung ke ${ministry.nama} terkirim. Menunggu persetujuan leader.`,
  });
});

/** DELETE /admin/ministry/:id/join-request — batalkan request PENDING milik sendiri. */
ministryRouter.delete('/:id/join-request', async (req, res) => {
  if (!req.user) throw Unauthorized();
  const pending = await prisma.pelayananJoinRequest.findFirst({
    where: { jemaatId: req.user.jemaatId, pelayananId: req.params.id, status: 'PENDING' },
    select: { id: true },
  });
  if (!pending) throw NotFound('Tidak ada permintaan bergabung yang menunggu.');

  await prisma.pelayananJoinRequest.update({
    where: { id: pending.id },
    data: { status: 'CANCELLED', reviewedAt: new Date() },
  });
  audit(req, {
    action: 'UPDATE',
    resource: 'pelayanan_join_request',
    resourceId: pending.id,
    resourceLabel: 'Cancel join request (self)',
  });
  res.json({ success: true, data: { id: pending.id, status: 'CANCELLED' } });
});

/** GET /admin/ministry/:id/join-requests — list PENDING (leader / Fulltimer). */
ministryRouter.get('/:id/join-requests', async (req, res) => {
  await assertCanManage(req, req.params.id);
  const rows = await prisma.pelayananJoinRequest.findMany({
    where: { pelayananId: req.params.id, status: 'PENDING' },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      createdAt: true,
      motivasi: true,
      requestedRole: { select: { id: true, nama: true, level: true } },
      jemaat: {
        select: {
          id: true,
          namaLengkap: true,
          kode: true,
          fotoUrl: true,
          noHp: true,
          cabang: { select: { id: true, nama: true } },
        },
      },
    },
  });
  res.json({ success: true, data: rows });
});

const approveSchema = z.object({ roleId: z.string().uuid('roleId wajib') });
const rejectSchema = z.object({
  reason: z
    .string()
    .trim()
    .max(300)
    .optional()
    .transform((v) => (v ? v : undefined)),
});

/** POST /admin/ministry/:id/join-requests/:reqId/approve { roleId } */
ministryRouter.post('/:id/join-requests/:reqId/approve', async (req, res) => {
  if (!req.user) throw Unauthorized();
  await assertCanManage(req, req.params.id);
  const { roleId } = approveSchema.parse(req.body);

  const role = await prisma.pelayananRole.findFirst({
    where: { id: roleId, pelayananId: req.params.id, isActive: true },
    select: { id: true, nama: true },
  });
  if (!role) throw BadRequest('Peran tidak ditemukan di ministry ini.');

  const request = await prisma.pelayananJoinRequest.findFirst({
    where: { id: req.params.reqId, pelayananId: req.params.id },
    include: {
      jemaat: { select: { id: true, namaLengkap: true, noHp: true } },
      pelayanan: { select: { id: true, nama: true } },
    },
  });
  if (!request) throw NotFound('Permintaan tidak ditemukan.');

  const reviewerId = req.user.jemaatId;
  const membership = await prisma.$transaction(async (tx) => {
    // Atomic: hanya proses kalau masih PENDING (2 leader klik bersamaan → 409).
    const claimed = await tx.pelayananJoinRequest.updateMany({
      where: { id: request.id, status: 'PENDING' },
      data: {
        status: 'APPROVED',
        approvedRoleId: role.id,
        reviewedById: reviewerId,
        reviewedAt: new Date(),
      },
    });
    if (claimed.count === 0) {
      throw new ApiError(409, 'JOIN_REQUEST_NOT_PENDING', 'Permintaan ini sudah diproses.');
    }
    const existing = await tx.jemaatPelayanan.findFirst({
      where: { jemaatId: request.jemaatId, pelayananId: request.pelayananId, isActive: true },
      select: { id: true },
    });
    if (existing) {
      throw new ApiError(409, 'ALREADY_MEMBER', 'Jemaat ini sudah menjadi anggota aktif.');
    }
    const m = await tx.jemaatPelayanan.create({
      data: {
        jemaatId: request.jemaatId,
        pelayananId: request.pelayananId,
        pelayananRoleId: role.id,
        tanggalMulai: new Date(),
        isActive: true,
        catatan: request.motivasi,
      },
      select: { id: true, tanggalMulai: true },
    });
    await tx.pelayananJoinRequest.update({
      where: { id: request.id },
      data: { membershipId: m.id },
    });
    return m;
  });

  audit(req, {
    action: 'UPDATE',
    resource: 'pelayanan_join_request',
    resourceId: request.id,
    resourceLabel: `Approve join: ${request.jemaat.namaLengkap} @ ${request.pelayanan.nama} (${role.nama})`,
    metadata: { membershipId: membership.id, roleId: role.id },
  });

  void createNotification({
    jemaatId: request.jemaat.id,
    type: 'MINISTRY_JOIN_APPROVED',
    title: `Selamat bergabung di ${request.pelayanan.nama}`,
    body: `Permintaan Anda disetujui. Peran Anda: ${role.nama}.`,
    actionUrl: `/ministry/${request.pelayanan.id}`,
    metadata: { ministryId: request.pelayanan.id },
  });
  void sendWaIfEnabled('MINISTRY_JOIN_APPROVED', request.jemaat.noHp, {
    nama: request.jemaat.namaLengkap,
    ministry_nama: request.pelayanan.nama,
    posisi: role.nama,
  });

  res.json({
    success: true,
    data: {
      requestId: request.id,
      status: 'APPROVED',
      membershipId: membership.id,
      posisi: role.nama,
      sinceDate: membership.tanggalMulai,
    },
  });
});

/** POST /admin/ministry/:id/join-requests/:reqId/reject { reason? } */
ministryRouter.post('/:id/join-requests/:reqId/reject', async (req, res) => {
  if (!req.user) throw Unauthorized();
  await assertCanManage(req, req.params.id);
  const { reason } = rejectSchema.parse(req.body ?? {});

  const request = await prisma.pelayananJoinRequest.findFirst({
    where: { id: req.params.reqId, pelayananId: req.params.id },
    include: {
      jemaat: { select: { id: true, namaLengkap: true, noHp: true } },
      pelayanan: { select: { id: true, nama: true } },
    },
  });
  if (!request) throw NotFound('Permintaan tidak ditemukan.');

  const claimed = await prisma.pelayananJoinRequest.updateMany({
    where: { id: request.id, status: 'PENDING' },
    data: {
      status: 'REJECTED',
      rejectReason: reason ?? null,
      reviewedById: req.user.jemaatId,
      reviewedAt: new Date(),
    },
  });
  if (claimed.count === 0) {
    throw new ApiError(409, 'JOIN_REQUEST_NOT_PENDING', 'Permintaan ini sudah diproses.');
  }

  audit(req, {
    action: 'UPDATE',
    resource: 'pelayanan_join_request',
    resourceId: request.id,
    resourceLabel: `Reject join: ${request.jemaat.namaLengkap} @ ${request.pelayanan.nama}`,
    metadata: { reason: reason ?? null },
  });

  void createNotification({
    jemaatId: request.jemaat.id,
    type: 'MINISTRY_JOIN_REJECTED',
    title: `Permintaan bergabung ke ${request.pelayanan.nama}`,
    body: `Permintaan Anda belum dapat disetujui.${reason ? ` Alasan: ${reason}` : ''}`,
    actionUrl: `/ministry/${request.pelayanan.id}`,
    metadata: { ministryId: request.pelayanan.id },
  });
  void sendWaIfEnabled('MINISTRY_JOIN_REJECTED', request.jemaat.noHp, {
    nama: request.jemaat.namaLengkap,
    ministry_nama: request.pelayanan.nama,
    alasan: reason ? `\nAlasan: ${reason}` : '',
  });

  res.json({ success: true, data: { requestId: request.id, status: 'REJECTED' } });
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
          nama: true,
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
    ibadahNama: s.ibadah?.nama ?? null,
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
      ibadah: { select: { id: true, nama: true, jamMulai: true, lokasi: true } },
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

  // Fire notif ke setiap jemaat yang di-assign (in-app + WA kalau enabled)
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
    void (async () => {
      const j = await prisma.jemaat.findUnique({
        where: { id: a.jemaatId },
        select: { noHp: true, namaLengkap: true },
      });
      if (!j?.noHp) return;
      await sendWaIfEnabled('MINISTRY_SCHEDULE_ASSIGNED', j.noHp, {
        nama: j.namaLengkap,
        ministry_nama: ministry.nama,
        tanggal: created.tanggal.toLocaleDateString('id-ID', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          timeZone: 'UTC', // kolom tanggal (@db.Date) — jangan geser zona server
        }),
        posisi: a.pelayananRole.nama,
        notes: a.notes ? `Catatan: ${a.notes}` : '',
      });
    })();
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
      ibadah: { select: { id: true, nama: true, jamMulai: true, lokasi: true } },
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
