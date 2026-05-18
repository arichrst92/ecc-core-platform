import { Router } from 'express';
import { prisma } from '@ecc/database';
import {
  createIbadahSchema,
  updateIbadahSchema,
  createKategoriIbadahSchema,
  updateKategoriIbadahSchema,
  paginationQuerySchema,
} from '@ecc/shared-types';
import { NotFound, BadRequest } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { generateOccurrences } from '../../lib/ibadah-occurrences.js';

export const ibadahRouter = Router();

// ===== Kategori Ibadah =====
ibadahRouter.get('/kategori', async (req, res) => {
  const q = paginationQuerySchema.parse(req.query);
  const where = q.search
    ? { nama: { contains: q.search, mode: 'insensitive' as const } }
    : {};
  const [data, total] = await Promise.all([
    prisma.kategoriIbadah.findMany({
      where,
      skip: (q.page - 1) * q.limit,
      take: q.limit,
      orderBy: { [q.sortBy ?? 'nama']: q.sortOrder },
    }),
    prisma.kategoriIbadah.count({ where }),
  ]);
  res.json({
    success: true,
    data,
    meta: { page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit) },
  });
});

ibadahRouter.post('/kategori', async (req, res) => {
  const input = createKategoriIbadahSchema.parse(req.body);
  const created = await prisma.kategoriIbadah.create({ data: input });
  audit(req, { action: 'CREATE', resource: 'kategori_ibadah', resourceId: created.id, resourceLabel: created.nama, after: created });
  res.status(201).json({ success: true, data: created });
});

ibadahRouter.patch('/kategori/:id', async (req, res) => {
  const input = updateKategoriIbadahSchema.parse(req.body);
  const before = await prisma.kategoriIbadah.findUnique({ where: { id: req.params.id } });
  if (!before) throw NotFound('Kategori tidak ditemukan');
  const updated = await prisma.kategoriIbadah.update({ where: { id: req.params.id }, data: input });
  audit(req, { action: 'UPDATE', resource: 'kategori_ibadah', resourceId: updated.id, resourceLabel: updated.nama, before, after: updated });
  res.json({ success: true, data: updated });
});

ibadahRouter.delete('/kategori/:id', async (req, res) => {
  const before = await prisma.kategoriIbadah.findUnique({ where: { id: req.params.id } });
  if (!before) throw NotFound('Kategori tidak ditemukan');
  await prisma.kategoriIbadah.delete({ where: { id: req.params.id } });
  audit(req, { action: 'DELETE', resource: 'kategori_ibadah', resourceId: before.id, resourceLabel: before.nama, before });
  res.status(204).end();
});

// ===== Calendar — occurrences di rentang tanggal =====
ibadahRouter.get('/calendar', async (req, res) => {
  const fromStr = typeof req.query.from === 'string' ? req.query.from : undefined;
  const toStr = typeof req.query.to === 'string' ? req.query.to : undefined;
  if (!fromStr || !toStr) throw BadRequest('Query `from` dan `to` (YYYY-MM-DD) wajib');
  const from = new Date(fromStr);
  const to = new Date(toStr);
  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    throw BadRequest('Format tanggal harus YYYY-MM-DD');
  }
  // Limit range max 366 hari supaya tidak overload
  const DAY = 1000 * 60 * 60 * 24;
  if ((to.getTime() - from.getTime()) / DAY > 366) {
    throw BadRequest('Rentang max 366 hari');
  }
  // End-of-day untuk `to` supaya inclusive
  to.setHours(23, 59, 59, 999);

  const cabangId = typeof req.query.cabangId === 'string' ? req.query.cabangId : undefined;
  const kategoriIbadahId = typeof req.query.kategoriIbadahId === 'string' ? req.query.kategoriIbadahId : undefined;

  const where: any = { isActive: true };
  if (cabangId) where.cabangId = cabangId;
  if (kategoriIbadahId) where.kategoriIbadahId = kategoriIbadahId;

  const ibadahs = await prisma.ibadah.findMany({
    where,
    include: {
      cabang: { select: { id: true, nama: true } },
      kategoriIbadah: { select: { id: true, nama: true } },
    },
  });

  // Generate occurrences per ibadah, flatten ke array tanggal+ibadah
  const events: {
    ibadahId: string;
    tanggal: string; // ISO YYYY-MM-DD
    nama: string;
    jamMulai: string;
    jamSelesai: string;
    cabang: { id: string; nama: string };
    kategoriIbadah: { id: string; nama: string };
    tipeJadwal: string;
    lokasi: string | null;
    isOnline: boolean;
  }[] = [];

  for (const i of ibadahs) {
    const dates = generateOccurrences(
      { tipeJadwal: i.tipeJadwal, tanggalMulai: i.tanggalMulai, hari: i.hari },
      from,
      to,
    );
    for (const d of dates) {
      events.push({
        ibadahId: i.id,
        tanggal: d.toISOString().slice(0, 10),
        nama: i.nama,
        jamMulai: i.jamMulai,
        jamSelesai: i.jamSelesai,
        cabang: i.cabang!,
        kategoriIbadah: i.kategoriIbadah!,
        tipeJadwal: i.tipeJadwal,
        lokasi: i.lokasi,
        isOnline: i.isOnline,
      });
    }
  }

  // Sort by tanggal + jam
  events.sort((a, b) => {
    if (a.tanggal !== b.tanggal) return a.tanggal.localeCompare(b.tanggal);
    return a.jamMulai.localeCompare(b.jamMulai);
  });

  res.json({ success: true, data: events, meta: { from: fromStr, to: toStr, count: events.length } });
});

// ===== Ibadah =====
ibadahRouter.get('/', async (req, res) => {
  const q = paginationQuerySchema.parse(req.query);
  const where = q.search
    ? { nama: { contains: q.search, mode: 'insensitive' as const } }
    : {};
  const [rows, total] = await Promise.all([
    prisma.ibadah.findMany({
      where,
      skip: (q.page - 1) * q.limit,
      take: q.limit,
      orderBy: [{ kategoriIbadah: { nama: 'asc' } }, { [q.sortBy ?? 'nama']: q.sortOrder }],
      include: {
        cabang: { select: { id: true, nama: true } },
        kategoriIbadah: { select: { id: true, nama: true } },
        // Nested count untuk hitung total petugas: sum dari semua ibadahPelayanan link
        ibadahPelayanan: { select: { _count: { select: { petugas: true } } } },
      },
    }),
    prisma.ibadah.count({ where }),
  ]);
  // Flatten: petugasCount = sum petugas dari semua linked pelayanan
  const data = rows.map((i) => {
    const { ibadahPelayanan, ...rest } = i;
    const petugasCount = ibadahPelayanan.reduce((sum, ip) => sum + ip._count.petugas, 0);
    const pelayananCount = ibadahPelayanan.length;
    return { ...rest, petugasCount, pelayananCount };
  });
  res.json({
    success: true,
    data,
    meta: { page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit) },
  });
});

ibadahRouter.get('/:id', async (req, res) => {
  const item = await prisma.ibadah.findUnique({
    where: { id: req.params.id },
    include: { cabang: true, kategoriIbadah: true },
  });
  if (!item) throw NotFound('Ibadah tidak ditemukan');
  res.json({ success: true, data: item });
});

ibadahRouter.post('/', async (req, res) => {
  const input = createIbadahSchema.parse(req.body);
  const data = { ...input, tanggalMulai: new Date(input.tanggalMulai) };
  const created = await prisma.ibadah.create({ data });
  audit(req, { action: 'CREATE', resource: 'ibadah', resourceId: created.id, resourceLabel: created.nama, after: created });
  res.status(201).json({ success: true, data: created });
});

ibadahRouter.patch('/:id', async (req, res) => {
  const input = updateIbadahSchema.parse(req.body);
  const data = {
    ...input,
    tanggalMulai: input.tanggalMulai ? new Date(input.tanggalMulai) : undefined,
  };
  const before = await prisma.ibadah.findUnique({ where: { id: req.params.id } });
  if (!before) throw NotFound('Ibadah tidak ditemukan');
  const updated = await prisma.ibadah.update({ where: { id: req.params.id }, data });
  audit(req, { action: 'UPDATE', resource: 'ibadah', resourceId: updated.id, resourceLabel: updated.nama, before, after: updated });
  res.json({ success: true, data: updated });
});

ibadahRouter.delete('/:id', async (req, res) => {
  const before = await prisma.ibadah.findUnique({ where: { id: req.params.id } });
  if (!before) throw NotFound('Ibadah tidak ditemukan');
  await prisma.ibadah.delete({ where: { id: req.params.id } });
  audit(req, { action: 'DELETE', resource: 'ibadah', resourceId: before.id, resourceLabel: before.nama, before });
  res.status(204).end();
});
