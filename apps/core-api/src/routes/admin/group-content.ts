/**
 * Konten group — Hero image, File (nama + deskripsi), Pengumuman, Voting.
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
import { deleteGroupFile, deleteGroupHero, saveGroupFile, saveGroupHero } from '../../lib/storage.js';
import { flexImageUpload } from '../../lib/image-upload.js';
import { buildBoardRouter } from './content-board.js';
import { getJemaatIdForUser } from '../../lib/homecell-pic.js';

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
// HERO IMAGE — hanya PIC group. Kalau group belum punya PIC, admin
// fulltimer boleh mengisi.
// ============================================================

async function loadHeroEditor(req: Request) {
  const userSub = req.user?.sub;
  if (!userSub) throw new ApiError(401, 'UNAUTHORIZED', 'Auth required');
  const jemaatId = await getJemaatIdForUser(userSub);
  if (!jemaatId) throw new ApiError(401, 'UNAUTHORIZED', 'User tanpa jemaat profile');
  const groupId = (req.params as { id: string }).id;
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: { id: true, nama: true, picJemaatId: true, heroImageUrl: true },
  });
  if (!group) throw NotFound('Group tidak ditemukan');
  const ok = group.picJemaatId ? group.picJemaatId === jemaatId : req.user?.isFulltimer === true;
  if (!ok) throw Forbidden('Hanya PIC group yang boleh mengganti gambar group.');
  return group;
}

groupContentRouter.post('/hero', flexImageUpload({ maxBytes: 8 * 1024 * 1024 }), async (req, res) => {
  const group = await loadHeroEditor(req);
  if (!req.file) throw BadRequest('File gambar wajib diupload.');
  const heroImageUrl = await saveGroupHero(group.id, req.file.buffer);
  await prisma.group.update({ where: { id: group.id }, data: { heroImageUrl } });
  audit(req, {
    action: 'UPDATE',
    resource: 'group',
    resourceId: group.id,
    resourceLabel: `${group.nama} (hero)`,
    before: { heroImageUrl: group.heroImageUrl },
    after: { heroImageUrl },
  });
  res.json({ success: true, data: { heroImageUrl } });
});

groupContentRouter.delete('/hero', async (req, res) => {
  const group = await loadHeroEditor(req);
  await prisma.group.update({ where: { id: group.id }, data: { heroImageUrl: null } });
  await deleteGroupHero(group.id).catch(() => undefined);
  audit(req, {
    action: 'UPDATE',
    resource: 'group',
    resourceId: group.id,
    resourceLabel: `${group.nama} (hero dihapus)`,
    before: { heroImageUrl: group.heroImageUrl },
    after: { heroImageUrl: null },
  });
  res.json({ success: true, data: { heroImageUrl: null } });
});

// ============================================================
// PENGUMUMAN & VOTING — router bersama (content-board.ts)
// ============================================================

groupContentRouter.use(
  buildBoardRouter({
    resource: 'group',
    fk: 'groupId',
    loadAccess: async (req, ctx) => {
      const a = await loadAccess(req);
      return {
        ownerId: a.group.id,
        ownerNama: a.group.nama,
        jemaatId: a.jemaatId,
        canManage: a.canManage,
        recipients: async () => {
          const ms = await prisma.groupMember.findMany({
            where: { groupId: a.group.id, isActive: true },
            select: { jemaatId: true },
          });
          const ids = ms.map((m) => m.jemaatId);
          if (a.group.picJemaatId) ids.push(a.group.picJemaatId);
          return ids;
        },
      };
    },
    announcement: () => prisma.groupAnnouncement,
    poll: () => prisma.groupPoll,
    vote: () => prisma.groupPollVote,
    notif: { announcement: 'GROUP_ANNOUNCEMENT', poll: 'GROUP_POLL_CREATED' },
    actionUrl: (id) => `/group/${id}`,
  }),
);
