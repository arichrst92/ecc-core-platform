/**
 * Request update Spiritual Journey (portal) — /admin/spiritual-journey-request
 *
 *   GET  /?status=PENDING&search=&cabangId=&page=  → daftar request
 *   GET  /summary                                 → { pending } (badge menu)
 *   GET  /:id                                     → detail + rencana tahap yang akan diberikan
 *   POST /:id/approve  { subRoleIds?: {stepId: subRoleId} } → beri tahap s/d tahap dipilih
 *   POST /:id/reject   { alasan }                 → tolak (alasan dikirim ke jemaat)
 *
 * Akses: sama dengan menu Spiritual Journey (read untuk melihat, write untuk memproses).
 */
import { Router } from 'express';
import { prisma, type Prisma } from '@ecc/database';
import { z } from 'zod';
import { BadRequest, Conflict, NotFound } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { createNotification } from '../../lib/notification.js';
import { applyGrant, grantPlan } from '../../lib/spiritual-journey-request.js';
import { journeyStage } from '../../lib/spiritual-journey.js';
import { assertAccess } from './spiritual-journey.js';

export const spiritualJourneyRequestRouter = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUS = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const;

const requestSelect = {
  id: true,
  status: true,
  catatan: true,
  alasanTolak: true,
  reviewedAt: true,
  createdAt: true,
  step: { select: { id: true, judul: true, ikon: true, urutan: true } },
  jemaat: {
    select: {
      id: true,
      namaLengkap: true,
      kode: true,
      fotoUrl: true,
      noHp: true,
      cabang: { select: { id: true, nama: true } },
    },
  },
  reviewedBy: { select: { id: true, namaLengkap: true } },
} satisfies Prisma.SpiritualJourneyRequestSelect;

/** Nomor urut tahap (1-based, hanya tahap aktif) untuk ditampilkan. */
async function stepNumberMap() {
  const steps = await prisma.spiritualJourneyStep.findMany({
    where: { isActive: true },
    orderBy: [{ urutan: 'asc' }, { createdAt: 'asc' }],
    select: { id: true },
  });
  return new Map(steps.map((s, i) => [s.id, i + 1]));
}

spiritualJourneyRequestRouter.get('/summary', async (req, res) => {
  await assertAccess(req, 'read');
  const pending = await prisma.spiritualJourneyRequest.count({ where: { status: 'PENDING' } });
  res.json({ success: true, data: { pending } });
});

spiritualJourneyRequestRouter.get('/', async (req, res) => {
  await assertAccess(req, 'read');
  const q = z
    .object({
      status: z.enum(STATUS).optional(),
      search: z.string().trim().max(100).optional(),
      cabangId: z.string().uuid().optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(25),
    })
    .parse(req.query);
  const where: Prisma.SpiritualJourneyRequestWhereInput = {
    ...(q.status ? { status: q.status } : {}),
    ...(q.cabangId || q.search
      ? {
          jemaat: {
            ...(q.cabangId ? { cabangId: q.cabangId } : {}),
            ...(q.search ? { namaLengkap: { contains: q.search, mode: 'insensitive' as const } } : {}),
          },
        }
      : {}),
  };
  const [rows, total, nomor] = await Promise.all([
    prisma.spiritualJourneyRequest.findMany({
      where,
      // Menunggu: yang paling lama dulu; lainnya: terbaru dulu.
      orderBy: { createdAt: q.status === 'PENDING' ? 'asc' : 'desc' },
      skip: (q.page - 1) * q.limit,
      take: q.limit,
      select: requestSelect,
    }),
    prisma.spiritualJourneyRequest.count({ where }),
    stepNumberMap(),
  ]);
  res.json({
    success: true,
    data: rows.map((r) => ({ ...r, step: { ...r.step, nomor: nomor.get(r.step.id) ?? null } })),
    meta: { page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit) },
  });
});

spiritualJourneyRequestRouter.get('/:id', async (req, res) => {
  await assertAccess(req, 'read');
  if (!UUID_RE.test(req.params.id)) throw NotFound('Request tidak ditemukan');
  const r = await prisma.spiritualJourneyRequest.findUnique({ where: { id: req.params.id }, select: requestSelect });
  if (!r) throw NotFound('Request tidak ditemukan');
  let plan: Awaited<ReturnType<typeof grantPlan>>['plan'] = [];
  let tahapSekarang: { achievedCount: number; total: number; currentTitle: string | null } | null = null;
  if (r.status === 'PENDING') {
    try {
      const g = await grantPlan(r.jemaat.id, r.step.id);
      plan = g.plan;
      const st = journeyStage(g.steps, g.roles);
      tahapSekarang = { achievedCount: st.stage, total: st.total, currentTitle: st.judul };
    } catch {
      plan = [];
    }
  }
  const nomor = await stepNumberMap();
  res.json({ success: true, data: { ...r, step: { ...r.step, nomor: nomor.get(r.step.id) ?? null }, plan, tahapSekarang } });
});

spiritualJourneyRequestRouter.post('/:id/approve', async (req, res) => {
  await assertAccess(req, 'write');
  if (!UUID_RE.test(req.params.id)) throw NotFound('Request tidak ditemukan');
  const { subRoleIds } = z
    .object({ subRoleIds: z.record(z.string().uuid(), z.string().uuid()).default({}) })
    .parse(req.body ?? {});
  const reviewer = req.user!.jemaatId;
  const result = await prisma.$transaction(async (tx) => {
    const r = await tx.spiritualJourneyRequest.findUnique({
      where: { id: req.params.id },
      select: { id: true, status: true, jemaatId: true, stepId: true, step: { select: { judul: true } }, jemaat: { select: { namaLengkap: true } } },
    });
    if (!r) throw NotFound('Request tidak ditemukan');
    if (r.status !== 'PENDING') throw Conflict('Request ini sudah diproses.');
    const { granted } = await applyGrant(tx, r.jemaatId, r.stepId, subRoleIds, 'Disetujui dari request Spiritual Journey');
    await tx.spiritualJourneyRequest.update({
      where: { id: r.id },
      data: { status: 'APPROVED', reviewedByJemaatId: reviewer, reviewedAt: new Date() },
    });
    return { r, granted };
  });
  audit(req, {
    action: 'UPDATE',
    resource: 'spiritual_journey_request',
    resourceId: result.r.id,
    resourceLabel: `Setujui: ${result.r.jemaat.namaLengkap} → ${result.r.step.judul}`,
    metadata: { granted: result.granted },
  });
  void createNotification({
    jemaatId: result.r.jemaatId,
    type: 'SPIRITUAL_JOURNEY_APPROVED',
    title: 'Spiritual Journey diperbarui',
    body: `Request Anda disetujui. Tahap "${result.r.step.judul}" sudah tercatat di Spiritual Journey Anda.`,
    actionUrl: '/spiritual-journey',
    metadata: { requestId: result.r.id, stepId: result.r.stepId },
  });
  res.json({ success: true, data: { id: result.r.id, status: 'APPROVED', granted: result.granted } });
});

spiritualJourneyRequestRouter.post('/:id/reject', async (req, res) => {
  await assertAccess(req, 'write');
  if (!UUID_RE.test(req.params.id)) throw NotFound('Request tidak ditemukan');
  const { alasan } = z.object({ alasan: z.string().trim().min(3, 'Isi alasan penolakan (min. 3 karakter).').max(500) }).parse(req.body ?? {});
  const r = await prisma.spiritualJourneyRequest.findUnique({
    where: { id: req.params.id },
    select: { id: true, status: true, jemaatId: true, step: { select: { judul: true } }, jemaat: { select: { namaLengkap: true } } },
  });
  if (!r) throw NotFound('Request tidak ditemukan');
  if (r.status !== 'PENDING') throw Conflict('Request ini sudah diproses.');
  const upd = await prisma.spiritualJourneyRequest.updateMany({
    where: { id: r.id, status: 'PENDING' },
    data: { status: 'REJECTED', alasanTolak: alasan, reviewedByJemaatId: req.user!.jemaatId, reviewedAt: new Date() },
  });
  if (!upd.count) throw BadRequest('Request ini sudah diproses.');
  audit(req, {
    action: 'UPDATE',
    resource: 'spiritual_journey_request',
    resourceId: r.id,
    resourceLabel: `Tolak: ${r.jemaat.namaLengkap} → ${r.step.judul}`,
    metadata: { alasan },
  });
  void createNotification({
    jemaatId: r.jemaatId,
    type: 'SPIRITUAL_JOURNEY_REJECTED',
    title: 'Request Spiritual Journey belum disetujui',
    body: `Request tahap "${r.step.judul}" belum disetujui: ${alasan}`,
    actionUrl: '/spiritual-journey',
    metadata: { requestId: r.id },
  });
  res.json({ success: true, data: { id: r.id, status: 'REJECTED' } });
});
