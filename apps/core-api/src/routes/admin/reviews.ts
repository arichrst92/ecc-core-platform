/**
 * Ulasan jemaat (portal) — /admin/reviews
 *
 *   GET /ibadah/:id?from=YYYY-MM-DD&to=YYYY-MM-DD → ringkasan, per tanggal, daftar ulasan
 *   GET /event/:id                                → ringkasan + daftar ulasan
 *
 * Ulasan anonim tampil sebagai "Anonim" (nama tidak dikirim ke portal).
 */
import { Router } from 'express';
import { prisma } from '@ecc/database';
import { z } from 'zod';
import { NotFound } from '../../lib/errors.js';
import { requireMenu } from '../../middleware/require-menu.js';
import { eventReviews, ibadahReviews, summarize, toItem } from '../../lib/service-review.js';

export const reviewsRouter = Router();

const dateQ = z.string().date().optional();

reviewsRouter.get('/ibadah/:id', requireMenu('ibadah'), async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const ib = await prisma.ibadah.findUnique({ where: { id }, select: { id: true } });
  if (!ib) throw NotFound('Ibadah tidak ditemukan');
  const to = dateQ.parse(req.query.to) ? new Date(String(req.query.to)) : new Date();
  const from = dateQ.parse(req.query.from) ? new Date(String(req.query.from)) : new Date(to.getTime() - 90 * 86_400_000);
  const rows = await ibadahReviews([id], from, to);
  const byDate = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = r.tanggal ? r.tanggal.toISOString().slice(0, 10) : '—';
    byDate.set(k, [...(byDate.get(k) ?? []), r]);
  }
  res.json({
    success: true,
    data: {
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      summary: summarize(rows),
      perTanggal: [...byDate.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([tanggal, rs]) => ({ tanggal, ...summarize(rs) })),
      items: rows.slice(0, 300).map(toItem),
    },
  });
});

reviewsRouter.get('/event/:id', requireMenu('event'), async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const ev = await prisma.event.findUnique({ where: { id }, select: { id: true } });
  if (!ev) throw NotFound('Event tidak ditemukan');
  const rows = await eventReviews([id]);
  res.json({ success: true, data: { summary: summarize(rows), items: rows.slice(0, 300).map(toItem) } });
});
