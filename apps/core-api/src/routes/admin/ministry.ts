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
import { generateOccurrences } from '../../lib/ibadah-occurrences.js';
import { isMobileClient } from '../../lib/client-kind.js';
import { privacyGate } from '../../lib/privacy.js';
import { infoOrDefault, pendaftaranForCabang, resolveStatus } from '../../lib/pelayanan-pendaftaran.js';
import {
  canManageMinistry,
  checkCanRequestJoin,
  pickMyJoinRequest,
} from '../../lib/ministry-access.js';

export const ministryRouter = Router();

/**
 * Otoritas approval request bergabung (2026-11) — diberikan admin di Portal
 * (Pelayanan → anggota → Otoritas approval) per CABANG. Hanya anggota aktif
 * yang diberi otoritas yang boleh menyetujui/menolak request dari jemaat di
 * cabang tsb (dan mengatur jadwal). Fulltimer boleh semua — hanya di Portal.
 *
 * Map pelayananId → Set cabangId; 'ALL' untuk Fulltimer.
 */
type ApprovalScope = 'ALL' | Map<string, Set<string>>;

async function approvalScope(req: Request): Promise<ApprovalScope> {
  if (!req.user) return new Map();
  // Fulltimer bebas mengelola semua HANYA di Portal. Di app, Fulltimer pun
  // mengikuti otoritas yang diberikan (cabang & pelayanan tertentu).
  if (req.user.isFulltimer && !isMobileClient(req)) return 'ALL';
  const rows = await prisma.pelayananApprover.findMany({
    where: {
      jemaatId: req.user.jemaatId,
      // Otoritas hanya berlaku selama masih anggota aktif pelayanan tsb.
      pelayanan: { jemaatPelayanan: { some: { jemaatId: req.user.jemaatId, isActive: true } } },
    },
    select: { pelayananId: true, cabangId: true },
  });
  const m = new Map<string, Set<string>>();
  for (const r of rows) {
    const set = m.get(r.pelayananId) ?? new Set<string>();
    set.add(r.cabangId);
    m.set(r.pelayananId, set);
  }
  return m;
}

/** Set pelayananId yang punya otoritas (untuk helper lama canManageMinistry). */
function managedIdsOf(scope: ApprovalScope): 'ALL' | Set<string> {
  return scope === 'ALL' ? 'ALL' : new Set(scope.keys());
}

/** Filter Prisma request join sesuai otoritas (pelayanan + cabang pemohon). */
function scopeRequestWhere(scope: ApprovalScope, pelayananId?: string) {
  if (scope === 'ALL') return pelayananId ? { pelayananId } : {};
  const entries = [...scope.entries()].filter(([pid]) => !pelayananId || pid === pelayananId);
  if (!entries.length) return { id: '00000000-0000-0000-0000-000000000000' };
  return { OR: entries.map(([pid, cab]) => ({ pelayananId: pid, jemaat: { cabangId: { in: [...cab] } } })) };
}

async function assertCanManage(req: Request, pelayananId: string): Promise<ApprovalScope> {
  const scope = await approvalScope(req);
  if (!canManageMinistry(managedIdsOf(scope), pelayananId)) {
    throw Forbidden('Hanya anggota yang diberi otoritas approval yang dapat mengelola permintaan bergabung.');
  }
  return scope;
}

/** Pastikan pemohon berada di cabang yang menjadi otoritas requester. */
function assertCabangInScope(scope: ApprovalScope, pelayananId: string, cabangId: string) {
  if (scope === 'ALL') return;
  if (!scope.get(pelayananId)?.has(cabangId)) {
    throw Forbidden('Anda tidak punya otoritas approval untuk cabang pemohon ini.');
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
      // Leader proxy (baris pertama) + 4 foto anggota untuk kartu (2.4.6).
      jemaatPelayanan: {
        where: memberWhere,
        orderBy: [{ pelayananRole: { level: 'desc' } }, { tanggalMulai: 'asc' }],
        take: 4,
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
  const scope = await approvalScope(req);
  const managed = managedIdsOf(scope);
  const pendingByMinistry = new Map<string, number>();
  if (managed === 'ALL' || managed.size > 0) {
    const grouped = await prisma.pelayananJoinRequest.groupBy({
      by: ['pelayananId'],
      where: {
        status: 'PENDING',
        ...scopeRequestWhere(scope),
      },
      _count: { _all: true },
    });
    for (const g of grouped) pendingByMinistry.set(g.pelayananId, g._count._all);
  }

  // Keanggotaan saya (kartu "Pelayanan saya").
  const mine = req.user
    ? await prisma.jemaatPelayanan.findMany({
        where: { jemaatId: req.user.jemaatId, isActive: true },
        select: { pelayananId: true, pelayananRole: { select: { nama: true, level: true } } },
      })
    : [];
  const mineById = new Map(mine.map((x) => [x.pelayananId, x.pelayananRole]));
  // Status pendaftaran untuk cabang saya (patokan = cabang jemaat yang mendaftar).
  const myCabangId = req.user
    ? (await prisma.jemaat.findUnique({ where: { id: req.user.jemaatId }, select: { cabangId: true } }))?.cabangId ?? null
    : null;
  const pendMap = await pendaftaranForCabang(items.map((m) => m.id), myCabangId);

  const data = items.map((m) => ({
    id: m.id,
    nama: m.nama,
    deskripsi: m.deskripsi,
    ikon: m.ikon,
    warna: m.warna,
    myPosisi: mineById.get(m.id)?.nama ?? null,
    pendaftaran: infoOrDefault(pendMap, m.id, myCabangId, m.isActive),
    avatars: m.jemaatPelayanan.map((jp) => ({ id: jp.jemaat.id, namaLengkap: jp.jemaat.namaLengkap, fotoUrl: jp.jemaat.fotoUrl })),
    memberCount: m._count.jemaatPelayanan,
    pendingRequestCount: pendingByMinistry.get(m.id) ?? 0,
    // Menerima pendaftaran dari cabang saya (app lama memakai field ini untuk tombol Gabung).
    isOpen: infoOrDefault(pendMap, m.id, myCabangId, m.isActive)?.status !== 'TUTUP' && m.isActive,
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
  const scope = await approvalScope(req);
  const managed = managedIdsOf(scope);
  const filterId = typeof req.query.pelayananId === 'string' ? req.query.pelayananId : undefined;

  if (managed !== 'ALL' && managed.size === 0) {
    return res.json({ success: true, data: { ministries: [], requests: [], canManageAny: false } });
  }
  if (filterId && !canManageMinistry(managed, filterId)) {
    throw Forbidden('Hanya leader ministry yang dapat mengelola permintaan bergabung.');
  }

  const scopeWhere = scopeRequestWhere(scope);

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
      ...(filterId ? scopeRequestWhere(scope, filterId) : scopeWhere),
    },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      createdAt: true,
      motivasi: true,
      pelayanan: { select: { id: true, nama: true, ikon: true, warna: true } },
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
  if (!item) throw NotFound('Pelayanan tidak ditemukan.');

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
  const scope = await approvalScope(req);
  const canManageRequests = canManageMinistry(managedIdsOf(scope), item.id);
  const pendingRequestCount = canManageRequests
    ? await prisma.pelayananJoinRequest.count({
        where: { status: 'PENDING', ...scopeRequestWhere(scope, item.id) },
      })
    : 0;
  // Cabang tempat requester punya otoritas approval (null = semua / Fulltimer).
  const approvalCabangIds = scope === 'ALL' ? null : [...(scope.get(item.id) ?? [])];
  const meCab = jemaatId
    ? await prisma.jemaat.findUnique({ where: { id: jemaatId }, select: { cabangId: true, cabang: { select: { nama: true } } } })
    : null;
  const myCabangId = meCab?.cabangId ?? null;
  const myPendRaw = infoOrDefault(await pendaftaranForCabang([item.id], myCabangId), item.id, myCabangId, item.isActive);
  const myPend = myPendRaw ? { ...myPendRaw, cabangNama: meCab?.cabang.nama ?? null } : null;

  // Koordinator (pemegang otoritas approval) per cabang — boleh dilihat semua
  // jemaat; no HP mengikuti pengaturan privasi masing-masing.
  const approverRows = await prisma.pelayananApprover.findMany({
    where: {
      pelayananId: item.id,
      jemaat: { isActive: true, jemaatPelayanan: { some: { pelayananId: item.id, isActive: true } } },
    },
    select: {
      cabangId: true,
      jemaat: { select: { id: true, namaLengkap: true, fotoUrl: true, noHp: true } },
    },
  });
  const coordMap = new Map<string, { jemaat: { id: string; namaLengkap: string; fotoUrl: string | null; noHp: string | null }; cabangIds: string[] }>();
  for (const a of approverRows) {
    const e = coordMap.get(a.jemaat.id) ?? { jemaat: a.jemaat, cabangIds: [] };
    e.cabangIds.push(a.cabangId);
    coordMap.set(a.jemaat.id, e);
  }
  const gate = jemaatId ? await privacyGate(jemaatId, [...coordMap.keys()]) : null;
  const coordinators = [...coordMap.values()].map((c) => ({
    jemaat: { ...c.jemaat, noHp: gate?.can(c.jemaat.id, 'noHp') ? c.jemaat.noHp : null },
    cabangIds: c.cabangIds,
  }));

  res.json({
    success: true,
    data: {
      id: item.id,
      nama: item.nama,
      deskripsi: item.deskripsi,
      ikon: item.ikon,
      warna: item.warna,
      // Menerima pendaftaran dari cabang saya (app lama: tombol Gabung).
      isOpen: item.isActive && myPend?.status !== 'TUTUP',
      pendaftaran: myPend,
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
        posisiLevel: jp.pelayananRole.level,
        sinceDate: jp.tanggalMulai,
      })),
      coordinators,
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
      approvalCabangIds,
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
  if (!ministry) throw NotFound('Pelayanan tidak ditemukan.');
  if (!ministry.isActive) throw BadRequest('Ministry ini tidak buka untuk join');
  // Pendaftaran per cabang pemohon.
  {
    const pem = await prisma.jemaat.findUnique({ where: { id: jemaatId }, select: { cabangId: true, cabang: { select: { nama: true } } } });
    const row = pem
      ? await prisma.pelayananPendaftaran.findUnique({
          where: { pelayananId_cabangId: { pelayananId: ministry.id, cabangId: pem.cabangId } },
          select: { isOpen: true, tutupOtomatis: true },
        })
      : null;
    if (resolveStatus(row) === 'TUTUP') {
      throw new ApiError(403, 'PENDAFTARAN_TUTUP', `Pendaftaran ${ministry.nama} di ${pem?.cabang.nama ?? 'cabang Anda'} sedang ditutup.`);
    }
  }
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

  // Notif ke pemegang otoritas approval untuk cabang pemohon (anggota aktif).
  const pemohon = await prisma.jemaat.findUnique({ where: { id: jemaatId }, select: { cabangId: true } });
  const leaders = await prisma.pelayananApprover.findMany({
    where: {
      pelayananId: ministry.id,
      cabangId: pemohon?.cabangId ?? '00000000-0000-0000-0000-000000000000',
      jemaatId: { not: jemaatId },
      jemaat: { isActive: true, jemaatPelayanan: { some: { pelayananId: ministry.id, isActive: true } } },
    },
    select: { jemaat: { select: { id: true, namaLengkap: true, noHp: true } } },
    take: 20,
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
  const scope = await assertCanManage(req, req.params.id);
  const rows = await prisma.pelayananJoinRequest.findMany({
    where: { status: 'PENDING', ...scopeRequestWhere(scope, req.params.id) },
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
  const scope = await assertCanManage(req, req.params.id);
  const { roleId } = approveSchema.parse(req.body);

  const role = await prisma.pelayananRole.findFirst({
    where: { id: roleId, pelayananId: req.params.id, isActive: true },
    select: { id: true, nama: true },
  });
  if (!role) throw BadRequest('Peran tidak ditemukan di ministry ini.');

  const request = await prisma.pelayananJoinRequest.findFirst({
    where: { id: req.params.reqId, pelayananId: req.params.id },
    include: {
      jemaat: { select: { id: true, namaLengkap: true, noHp: true, cabangId: true } },
      pelayanan: { select: { id: true, nama: true } },
    },
  });
  if (!request) throw NotFound('Permintaan tidak ditemukan.');
  assertCabangInScope(scope, request.pelayananId, request.jemaat.cabangId);

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
  const scope = await assertCanManage(req, req.params.id);
  const { reason } = rejectSchema.parse(req.body ?? {});

  const request = await prisma.pelayananJoinRequest.findFirst({
    where: { id: req.params.reqId, pelayananId: req.params.id },
    include: {
      jemaat: { select: { id: true, namaLengkap: true, noHp: true, cabangId: true } },
      pelayanan: { select: { id: true, nama: true } },
    },
  });
  if (!request) throw NotFound('Permintaan tidak ditemukan.');
  assertCabangInScope(scope, request.pelayananId, request.jemaat.cabangId);

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
  if (!ministry) throw NotFound('Pelayanan tidak ditemukan.');

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
  if (!ministry) throw NotFound('Pelayanan tidak ditemukan.');

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

// ============================================================
//  Atur jadwal petugas pelayanan (2.4.6) — oleh pemegang OTORITAS APPROVAL,
//  untuk ibadah / event di cabang otoritasnya. Menulis ke petugas resmi
//  (IbadahPelayananPetugas / EventPelayananPetugas) → tampil di detail ibadah,
//  Portal, dan "Jadwal Pelayanan Saya". Hak scan kehadiran TIDAK diatur dari app
//  (petugas baru = false, nilai lama dipertahankan).
//
//   GET /admin/ministry/:id/jadwal?cabangId=&weeks=8
//   PUT /admin/ministry/:id/jadwal/ibadah/:ibadahId
//        { tanggal: 'YYYY-MM-DD', scope: 'TANGGAL'|'DEFAULT'|'RESET', petugas: [{ jemaatId, pelayananRoleId }] }
//   PUT /admin/ministry/:id/jadwal/event/:eventId { petugas: [{ jemaatId, pelayananRoleId }] }
// ============================================================

const ymdUtc = (d: Date) => d.toISOString().slice(0, 10);
const UUIDV = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Cabang tempat requester boleh mengatur jadwal pelayanan ini. */
async function jadwalCabangIds(req: Request, pelayananId: string): Promise<'ALL' | string[]> {
  const scope = await approvalScope(req);
  if (scope === 'ALL') return 'ALL';
  const set = scope.get(pelayananId);
  if (!set || !set.size) throw Forbidden('Hanya anggota dengan otoritas yang dapat mengatur jadwal pelayanan.');
  return [...set];
}

function assertCabangAllowed(allowed: 'ALL' | string[], cabangId: string | null) {
  if (allowed === 'ALL') return;
  if (!cabangId || !allowed.includes(cabangId)) throw Forbidden('Anda tidak punya otoritas di cabang ini.');
}

const petugasSelect = {
  id: true,
  jemaatId: true,
  tanggalIbadah: true,
  canScanAttendance: true,
  pelayananRole: { select: { id: true, nama: true, level: true } },
  jemaat: { select: { id: true, namaLengkap: true, fotoUrl: true } },
} as const;

ministryRouter.get('/:id/jadwal', async (req, res) => {
  if (!req.user) throw Unauthorized();
  if (!UUIDV.test(req.params.id)) throw NotFound('Pelayanan tidak ditemukan.');
  const allowed = await jadwalCabangIds(req, req.params.id);
  const q = z
    .object({ cabangId: z.string().uuid().optional(), weeks: z.coerce.number().int().min(1).max(12).default(8) })
    .parse(req.query);
  const pel = await prisma.pelayanan.findUnique({
    where: { id: req.params.id },
    select: {
      id: true,
      nama: true,
      ikon: true,
      warna: true,
      roles: { where: { isActive: true }, orderBy: { level: 'desc' }, select: { id: true, nama: true, level: true } },
    },
  });
  if (!pel) throw NotFound('Pelayanan tidak ditemukan.');

  const cabangList = await prisma.cabangGereja.findMany({
    where: { isActive: true, ...(allowed === 'ALL' ? {} : { id: { in: allowed } }) },
    orderBy: { nama: 'asc' },
    select: { id: true, nama: true },
  });
  const cabangId = q.cabangId ?? cabangList[0]?.id;
  if (!cabangId) {
    res.json({ success: true, data: { pelayanan: pel, cabang: cabangList, cabangId: null, ibadah: [], events: [], members: [] } });
    return;
  }
  assertCabangAllowed(allowed, cabangId);

  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const to = new Date(from.getTime() + q.weeks * 7 * 86_400_000);

  const [links, cancelledRows, eventRows, members] = await Promise.all([
    prisma.ibadahPelayanan.findMany({
      where: { pelayananId: pel.id, ibadah: { cabangId, isActive: true } },
      select: {
        id: true,
        ibadah: {
          select: { id: true, nama: true, jamMulai: true, jamSelesai: true, tipeJadwal: true, tanggalMulai: true, hari: true, mingguKe: true },
        },
        petugas: { select: petugasSelect },
      },
    }),
    prisma.ibadahOccurrenceStatus.findMany({
      where: { ibadah: { cabangId }, status: 'CANCELLED', tanggalIbadah: { gte: from, lte: to } },
      select: { ibadahId: true, tanggalIbadah: true },
    }),
    prisma.event.findMany({
      where: {
        isActive: true,
        cabangId,
        OR: [{ tanggalSelesai: { gte: from } }, { tanggalSelesai: null, tanggalMulai: { gte: from } }],
        tanggalMulai: { lte: to },
      },
      orderBy: { tanggalMulai: 'asc' },
      take: 50,
      select: {
        id: true,
        judul: true,
        tanggalMulai: true,
        tanggalSelesai: true,
        jamMulai: true,
        pelayanan: {
          where: { pelayananId: pel.id },
          select: {
            petugas: {
              select: {
                id: true,
                jemaatId: true,
                pelayananRole: { select: { id: true, nama: true, level: true } },
                jemaat: { select: { id: true, namaLengkap: true, fotoUrl: true } },
              },
            },
          },
        },
      },
    }),
    prisma.jemaatPelayanan.findMany({
      where: { pelayananId: pel.id, isActive: true, jemaat: { isActive: true } },
      orderBy: { jemaat: { namaLengkap: 'asc' } },
      select: {
        pelayananRole: { select: { id: true, nama: true, level: true } },
        jemaat: { select: { id: true, namaLengkap: true, fotoUrl: true, cabang: { select: { id: true, nama: true } } } },
      },
    }),
  ]);
  const cancelled = new Set(cancelledRows.map((c) => `${c.ibadahId}:${ymdUtc(c.tanggalIbadah)}`));
  const strip = (r: { id: string; jemaat: { id: string; namaLengkap: string; fotoUrl: string | null }; pelayananRole: { id: string; nama: string; level: number } }) => ({
    id: r.id,
    jemaat: r.jemaat,
    role: r.pelayananRole,
  });

  const ibadah: unknown[] = [];
  for (const l of links) {
    for (const d of generateOccurrences(l.ibadah, from, to)) {
      const tanggal = ymdUtc(d);
      if (cancelled.has(`${l.ibadah.id}:${tanggal}`)) continue;
      const overrides = l.petugas.filter((p) => p.tanggalIbadah && ymdUtc(p.tanggalIbadah) === tanggal);
      const defaults = l.petugas.filter((p) => p.tanggalIbadah === null);
      ibadah.push({
        key: `${l.ibadah.id}:${tanggal}`,
        ibadahId: l.ibadah.id,
        nama: l.ibadah.nama,
        jamMulai: l.ibadah.jamMulai,
        jamSelesai: l.ibadah.jamSelesai,
        tanggal,
        // TANGGAL = susunan khusus tanggal ini; DEFAULT = ikut susunan tiap minggu.
        source: overrides.length ? 'TANGGAL' : 'DEFAULT',
        petugas: (overrides.length ? overrides : defaults).map(strip),
        defaultPetugas: defaults.map(strip),
      });
    }
  }
  ibadah.sort((a: any, b: any) => (a.tanggal + a.jamMulai).localeCompare(b.tanggal + b.jamMulai));

  res.json({
    success: true,
    data: {
      pelayanan: pel,
      cabang: cabangList,
      cabangId,
      ibadah,
      events: eventRows.map((e) => ({
        eventId: e.id,
        judul: e.judul,
        tanggalMulai: e.tanggalMulai,
        tanggalSelesai: e.tanggalSelesai,
        jamMulai: e.jamMulai,
        petugas: (e.pelayanan[0]?.petugas ?? []).map(strip),
      })),
      // Anggota aktif pelayanan (semua cabang; app menampilkan cabang ini lebih dulu).
      members: members.map((m) => ({ jemaat: m.jemaat, role: m.pelayananRole })),
    },
  });
});

const petugasInput = z.array(z.object({ jemaatId: z.string().uuid(), pelayananRoleId: z.string().uuid() })).max(60);

/** Validasi petugas: anggota aktif pelayanan + role milik pelayanan. Dedup per jemaat. */
async function validatePetugas(pelayananId: string, list: z.infer<typeof petugasInput>) {
  const seen = new Set<string>();
  const uniq = list.filter((p) => (seen.has(p.jemaatId) ? false : (seen.add(p.jemaatId), true)));
  if (!uniq.length) return uniq;
  const [members, roles] = await Promise.all([
    prisma.jemaatPelayanan.findMany({
      where: { pelayananId, isActive: true, jemaatId: { in: uniq.map((p) => p.jemaatId) } },
      select: { jemaatId: true },
    }),
    prisma.pelayananRole.findMany({ where: { pelayananId, isActive: true }, select: { id: true } }),
  ]);
  const memberSet = new Set(members.map((m) => m.jemaatId));
  const roleSet = new Set(roles.map((r) => r.id));
  for (const p of uniq) {
    if (!memberSet.has(p.jemaatId)) throw BadRequest('Petugas harus anggota aktif pelayanan ini.');
    if (!roleSet.has(p.pelayananRoleId)) throw BadRequest('Peran tidak ditemukan di pelayanan ini.');
  }
  return uniq;
}

/** Kirim notifikasi ke yang baru dijadwalkan / dikeluarkan dari jadwal. */
function notifyDutyChanges(
  before: string[],
  after: string[],
  self: string,
  ctx: { ministry: string; label: string; ministryId: string },
) {
  const b = new Set(before);
  const a = new Set(after);
  for (const id of a) {
    if (b.has(id) || id === self) continue;
    void createNotification({
      jemaatId: id,
      type: 'MINISTRY_DUTY_ASSIGNED',
      title: `Jadwal pelayanan ${ctx.ministry}`,
      body: `Anda dijadwalkan melayani: ${ctx.label}. Lihat di Jadwal Pelayanan Saya.`,
      actionUrl: '/profile/my-service',
      metadata: { ministryId: ctx.ministryId },
    });
  }
  for (const id of b) {
    if (a.has(id) || id === self) continue;
    void createNotification({
      jemaatId: id,
      type: 'MINISTRY_DUTY_REMOVED',
      title: `Perubahan jadwal ${ctx.ministry}`,
      body: `Anda tidak lagi dijadwalkan: ${ctx.label}.`,
      actionUrl: '/profile/my-service',
      metadata: { ministryId: ctx.ministryId },
    });
  }
}

const fmtTanggalId = (ymd: string) =>
  new Date(`${ymd}T00:00:00Z`).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

ministryRouter.put('/:id/jadwal/ibadah/:ibadahId', async (req, res) => {
  if (!req.user) throw Unauthorized();
  if (!UUIDV.test(req.params.id) || !UUIDV.test(req.params.ibadahId)) throw NotFound('Ibadah atau pelayanan tidak ditemukan.');
  const allowed = await jadwalCabangIds(req, req.params.id);
  const body = z
    .object({
      tanggal: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      scope: z.enum(['TANGGAL', 'DEFAULT', 'RESET']),
      petugas: petugasInput.default([]),
    })
    .parse(req.body ?? {});
  const link = await prisma.ibadahPelayanan.findFirst({
    where: { ibadahId: req.params.ibadahId, pelayananId: req.params.id },
    select: {
      id: true,
      pelayanan: { select: { nama: true } },
      ibadah: { select: { nama: true, jamMulai: true, cabangId: true } },
      petugas: { select: { jemaatId: true, tanggalIbadah: true, canScanAttendance: true } },
    },
  });
  if (!link) throw NotFound('Pelayanan ini belum terhubung ke ibadah tersebut.');
  assertCabangAllowed(allowed, link.ibadah.cabangId);
  const tgl = new Date(`${body.tanggal}T00:00:00Z`);
  const defaults = link.petugas.filter((p) => p.tanggalIbadah === null);
  const overrides = link.petugas.filter((p) => p.tanggalIbadah && ymdUtc(p.tanggalIbadah) === body.tanggal);
  const effectiveBefore = (overrides.length ? overrides : defaults).map((p) => p.jemaatId);
  // Pertahankan hak scan yang sudah diberikan admin di Portal.
  const scanOf = new Set(link.petugas.filter((p) => p.canScanAttendance).map((p) => p.jemaatId));
  const list = body.scope === 'RESET' ? [] : await validatePetugas(req.params.id, body.petugas);

  await prisma.$transaction(async (tx) => {
    if (body.scope === 'DEFAULT') {
      await tx.ibadahPelayananPetugas.deleteMany({ where: { ibadahPelayananId: link.id, tanggalIbadah: null } });
      // Tanggal ini ikut susunan default yang baru.
      await tx.ibadahPelayananPetugas.deleteMany({ where: { ibadahPelayananId: link.id, tanggalIbadah: tgl } });
    } else {
      await tx.ibadahPelayananPetugas.deleteMany({ where: { ibadahPelayananId: link.id, tanggalIbadah: tgl } });
    }
    if (list.length) {
      await tx.ibadahPelayananPetugas.createMany({
        data: list.map((p) => ({
          ibadahPelayananId: link.id,
          jemaatId: p.jemaatId,
          pelayananRoleId: p.pelayananRoleId,
          tanggalIbadah: body.scope === 'DEFAULT' ? null : tgl,
          canScanAttendance: scanOf.has(p.jemaatId),
        })),
      });
    }
  });

  const effectiveAfter =
    body.scope === 'RESET' ? defaults.map((p) => p.jemaatId) : list.map((p) => p.jemaatId);
  const label =
    body.scope === 'DEFAULT'
      ? `${link.ibadah.nama} (${link.ibadah.jamMulai}) — setiap jadwal`
      : `${link.ibadah.nama}, ${fmtTanggalId(body.tanggal)} ${link.ibadah.jamMulai}`;
  notifyDutyChanges(
    body.scope === 'DEFAULT' ? defaults.map((p) => p.jemaatId) : effectiveBefore,
    effectiveAfter,
    req.user.jemaatId,
    { ministry: link.pelayanan.nama, label, ministryId: req.params.id },
  );
  audit(req, {
    action: 'UPDATE',
    resource: 'ibadah_pelayanan_petugas',
    resourceId: link.id,
    resourceLabel: `Jadwal ${link.pelayanan.nama} · ${label} (${body.scope === 'RESET' ? 'kembali ke default' : `${list.length} petugas`})`,
    metadata: { scope: body.scope, tanggal: body.tanggal, petugas: list, via: 'app' },
  });
  res.json({ success: true, data: { ok: true } });
});

ministryRouter.put('/:id/jadwal/event/:eventId', async (req, res) => {
  if (!req.user) throw Unauthorized();
  if (!UUIDV.test(req.params.id) || !UUIDV.test(req.params.eventId)) throw NotFound('Event atau pelayanan tidak ditemukan.');
  const allowed = await jadwalCabangIds(req, req.params.id);
  const body = z.object({ petugas: petugasInput.default([]) }).parse(req.body ?? {});
  const [event, pel] = await Promise.all([
    prisma.event.findUnique({ where: { id: req.params.eventId }, select: { id: true, judul: true, cabangId: true, tanggalMulai: true } }),
    prisma.pelayanan.findUnique({ where: { id: req.params.id }, select: { nama: true } }),
  ]);
  if (!event || !pel) throw NotFound('Event atau pelayanan tidak ditemukan.');
  assertCabangAllowed(allowed, event.cabangId);
  const list = await validatePetugas(req.params.id, body.petugas);

  const link = await prisma.eventPelayanan.upsert({
    where: { eventId_pelayananId: { eventId: event.id, pelayananId: req.params.id } },
    create: { eventId: event.id, pelayananId: req.params.id },
    update: {},
    select: { id: true, petugas: { select: { jemaatId: true, canScanAttendance: true } } },
  });
  const before = link.petugas.map((p) => p.jemaatId);
  const scanOf = new Set(link.petugas.filter((p) => p.canScanAttendance).map((p) => p.jemaatId));
  await prisma.$transaction([
    prisma.eventPelayananPetugas.deleteMany({ where: { eventPelayananId: link.id } }),
    prisma.eventPelayananPetugas.createMany({
      data: list.map((p) => ({
        eventPelayananId: link.id,
        jemaatId: p.jemaatId,
        pelayananRoleId: p.pelayananRoleId,
        canScanAttendance: scanOf.has(p.jemaatId),
      })),
    }),
  ]);
  const label = `${event.judul}, ${fmtTanggalId(ymdUtc(event.tanggalMulai))}`;
  notifyDutyChanges(before, list.map((p) => p.jemaatId), req.user.jemaatId, { ministry: pel.nama, label, ministryId: req.params.id });
  audit(req, {
    action: 'UPDATE',
    resource: 'event_pelayanan_petugas',
    resourceId: link.id,
    resourceLabel: `Jadwal ${pel.nama} · ${label} (${list.length} petugas)`,
    metadata: { petugas: list, via: 'app' },
  });
  res.json({ success: true, data: { ok: true } });
});

// ============================================================
//  Buka / tutup pendaftaran per cabang (2.4.6) — pemegang otoritas cabang
//  (app) atau admin Fulltimer (Portal).
//   GET /admin/ministry/:id/pendaftaran            → status cabang yang boleh dikelola
//   PUT /admin/ministry/:id/pendaftaran/:cabangId  { isOpen, catatan?, tutupOtomatis?: 'YYYY-MM-DD'|null }
// ============================================================

ministryRouter.get('/:id/pendaftaran', async (req, res) => {
  if (!req.user) throw Unauthorized();
  if (!UUIDV.test(req.params.id)) throw NotFound('Pelayanan tidak ditemukan.');
  const allowed = await jadwalCabangIds(req, req.params.id);
  const pel = await prisma.pelayanan.findUnique({ where: { id: req.params.id }, select: { isActive: true } });
  if (!pel) throw NotFound('Pelayanan tidak ditemukan.');
  const [cabang, rows] = await Promise.all([
    prisma.cabangGereja.findMany({
      where: { isActive: true, ...(allowed === 'ALL' ? {} : { id: { in: allowed } }) },
      orderBy: { nama: 'asc' },
      select: { id: true, nama: true },
    }),
    prisma.pelayananPendaftaran.findMany({ where: { pelayananId: req.params.id } }),
  ]);
  const byCabang = new Map(rows.map((r) => [r.cabangId, r]));
  res.json({
    success: true,
    data: cabang.map((c) => {
      const r = byCabang.get(c.id);
      return {
        cabangId: c.id,
        cabangNama: c.nama,
        status: resolveStatus(r ?? null, pel.isActive),
        catatan: r?.catatan ?? null,
        tutupOtomatis: r?.tutupOtomatis ? ymdUtc(r.tutupOtomatis) : null,
        updatedAt: r?.updatedAt ?? null,
      };
    }),
  });
});

ministryRouter.put('/:id/pendaftaran/:cabangId', async (req, res) => {
  if (!req.user) throw Unauthorized();
  if (!UUIDV.test(req.params.id) || !UUIDV.test(req.params.cabangId)) throw NotFound('Pelayanan atau cabang tidak ditemukan.');
  const allowed = await jadwalCabangIds(req, req.params.id);
  assertCabangAllowed(allowed, req.params.cabangId);
  const body = z
    .object({
      isOpen: z.boolean(),
      catatan: z.string().trim().max(500).nullish(),
      tutupOtomatis: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
    })
    .parse(req.body ?? {});
  const [pel, cab] = await Promise.all([
    prisma.pelayanan.findUnique({ where: { id: req.params.id }, select: { nama: true } }),
    prisma.cabangGereja.findUnique({ where: { id: req.params.cabangId }, select: { nama: true } }),
  ]);
  if (!pel || !cab) throw NotFound('Pelayanan atau cabang tidak ditemukan.');
  const data = {
    isOpen: body.isOpen,
    catatan: body.isOpen ? body.catatan || null : null,
    tutupOtomatis: body.isOpen && body.tutupOtomatis ? new Date(`${body.tutupOtomatis}T00:00:00Z`) : null,
    updatedById: req.user.jemaatId,
  };
  await prisma.pelayananPendaftaran.upsert({
    where: { pelayananId_cabangId: { pelayananId: req.params.id, cabangId: req.params.cabangId } },
    create: { pelayananId: req.params.id, cabangId: req.params.cabangId, ...data },
    update: data,
  });
  audit(req, {
    action: 'UPDATE',
    resource: 'pelayanan_pendaftaran',
    resourceId: req.params.id,
    resourceLabel: `${body.isOpen ? 'Buka' : 'Tutup'} pendaftaran ${pel.nama} @ ${cab.nama}`,
    metadata: { cabangId: req.params.cabangId, ...body },
  });
  res.json({ success: true, data: { ok: true } });
});
