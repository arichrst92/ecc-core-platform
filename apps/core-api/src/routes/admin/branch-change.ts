/**
 * Admin queue untuk Branch Change Request (mobile app).
 *
 * Flow:
 *   1. Jemaat submit request via POST /admin/me/branch-change-request.
 *   2. Admin cabang lihat queue PENDING di portal.
 *   3. Admin approve → Jemaat.cabangId di-update ke targetCabangId, request
 *      ditandai APPROVED + reviewedBy/reviewedAt.
 *   4. Admin reject → request ditandai REJECTED + reviewNote.
 *
 * Tidak ada notifikasi otomatis ke jemaat (defer notif infra). Mobile poll
 * GET /admin/me/branch-change-requests untuk lihat status.
 */
import { Router } from 'express';
import { prisma } from '@ecc/database';
import {
  reviewBranchChangeRequestSchema,
  paginationQuerySchema,
} from '@ecc/shared-types';
import { BadRequest, NotFound, Unauthorized } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { createNotification } from '../../lib/notification.js';

export const branchChangeRouter = Router();

// List requests — admin queue.
// Filter: ?status=PENDING|APPROVED|REJECTED, ?cabangId=<targetCabangId>
branchChangeRouter.get('/', async (req, res) => {
  const q = paginationQuerySchema.parse(req.query);
  const statusFilter = typeof req.query.status === 'string' ? req.query.status : undefined;
  const cabangId = typeof req.query.cabangId === 'string' ? req.query.cabangId : undefined;

  const where: any = {};
  if (statusFilter && ['PENDING', 'APPROVED', 'REJECTED'].includes(statusFilter)) {
    where.status = statusFilter;
  }
  if (cabangId) where.OR = [{ currentCabangId: cabangId }, { targetCabangId: cabangId }];

  const [rows, total] = await Promise.all([
    prisma.branchChangeRequest.findMany({
      where,
      skip: (q.page - 1) * q.limit,
      take: q.limit,
      orderBy: { createdAt: 'desc' },
      include: {
        jemaat: { select: { id: true, namaLengkap: true, noHp: true, fotoUrl: true } },
        reviewer: { select: { id: true, namaLengkap: true } },
      },
    }),
    prisma.branchChangeRequest.count({ where }),
  ]);

  // Hydrate cabang names (since schema doesn't model these as relations).
  const cabangIds = new Set<string>();
  for (const r of rows) {
    cabangIds.add(r.currentCabangId);
    cabangIds.add(r.targetCabangId);
  }
  const cabangs = cabangIds.size
    ? await prisma.cabangGereja.findMany({
        where: { id: { in: [...cabangIds] } },
        select: { id: true, nama: true, kode: true },
      })
    : [];
  const cabangMap = new Map(cabangs.map((c) => [c.id, c]));

  const data = rows.map((r: any) => ({
    ...r,
    currentCabang: cabangMap.get(r.currentCabangId) ?? null,
    targetCabang: cabangMap.get(r.targetCabangId) ?? null,
  }));

  res.json({
    success: true,
    data,
    meta: { page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit) },
  });
});

// Detail
branchChangeRouter.get('/:id', async (req, res) => {
  const r = await prisma.branchChangeRequest.findUnique({
    where: { id: req.params.id },
    include: {
      jemaat: { select: { id: true, namaLengkap: true, noHp: true, fotoUrl: true } },
      reviewer: { select: { id: true, namaLengkap: true } },
    },
  });
  if (!r) throw NotFound('Permohonan tidak ditemukan');
  const [current, target] = await Promise.all([
    prisma.cabangGereja.findUnique({ where: { id: r.currentCabangId }, select: { id: true, nama: true, kode: true } }),
    prisma.cabangGereja.findUnique({ where: { id: r.targetCabangId }, select: { id: true, nama: true, kode: true } }),
  ]);
  res.json({ success: true, data: { ...r, currentCabang: current, targetCabang: target } });
});

// Approve / reject
branchChangeRouter.post('/:id/review', async (req, res) => {
  if (!req.user) throw Unauthorized();
  const input = reviewBranchChangeRequestSchema.parse(req.body);

  const before = await prisma.branchChangeRequest.findUnique({
    where: { id: req.params.id },
    include: { jemaat: { select: { namaLengkap: true } } },
  });
  if (!before) throw NotFound('Permohonan tidak ditemukan');
  if (before.status !== 'PENDING') {
    throw BadRequest(`Permohonan sudah di-${before.status}, tidak bisa di-review ulang.`);
  }

  // Resolve reviewer (jemaatId, bukan userId — review_note ref ke jemaat)
  const reviewer = await prisma.user.findUnique({
    where: { id: req.user.sub },
    select: { jemaatId: true },
  });

  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const r = await tx.branchChangeRequest.update({
      where: { id: before.id },
      data: {
        status: input.decision,
        reviewedBy: reviewer?.jemaatId,
        reviewedAt: now,
        reviewNote: input.reviewNote,
      },
    });
    // Kalau approved, update Jemaat.cabangId
    if (input.decision === 'APPROVED') {
      await tx.jemaat.update({
        where: { id: before.jemaatId },
        data: { cabangId: before.targetCabangId },
      });
    }
    return r;
  });

  audit(req, {
    action: 'UPDATE',
    resource: 'branch_change_request',
    resourceId: updated.id,
    resourceLabel: `${input.decision} — ${before.jemaat.namaLengkap}`,
    before,
    after: updated,
  });

  // In-app notif ke jemaat requester
  if (input.decision === 'APPROVED') {
    void createNotification({
      jemaatId: before.jemaatId,
      type: 'BRANCH_CHANGE_APPROVED',
      title: 'Perubahan cabang di-approve',
      body: `Permohonan pindah cabang Anda sudah disetujui. Cabang aktif Anda sudah di-update.${input.reviewNote ? ` Catatan admin: ${input.reviewNote}` : ''}`,
      actionUrl: `/profile/branch`,
      metadata: {
        requestId: updated.id,
        targetCabangId: before.targetCabangId,
        reviewNote: input.reviewNote ?? null,
      },
    });
  } else if (input.decision === 'REJECTED') {
    void createNotification({
      jemaatId: before.jemaatId,
      type: 'BRANCH_CHANGE_REJECTED',
      title: 'Permohonan pindah cabang ditolak',
      body: `Permohonan Anda tidak disetujui.${input.reviewNote ? ` Alasan: ${input.reviewNote}` : ' Hubungi admin cabang untuk info lebih lanjut.'}`,
      actionUrl: `/profile/branch`,
      metadata: {
        requestId: updated.id,
        targetCabangId: before.targetCabangId,
        reviewNote: input.reviewNote ?? null,
      },
    });
  }

  res.json({ success: true, data: updated });
});
