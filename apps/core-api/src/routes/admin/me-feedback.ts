/**
 * Kritik & Saran milik saya (mobile) — /admin/me/feedback
 *
 *   GET  /                → daftar kiriman saya (terbaru), + unread balasan admin
 *   POST /                → kirim { tipe, kategori, isi, appInfo? }
 *   GET  /:id             → detail + percakapan (tandai balasan admin terbaca)
 *   POST /:id/replies     → tanggapan lanjutan saya { isi }
 */
import { Router, type Request } from 'express';
import { prisma } from '@ecc/database';
import { NotFound, Unauthorized } from '../../lib/errors.js';
import { createFeedbackSchema, feedbackPersonSelect, replySchema } from '../../lib/feedback.js';

export const meFeedbackRouter = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function me(req: Request) {
  if (!req.user) throw Unauthorized();
  return req.user;
}

async function loadMine(req: Request) {
  const u = me(req);
  const id = String(req.params.id ?? '');
  if (!UUID_RE.test(id)) throw NotFound('Kritik/saran tidak ditemukan');
  const fb = await prisma.feedback.findFirst({ where: { id, jemaatId: u.jemaatId } });
  if (!fb) throw NotFound('Kritik/saran tidak ditemukan');
  return { u, fb };
}

meFeedbackRouter.get('/', async (req, res) => {
  const u = me(req);
  const rows = await prisma.feedback.findMany({
    where: { jemaatId: u.jemaatId },
    orderBy: { lastActivityAt: 'desc' },
    take: 100,
    select: {
      id: true,
      tipe: true,
      kategori: true,
      isi: true,
      status: true,
      unreadForUser: true,
      createdAt: true,
      lastActivityAt: true,
      _count: { select: { replies: true } },
    },
  });
  res.json({
    success: true,
    data: rows.map(({ _count, ...r }) => ({ ...r, replyCount: _count.replies })),
  });
});

meFeedbackRouter.post('/', async (req, res) => {
  const u = me(req);
  const input = createFeedbackSchema.parse(req.body ?? {});
  const j = await prisma.jemaat.findUnique({ where: { id: u.jemaatId }, select: { cabangId: true } });
  const created = await prisma.feedback.create({
    data: {
      jemaatId: u.jemaatId,
      cabangId: j?.cabangId ?? null,
      tipe: input.tipe,
      kategori: input.kategori,
      isi: input.isi,
      appInfo: input.appInfo ?? null,
    },
  });
  res.status(201).json({
    success: true,
    data: created,
    message: 'Terima kasih! Kritik/saran Anda sudah kami terima.',
  });
});

meFeedbackRouter.get('/:id', async (req, res) => {
  const { fb } = await loadMine(req);
  const replies = await prisma.feedbackReply.findMany({
    where: { feedbackId: fb.id },
    orderBy: { createdAt: 'asc' },
    select: { id: true, isi: true, fromAdmin: true, createdAt: true, author: { select: feedbackPersonSelect } },
  });
  if (fb.unreadForUser) {
    await prisma.feedback.update({ where: { id: fb.id }, data: { unreadForUser: false } });
  }
  res.json({
    success: true,
    data: {
      ...fb,
      unreadForUser: false,
      // Nama admin tidak ditampilkan ke jemaat — cukup "Tim Gereja".
      replies: replies.map((r) => ({ ...r, author: r.fromAdmin ? null : r.author })),
    },
  });
});

meFeedbackRouter.post('/:id/replies', async (req, res) => {
  const { u, fb } = await loadMine(req);
  const { isi } = replySchema.parse(req.body ?? {});
  const now = new Date();
  const [reply] = await prisma.$transaction([
    prisma.feedbackReply.create({
      data: { feedbackId: fb.id, authorJemaatId: u.jemaatId, fromAdmin: false, isi },
      select: { id: true, isi: true, fromAdmin: true, createdAt: true },
    }),
    prisma.feedback.update({
      where: { id: fb.id },
      // Tanggapan baru dari jemaat membuka kembali yang sudah selesai.
      data: { lastActivityAt: now, status: fb.status === 'SELESAI' ? 'DIPROSES' : fb.status },
    }),
  ]);
  res.status(201).json({ success: true, data: reply });
});
