import { Router } from 'express';
import { prisma } from '@ecc/database';
import {
  createCabangSchema,
  updateCabangSchema,
  createCabangRekeningSchema,
  updateCabangRekeningSchema,
  paginationQuerySchema,
} from '@ecc/shared-types';
import { NotFound, BadRequest } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { saveCabangRekeningQris, deleteCabangRekeningQris } from '../../lib/storage.js';
import { flexImageUpload } from '../../lib/image-upload.js';

export const cabangRouter = Router();

cabangRouter.get('/', async (req, res) => {
  const q = paginationQuerySchema.parse(req.query);
  const sinodeId = typeof req.query.sinodeId === 'string' ? req.query.sinodeId : undefined;
  const where: any = {};
  if (q.search) where.nama = { contains: q.search, mode: 'insensitive' };
  if (sinodeId) where.sinodeId = sinodeId;

  const [rows, total] = await Promise.all([
    prisma.cabangGereja.findMany({
      where,
      skip: (q.page - 1) * q.limit,
      take: q.limit,
      orderBy: { [q.sortBy ?? 'nama']: q.sortOrder },
      include: {
        sinode: { select: { id: true, nama: true, kode: true } },
        _count: { select: { jemaat: true, ibadah: true, homecellAreas: true } },
      },
    }),
    prisma.cabangGereja.count({ where }),
  ]);

  // Aggregate homecellCount per cabang via grouped homecell query.
  // homecell tidak punya cabangId langsung — harus join via area.cabangId.
  const cabangIds = rows.map((c) => c.id);
  const homecellRows = cabangIds.length
    ? await prisma.homecell.findMany({
        where: { area: { cabangId: { in: cabangIds } } },
        select: { area: { select: { cabangId: true } } },
      })
    : [];
  const homecellCountByCabang = new Map<string, number>();
  for (const h of homecellRows) {
    const cid = h.area.cabangId;
    homecellCountByCabang.set(cid, (homecellCountByCabang.get(cid) ?? 0) + 1);
  }

  // Flatten _count → jemaatCount / ibadahCount / homecellAreaCount / homecellCount
  const data = rows.map((c) => {
    const { _count, ...rest } = c;
    return {
      ...rest,
      jemaatCount: _count.jemaat,
      ibadahCount: _count.ibadah,
      homecellAreaCount: _count.homecellAreas,
      homecellCount: homecellCountByCabang.get(c.id) ?? 0,
    };
  });
  res.json({
    success: true,
    data,
    meta: { page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit) },
  });
});

// ============================================================
//  Cabang locations — untuk plot di Globe (dashboard).
// ============================================================
// Hanya return cabang yang punya koordinat. Tidak perlu pagination — total
// cabang per sinode realistis di bawah 1000.
//
// CATATAN ORDER: harus di-declare SEBELUM `/:id` route, kalau tidak Express
// akan match `/locations` sebagai `:id='locations'` → return NotFound.
cabangRouter.get('/locations', async (_req, res) => {
  const data = await prisma.cabangGereja.findMany({
    where: {
      isActive: true,
      latitude: { not: null },
      longitude: { not: null },
    },
    select: {
      id: true,
      nama: true,
      kode: true,
      latitude: true,
      longitude: true,
      kontak: true,
      sinode: { select: { id: true, nama: true } },
      _count: { select: { jemaat: { where: { isActive: true } } } },
    },
    orderBy: { nama: 'asc' },
  });
  res.json({
    success: true,
    data: data.map((c) => ({
      id: c.id,
      nama: c.nama,
      kode: c.kode,
      latitude: c.latitude!,
      longitude: c.longitude!,
      kontak: c.kontak,
      sinode: c.sinode,
      jemaatCount: c._count.jemaat,
    })),
  });
});

cabangRouter.get('/:id', async (req, res) => {
  const item = await prisma.cabangGereja.findUnique({
    where: { id: req.params.id },
    include: { sinode: true, _count: { select: { jemaat: true, ibadah: true } } },
  });
  if (!item) throw NotFound('Cabang tidak ditemukan');
  res.json({ success: true, data: item });
});

cabangRouter.post('/', async (req, res) => {
  const input = createCabangSchema.parse(req.body);
  const created = await prisma.cabangGereja.create({ data: input });
  audit(req, { action: 'CREATE', resource: 'cabang_gereja', resourceId: created.id, resourceLabel: created.nama, after: created });
  res.status(201).json({ success: true, data: created });
});

cabangRouter.patch('/:id', async (req, res) => {
  const input = updateCabangSchema.parse(req.body);
  const before = await prisma.cabangGereja.findUnique({ where: { id: req.params.id } });
  if (!before) throw NotFound('Cabang tidak ditemukan');
  const updated = await prisma.cabangGereja.update({ where: { id: req.params.id }, data: input });
  audit(req, { action: 'UPDATE', resource: 'cabang_gereja', resourceId: updated.id, resourceLabel: updated.nama, before, after: updated });
  res.json({ success: true, data: updated });
});

cabangRouter.delete('/:id', async (req, res) => {
  const before = await prisma.cabangGereja.findUnique({ where: { id: req.params.id } });
  if (!before) throw NotFound('Cabang tidak ditemukan');
  await prisma.cabangGereja.delete({ where: { id: req.params.id } });
  audit(req, { action: 'DELETE', resource: 'cabang_gereja', resourceId: before.id, resourceLabel: before.nama, before });
  res.status(204).end();
});

// ============================================================
//  STATS — Statistik kehadiran cabang (ibadah, event, homecell)
// ============================================================
// Query: GET /admin/cabang/:id/stats?from=YYYY-MM-DD&to=YYYY-MM-DD
//
// Default periode: 30 hari terakhir (kalau from/to tidak dikirim).
// Return:
//   - meta: cabang info + range
//   - kpi: total counts (jemaat aktif, ibadah aktif, event di periode,
//          homecell aktif, total kehadiran ibadah+event)
//   - topIbadah[]: { ibadahNama, kehadiran }  (top 10)
//   - topEvent[]: { eventJudul, kehadiran, kapasitas?, butuhKehadiran }
//   - timeSeries[]: { tanggal (ISO YYYY-MM-DD), ibadahCheckin, eventCheckin }
//   - homecells[]: { nama, area, memberAktif, memberBaru (di periode) }
//   - reservasiStatusBreakdown: { JOIN, RESERVE, CANCEL } untuk periode
// ============================================================

function parseDate(s: string | undefined, fallback: Date): Date {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return fallback;
  const d = new Date(s);
  if (isNaN(d.getTime())) return fallback;
  return d;
}

cabangRouter.get('/:id/stats', async (req, res) => {
  const cabang = await prisma.cabangGereja.findUnique({
    where: { id: req.params.id },
    include: { sinode: { select: { id: true, nama: true, kode: true } } },
  });
  if (!cabang) throw NotFound('Cabang tidak ditemukan');

  // Resolve periode (default 30 hari terakhir)
  const now = new Date();
  now.setHours(23, 59, 59, 999);
  const defaultFrom = new Date(now);
  defaultFrom.setDate(defaultFrom.getDate() - 29);
  defaultFrom.setHours(0, 0, 0, 0);

  const from = parseDate(req.query.from as string | undefined, defaultFrom);
  from.setHours(0, 0, 0, 0);
  const to = parseDate(req.query.to as string | undefined, now);
  to.setHours(23, 59, 59, 999);

  if (to.getTime() < from.getTime()) {
    throw BadRequest('Tanggal `to` harus setelah `from`');
  }
  const DAY = 1000 * 60 * 60 * 24;
  if ((to.getTime() - from.getTime()) / DAY > 366) {
    throw BadRequest('Rentang maksimal 366 hari');
  }

  // ============== KPI counts ==============
  const [
    jemaatAktifCount,
    ibadahAktifCount,
    homecellAktifCount,
    homecellAreaCount,
    eventDiPeriodeCount,
  ] = await Promise.all([
    prisma.jemaat.count({ where: { cabangId: cabang.id, isActive: true } }),
    prisma.ibadah.count({ where: { cabangId: cabang.id, isActive: true } }),
    prisma.homecell.count({
      where: { area: { cabangId: cabang.id }, isActive: true },
    }),
    prisma.homecellArea.count({ where: { cabangId: cabang.id, isActive: true } }),
    prisma.event.count({
      where: {
        OR: [
          { cabangId: cabang.id },
          { cabangId: null, sinodeId: cabang.sinodeId },
          { cabangId: null, sinodeId: null },
        ],
        tanggalMulai: { gte: from, lte: to },
      },
    }),
  ]);

  // ============== Total kehadiran (KPI total) ==============
  const totalIbadahCheckin = await prisma.reservasi.count({
    where: {
      ibadah: { cabangId: cabang.id },
      status: 'JOIN',
      tanggalIbadah: { gte: from, lte: to },
    },
  });
  const totalEventCheckin = await prisma.eventParticipation.count({
    where: {
      jemaat: { cabangId: cabang.id },
      status: 'HADIR',
      event: { tanggalMulai: { gte: from, lte: to } },
    },
  });

  // ============== Top Ibadah ==============
  const topIbadahGroup = await prisma.reservasi.groupBy({
    by: ['ibadahId'],
    where: {
      ibadah: { cabangId: cabang.id },
      status: 'JOIN',
      tanggalIbadah: { gte: from, lte: to },
    },
    _count: { _all: true },
    orderBy: { _count: { ibadahId: 'desc' } },
    take: 10,
  });
  const ibadahIds = topIbadahGroup.map((g) => g.ibadahId);
  const ibadahNames = ibadahIds.length
    ? await prisma.ibadah.findMany({
        where: { id: { in: ibadahIds } },
        select: { id: true, nama: true, kategoriIbadah: { select: { nama: true } } },
      })
    : [];
  const ibadahNameMap = new Map(ibadahNames.map((i) => [i.id, i]));
  const topIbadah = topIbadahGroup.map((g) => {
    const meta = ibadahNameMap.get(g.ibadahId);
    return {
      ibadahId: g.ibadahId,
      ibadahNama: meta?.nama ?? '(unknown)',
      kategori: meta?.kategoriIbadah?.nama ?? null,
      kehadiran: g._count._all,
    };
  });

  // ============== Top Event ==============
  // Untuk event di periode, count partisipasi HADIR per event (jemaat dari cabang ini)
  const eventsDiPeriode = await prisma.event.findMany({
    where: {
      OR: [
        { cabangId: cabang.id },
        { cabangId: null, sinodeId: cabang.sinodeId },
        { cabangId: null, sinodeId: null },
      ],
      tanggalMulai: { gte: from, lte: to },
    },
    select: {
      id: true,
      judul: true,
      tanggalMulai: true,
      tanggalSelesai: true,
      butuhKehadiran: true,
      quotaPeserta: true,
    },
    orderBy: { tanggalMulai: 'desc' },
  });
  const eventIds = eventsDiPeriode.map((e) => e.id);
  const eventPartisipasi = eventIds.length
    ? await prisma.eventParticipation.groupBy({
        by: ['eventId', 'status'],
        where: {
          eventId: { in: eventIds },
          jemaat: { cabangId: cabang.id },
        },
        _count: { _all: true },
      })
    : [];
  const topEvent = eventsDiPeriode
    .map((e) => {
      const rows = eventPartisipasi.filter((p) => p.eventId === e.id);
      const hadir = rows.filter((r) => r.status === 'HADIR').reduce((a, b) => a + b._count._all, 0);
      const bayar = rows.filter((r) => r.status === 'BAYAR').reduce((a, b) => a + b._count._all, 0);
      const daftar = rows.filter((r) => r.status === 'DAFTAR').reduce((a, b) => a + b._count._all, 0);
      const total = rows.reduce((a, b) => a + b._count._all, 0);
      return {
        eventId: e.id,
        judul: e.judul,
        tanggalMulai: e.tanggalMulai,
        tanggalSelesai: e.tanggalSelesai,
        butuhKehadiran: e.butuhKehadiran,
        kapasitas: e.quotaPeserta,
        hadir,
        bayar,
        daftar,
        totalPartisipasi: total,
      };
    })
    .sort((a, b) => b.totalPartisipasi - a.totalPartisipasi)
    .slice(0, 10);

  // ============== Time series — kehadiran per tanggal ==============
  // Aggregate per hari. Pakai SQL groupBy supaya cepat.
  const ibadahByDay = await prisma.reservasi.groupBy({
    by: ['tanggalIbadah'],
    where: {
      ibadah: { cabangId: cabang.id },
      status: 'JOIN',
      tanggalIbadah: { gte: from, lte: to },
    },
    _count: { _all: true },
    orderBy: { tanggalIbadah: 'asc' },
  });
  // Untuk event, group by event.tanggalMulai
  const eventCheckinByDay = await prisma.eventParticipation.findMany({
    where: {
      eventId: { in: eventIds },
      jemaat: { cabangId: cabang.id },
      status: 'HADIR',
    },
    select: { event: { select: { tanggalMulai: true } } },
  });
  const eventByDayMap = new Map<string, number>();
  for (const r of eventCheckinByDay) {
    const iso = r.event.tanggalMulai.toISOString().slice(0, 10);
    eventByDayMap.set(iso, (eventByDayMap.get(iso) ?? 0) + 1);
  }
  // Bangun list semua tanggal dalam range untuk x-axis chart yang continuous.
  const timeSeries: { tanggal: string; ibadahCheckin: number; eventCheckin: number }[] = [];
  for (let d = new Date(from); d.getTime() <= to.getTime(); d.setDate(d.getDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    const ibadahForDay = ibadahByDay.find(
      (g) => g.tanggalIbadah.toISOString().slice(0, 10) === iso,
    );
    timeSeries.push({
      tanggal: iso,
      ibadahCheckin: ibadahForDay?._count._all ?? 0,
      eventCheckin: eventByDayMap.get(iso) ?? 0,
    });
  }

  // ============== Homecell breakdown ==============
  const homecells = await prisma.homecell.findMany({
    where: { area: { cabangId: cabang.id } },
    include: {
      area: { select: { id: true, nama: true } },
      _count: { select: { members: { where: { isActive: true } } } },
      members: {
        where: {
          tanggalBergabung: { gte: from, lte: to },
        },
        select: { id: true },
      },
    },
    orderBy: { nama: 'asc' },
  });
  const homecellSummary = homecells.map((h) => ({
    id: h.id,
    nama: h.nama,
    area: h.area.nama,
    memberAktif: h._count.members,
    memberBaru: h.members.length,
    isActive: h.isActive,
  }));

  // ============== Reservasi status breakdown ==============
  const reservasiStatusBreakdown = await prisma.reservasi.groupBy({
    by: ['status'],
    where: {
      ibadah: { cabangId: cabang.id },
      tanggalIbadah: { gte: from, lte: to },
    },
    _count: { _all: true },
  });
  const statusMap = { JOIN: 0, RESERVE: 0, CANCEL: 0 } as Record<string, number>;
  for (const r of reservasiStatusBreakdown) {
    statusMap[r.status] = r._count._all;
  }

  res.json({
    success: true,
    data: {
      cabang: {
        id: cabang.id,
        nama: cabang.nama,
        kode: cabang.kode,
        alamat: cabang.alamat,
        kontak: cabang.kontak,
        sinode: cabang.sinode,
      },
      periode: {
        from: from.toISOString().slice(0, 10),
        to: to.toISOString().slice(0, 10),
        days: Math.floor((to.getTime() - from.getTime()) / DAY) + 1,
      },
      kpi: {
        jemaatAktif: jemaatAktifCount,
        ibadahAktif: ibadahAktifCount,
        homecellAktif: homecellAktifCount,
        homecellArea: homecellAreaCount,
        eventDiPeriode: eventDiPeriodeCount,
        totalIbadahCheckin,
        totalEventCheckin,
      },
      topIbadah,
      topEvent,
      timeSeries,
      homecells: homecellSummary,
      reservasiStatusBreakdown: statusMap,
    },
  });
});

// ============================================================
//  REKENING — multi rekening bank per cabang (dgn purpose + QRIS)
// ============================================================
// Endpoint:
//   GET    /admin/cabang/:id/rekening              # list (semua)
//   POST   /admin/cabang/:id/rekening              # tambah rekening
//   PATCH  /admin/cabang/:id/rekening/:rekeningId  # update field
//   DELETE /admin/cabang/:id/rekening/:rekeningId  # hapus
//   POST   /admin/cabang/:id/rekening/:rekeningId/qris   # multipart 'foto'
//   DELETE /admin/cabang/:id/rekening/:rekeningId/qris
// ============================================================

cabangRouter.get('/:id/rekening', async (req, res) => {
  const cabang = await prisma.cabangGereja.findUnique({ where: { id: req.params.id } });
  if (!cabang) throw NotFound('Cabang tidak ditemukan');
  const data = await prisma.cabangRekening.findMany({
    where: { cabangId: cabang.id },
    orderBy: [{ isActive: 'desc' }, { purpose: 'asc' }],
  });
  res.json({ success: true, data });
});

cabangRouter.post('/:id/rekening', async (req, res) => {
  const cabang = await prisma.cabangGereja.findUnique({ where: { id: req.params.id } });
  if (!cabang) throw NotFound('Cabang tidak ditemukan');
  const input = createCabangRekeningSchema.parse(req.body);
  const created = await prisma.cabangRekening.create({
    data: { ...input, cabangId: cabang.id },
  });
  audit(req, {
    action: 'CREATE',
    resource: 'cabang_rekening',
    resourceId: created.id,
    resourceLabel: `${cabang.nama} · ${created.purpose} · ${created.bankNama} ${created.bankNomor}`,
    after: created,
  });
  res.status(201).json({ success: true, data: created });
});

cabangRouter.patch('/:id/rekening/:rekeningId', async (req, res) => {
  const before = await prisma.cabangRekening.findUnique({
    where: { id: req.params.rekeningId },
    include: { cabang: { select: { nama: true } } },
  });
  if (!before || before.cabangId !== req.params.id) {
    throw NotFound('Rekening tidak ditemukan');
  }
  const input = updateCabangRekeningSchema.parse(req.body);
  const updated = await prisma.cabangRekening.update({
    where: { id: before.id },
    data: input,
  });
  audit(req, {
    action: 'UPDATE',
    resource: 'cabang_rekening',
    resourceId: updated.id,
    resourceLabel: `${before.cabang.nama} · ${updated.purpose}`,
    before,
    after: updated,
  });
  res.json({ success: true, data: updated });
});

cabangRouter.delete('/:id/rekening/:rekeningId', async (req, res) => {
  const before = await prisma.cabangRekening.findUnique({
    where: { id: req.params.rekeningId },
    include: { cabang: { select: { nama: true } } },
  });
  if (!before || before.cabangId !== req.params.id) {
    throw NotFound('Rekening tidak ditemukan');
  }
  await prisma.cabangRekening.delete({ where: { id: before.id } });
  await deleteCabangRekeningQris(before.id).catch(() => {});
  audit(req, {
    action: 'DELETE',
    resource: 'cabang_rekening',
    resourceId: before.id,
    resourceLabel: `${before.cabang.nama} · ${before.purpose}`,
    before,
  });
  res.status(204).end();
});

cabangRouter.post(
  '/:id/rekening/:rekeningId/qris',
  flexImageUpload(),
  async (req, res) => {
    if (!req.file) throw BadRequest('File foto wajib (field name: foto)');
    const rek = await prisma.cabangRekening.findUnique({
      where: { id: req.params.rekeningId },
    });
    if (!rek || rek.cabangId !== req.params.id) {
      throw NotFound('Rekening tidak ditemukan');
    }
    const qrisImageUrl = await saveCabangRekeningQris(rek.id, req.file.buffer);
    const updated = await prisma.cabangRekening.update({
      where: { id: rek.id },
      data: { qrisImageUrl },
      select: { id: true, qrisImageUrl: true },
    });
    audit(req, {
      action: 'UPLOAD_PHOTO',
      resource: 'cabang_rekening',
      resourceId: rek.id,
      resourceLabel: `QRIS ${rek.purpose}`,
      metadata: { kind: 'cabang-rekening-qris', size: req.file.size },
    });
    res.json({ success: true, data: updated });
  },
);

cabangRouter.delete('/:id/rekening/:rekeningId/qris', async (req, res) => {
  const rek = await prisma.cabangRekening.findUnique({
    where: { id: req.params.rekeningId },
  });
  if (!rek || rek.cabangId !== req.params.id) {
    throw NotFound('Rekening tidak ditemukan');
  }
  await deleteCabangRekeningQris(rek.id);
  await prisma.cabangRekening.update({
    where: { id: rek.id },
    data: { qrisImageUrl: null },
  });
  res.status(204).end();
});
