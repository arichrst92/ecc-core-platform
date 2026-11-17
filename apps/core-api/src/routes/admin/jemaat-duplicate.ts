/**
 * Kandidat akun ganda (pendaftar baru mirip data jemaat lama / nomor milik data tamu).
 *   GET   /admin/jemaat-duplicate?status=OPEN|MERGED|DISMISSED
 *   PATCH /admin/jemaat-duplicate/:id { status: 'MERGED' | 'DISMISSED' }
 * Penggabungan data dilakukan admin (edit / konsolidasi); di sini hanya
 * ditinjau & ditandai.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@ecc/database';
import { NotFound } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { requireMenu } from '../../middleware/require-menu.js';

export const jemaatDuplicateRouter = Router();
jemaatDuplicateRouter.use(requireMenu('jemaat'));

const SELECT = {
  id: true,
  namaLengkap: true,
  kode: true,
  noHp: true,
  email: true,
  tanggalLahir: true,
  isTamu: true,
  isActive: true,
  createdAt: true,
  cabang: { select: { nama: true } },
  user: { select: { lastLoginAt: true } },
} as const;

jemaatDuplicateRouter.get('/', async (req, res) => {
  const status = z.enum(['OPEN', 'MERGED', 'DISMISSED']).catch('OPEN').parse(req.query.status);
  const rows = await prisma.duplicateCandidate.findMany({
    where: { status },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  const ids = [...new Set(rows.flatMap((r) => [r.newJemaatId, r.oldJemaatId]))];
  const people = await prisma.jemaat.findMany({ where: { id: { in: ids } }, select: SELECT });
  const byId = new Map(people.map((p) => [p.id, p]));
  const openCount = status === 'OPEN' ? rows.length : await prisma.duplicateCandidate.count({ where: { status: 'OPEN' } });
  res.json({
    success: true,
    data: rows
      .map((r) => ({ ...r, baru: byId.get(r.newJemaatId) ?? null, lama: byId.get(r.oldJemaatId) ?? null }))
      .filter((r) => r.baru && r.lama),
    meta: { openCount },
  });
});

jemaatDuplicateRouter.patch('/:id', requireMenu('jemaat', 'write'), async (req, res) => {
  const { status } = z.object({ status: z.enum(['MERGED', 'DISMISSED', 'OPEN']) }).parse(req.body ?? {});
  const before = await prisma.duplicateCandidate.findUnique({ where: { id: req.params.id } });
  if (!before) throw NotFound('Kandidat tidak ditemukan');
  const updated = await prisma.duplicateCandidate.update({
    where: { id: before.id },
    data: status === 'OPEN' ? { status, resolvedAt: null, resolvedByUserId: null } : { status, resolvedAt: new Date(), resolvedByUserId: req.user?.sub ?? null },
  });
  audit(req, {
    action: 'UPDATE',
    resource: 'duplicate_candidate',
    resourceId: before.id,
    resourceLabel: `Kandidat ganda → ${status}`,
    before,
    after: updated,
  });
  res.json({ success: true, data: updated });
});
