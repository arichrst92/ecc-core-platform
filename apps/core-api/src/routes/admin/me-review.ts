/**
 * Ulasan jemaat untuk ibadah / event dari tiket — /admin/me/reviews
 *
 *   GET ?kind=IBADAH|EVENT&ticketId=<reservasiId|participationId>
 *       → { window, review|null }
 *   PUT { kind, ticketId, rating 1–5, komentar?, isAnonim? } → simpan/ubah
 *
 * Hanya pemilik tiket. Dibuka saat acara dimulai s/d 14 hari setelah selesai.
 */
import { Router, type Request } from 'express';
import { prisma } from '@ecc/database';
import { z } from 'zod';
import { BadRequest, Forbidden, NotFound, Unauthorized } from '../../lib/errors.js';
import { eventReviewWindow, ibadahReviewWindow, type ReviewWindow } from '../../lib/service-review.js';

export const meReviewRouter = Router();

const kindSchema = z.enum(['IBADAH', 'EVENT']);

function me(req: Request) {
  if (!req.user) throw Unauthorized();
  return req.user.jemaatId;
}

const REASON_TEXT: Record<string, string> = {
  NOT_STARTED: 'Ulasan bisa diberikan setelah acara dimulai.',
  CLOSED: 'Masa pemberian ulasan sudah berakhir.',
  CANCELLED: 'Tiket ini dibatalkan.',
  NOT_OWNER: 'Hanya pemilik tiket yang bisa memberi ulasan.',
};

async function loadTicket(kind: 'IBADAH' | 'EVENT', ticketId: string, jemaatId: string) {
  if (kind === 'IBADAH') {
    const r = await prisma.reservasi.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        jemaatId: true,
        status: true,
        tanggalIbadah: true,
        ibadahId: true,
        ibadah: { select: { jamMulai: true, jamSelesai: true, cabangId: true, cabang: { select: { timezone: true } } } },
        review: true,
      },
    });
    if (!r) throw NotFound('Tiket tidak ditemukan');
    const win: ReviewWindow =
      r.jemaatId !== jemaatId
        ? { ...ibadahReviewWindow(r, r.ibadah.cabang?.timezone), open: false, reason: 'NOT_OWNER' }
        : ibadahReviewWindow(r, r.ibadah.cabang?.timezone);
    return {
      win,
      review: r.review,
      target: { kind, reservasiId: r.id, ibadahId: r.ibadahId, tanggal: r.tanggalIbadah, cabangId: r.ibadah.cabangId, jemaatId: r.jemaatId },
    };
  }
  const p = await prisma.eventParticipation.findUnique({
    where: { id: ticketId },
    select: {
      id: true,
      jemaatId: true,
      status: true,
      eventId: true,
      event: { select: { tanggalMulai: true, tanggalSelesai: true, jamMulai: true, jamSelesai: true, cabangId: true, cabang: { select: { timezone: true } } } },
      review: true,
    },
  });
  if (!p) throw NotFound('Tiket tidak ditemukan');
  const base = eventReviewWindow(p, p.event.cabang?.timezone);
  const win: ReviewWindow = p.jemaatId !== jemaatId ? { ...base, open: false, reason: 'NOT_OWNER' } : base;
  return {
    win,
    review: p.review,
    target: { kind, participationId: p.id, eventId: p.eventId, cabangId: p.event.cabangId, jemaatId: p.jemaatId },
  };
}

const present = (win: ReviewWindow, review: { rating: number; komentar: string | null; isAnonim: boolean; updatedAt: Date } | null) => ({
  window: { ...win, reasonText: win.reason ? REASON_TEXT[win.reason] : null },
  review: review ? { rating: review.rating, komentar: review.komentar, isAnonim: review.isAnonim, updatedAt: review.updatedAt.toISOString() } : null,
});

meReviewRouter.get('/', async (req, res) => {
  const jemaatId = me(req);
  const kind = kindSchema.parse(String(req.query.kind ?? '').toUpperCase());
  const ticketId = z.string().uuid().parse(req.query.ticketId);
  const t = await loadTicket(kind, ticketId, jemaatId);
  if (t.target.jemaatId !== jemaatId && !t.review) {
    // tiket keluarga/tamu: status saja, tanpa data ulasan orang lain
    return res.json({ success: true, data: present(t.win, null) });
  }
  res.json({ success: true, data: present(t.win, t.target.jemaatId === jemaatId ? t.review : null) });
});

const putSchema = z.object({
  kind: kindSchema,
  ticketId: z.string().uuid(),
  rating: z.coerce.number().int().min(1).max(5),
  komentar: z.string().trim().max(1000).optional().nullable(),
  isAnonim: z.boolean().optional(),
});

meReviewRouter.put('/', async (req, res) => {
  const jemaatId = me(req);
  const input = putSchema.parse(req.body ?? {});
  const t = await loadTicket(input.kind, input.ticketId, jemaatId);
  if (t.win.reason === 'NOT_OWNER') throw Forbidden(REASON_TEXT.NOT_OWNER!);
  if (!t.win.open) throw BadRequest(REASON_TEXT[t.win.reason ?? 'CLOSED'] ?? 'Ulasan belum bisa diberikan.');
  const data = {
    rating: input.rating,
    komentar: input.komentar?.trim() || null,
    isAnonim: input.isAnonim ?? false,
  };
  const tg = t.target;
  const saved =
    tg.kind === 'IBADAH'
      ? await prisma.serviceReview.upsert({
          where: { reservasiId: tg.reservasiId },
          create: { kind: 'IBADAH', reservasiId: tg.reservasiId, ibadahId: tg.ibadahId, tanggal: tg.tanggal, cabangId: tg.cabangId, jemaatId, ...data },
          update: data,
        })
      : await prisma.serviceReview.upsert({
          where: { participationId: tg.participationId },
          create: { kind: 'EVENT', participationId: tg.participationId, eventId: tg.eventId, cabangId: tg.cabangId, jemaatId, ...data },
          update: data,
        });
  res.json({ success: true, data: present(t.win, saved) });
});
