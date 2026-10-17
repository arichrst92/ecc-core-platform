/**
 * Papan konten bersama: Pengumuman + Voting.
 * Dipakai oleh Group (/admin/group/:id/...) dan Homecell
 * (/admin/homecell/:homecellId/...). Tiap scope menentukan sendiri akses,
 * tabel Prisma, penerima notifikasi, dan link notifikasi.
 *
 * Endpoint (relatif terhadap mount):
 *   GET    /announcements                 anggota
 *   POST   /announcements                 pengelola
 *   PATCH  /announcements/:annId          pengelola
 *   DELETE /announcements/:annId          pengelola
 *   GET    /polls                         anggota
 *   POST   /polls                         pengelola
 *   PATCH  /polls/:pollId                 pengelola
 *   DELETE /polls/:pollId                 pengelola
 *   POST   /polls/:pollId/vote            anggota
 */
import { Router, type Request } from 'express';
import { prisma } from '@ecc/database';
import { z } from 'zod';
import { ApiError, BadRequest, Forbidden, NotFound } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { createNotificationBatch, type InAppNotifType } from '../../lib/notification.js';
import { getJemaatIdForUser } from '../../lib/homecell-pic.js';
import { canSeeResults, checkVoteSelection, isPollOpen, normalizePollOptions } from '../../lib/group-poll.js';

export interface BoardAccess {
  ownerId: string;
  ownerNama: string;
  jemaatId: string;
  canManage: boolean;
  /** Anggota aktif / PIC — hanya mereka yang boleh vote. */
  isParticipant: boolean;
  /** jemaatId penerima notifikasi (anggota aktif + PIC). */
  recipients: () => Promise<string[]>;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface BoardScope {
  /** Nama resource untuk audit log, mis. 'group' / 'homecell'. */
  resource: string;
  /** Kolom FK pemilik di tabel announcement/poll. */
  fk: 'groupId' | 'homecellId';
  loadAccess: (req: Request, ctx: { jemaatId: string; isFulltimer: boolean }) => Promise<BoardAccess>;
  announcement: () => any;
  poll: () => any;
  vote: () => any;
  notif: { announcement: InAppNotifType; poll: InAppNotifType };
  actionUrl: (ownerId: string) => string;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const personSelect = { id: true, namaLengkap: true } as const;

const announcementSelect = {
  id: true,
  judul: true,
  isi: true,
  isPinned: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: personSelect },
} as const;

const pollInclude = (withVoterNames: boolean) => ({
  createdBy: { select: personSelect },
  options: { orderBy: { urutan: 'asc' as const }, select: { id: true, label: true, urutan: true } },
  votes: {
    select: withVoterNames
      ? { optionId: true, jemaatId: true, jemaat: { select: personSelect } }
      : { optionId: true, jemaatId: true },
  },
});

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
export function serializePoll(p: PollRow, jemaatId: string, canManage: boolean) {
  const open = isPollOpen(p);
  const myVotes = p.votes.filter((v) => v.jemaatId === jemaatId).map((v) => v.optionId);
  const show = canSeeResults({ canManage, hasVoted: myVotes.length > 0, open });
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
    totalVoters: new Set(p.votes.map((v) => v.jemaatId)).size,
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

const announcementSchema = z.object({
  judul: z.string().trim().min(2, 'Judul minimal 2 karakter').max(200),
  isi: z.string().trim().min(1, 'Isi pengumuman wajib diisi').max(5000),
  isPinned: z.boolean().optional(),
  notify: z.boolean().optional(),
});

const createPollSchema = z.object({
  pertanyaan: z.string().trim().min(3, 'Pertanyaan minimal 3 karakter').max(300),
  deskripsi: z.string().trim().max(2000).optional().nullable(),
  multiple: z.boolean().optional(),
  closesAt: z.coerce.date().optional().nullable(),
  options: z.array(z.string()).min(2).max(20),
  notify: z.boolean().optional(),
});

const updatePollSchema = z.object({
  pertanyaan: z.string().trim().min(3).max(300).optional(),
  deskripsi: z.string().trim().max(2000).optional().nullable(),
  isClosed: z.boolean().optional(),
  closesAt: z.coerce.date().optional().nullable(),
});

export function buildBoardRouter(scope: BoardScope): Router {
  const r = Router({ mergeParams: true });

  async function access(req: Request) {
    const userSub = req.user?.sub;
    if (!userSub) throw new ApiError(401, 'UNAUTHORIZED', 'Auth required');
    const jemaatId = await getJemaatIdForUser(userSub);
    if (!jemaatId) throw new ApiError(401, 'UNAUTHORIZED', 'User tanpa jemaat profile');
    return scope.loadAccess(req, { jemaatId, isFulltimer: req.user?.isFulltimer === true });
  }
  async function manage(req: Request) {
    const a = await access(req);
    if (!a.canManage) throw Forbidden('Hanya PIC atau admin yang boleh mengelola konten ini.');
    return a;
  }
  async function notify(a: BoardAccess, type: InAppNotifType, title: string, body: string, metadata: Record<string, unknown>) {
    const ids = new Set(await a.recipients());
    ids.delete(a.jemaatId);
    await createNotificationBatch([...ids], {
      type,
      title,
      body: body.slice(0, 300),
      actionUrl: scope.actionUrl(a.ownerId),
      metadata: { [scope.fk]: a.ownerId, ...metadata },
    });
  }
  const own = (a: BoardAccess) => ({ [scope.fk]: a.ownerId });

  // ---------------------------------------------------------------- Pengumuman
  r.get('/announcements', async (req, res) => {
    const a = await access(req);
    const rows = await scope.announcement().findMany({
      where: own(a),
      orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
      take: 100,
      select: announcementSelect,
    });
    res.json({ success: true, data: rows, meta: { canManage: a.canManage, canVote: a.isParticipant } });
  });

  r.post('/announcements', async (req, res) => {
    const a = await manage(req);
    const body = announcementSchema.parse(req.body ?? {});
    const created = await scope.announcement().create({
      data: { ...own(a), judul: body.judul, isi: body.isi, isPinned: body.isPinned ?? false, createdById: a.jemaatId },
      select: announcementSelect,
    });
    if (body.notify !== false) {
      void notify(a, scope.notif.announcement, `📢 ${a.ownerNama}: ${created.judul}`, created.isi, {
        announcementId: created.id,
      });
    }
    audit(req, {
      action: 'CREATE',
      resource: `${scope.resource}_announcement`,
      resourceId: created.id,
      resourceLabel: created.judul,
      after: created,
    });
    res.status(201).json({ success: true, data: created });
  });

  r.patch('/announcements/:annId', async (req, res) => {
    const a = await manage(req);
    const before = await scope.announcement().findFirst({ where: { id: req.params.annId, ...own(a) } });
    if (!before) throw NotFound('Pengumuman tidak ditemukan.');
    const body = announcementSchema.omit({ notify: true }).partial().parse(req.body ?? {});
    const updated = await scope.announcement().update({
      where: { id: before.id },
      data: { judul: body.judul, isi: body.isi, isPinned: body.isPinned },
      select: announcementSelect,
    });
    audit(req, {
      action: 'UPDATE',
      resource: `${scope.resource}_announcement`,
      resourceId: before.id,
      resourceLabel: updated.judul,
      before,
      after: updated,
    });
    res.json({ success: true, data: updated });
  });

  r.delete('/announcements/:annId', async (req, res) => {
    const a = await manage(req);
    const before = await scope.announcement().findFirst({ where: { id: req.params.annId, ...own(a) } });
    if (!before) throw NotFound('Pengumuman tidak ditemukan.');
    await scope.announcement().delete({ where: { id: before.id } });
    audit(req, {
      action: 'DELETE',
      resource: `${scope.resource}_announcement`,
      resourceId: before.id,
      resourceLabel: before.judul,
      before,
    });
    res.json({ success: true, data: { id: before.id } });
  });

  // ---------------------------------------------------------------- Voting
  r.get('/polls', async (req, res) => {
    const a = await access(req);
    const rows: PollRow[] = await scope.poll().findMany({
      where: own(a),
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: pollInclude(a.canManage),
    });
    res.json({
      success: true,
      data: rows.map((p) => serializePoll(p, a.jemaatId, a.canManage)),
      meta: { canManage: a.canManage, canVote: a.isParticipant },
    });
  });

  r.post('/polls', async (req, res) => {
    const a = await manage(req);
    const body = createPollSchema.parse(req.body ?? {});
    const options = normalizePollOptions(body.options);
    if (!options) throw BadRequest('Voting butuh 2–10 opsi yang berbeda.');
    if (body.closesAt && body.closesAt.getTime() <= Date.now()) {
      throw BadRequest('Batas waktu voting harus di masa depan.');
    }
    const created: PollRow = await scope.poll().create({
      data: {
        ...own(a),
        pertanyaan: body.pertanyaan,
        deskripsi: body.deskripsi || null,
        multiple: body.multiple ?? false,
        closesAt: body.closesAt ?? null,
        createdById: a.jemaatId,
        options: { create: options.map((label, i) => ({ label, urutan: i })) },
      },
      include: pollInclude(true),
    });
    if (body.notify !== false) {
      void notify(a, scope.notif.poll, `🗳️ Voting baru di ${a.ownerNama}`, created.pertanyaan, { pollId: created.id });
    }
    audit(req, {
      action: 'CREATE',
      resource: `${scope.resource}_poll`,
      resourceId: created.id,
      resourceLabel: created.pertanyaan,
    });
    res.status(201).json({ success: true, data: serializePoll(created, a.jemaatId, true) });
  });

  r.patch('/polls/:pollId', async (req, res) => {
    const a = await manage(req);
    const before = await scope.poll().findFirst({ where: { id: req.params.pollId, ...own(a) } });
    if (!before) throw NotFound('Voting tidak ditemukan.');
    const body = updatePollSchema.parse(req.body ?? {});
    const updated: PollRow = await scope.poll().update({
      where: { id: before.id },
      data: {
        pertanyaan: body.pertanyaan,
        deskripsi: body.deskripsi === undefined ? undefined : body.deskripsi || null,
        isClosed: body.isClosed,
        closesAt: body.closesAt,
      },
      include: pollInclude(true),
    });
    audit(req, {
      action: 'UPDATE',
      resource: `${scope.resource}_poll`,
      resourceId: before.id,
      resourceLabel: updated.pertanyaan,
      before,
    });
    res.json({ success: true, data: serializePoll(updated, a.jemaatId, true) });
  });

  r.delete('/polls/:pollId', async (req, res) => {
    const a = await manage(req);
    const before = await scope.poll().findFirst({ where: { id: req.params.pollId, ...own(a) } });
    if (!before) throw NotFound('Voting tidak ditemukan.');
    await scope.poll().delete({ where: { id: before.id } });
    audit(req, {
      action: 'DELETE',
      resource: `${scope.resource}_poll`,
      resourceId: before.id,
      resourceLabel: before.pertanyaan,
    });
    res.json({ success: true, data: { id: before.id } });
  });

  /** Pilih / ubah / tarik suara. Body `{ optionIds: string[] }` (kosong = tarik). */
  r.post('/polls/:pollId/vote', async (req, res) => {
    const a = await access(req);
    if (!a.isParticipant) throw Forbidden('Voting hanya untuk anggota dan PIC.');
    const { optionIds } = z.object({ optionIds: z.array(z.string().uuid()).max(20) }).parse(req.body ?? {});
    const poll = await scope.poll().findFirst({
      where: { id: req.params.pollId, ...own(a) },
      include: { options: { select: { id: true } } },
    });
    if (!poll) throw NotFound('Voting tidak ditemukan.');
    const check = checkVoteSelection(
      poll,
      poll.options.map((o: { id: string }) => o.id),
      optionIds,
    );
    if (!check.ok) throw new ApiError(400, check.code, check.message);

    await prisma.$transaction([
      scope.vote().deleteMany({ where: { pollId: poll.id, jemaatId: a.jemaatId } }),
      scope.vote().createMany({
        data: check.optionIds.map((optionId) => ({ pollId: poll.id, optionId, jemaatId: a.jemaatId })),
        skipDuplicates: true,
      }),
    ]);

    const fresh: PollRow = await scope.poll().findUniqueOrThrow({
      where: { id: poll.id },
      include: pollInclude(a.canManage),
    });
    res.json({ success: true, data: serializePoll(fresh, a.jemaatId, a.canManage) });
  });

  return r;
}
