/**
 * Group (Module 23) — CRUD + membership + join workflow.
 *
 * Mounted at: /admin/group
 *
 * Endpoint summary:
 *   Public/PIC/Admin:
 *     GET    /                       list (filter: cabangId, jenis, parentId, search)
 *     GET    /:id                    detail + members + children
 *     POST   /                       create (PIC/admin only)
 *     PATCH  /:id                    update
 *     DELETE /:id                    dismiss (soft delete + notif members)
 *     POST   /:id/regenerate-code    rotate joinCode (private group only)
 *     POST   /:id/members/:jemaatId  add member direct (PIC bypass approval)
 *     DELETE /:id/members/:jemaatId  remove member (PIC + notif)
 *
 *   Self-service:
 *     POST   /:id/join               join public group (direct)
 *     POST   /join-by-code           join private group via invitation code
 *     DELETE /:id/leave              leave self
 *
 * Visibility rules:
 *   - Public group: siapa aja bisa lihat + join direct
 *   - Private group: HIDDEN dari listing kalau bukan member/PIC/admin.
 *     Join hanya via joinCode (QR scan mobile / manual input).
 *
 * PIC identity: PIC = Group.picJemaatId. Admin fulltimer (isFulltimer=true)
 * auto-passes semua auth check (mirror pattern Homecell).
 */
import { Router } from 'express';
import { prisma, type Prisma } from '@ecc/database';
import {
  createGroupSchema,
  updateGroupSchema,
  addGroupMemberSchema,
  joinByCodeSchema,
  paginationQuerySchema,
} from '@ecc/shared-types';
import { ApiError, BadRequest, NotFound, Conflict, Forbidden, Unauthorized } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import {
  assertCanManageGroup,
  assertCanViewGroup,
  generateUniqueJoinCode,
} from '../../lib/group-authz.js';
import {
  notifMemberAdded,
  notifMemberRemoved,
  notifGroupDismissed,
} from '../../lib/group-notif.js';
import { getJemaatIdForUser } from '../../lib/homecell-pic.js';

export const groupRouter = Router();

/** Helper — extract requester context (jemaatId + isFulltimer) dari JWT. */
async function getRequester(req: import('express').Request) {
  const userSub = req.user?.sub;
  if (!userSub) throw new ApiError(401, 'UNAUTHORIZED', 'Auth required');
  const isFulltimer = req.user?.isFulltimer === true;
  const jemaatId = await getJemaatIdForUser(userSub);
  if (!jemaatId) throw new ApiError(401, 'UNAUTHORIZED', 'User tanpa jemaat profile');
  return { jemaatId, isFulltimer };
}

// ============================================================
// GET / — list groups
// ============================================================
// Filter: cabangId, jenis, parentId, search. Public group visible ke semua.
// Private group hanya visible kalau requester member/PIC atau isFulltimer.
groupRouter.get('/', async (req, res) => {
  const q = paginationQuerySchema.parse(req.query);
  const cabangId = typeof req.query.cabangId === 'string' ? req.query.cabangId : undefined;
  const jenis = typeof req.query.jenis === 'string' ? req.query.jenis : undefined;
  const parentIdParam = typeof req.query.parentId === 'string' ? req.query.parentId : undefined;

  const requester = await getRequester(req);

  // Base filter — isActive true (skip dismissed)
  const where: Prisma.GroupWhereInput = { isActive: true };
  if (q.search) where.nama = { contains: q.search, mode: 'insensitive' };
  if (cabangId) where.cabangId = cabangId;
  if (jenis) where.jenis = jenis as Prisma.GroupWhereInput['jenis'];
  if (parentIdParam === 'null' || parentIdParam === 'root') {
    where.parentId = null;
  } else if (parentIdParam) {
    where.parentId = parentIdParam;
  }

  // Private group visibility — kalau bukan fulltimer, exclude private
  // kecuali requester member atau PIC. Query dua tahap simpler:
  //   1. Fetch all matching where (bisa banyak)
  //   2. Filter di code: keep public + (private & (member|pic|fulltimer))
  // Untuk performa besar, bisa optimize dgn subquery, tapi 314 group Bandung
  // (~500 total across 8 cabang) masih OK in-memory filter.
  const [allRows, total] = await Promise.all([
    prisma.group.findMany({
      where,
      skip: (q.page - 1) * q.limit,
      take: q.limit * 2, // over-fetch untuk kompensasi filter
      orderBy: { [q.sortBy ?? 'nama']: q.sortOrder },
      include: {
        cabang: { select: { id: true, nama: true, kode: true } },
        picJemaat: { select: { id: true, namaLengkap: true, fotoUrl: true } },
        _count: { select: { members: { where: { isActive: true } }, children: true } },
      },
    }),
    prisma.group.count({ where }),
  ]);

  let visible = allRows;
  if (!requester.isFulltimer) {
    // Fetch jemaat's membership set + PIC set untuk private visibility
    const [memberships, picOf] = await Promise.all([
      prisma.groupMember.findMany({
        where: { jemaatId: requester.jemaatId, isActive: true },
        select: { groupId: true },
      }),
      prisma.group.findMany({
        where: { picJemaatId: requester.jemaatId },
        select: { id: true },
      }),
    ]);
    const memberSet = new Set([
      ...memberships.map((m) => m.groupId),
      ...picOf.map((g) => g.id),
    ]);
    visible = allRows.filter(
      (g) => g.isPublic || memberSet.has(g.id),
    );
  }

  // Trim ke q.limit setelah filter
  visible = visible.slice(0, q.limit);

  const data = visible.map((g) => ({
    ...g,
    memberCount: g._count.members,
    childrenCount: g._count.children,
    // Hide joinCode dari non-PIC/non-admin listing (privacy — code = invitation)
    joinCode:
      requester.isFulltimer || g.picJemaatId === requester.jemaatId
        ? g.joinCode
        : null,
  }));

  res.json({
    success: true,
    data,
    meta: { page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit) },
  });
});

// ============================================================
// POST /join-by-code — join private group via invitation code
// ============================================================
// MUST be declared before /:id supaya routing gak nyangkut ke /:id handler.
groupRouter.post('/join-by-code', async (req, res) => {
  const { code } = joinByCodeSchema.parse(req.body);
  const requester = await getRequester(req);

  const group = await prisma.group.findUnique({
    where: { joinCode: code.toUpperCase() },
    select: { id: true, nama: true, isActive: true },
  });
  if (!group || !group.isActive) throw NotFound('Kode invitation tidak valid');

  // Check apakah sudah member
  const existing = await prisma.groupMember.findUnique({
    where: { groupId_jemaatId: { groupId: group.id, jemaatId: requester.jemaatId } },
    select: { id: true, isActive: true },
  });
  if (existing?.isActive) {
    return res.json({
      success: true,
      message: 'Anda sudah member group ini',
      data: { groupId: group.id, alreadyMember: true },
    });
  }

  // Create atau reactivate
  await prisma.groupMember.upsert({
    where: { groupId_jemaatId: { groupId: group.id, jemaatId: requester.jemaatId } },
    create: { groupId: group.id, jemaatId: requester.jemaatId, isActive: true },
    update: { isActive: true, tanggalKeluar: null },
  });

  await notifMemberAdded(group.id, requester.jemaatId).catch(() => {});

  audit(req, {
    action: 'CREATE',
    resource: 'group_member',
    resourceLabel: `Join by code: ${group.nama}`,
    metadata: { groupId: group.id, via: 'invitation_code' },
  });

  res.json({
    success: true,
    message: `Berhasil bergabung ke ${group.nama}`,
    data: { groupId: group.id, groupNama: group.nama },
  });
});

// ============================================================
// GET /:id — detail group
// ============================================================
groupRouter.get('/:id', async (req, res) => {
  const requester = await getRequester(req);
  await assertCanViewGroup(req.params.id, requester.jemaatId, requester.isFulltimer);

  const group = await prisma.group.findUnique({
    where: { id: req.params.id },
    include: {
      cabang: { select: { id: true, nama: true, kode: true } },
      parent: { select: { id: true, nama: true } },
      children: {
        where: { isActive: true },
        select: { id: true, nama: true, jenis: true, _count: { select: { members: true } } },
        orderBy: { nama: 'asc' },
      },
      picJemaat: {
        select: { id: true, namaLengkap: true, fotoUrl: true, noHp: true },
      },
      members: {
        where: { isActive: true },
        orderBy: { tanggalBergabung: 'desc' },
        include: {
          jemaat: {
            select: { id: true, namaLengkap: true, fotoUrl: true, noHp: true },
          },
        },
      },
      _count: { select: { members: { where: { isActive: true } } } },
    },
  });
  if (!group) throw NotFound('Group tidak ditemukan');

  // Hide joinCode kalau bukan PIC/admin
  const isPicOrAdmin =
    requester.isFulltimer || group.picJemaatId === requester.jemaatId;
  const { _count, ...rest } = group;
  res.json({
    success: true,
    data: {
      ...rest,
      memberCount: _count.members,
      joinCode: isPicOrAdmin ? group.joinCode : null,
    },
  });
});

// ============================================================
// POST / — create group (any authenticated jemaat, admin bisa set apapun)
// ============================================================
groupRouter.post('/', async (req, res) => {
  const requester = await getRequester(req);
  const input = createGroupSchema.parse(req.body);

  // Kalau isPublic=false, auto-generate joinCode
  const joinCode = input.isPublic === false ? await generateUniqueJoinCode() : null;

  // PIC default = requester kalau tidak specified
  const picJemaatId = input.picJemaatId ?? requester.jemaatId;

  const created = await prisma.group.create({
    data: {
      cabangId: input.cabangId,
      parentId: input.parentId,
      nama: input.nama,
      deskripsi: input.deskripsi,
      jenis: input.jenis,
      alamat: input.alamat,
      gps: input.gps,
      hari: input.hari,
      jam: input.jam,
      picJemaatId,
      isPublic: input.isPublic,
      isActive: input.isActive,
      joinCode,
    },
  });

  audit(req, {
    action: 'CREATE',
    resource: 'group',
    resourceId: created.id,
    resourceLabel: created.nama,
    after: created,
  });

  res.status(201).json({ success: true, data: created });
});

// ============================================================
// PATCH /:id — update group (PIC/admin)
// ============================================================
// Kalau toggle isPublic: true→false → auto-generate joinCode.
// Kalau false→true → clear joinCode.
groupRouter.patch('/:id', async (req, res) => {
  const requester = await getRequester(req);
  await assertCanManageGroup(req.params.id, requester.jemaatId, requester.isFulltimer);

  const input = updateGroupSchema.parse(req.body);
  const before = await prisma.group.findUnique({ where: { id: req.params.id } });
  if (!before) throw NotFound('Group tidak ditemukan');

  const updateData: Prisma.GroupUpdateInput = {};
  if (input.parentId !== undefined) {
    updateData.parent = input.parentId ? { connect: { id: input.parentId } } : { disconnect: true };
  }
  if (input.nama !== undefined) updateData.nama = input.nama;
  if (input.deskripsi !== undefined) updateData.deskripsi = input.deskripsi;
  if (input.jenis !== undefined) updateData.jenis = input.jenis;
  if (input.alamat !== undefined) updateData.alamat = input.alamat;
  if (input.gps !== undefined) updateData.gps = input.gps;
  if (input.hari !== undefined) updateData.hari = input.hari;
  if (input.jam !== undefined) updateData.jam = input.jam;
  if (input.picJemaatId !== undefined) {
    updateData.picJemaat = input.picJemaatId
      ? { connect: { id: input.picJemaatId } }
      : { disconnect: true };
  }
  if (input.isActive !== undefined) updateData.isActive = input.isActive;

  // Visibility toggle logic
  if (input.isPublic !== undefined && input.isPublic !== before.isPublic) {
    updateData.isPublic = input.isPublic;
    if (input.isPublic === false) {
      // Baru dijadikan private → generate joinCode
      updateData.joinCode = await generateUniqueJoinCode();
    } else {
      // Baru dijadikan public → clear joinCode
      updateData.joinCode = null;
    }
  }

  const updated = await prisma.group.update({
    where: { id: req.params.id },
    data: updateData,
  });

  audit(req, {
    action: 'UPDATE',
    resource: 'group',
    resourceId: updated.id,
    resourceLabel: updated.nama,
    before,
    after: updated,
  });

  res.json({ success: true, data: updated });
});

// ============================================================
// DELETE /:id — dismiss group (soft delete + notif all members)
// ============================================================
groupRouter.delete('/:id', async (req, res) => {
  const requester = await getRequester(req);
  await assertCanManageGroup(req.params.id, requester.jemaatId, requester.isFulltimer);

  const before = await prisma.group.findUnique({
    where: { id: req.params.id },
    select: { id: true, nama: true, isActive: true, _count: { select: { members: true } } },
  });
  if (!before) throw NotFound('Group tidak ditemukan');
  if (!before.isActive) throw BadRequest('Group sudah dismissed');

  // Notif ke members SEBELUM soft-delete (query members yg masih aktif)
  await notifGroupDismissed(req.params.id).catch(() => {});

  const updated = await prisma.group.update({
    where: { id: req.params.id },
    data: { isActive: false },
  });

  audit(req, {
    action: 'DELETE',
    resource: 'group',
    resourceId: updated.id,
    resourceLabel: `Dismissed: ${updated.nama} (${before._count.members} members notified)`,
    before,
    after: updated,
  });

  res.json({
    success: true,
    message: `Group "${updated.nama}" dismissed. ${before._count.members} members di-notif.`,
    data: updated,
  });
});

// ============================================================
// POST /:id/regenerate-code — rotate joinCode (private group only)
// ============================================================
groupRouter.post('/:id/regenerate-code', async (req, res) => {
  const requester = await getRequester(req);
  await assertCanManageGroup(req.params.id, requester.jemaatId, requester.isFulltimer);

  const group = await prisma.group.findUnique({
    where: { id: req.params.id },
    select: { id: true, isPublic: true },
  });
  if (!group) throw NotFound('Group tidak ditemukan');
  if (group.isPublic) throw BadRequest('Group public tidak punya joinCode');

  const newCode = await generateUniqueJoinCode();
  const updated = await prisma.group.update({
    where: { id: req.params.id },
    data: { joinCode: newCode },
    select: { id: true, joinCode: true },
  });

  audit(req, {
    action: 'UPDATE',
    resource: 'group',
    resourceId: req.params.id,
    resourceLabel: `joinCode rotated`,
    metadata: { newCodePreview: `${newCode.slice(0, 3)}****` },
  });

  res.json({ success: true, data: updated });
});

// ============================================================
// POST /:id/members/:jemaatId — PIC add member (auto-approve)
// ============================================================
groupRouter.post('/:id/members/:jemaatId', async (req, res) => {
  const requester = await getRequester(req);
  await assertCanManageGroup(req.params.id, requester.jemaatId, requester.isFulltimer);

  const { catatan } = addGroupMemberSchema.partial().parse(req.body);

  const jemaat = await prisma.jemaat.findUnique({
    where: { id: req.params.jemaatId },
    select: { id: true, namaLengkap: true, isActive: true },
  });
  if (!jemaat || !jemaat.isActive) throw NotFound('Jemaat tidak ditemukan atau nonaktif');

  // Upsert — kalau sudah ada (isActive=false), reactivate
  const existing = await prisma.groupMember.findUnique({
    where: { groupId_jemaatId: { groupId: req.params.id, jemaatId: req.params.jemaatId } },
    select: { id: true, isActive: true },
  });
  await prisma.groupMember.upsert({
    where: { groupId_jemaatId: { groupId: req.params.id, jemaatId: req.params.jemaatId } },
    create: { groupId: req.params.id, jemaatId: req.params.jemaatId, catatan: catatan ?? null, isActive: true },
    update: { isActive: true, tanggalKeluar: null, catatan: catatan ?? null },
  });

  await notifMemberAdded(req.params.id, req.params.jemaatId).catch(() => {});

  audit(req, {
    action: existing ? 'UPDATE' : 'CREATE',
    resource: 'group_member',
    resourceLabel: `Add member: ${jemaat.namaLengkap}`,
    metadata: { groupId: req.params.id, via: 'pic_direct_add' },
  });

  res.status(existing ? 200 : 201).json({
    success: true,
    message: `${jemaat.namaLengkap} berhasil ditambahkan`,
    data: { alreadyMember: !!existing?.isActive },
  });
});

// ============================================================
// POST /:id/members/by-kode — helper: add member via kode 8-char jemaat
// (mirror pattern /admin/homecell/:id/members/by-kode)
// ============================================================
groupRouter.post('/:id/members/by-kode', async (req, res) => {
  const requester = await getRequester(req);
  await assertCanManageGroup(req.params.id, requester.jemaatId, requester.isFulltimer);

  const kode = typeof req.body?.kode === 'string' ? req.body.kode.trim().toUpperCase() : '';
  const catatan = typeof req.body?.catatan === 'string' ? req.body.catatan.trim() : undefined;
  if (!kode) throw BadRequest('Kode jemaat wajib');

  const jemaat = await prisma.jemaat.findUnique({
    where: { kode },
    select: { id: true, namaLengkap: true, kode: true, isActive: true },
  });
  if (!jemaat || !jemaat.isActive) throw NotFound('Kode jemaat tidak ditemukan atau nonaktif');

  const existing = await prisma.groupMember.findUnique({
    where: { groupId_jemaatId: { groupId: req.params.id, jemaatId: jemaat.id } },
    select: { id: true, isActive: true },
  });
  await prisma.groupMember.upsert({
    where: { groupId_jemaatId: { groupId: req.params.id, jemaatId: jemaat.id } },
    create: {
      groupId: req.params.id,
      jemaatId: jemaat.id,
      catatan: catatan ?? null,
      isActive: true,
    },
    update: { isActive: true, tanggalKeluar: null, catatan: catatan ?? null },
  });

  await notifMemberAdded(req.params.id, jemaat.id).catch(() => {});

  audit(req, {
    action: existing ? 'UPDATE' : 'CREATE',
    resource: 'group_member',
    resourceLabel: `Add member by-kode: ${jemaat.namaLengkap} (${kode})`,
    metadata: { groupId: req.params.id, via: 'by-kode', kode },
  });

  res.status(existing ? 200 : 201).json({
    success: true,
    message: `${jemaat.namaLengkap} berhasil ditambahkan`,
    data: {
      alreadyMember: !!existing?.isActive,
      jemaat: { id: jemaat.id, namaLengkap: jemaat.namaLengkap, kode: jemaat.kode },
    },
  });
});

// ============================================================
// DELETE /:id/members/:jemaatId — remove member (PIC + notif)
// ============================================================
groupRouter.delete('/:id/members/:jemaatId', async (req, res) => {
  const requester = await getRequester(req);
  await assertCanManageGroup(req.params.id, requester.jemaatId, requester.isFulltimer);

  const existing = await prisma.groupMember.findUnique({
    where: { groupId_jemaatId: { groupId: req.params.id, jemaatId: req.params.jemaatId } },
    include: { jemaat: { select: { namaLengkap: true } } },
  });
  if (!existing) throw NotFound('Member tidak ditemukan di group ini');
  if (!existing.isActive) {
    return res.json({
      success: true,
      message: 'Member sudah keluar sebelumnya',
      meta: { alreadyRemoved: true },
    });
  }

  const updated = await prisma.groupMember.update({
    where: { id: existing.id },
    data: { isActive: false, tanggalKeluar: new Date() },
  });

  await notifMemberRemoved(req.params.id, req.params.jemaatId).catch(() => {});

  audit(req, {
    action: 'UPDATE',
    resource: 'group_member',
    resourceId: updated.id,
    resourceLabel: `Remove member: ${existing.jemaat.namaLengkap}`,
    metadata: { groupId: req.params.id, via: 'pic_remove' },
  });

  res.json({ success: true, message: `${existing.jemaat.namaLengkap} dikeluarkan dari group` });
});

// ============================================================
// POST /:id/join — self join public group
// ============================================================
groupRouter.post('/:id/join', async (req, res) => {
  const requester = await getRequester(req);
  const group = await prisma.group.findUnique({
    where: { id: req.params.id },
    select: { id: true, nama: true, isPublic: true, isActive: true },
  });
  if (!group || !group.isActive) throw NotFound('Group tidak ditemukan');
  if (!group.isPublic) {
    throw Forbidden(
      'Group ini private — gunakan kode invitation via POST /admin/group/join-by-code',
    );
  }

  const existing = await prisma.groupMember.findUnique({
    where: { groupId_jemaatId: { groupId: group.id, jemaatId: requester.jemaatId } },
    select: { id: true, isActive: true },
  });
  if (existing?.isActive) {
    return res.json({
      success: true,
      message: 'Anda sudah member group ini',
      data: { alreadyMember: true },
    });
  }

  await prisma.groupMember.upsert({
    where: { groupId_jemaatId: { groupId: group.id, jemaatId: requester.jemaatId } },
    create: { groupId: group.id, jemaatId: requester.jemaatId, isActive: true },
    update: { isActive: true, tanggalKeluar: null },
  });

  // Notif PIC untuk info (optional — deferred to avoid noise). Skip notif here
  // supaya PIC gak spam kalau banyak yg join. Kalau perlu ada notif PIC on join,
  // add di future extension.

  audit(req, {
    action: 'CREATE',
    resource: 'group_member',
    resourceLabel: `Self-join: ${group.nama}`,
    metadata: { groupId: group.id, via: 'public_join' },
  });

  res.json({ success: true, message: `Berhasil bergabung ke ${group.nama}` });
});

// ============================================================
// DELETE /:id/leave — self leave group
// ============================================================
groupRouter.delete('/:id/leave', async (req, res) => {
  const requester = await getRequester(req);
  const existing = await prisma.groupMember.findUnique({
    where: { groupId_jemaatId: { groupId: req.params.id, jemaatId: requester.jemaatId } },
    include: { group: { select: { nama: true } } },
  });
  if (!existing) throw NotFound('Anda bukan member group ini');
  if (!existing.isActive) {
    return res.json({
      success: true,
      message: 'Anda sudah keluar sebelumnya',
      meta: { alreadyLeft: true },
    });
  }

  await prisma.groupMember.update({
    where: { id: existing.id },
    data: { isActive: false, tanggalKeluar: new Date() },
  });

  audit(req, {
    action: 'UPDATE',
    resource: 'group_member',
    resourceId: existing.id,
    resourceLabel: `Self-leave: ${existing.group.nama}`,
    metadata: { groupId: req.params.id, via: 'self_leave' },
  });

  res.json({ success: true, message: `Keluar dari ${existing.group.nama}` });
});
