/**
 * Spiritual Journey saya (mobile) — GET /admin/me/spiritual-journey
 *
 * Tahap aktif berurutan + tanda sudah/belum tercapai (dari role aktif saya),
 * tahap berikutnya, dan event mendatang (cabang saya / global) yang memberi
 * status tahap tersebut sebagai "cara mendapatkan".
 *
 * 2.4.6 — request update tahap (disetujui admin di Portal):
 *   POST   /admin/me/spiritual-journey/request      { stepId, catatan? }
 *   DELETE /admin/me/spiritual-journey/request/:id  → batalkan (masih menunggu)
 * GET / juga mengirim `request` = request terakhir (menunggu / hasil terakhir).
 */
import { Router } from 'express';
import { prisma } from '@ecc/database';
import { z } from 'zod';
import { BadRequest, Conflict, NotFound, Unauthorized } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { meetsStep } from '../../lib/spiritual-journey.js';
import { eventGrantsStep, journeyProgress } from '../../lib/spiritual-journey.js';
import { stepInclude } from './spiritual-journey.js';

export const meSpiritualJourneyRouter = Router();

meSpiritualJourneyRouter.get('/', async (req, res) => {
  if (!req.user) throw Unauthorized();
  const jemaatId = req.user.jemaatId;
  const now = new Date();
  const [steps, roles, me, lastRequest] = await Promise.all([
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
    prisma.spiritualJourneyRequest.findFirst({
      where: { jemaatId, status: { not: 'CANCELLED' } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true, catatan: true, alasanTolak: true, createdAt: true, reviewedAt: true, step: { select: { id: true, judul: true } } },
    }),
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
      request: lastRequest,
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

const requestSchema = z.object({
  stepId: z.string().uuid('Pilih tahap.'),
  // Opsional (2.4.7): kosong → null.
  catatan: z
    .string()
    .trim()
    .max(1000)
    .nullish()
    .transform((v) => (v ? v : null)),
});

meSpiritualJourneyRouter.post('/request', async (req, res) => {
  if (!req.user) throw Unauthorized();
  const jemaatId = req.user.jemaatId;
  const input = requestSchema.parse(req.body ?? {});
  const [steps, roles, pending] = await Promise.all([
    prisma.spiritualJourneyStep.findMany({
      where: { isActive: true },
      orderBy: [{ urutan: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, judul: true, roleId: true, subRoleId: true, subRoleStatusId: true },
    }),
    prisma.jemaatRole.findMany({ where: { jemaatId, isActive: true }, select: { roleId: true, subRoleId: true, subRoleStatusId: true } }),
    prisma.spiritualJourneyRequest.findFirst({ where: { jemaatId, status: 'PENDING' }, select: { id: true } }),
  ]);
  if (pending) throw Conflict('Masih ada request yang menunggu persetujuan. Batalkan dulu bila ingin mengganti.');
  const idx = steps.findIndex((s) => s.id === input.stepId);
  if (idx < 0) throw NotFound('Tahap tidak ditemukan.');
  if (steps.slice(0, idx + 1).every((s) => meetsStep(s, roles))) {
    throw BadRequest('Tahap ini (dan tahap sebelumnya) sudah tercatat di Spiritual Journey Anda.');
  }
  const created = await prisma.spiritualJourneyRequest.create({
    data: { jemaatId, stepId: input.stepId, catatan: input.catatan },
    select: { id: true, status: true, catatan: true, alasanTolak: true, createdAt: true, reviewedAt: true, step: { select: { id: true, judul: true } } },
  });
  audit(req, {
    action: 'CREATE',
    resource: 'spiritual_journey_request',
    resourceId: created.id,
    resourceLabel: `Request tahap "${created.step.judul}"`,
  });
  res.status(201).json({ success: true, data: created });
});

meSpiritualJourneyRouter.delete('/request/:id', async (req, res) => {
  if (!req.user) throw Unauthorized();
  const upd = await prisma.spiritualJourneyRequest.updateMany({
    where: { id: z.string().uuid().parse(req.params.id), jemaatId: req.user.jemaatId, status: 'PENDING' },
    data: { status: 'CANCELLED' },
  });
  if (!upd.count) throw NotFound('Request tidak ditemukan atau sudah diproses.');
  res.json({ success: true, data: { id: req.params.id, status: 'CANCELLED' } });
});
