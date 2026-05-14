import { Router } from 'express';
import { prisma } from '@ecc/database';
import {
  createJemaatSchema,
  updateJemaatSchema,
  paginationQuerySchema,
} from '@ecc/shared-types';
import { NotFound } from '../../lib/errors.js';

export const jemaatRouter = Router();

jemaatRouter.get('/', async (req, res) => {
  const q = paginationQuerySchema.parse(req.query);
  const where = q.search
    ? {
        OR: [
          { namaLengkap: { contains: q.search, mode: 'insensitive' as const } },
          { email: { contains: q.search, mode: 'insensitive' as const } },
          { noHp: { contains: q.search } },
        ],
      }
    : {};
  const [data, total] = await Promise.all([
    prisma.jemaat.findMany({
      where,
      skip: (q.page - 1) * q.limit,
      take: q.limit,
      orderBy: { [q.sortBy ?? 'namaLengkap']: q.sortOrder },
      include: { cabang: { select: { id: true, nama: true } } },
    }),
    prisma.jemaat.count({ where }),
  ]);
  res.json({
    success: true,
    data,
    meta: { page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit) },
  });
});

jemaatRouter.get('/:id', async (req, res) => {
  const item = await prisma.jemaat.findUnique({
    where: { id: req.params.id },
    include: {
      cabang: true,
      jemaatRoles: {
        include: { role: true, subRole: true, subRoleStatus: true },
        orderBy: { tanggalMulai: 'desc' },
      },
      relasiAsal: { include: { jemaatTerkait: true, tipeRelasi: true } },
    },
  });
  if (!item) throw NotFound('Jemaat tidak ditemukan');
  res.json({ success: true, data: item });
});

jemaatRouter.post('/', async (req, res) => {
  const input = createJemaatSchema.parse(req.body);
  // Handle optional dates dengan benar
  const data = {
    ...input,
    email: input.email || null,
    tanggalLahir: input.tanggalLahir ? new Date(input.tanggalLahir) : undefined,
    tanggalBergabung: input.tanggalBergabung ? new Date(input.tanggalBergabung) : undefined,
  };
  const created = await prisma.jemaat.create({ data });
  res.status(201).json({ success: true, data: created });
});

jemaatRouter.patch('/:id', async (req, res) => {
  const input = updateJemaatSchema.parse(req.body);
  const data = {
    ...input,
    tanggalLahir: input.tanggalLahir ? new Date(input.tanggalLahir) : undefined,
    tanggalBergabung: input.tanggalBergabung ? new Date(input.tanggalBergabung) : undefined,
  };
  const updated = await prisma.jemaat.update({ where: { id: req.params.id }, data });
  res.json({ success: true, data: updated });
});

jemaatRouter.delete('/:id', async (req, res) => {
  await prisma.jemaat.delete({ where: { id: req.params.id } });
  res.status(204).end();
});
