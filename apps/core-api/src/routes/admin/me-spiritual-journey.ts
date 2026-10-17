/**
 * Spiritual Journey saya (mobile) — GET /admin/me/spiritual-journey
 *
 * Tahap aktif berurutan + tanda sudah/belum tercapai (dari role aktif saya),
 * tahap berikutnya, dan event mendatang (cabang saya / global) yang memberi
 * status tahap tersebut sebagai "cara mendapatkan".
 */
import { Router } from 'express';
import { prisma } from '@ecc/database';
import { Unauthorized } from '../../lib/errors.js';
import { eventGrantsStep, journeyProgress } from '../../lib/spiritual-journey.js';
import { stepInclude } from './spiritual-journey.js';

export const meSpiritualJourneyRouter = Router();

meSpiritualJourneyRouter.get('/', async (req, res) => {
  if (!req.user) throw Unauthorized();
  const jemaatId = req.user.jemaatId;
  const now = new Date();
  const [steps, roles, me] = await Promise.all([
    prisma.spiritualJourneyStep.findMany({
      where: { isActive: true },
      orderBy: [{ urutan: 'asc' }, { createdAt: 'asc' }],
      include: stepInclude,
    }),
    prisma.jemaatRole.findMany({
      where: { jemaatId, isActive: true },
      select: { roleId: true, subRoleId: true, subRoleStatusId: true },
    }),
    prisma.jemaat.findUnique({ where: { id: jemaatId }, select: { cabangId: true } }),
  ]);
  const events = steps.length
    ? await prisma.event.findMany({
        where: {
          isActive: true,
          isPublished: true,
          grantRoleId: { in: [...new Set(steps.map((s) => s.roleId))] },
          OR: [{ cabangId: null }, ...(me ? [{ cabangId: me.cabangId }] : [])],
          AND: [
            {
              OR: [
                { tanggalSelesai: { gte: now } },
                { tanggalSelesai: null, tanggalMulai: { gte: new Date(now.getTime() - 86_400_000) } },
              ],
            },
          ],
        },
        orderBy: { tanggalMulai: 'asc' },
        take: 100,
        select: {
          id: true,
          judul: true,
          tanggalMulai: true,
          jamMulai: true,
          lokasi: true,
          grantRoleId: true,
          grantSubRoleId: true,
          grantSubRoleStatusId: true,
          cabang: { select: { id: true, nama: true } },
        },
      })
    : [];

  const p = journeyProgress(steps, roles);
  res.json({
    success: true,
    data: {
      total: steps.length,
      achievedCount: p.achievedCount,
      nextIndex: p.nextIndex,
      steps: p.steps.map((s, i) => ({
        id: s.id,
        urutan: i + 1,
        judul: s.judul,
        deskripsi: s.deskripsi,
        caraMendapatkan: s.caraMendapatkan,
        ikon: s.ikon,
        syarat: { role: s.role.nama, subRole: s.subRole?.nama ?? null, status: s.subRoleStatus?.nama ?? null },
        achieved: s.achieved,
        isNext: s.isNext,
        // Event mendatang yang memberi status tahap ini (hanya untuk yang belum).
        events: s.achieved
          ? []
          : events
              .filter((e) => eventGrantsStep(e, s))
              .slice(0, 3)
              .map((e) => ({ id: e.id, judul: e.judul, tanggalMulai: e.tanggalMulai, jamMulai: e.jamMulai, lokasi: e.lokasi, cabang: e.cabang })),
      })),
    },
  });
});
