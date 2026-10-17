/**
 * Pengumuman & voting homecell (level homecell, bukan per jadwal).
 * Mount: homecellRouter.use('/:homecellId', homecellBoardRouter)
 *   → /admin/homecell/:homecellId/announcements, /admin/homecell/:homecellId/polls
 *
 * Akses:
 *   - Kelola: PIC homecell, PIC area, atau fulltimer (fulltimer hanya via portal)
 *   - Lihat & vote: anggota aktif homecell + PIC (fulltimer non-anggota tidak bisa vote)
 */
import { prisma } from '@ecc/database';
import { Forbidden, NotFound } from '../../lib/errors.js';
import { buildBoardRouter } from './content-board.js';
import { isMobileClient } from '../../lib/client-kind.js';

export const homecellBoardRouter = buildBoardRouter({
  resource: 'homecell',
  fk: 'homecellId',
  loadAccess: async (req, { jemaatId, isFulltimer }) => {
    const homecellId = (req.params as { homecellId: string }).homecellId;
    const hc = await prisma.homecell.findUnique({
      where: { id: homecellId },
      select: { id: true, nama: true, isActive: true, picJemaatId: true, area: { select: { picJemaatId: true } } },
    });
    if (!hc || !hc.isActive) throw NotFound('Homecell tidak ditemukan.');
    const isPic = hc.picJemaatId === jemaatId || hc.area?.picJemaatId === jemaatId;
    const m = isPic
      ? null
      : await prisma.homecellMember.findUnique({
          where: { homecellId_jemaatId: { homecellId: hc.id, jemaatId } },
          select: { isActive: true },
        });
    const isParticipant = isPic || !!m?.isActive;
    // Admin fulltimer hanya lewat portal; di app mobile konten hanya untuk anggota & PIC.
    const adminBypass = isFulltimer && !isMobileClient(req);
    const canManage = isPic || adminBypass;
    if (!isParticipant && !adminBypass) throw Forbidden('Konten ini hanya untuk anggota homecell.');
    return {
      ownerId: hc.id,
      ownerNama: hc.nama,
      jemaatId,
      canManage,
      isParticipant,
      recipients: async () => {
        const ms = await prisma.homecellMember.findMany({
          where: { homecellId: hc.id, isActive: true },
          select: { jemaatId: true },
        });
        const ids = ms.map((m) => m.jemaatId);
        if (hc.picJemaatId) ids.push(hc.picJemaatId);
        return ids;
      },
    };
  },
  announcement: () => prisma.homecellAnnouncement,
  poll: () => prisma.homecellPoll,
  vote: () => prisma.homecellPollVote,
  notif: { announcement: 'HOMECELL_ANNOUNCEMENT', poll: 'HOMECELL_POLL_CREATED' },
  actionUrl: (id) => `/homecell/view/${id}`,
});
