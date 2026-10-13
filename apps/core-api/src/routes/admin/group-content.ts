/**
 * Konten group — File (nama + deskripsi), Pengumuman, Voting.
 *
 * Di-mount di group.ts: `groupRouter.use('/:id', groupContentRouter)`.
 *
 * Akses:
 *   - PIC group / fulltimer  → kelola (buat, ubah, hapus, tutup voting, lihat pemilih)
 *   - Anggota aktif          → lihat file & pengumuman, ikut voting
 *   - Lainnya                → 403
 */
import { Router, type Request } from 'express';
import { randomUUID } from 'node:crypto';
import { prisma } from '@ecc/database';
import { z } from 'zod';
import { ApiError, BadRequest, Forbidden, NotFound } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { flexMaterialUpload, materialExt, MATERIAL_TYPES } from '../../lib/material-upload.js';
import { deleteGroupFile, saveGroupFile } from '../../lib/storage.js';
import { createNotificationBatch } from '../../lib/notification.js';
import { getJemaatIdForUser } from '../../lib/homecell-pic.js';
import { canSeeResults, checkVoteSelection, isPollOpen, normalizePollOptions } from '../../lib/group-poll.js';

export const groupContentRouter = Router({ mergeParams: true });

const personSelect = { id: true, namaLengkap: true } as const;

async function loadAccess(req: Request) {
  const userSub = req.user?.sub;
  if (!userSub) throw new ApiError(401, 'UNAUTHORIZED', 'Auth required');
  const isFulltimer = req.user?.isFulltimer === true;
  const jemaatId = await getJemaatIdForUser(userSub);
  if (!jemaatId) throw new ApiError(401, 'UNAUTHORIZED', 'User tanpa jemaat profile');

  const groupId = (req.params as { id: string }).id;
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: { id: true, nama: true, picJemaatId: true, isActive: true },
  });
  if (!group || !group.isActive) throw NotFound('Group tidak ditemukan');

  const canManage = isFulltimer || group.picJemaatId === jemaatId;
  if (!canManage) {
    const m = await prisma.groupMember.findUnique({
      where: { groupId_jemaatId: { groupId, jemaatId } },
      select: { isActive: true },
    });
    if (!m?.isActive) throw Forbidden('Konten ini hanya untuk anggota group.');
  }
  return { group, jemaatId, canManage };
}

async function loadManage(req: Request) {
  const a = await loadAccess(req);
  if (!a.canManage) throw Forbidden('Hanya PIC group atau admin yang boleh mengelola konten ini.');
  return a;
}

/** Notif in-app ke semua anggota aktif + PIC, kecuali pembuat. */
async function notifyMembers(
  group: { id: string; picJemaatId: string | null },
  exceptJemaatId: string,
  args: { type: 'GROUP_ANNOUNCEMENT' | 'GROUP_POLL_CREATED'; title: string; body: string; metadata: Record<string, unknown> },
) {
  const members = await prisma.groupMember.findMany({
    where: { groupId: group.id, isActive: true },
    select: { jemaatId: true },
  });
  const ids = new Set(members.map((m) => m.jemaatId));
  if (group.picJemaatId) ids.add(group.picJemaatId);
  ids.delete(exceptJemaatId);
  await createNotificationBatch([...ids], {
    type: args.type,
    title: args.title,
    body: args.body.slice(0, 300),
    actionUrl: `/group/${group.id}`,
    metadata: { groupId: group.id, ...args.metadata },
  });
}

// ============================================================
// FILE
// ============================================================

const fileSelect = {
  id: true,
  nama: true,
  deskripsi: true,
  fileUrl: true,
  fileMime: true,
  fileName: true,
  fileSize: true,
  createdAt: true,
  uploadedBy: { select: personSelect },
} as const;

const fileMetaSchema = z.object({
  nama: z.string().trim().min(2, 'Nama file minimal 2 karakter').max(200),
  deskripsi: z.string().trim().max(2000).optional().nullable(),
});

groupContentRouter.get('/files', async (req, res) => {
  const { group, canManage } = await loadAccess(req);
  const rows = await prisma.groupFile.findMany({
    where: { groupId: group.id },
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: fileSelect,
  });
  res.json({ success: true, data: rows, meta: { canManage } });
});

groupContentRouter.post('/files', flexMaterialUpload(), async (req, res) => {
  const { group, jemaatId } = await loadManage(req);
  const meta = fileMetaSchema.parse(req.body ?? {});
  if (!req.file) throw BadRequest('File wajib diupload.');
  const ext = materialExt(req.file.originalname, req.file.mimetype);
  if (!ext) throw BadRequest('Tipe file tidak didukung.');

  const id = randomUUID();
  const fileUrl = await saveGroupFile(group.id, id, ext, req.file.buffer);
  const created = await prisma.groupFile.create({
    data: {
      id,
      groupId: group.id,
      nama: meta.nama,
      deskripsi: meta.deskripsi || null,
      fileUrl,
      fileMime: MATERIAL_TYPES[ext]!,
      fileName: req.file.originalname?.slice(0, 255) || null,
      fileSize: req.file.size,
      uploadedById: jemaatId,
    },
    select: fileSelect,
  });
  audit(req, { action: 'CREATE', resource: 'group_file', resourceId: id, resourceLabel: created.nama, after: created });
  res.status(201).json({ success: true, data: created });
});

groupContentRouter.patch('/files/:fileId', async (req, res) => {
  const { group } = await loadManage(req);
  const before = await prisma.groupFile.findFirst({ where: { id: req.params.fileId, groupId: group.id } });
  if (!before) throw NotFound('File tidak ditemukan.');
  const meta = fileMetaSchema.partial().parse(req.body ?? {});
  const updated = await prisma.groupFile.update({
    where: { id: before.id },
    data: {
      nama: meta.nama,
      deskripsi: meta.deskripsi === undefined ? undefined : meta.deskripsi || null,
    },
    select: fileSelect,
  });
  audit(req, { action: 'UPDATE', resource: 'group_file', resourceId: before.id, resourceLabel: updated.nama, before, after: updated });
  res.json({ success: true, data: updated });
});

groupContentRouter.delete('/files/:fileId', async (req, res) => {
  const { group } = await loadManage(req);
  const before = await prisma.groupFile.findFirst({ where: { id: req.params.fileId, groupId: group.id } });
  if (!before) throw NotFound('File tidak ditemukan.');
  await prisma.groupFile.delete({ where: { id: before.id } });
  await deleteGroupFile(before.fileUrl).catch(() => undefined);
  audit(req, { action: 'DELETE', resource: 'group_file', resourceId: before.id, resourceLabel: before.nama, before });
  res.json({ success: true, data: { id: before.id } });
});

// ============================================================
// PENGUMUMAN
// ============================================================

const announcementSelect = {
  id: true,
  judul: true,
  isi: true,
  isPinned: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: personSelect },
} as const;

const announcementSchema = z.object({
  judul: z.string().trim().min(2, 'Judul minimal 2 karakter').max(200),
  isi: z.string().trim().min(1, 'Isi pengumuman wajib diisi').max(5000),
  isPinned: z.boolean().optional(),
  notify: z.boolean().optional(),
});

groupContentRouter.get('/announcements', async (req, res) => {
  const { group, canManage } = await loadAccess(req);
  const rows = await prisma.groupAnnouncement.findMany({
    where: { groupId: group.id },
    orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
    take: 100,
    select: announcementSelect,
  });
  res.json({ success: true, data: rows, meta: { canManage } });
});

groupContentRouter.post('/announcements', async (req, res) => {
  const { group, jemaatId } = await loadManage(req);
  const body = announcementSchema.parse(req.body ?? {});
  const created = await prisma.groupAnnouncement.create({
    data: {
      groupId: group.id,
      judul: body.judul,
      isi: body.isi,
      isPinned: body.isPinned ?? false,
      createdById: jemaatId,
    },
    select: announcementSelect,
  });
  if (body.notify !== false) {
    void notifyMembers(group, jemaatId, {
      type: 'GROUP_ANNOUNCEMENT',
      title: `📢 ${group.nama}: ${created.judul}`,
      body: created.isi,
      metadata: { announcementId: created.id },
    });
  }
  audit(req, { action: 'CREATE', resource: 'group_announcement', resourceId: created.id, resourceLabel: created.judul, after: created });
  res.status(201).json({ success: true, data: created });
});

groupContentRouter.patch('/announcements/:annId', async (req, res) => {
  const { group } = await loadManage(req);
  const before = await prisma.groupAnnouncement.findFirst({ where: { id: req.params.annId, groupId: group.id } });
  if (!before) throw NotFound('Pengumuman tidak ditemukan.');
  const body = announcementSchema.omit({ notify: true }).partial().parse(req.body ?? {});
  const updated = await prisma.groupAnnouncement.update({
    where: { id: before.id },
    data: { judul: body.judul, isi: body.isi, isPinned: body.isPinned },
    select: announcementSelect,
  });
  audit(req, { action: 'UPDATE', resource: 'group_announcement', resourceId: before.id, resourceLabel: updated.judul, before, after: updated });
  res.json({ success: true, data: updated });
});

groupContentRouter.delete('/announcements/:annId', async (req, res) => {
  const { group } = await loadManage(req);
  const before = await prisma.groupAnnouncement.findFirst({ where: { id: req.params.annId, groupId: group.id } });
  if (!before) throw NotFound('Pengumuman tidak ditemukan.');
  await prisma.groupAnnouncement.delete({ where: { id: before.id } });
  audit(req, { action: 'DELETE', resource: 'group_announcement', resourceId: before.id, resourceLabel: before.judul, before });
  res.json({ success: true, data: { id: before.id } });
});

// ============================================================
// VOTING
// ============================================================

const pollInclude = (withVoterNames: boolean) =>
  ({
    createdBy: { select: personSelect },
    options: { orderBy: { urutan: 'asc' as const }, select: { id: true, label: true, urutan: true } },
    votes: {
      select: withVoterNames
        ? { optionId: true, jemaatId: true, jemaat: { select: personSelect } }
        : { optionId: true, jemaatId: true },
    },
  }) as const;

type PollRow = {
  id: string;
  pertanyaan: string;
  deskripsi: string | null;
  multiple: boolean;
  closesAt: Date | null;
  isClosed: boolean;
  createdAt: Date;
  createdBy: { id: string; namaLengkap: string } | null;
  options: { id: string; label: string; urutan: number }[];
  votes: { optionId: string; jemaatId: string; jemaat?: { id: string; namaLengkap: string } }[];
};

/** Bentuk respons poll: hasil disembunyikan untuk anggota yang belum memilih. */
function serializePoll(p: PollRow, jemaatId: string, canManage: boolean) {
  const open = isPollOpen(p);
  const myVotes = p.votes.filter((v) => v.jemaatId === jemaatId).map((v) => v.optionId);
  const show = canSeeResults({ canManage, hasVoted: myVotes.length > 0, open });
  const totalVoters = new Set(p.votes.map((v) => v.jemaatId)).size;
  return {
    id: p.id,
    pertanyaan: p.pertanyaan,
    deskripsi: p.deskripsi,
    multiple: p.multiple,
    closesAt: p.closesAt,
    isClosed: p.isClosed,
    isOpen: open,
    createdAt: p.createdAt,
    createdBy: p.createdBy,
    totalVoters,
    myVotes,
    showResults: show,
    options: p.options.map((o) => {
      const vs = p.votes.filter((v) => v.optionId === o.id);
      return {
        id: o.id,
        label: o.label,
        count: show ? vs.length : null,
        voters: canManage ? vs.map((v) => v.jemaat!).filter(Boolean) : undefined,
      };
    }),
  };
}

const createPollSchema = z.object({
  pertanyaan: z.string().trim().min(3, 'Pertanyaan minimal 3 karakter').max(300),
  deskripsi: z.string().trim().max(2000).optional().nullable(),
  multiple: z.boolean().optional(),
  closesAt: z.coerce.date().optional().nullable(),
  options: z.array(z.string()).min(2).max(20),
  notify: z.boolean().optional(),
});

groupContentRouter.get('/polls', async (req, res) => {
  const { group, jemaatId, canManage } = await loadAccess(req);
  const rows = await prisma.groupPoll.findMany({
    where: { groupId: group.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: pollInclude(canManage),
  });
  res.json({
    success: true,
    data: rows.map((p) => serializePoll(p as unknown as PollRow, jemaatId, canManage)),
    meta: { canManage },
  });
});

groupContentRouter.post('/polls', async (req, res) => {
  const { group, jemaatId } = await loadManage(req);
  const body = createPollSchema.parse(req.body ?? {});
  const options = normalizePollOptions(body.options);
  if (!options) throw BadRequest('Voting butuh 2–10 opsi yang berbeda.');
  if (body.closesAt && body.closesAt.getTime() <= Date.now()) {
    throw BadRequest('Batas waktu voting harus di masa depan.');
  }
  const created = await prisma.groupPoll.create({
    data: {
      groupId: group.id,
      pertanyaan: body.pertanyaan,
      deskripsi: body.deskripsi || null,
      multiple: body.multiple ?? false,
      closesAt: body.closesAt ?? null,
      createdById: jemaatId,
      options: { create: options.map((label, i) => ({ label, urutan: i })) },
    },
    include: pollInclude(true),
  });
  if (body.notify !== false) {
    void notifyMembers(group, jemaatId, {
      type: 'GROUP_POLL_CREATED',
      title: `🗳️ Voting baru di ${group.nama}`,
      body: created.pertanyaan,
      metadata: { pollId: created.id },
    });
  }
  audit(req, { action: 'CREATE', resource: 'group_poll', resourceId: created.id, resourceLabel: created.pertanyaan });
  res.status(201).json({ success: true, data: serializePoll(created as unknown as PollRow, jemaatId, true) });
});

const updatePollSchema = z.object({
  pertanyaan: z.string().trim().min(3).max(300).optional(),
  deskripsi: z.string().trim().max(2000).optional().nullable(),
  isClosed: z.boolean().optional(),
  closesAt: z.coerce.date().optional().nullable(),
});

groupContentRouter.patch('/polls/:pollId', async (req, res) => {
  const { group, jemaatId } = await loadManage(req);
  const before = await prisma.groupPoll.findFirst({ where: { id: req.params.pollId, groupId: group.id } });
  if (!before) throw NotFound('Voting tidak ditemukan.');
  const body = updatePollSchema.parse(req.body ?? {});
  const updated = await prisma.groupPoll.update({
    where: { id: before.id },
    data: {
      pertanyaan: body.pertanyaan,
      deskripsi: body.deskripsi === undefined ? undefined : body.deskripsi || null,
      isClosed: body.isClosed,
      closesAt: body.closesAt,
    },
    include: pollInclude(true),
  });
  audit(req, { action: 'UPDATE', resource: 'group_poll', resourceId: before.id, resourceLabel: updated.pertanyaan, before });
  res.json({ success: true, data: serializePoll(updated as unknown as PollRow, jemaatId, true) });
});

groupContentRouter.delete('/polls/:pollId', async (req, res) => {
  const { group } = await loadManage(req);
  const before = await prisma.groupPoll.findFirst({ where: { id: req.params.pollId, groupId: group.id } });
  if (!before) throw NotFound('Voting tidak ditemukan.');
  await prisma.groupPoll.delete({ where: { id: before.id } });
  audit(req, { action: 'DELETE', resource: 'group_poll', resourceId: before.id, resourceLabel: before.pertanyaan });
  res.json({ success: true, data: { id: before.id } });
});

/** Pilih / ubah / tarik suara. Body `{ optionIds: string[] }` (kosong = tarik). */
groupContentRouter.post('/polls/:pollId/vote', async (req, res) => {
  const { group, jemaatId, canManage } = await loadAccess(req);
  const { optionIds } = z.object({ optionIds: z.array(z.string().uuid()).max(20) }).parse(req.body ?? {});
  const poll = await prisma.groupPoll.findFirst({
    where: { id: req.params.pollId, groupId: group.id },
    include: { options: { select: { id: true } } },
  });
  if (!poll) throw NotFound('Voting tidak ditemukan.');
  const check = checkVoteSelection(poll, poll.options.map((o) => o.id), optionIds);
  if (!check.ok) throw new ApiError(400, check.code, check.message);

  await prisma.$transaction([
    prisma.groupPollVote.deleteMany({ where: { pollId: poll.id, jemaatId } }),
    prisma.groupPollVote.createMany({
      data: check.optionIds.map((optionId) => ({ pollId: poll.id, optionId, jemaatId })),
      skipDuplicates: true,
    }),
  ]);

  const fresh = await prisma.groupPoll.findUniqueOrThrow({ where: { id: poll.id }, include: pollInclude(canManage) });
  res.json({ success: true, data: serializePoll(fresh as unknown as PollRow, jemaatId, canManage) });
});
