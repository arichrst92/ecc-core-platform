/**
 * Announcement untuk app jemaat — /admin/me/announcements
 *   GET  /popup        pengumuman In App yang belum ditutup (maks 30 hari) → popup
 *   GET  /:id          detail (penerima saja) → tandai dibaca
 *   POST /:id/dismiss  popup ditutup (tidak muncul lagi) → tandai dibaca
 */
import { Router, type Request } from 'express';
import { prisma } from '@ecc/database';
import { NotFound, Unauthorized } from '../../lib/errors.js';
import { parseLinks, publicPageUrl } from '../../lib/announcement.js';

export const meAnnouncementRouter = Router();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function me(req: Request) {
  if (!req.user) throw Unauthorized();
  return req.user.jemaatId;
}

const SELECT = {
  id: true,
  slug: true,
  judul: true,
  isi: true,
  bannerUrl: true,
  links: true,
  startedAt: true,
  channels: true,
  status: true,
} as const;

const view = (a: { id: string; slug: string; judul: string; isi: string; bannerUrl: string | null; links: unknown; startedAt: Date | null }) => ({
  id: a.id,
  judul: a.judul,
  isi: a.isi,
  bannerUrl: a.bannerUrl,
  links: parseLinks(a.links),
  sentAt: a.startedAt,
  publicUrl: publicPageUrl(a.slug),
});

meAnnouncementRouter.get('/popup', async (req, res) => {
  const jemaatId = me(req);
  const rows = await prisma.announcementRecipient.findMany({
    where: {
      jemaatId,
      dismissedAt: null,
      inAppStatus: 'SENT',
      createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) },
      announcement: { status: { in: ['SENDING', 'SENT'] } },
    },
    orderBy: { createdAt: 'asc' },
    take: 5,
    select: { announcement: { select: SELECT } },
  });
  res.json({ success: true, data: rows.map((r) => view(r.announcement)) });
});

meAnnouncementRouter.get('/:id', async (req, res) => {
  const jemaatId = me(req);
  const id = req.params.id ?? '';
  if (!UUID.test(id)) throw NotFound('Pengumuman tidak ditemukan');
  const r = await prisma.announcementRecipient.findUnique({
    where: { announcementId_jemaatId: { announcementId: id, jemaatId } },
    select: { id: true, readAt: true, announcement: { select: SELECT } },
  });
  if (!r || !['SENDING', 'SENT'].includes(r.announcement.status)) throw NotFound('Pengumuman tidak ditemukan');
  if (!r.readAt) await prisma.announcementRecipient.update({ where: { id: r.id }, data: { readAt: new Date() } });
  res.json({ success: true, data: view(r.announcement) });
});

meAnnouncementRouter.post('/:id/dismiss', async (req, res) => {
  const jemaatId = me(req);
  const id = req.params.id ?? '';
  if (!UUID.test(id)) throw NotFound('Pengumuman tidak ditemukan');
  const now = new Date();
  await prisma.announcementRecipient.updateMany({ where: { announcementId: id, jemaatId, dismissedAt: null }, data: { dismissedAt: now } });
  await prisma.announcementRecipient.updateMany({ where: { announcementId: id, jemaatId, readAt: null }, data: { readAt: now } });
  // Notifikasi di lonceng ikut ditandai dibaca.
  await prisma.notification.updateMany({
    where: { jemaatId, type: 'ANNOUNCEMENT', readAt: null, actionUrl: `/announcement/${id}` },
    data: { readAt: now },
  });
  res.json({ success: true, data: { dismissed: true } });
});
