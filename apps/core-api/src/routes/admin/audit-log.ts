import { Router } from 'express';
import { z } from 'zod';
import { prisma, type Prisma } from '@ecc/database';
import { paginationQuerySchema } from '@ecc/shared-types';
import { NotFound } from '../../lib/errors.js';

export const auditLogRouter = Router();

const filterSchema = paginationQuerySchema.extend({
  action: z
    .enum(['CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'ENROLL_FACE', 'RESET_FACE', 'UPLOAD_PHOTO'])
    .optional(),
  resource: z.string().optional(),
  userId: z.string().uuid().optional(),
  /** ISO date string YYYY-MM-DD */
  from: z.string().date().optional(),
  to: z.string().date().optional(),
});

/**
 * GET /admin/audit-log
 *
 * Filter:
 *   - action  : CREATE / UPDATE / DELETE / LOGIN / dst.
 *   - resource: 'jemaat' / 'sinode' / 'auth' / dst.
 *   - userId  : actor
 *   - from/to : range tanggal (inclusive)
 *   - search  : cari di resourceLabel atau userName
 */
auditLogRouter.get('/', async (req, res) => {
  const q = filterSchema.parse(req.query);

  const where: Prisma.AuditLogWhereInput = {};
  if (q.action) where.action = q.action;
  if (q.resource) where.resource = q.resource;
  if (q.userId) where.userId = q.userId;
  if (q.from || q.to) {
    where.createdAt = {};
    if (q.from) where.createdAt.gte = new Date(q.from);
    if (q.to) {
      const end = new Date(q.to);
      end.setHours(23, 59, 59, 999);
      where.createdAt.lte = end;
    }
  }
  if (q.search) {
    where.OR = [
      { resourceLabel: { contains: q.search, mode: 'insensitive' } },
      { userName: { contains: q.search, mode: 'insensitive' } },
    ];
  }

  const [data, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      skip: (q.page - 1) * q.limit,
      take: q.limit,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            jemaat: { select: { namaLengkap: true, noHp: true, fotoUrl: true } },
          },
        },
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  // Flatten user info untuk display
  const enriched = data.map((row) => ({
    ...row,
    userDisplay: row.user?.jemaat
      ? {
          namaLengkap: row.user.jemaat.namaLengkap,
          noHp: row.user.jemaat.noHp,
          fotoUrl: row.user.jemaat.fotoUrl,
        }
      : row.userName
        ? { namaLengkap: row.userName, noHp: null, fotoUrl: null }
        : null,
    user: undefined,
  }));

  res.json({
    success: true,
    data: enriched,
    meta: { page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit) },
  });
});

/** GET /admin/audit-log/:id — detail single entry dengan before/after lengkap */
auditLogRouter.get('/:id', async (req, res) => {
  const item = await prisma.auditLog.findUnique({
    where: { id: req.params.id },
    include: {
      user: { select: { jemaat: { select: { namaLengkap: true, noHp: true } } } },
    },
  });
  if (!item) throw NotFound('Audit log tidak ditemukan');
  res.json({ success: true, data: item });
});

/** GET /admin/audit-log/resource/:resource/:resourceId — timeline 1 entity */
auditLogRouter.get('/resource/:resource/:resourceId', async (req, res) => {
  const data = await prisma.auditLog.findMany({
    where: { resource: req.params.resource, resourceId: req.params.resourceId },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  res.json({ success: true, data });
});

/** GET /admin/audit-log/stats — quick metrics utk dashboard widget */
auditLogRouter.get('/stats/summary', async (_req, res) => {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 hari
  const [byAction, byResource] = await Promise.all([
    prisma.auditLog.groupBy({
      by: ['action'],
      where: { createdAt: { gte: since } },
      _count: true,
    }),
    prisma.auditLog.groupBy({
      by: ['resource'],
      where: { createdAt: { gte: since } },
      _count: true,
      orderBy: { _count: { resource: 'desc' } },
      take: 10,
    }),
  ]);
  res.json({ success: true, data: { byAction, byResource, since: since.toISOString() } });
});
