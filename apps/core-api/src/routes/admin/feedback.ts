/**
 * Kritik & Saran — inbox admin (portal) — /admin/feedback
 *
 * Akses: fulltimer, atau role dengan menu "feedback"
 * (baca = lihat; tulis = balas & ubah status).
 *
 *   GET   /                 → daftar + filter (status, tipe, kategori, cabangId, search) + ringkasan
 *   GET   /:id              → detail + percakapan
 *   POST  /:id/replies      → balas { isi, status? } → notifikasi ke pengirim
 *   PATCH /:id              → { status }
 */
import { Router, type Request } from 'express';
import { prisma, type Prisma } from '@ecc/database';
import { z } from 'zod';
import { Forbidden, NotFound, Unauthorized } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { createNotification } from '../../lib/notification.js';
import { resolveJemaatAccess } from '../../lib/menu-access.js';
import { FEEDBACK_KATEGORI, feedbackPersonSelect, replySchema } from '../../lib/feedback.js';

export const feedbackRouter = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUS = ['BARU', 'DIPROSES', 'SELESAI'] as const;

async function assertAccess(req: Request, level: 'read' | 'write') {
  if (!req.user) throw Unauthorized();
  if (req.user.isFulltimer) return req.user;
  const access = await resolveJemaatAccess(req.user.jemaatId);
  const m = access.menuAccess['feedback'];
  const ok = level === 'read' ? m?.canRead : m?.canWrite;
  if (!ok) throw Forbidden('Anda tidak punya akses ke menu Kritik & Saran.');
  return req.user;
}

const listSelect = {
  id: true,
  tipe: true,
  kategori: true,
  isi: true,
  status: true,
  appInfo: true,
  createdAt: true,
  lastActivityAt: true,
  jemaat: { select: { ...feedbackPersonSelect, kode: true, noHp: true } },
  cabang: { select: { id: true, nama: true } },
  _count: { select: { replies: true } },
} satisfies Prisma.FeedbackSelect;

feedbackRouter.get('/', async (req, res) => {
  await assertAccess(req, 'read');
  const str = (k: string) => (typeof req.query[k] === 'string' && req.query[k] ? (req.query[k] as string) : undefined);
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const where: Prisma.FeedbackWhereInput = {};
  const status = str('status');
  if (status && (STATUS as readonly string[]).includes(status)) where.status = status as (typeof STATUS)[number];
  const tipe = str('tipe');
  if (tipe === 'KRITIK' || tipe === 'SARAN') where.tipe = tipe;
  const kategori = str('kategori');
  if (kategori && (FEEDBACK_KATEGORI as readonly string[]).includes(kategori)) where.kategori = kategori;
  const cabangId = str('cabangId');
  if (cabangId && UUID_RE.test(cabangId)) where.cabangId = cabangId;
  const search = str('search');
  if (search) {
    where.OR = [
      { isi: { contains: search, mode: 'insensitive' } },
      { jemaat: { namaLengkap: { contains: search, mode: 'insensitive' } } },
    ];
  }
  const [rows, total, counts] = await Promise.all([
    prisma.feedback.findMany({
      where,
      orderBy: [{ lastActivityAt: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
      select: listSelect,
    }),
    prisma.feedback.count({ where }),
    prisma.feedback.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);
  const summary = Object.fromEntries(STATUS.map((s) => [s, 0])) as Record<(typeof STATUS)[number], number>;
  for (const c of counts) summary[c.status] = c._count._all;
  res.json({
    success: true,
    data: rows.map(({ _count, ...r }) => ({ ...r, replyCount: _count.replies })),
    meta: { page, limit, total, totalPages: Math.ceil(total / limit), summary },
  });
});

async function loadOne(id: string) {
  if (!UUID_RE.test(id)) throw NotFound('Kritik/saran tidak ditemukan');
  const fb = await prisma.feedback.findUnique({ where: { id }, select: { ...listSelect, jemaatId: true } });
  if (!fb) throw NotFound('Kritik/saran tidak ditemukan');
  return fb;
}

feedbackRouter.get('/:id', async (req, res) => {
  await assertAccess(req, 'read');
  const fb = await loadOne(req.params.id);
  const replies = await prisma.feedbackReply.findMany({
    where: { feedbackId: fb.id },
    orderBy: { createdAt: 'asc' },
    select: { id: true, isi: true, fromAdmin: true, createdAt: true, author: { select: feedbackPersonSelect } },
  });
  const { _count, ...rest } = fb;
  res.json({ success: true, data: { ...rest, replyCount: _count.replies, replies } });
});

const adminReplySchema = replySchema.extend({ status: z.enum(STATUS).optional() });

feedbackRouter.post('/:id/replies', async (req, res) => {
  const u = await assertAccess(req, 'write');
  const fb = await loadOne(req.params.id);
  const input = adminReplySchema.parse(req.body ?? {});
  const now = new Date();
  const nextStatus = input.status ?? (fb.status === 'BARU' ? 'DIPROSES' : fb.status);
  const [reply] = await prisma.$transaction([
    prisma.feedbackReply.create({
      data: { feedbackId: fb.id, authorJemaatId: u.jemaatId, fromAdmin: true, isi: input.isi },
      select: { id: true, isi: true, fromAdmin: true, createdAt: true, author: { select: feedbackPersonSelect } },
    }),
    prisma.feedback.update({
      where: { id: fb.id },
      data: { lastActivityAt: now, unreadForUser: true, status: nextStatus },
    }),
  ]);
  void createNotification({
    jemaatId: fb.jemaatId,
    type: 'FEEDBACK_REPLIED',
    title: `Tanggapan untuk ${fb.tipe === 'KRITIK' ? 'kritik' : 'saran'} Anda`,
    body: input.isi.slice(0, 200),
    actionUrl: `/feedback/${fb.id}`,
    metadata: { feedbackId: fb.id },
  });
  audit(req, {
    action: 'UPDATE',
    resource: 'feedback',
    resourceId: fb.id,
    resourceLabel: `Balas ${fb.tipe.toLowerCase()} dari ${fb.jemaat.namaLengkap}`,
    metadata: { status: nextStatus },
  });
  res.status(201).json({ success: true, data: { reply, status: nextStatus } });
});

feedbackRouter.patch('/:id', async (req, res) => {
  await assertAccess(req, 'write');
  const fb = await loadOne(req.params.id);
  const { status } = z.object({ status: z.enum(STATUS) }).parse(req.body ?? {});
  const updated = await prisma.feedback.update({ where: { id: fb.id }, data: { status }, select: { id: true, status: true } });
  audit(req, {
    action: 'UPDATE',
    resource: 'feedback',
    resourceId: fb.id,
    resourceLabel: `Status ${fb.tipe.toLowerCase()} → ${status}`,
    before: { status: fb.status },
    after: { status },
  });
  res.json({ success: true, data: updated });
});
