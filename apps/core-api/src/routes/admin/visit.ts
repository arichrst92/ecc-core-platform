/**
 * Admin portal — Visit (Movement) read-only + moderation delete.
 *
 * Tidak ada create/edit dari portal. Aktivitas Visit dilakukan di mobile
 * app (scan QR + notes oleh jemaat). Portal hanya untuk:
 *   - GET    /admin/visit              → paginated list dgn filter
 *   - GET    /admin/visit/:id          → detail
 *   - DELETE /admin/visit/:id          → moderation delete (audit logged)
 *
 * Filter:
 *   - search   : free-text di judul/lokasi/nama peserta
 *   - cabangId : visits dimana minimal 1 peserta dari cabang ini
 *   - jemaatId : visits yang melibatkan jemaat ini (initiator OR target)
 *   - from/to  : range tanggalVisit (YYYY-MM-DD, inclusive)
 */
import { Router } from 'express';
import { prisma } from '@ecc/database';
import { adminVisitsQuerySchema } from '@ecc/shared-types';
import { NotFound } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';

export const visitRouter = Router();

const jemaatLite = {
  id: true,
  namaLengkap: true,
  fotoUrl: true,
  noHp: true,
  cabang: { select: { id: true, nama: true } },
} as const;

// ============================================================
//  LIST
// ============================================================
visitRouter.get('/', async (req, res) => {
  const q = adminVisitsQuerySchema.parse(req.query);

  const where: any = {};

  // Cabang scoping: minimal salah satu peserta dari cabang ini.
  if (q.cabangId) {
    where.OR = [
      { initiator: { cabangId: q.cabangId } },
      { target: { cabangId: q.cabangId } },
    ];
  }

  // Jemaat filter: peserta initiator atau target.
  if (q.jemaatId) {
    const jemaatClause = [
      { initiatorJemaatId: q.jemaatId },
      { targetJemaatId: q.jemaatId },
    ];
    if (where.OR) {
      // Combine cabang + jemaat filters with AND.
      where.AND = [{ OR: where.OR }, { OR: jemaatClause }];
      delete where.OR;
    } else {
      where.OR = jemaatClause;
    }
  }

  // Range tanggalVisit
  if (q.from || q.to) {
    where.tanggalVisit = {};
    if (q.from) where.tanggalVisit.gte = new Date(q.from);
    if (q.to) {
      const toEnd = new Date(q.to);
      toEnd.setUTCHours(23, 59, 59, 999);
      where.tanggalVisit.lte = toEnd;
    }
  }

  // Free-text search di judul + lokasi + nama peserta
  if (q.search) {
    const searchClause = {
      OR: [
        { judul: { contains: q.search, mode: 'insensitive' as const } },
        { lokasi: { contains: q.search, mode: 'insensitive' as const } },
        { initiator: { namaLengkap: { contains: q.search, mode: 'insensitive' as const } } },
        { target: { namaLengkap: { contains: q.search, mode: 'insensitive' as const } } },
      ],
    };
    if (where.AND) {
      where.AND.push(searchClause);
    } else if (where.OR) {
      where.AND = [{ OR: where.OR }, searchClause];
      delete where.OR;
    } else {
      Object.assign(where, searchClause);
    }
  }

  const orderBy = { [q.sortBy ?? 'tanggalVisit']: q.sortOrder ?? 'desc' };

  const [rows, total] = await Promise.all([
    prisma.visit.findMany({
      where,
      skip: (q.page - 1) * q.limit,
      take: q.limit,
      orderBy,
      include: {
        initiator: { select: jemaatLite },
        target: { select: jemaatLite },
      },
    }),
    prisma.visit.count({ where }),
  ]);

  res.json({
    success: true,
    data: rows,
    meta: { page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit) },
  });
});

// ============================================================
//  DETAIL
// ============================================================
visitRouter.get('/:id', async (req, res) => {
  const visit = await prisma.visit.findUnique({
    where: { id: req.params.id },
    include: {
      initiator: { select: jemaatLite },
      target: { select: jemaatLite },
    },
  });
  if (!visit) throw NotFound('Visit tidak ditemukan');
  res.json({ success: true, data: visit });
});

// ============================================================
//  DELETE (moderation)
// ============================================================
visitRouter.delete('/:id', async (req, res) => {
  const before = await prisma.visit.findUnique({
    where: { id: req.params.id },
    include: {
      initiator: { select: { namaLengkap: true } },
      target: { select: { namaLengkap: true } },
    },
  });
  if (!before) throw NotFound('Visit tidak ditemukan');

  await prisma.visit.delete({ where: { id: before.id } });
  audit(req, {
    action: 'DELETE',
    resource: 'visit',
    resourceId: before.id,
    resourceLabel: `[moderation] ${before.initiator.namaLengkap} ↔ ${before.target.namaLengkap}: ${before.judul}`,
    before,
  });
  res.status(204).end();
});
