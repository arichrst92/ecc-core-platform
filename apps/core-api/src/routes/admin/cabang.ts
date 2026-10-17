import { Router, type Request } from 'express';
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
import { jemaatWhereForStage } from '../../lib/spiritual-journey.js';
import { esc, fmtTgl, sendCsv, sendPrintHtml, summaryCards } from '../../lib/print-report.js';

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
        _count: { select: { jemaat: { where: { isTamu: false } }, ibadah: true, homecellAreas: true } },
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
      _count: { select: { jemaat: { where: { isActive: true, isTamu: false } } } },
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

async function computeCabangStats(req: Request) {
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
    prisma.jemaat.count({ where: { cabangId: cabang.id, isActive: true, isTamu: false } }),
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
  // Include schedules di periode + attendances-nya untuk hitung total pertemuan
  // & rata-rata % kehadiran per homecell.
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
      schedules: {
        where: { tanggal: { gte: from, lte: to } },
        select: { _count: { select: { attendances: true } } },
      },
    },
    orderBy: { nama: 'asc' },
  });

  let totalHomecellPertemuan = 0;
  let totalHomecellKehadiran = 0;

  const homecellSummary = homecells.map((h) => {
    const memberAktif = h._count.members;
    const scheduleCount = h.schedules.length;
    const totalAttendance = h.schedules.reduce(
      (sum, s) => sum + s._count.attendances,
      0,
    );
    const avgAttendancePercent =
      memberAktif > 0 && scheduleCount > 0
        ? Math.round((totalAttendance / (memberAktif * scheduleCount)) * 100)
        : null;
    totalHomecellPertemuan += scheduleCount;
    totalHomecellKehadiran += totalAttendance;
    return {
      id: h.id,
      nama: h.nama,
      area: h.area.nama,
      memberAktif,
      memberBaru: h.members.length,
      scheduleCount,
      totalAttendance,
      avgAttendancePercent,
      isActive: h.isActive,
    };
  });

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

  const executive = await computeExecutive(cabang.id, from, to);

  return {
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
        totalHomecellPertemuan,
        totalHomecellKehadiran,
      },
      topIbadah,
      topEvent,
      timeSeries,
      homecells: homecellSummary,
      reservasiStatusBreakdown: statusMap,
      executive,
  };
}


// ============================================================
//  Ringkasan eksekutif cabang — snapshot (sekarang) + periode.
// ============================================================
const AGE_GROUPS = [
  { label: 'Anak (0–12)', min: 0, max: 12 },
  { label: 'Remaja (13–17)', min: 13, max: 17 },
  { label: 'Pemuda (18–35)', min: 18, max: 35 },
  { label: 'Dewasa (36–59)', min: 36, max: 59 },
  { label: 'Lansia (60+)', min: 60, max: 200 },
];

function ageOf(d: Date, today = new Date()): number {
  let a = today.getFullYear() - d.getFullYear();
  const m = today.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < d.getDate())) a -= 1;
  return a;
}

async function computeExecutive(cabangId: string, from: Date, to: Date) {
  const base = { cabangId, isActive: true, isTamu: false };
  const DAY = 86_400_000;
  const since30 = new Date(Date.now() - 30 * DAY);
  const steps = await prisma.spiritualJourneyStep.findMany({
    where: { isActive: true },
    orderBy: [{ urutan: 'asc' }, { createdAt: 'asc' }],
    select: { judul: true, roleId: true, subRoleId: true, subRoleStatusId: true },
  });

  const [
    aktif,
    tamuTotal,
    jemaatBaru,
    tamuBaru,
    pria,
    wanita,
    pelayanan,
    homecell,
    keduanya,
    pernahLogin,
    aktifApp30,
    lahir,
    stageCounts,
    hadirUnik,
    tamuHadirUnik,
    pertemuan,
    totalHadir,
  ] = await Promise.all([
    prisma.jemaat.count({ where: base }),
    prisma.jemaat.count({ where: { cabangId, isActive: true, isTamu: true } }),
    prisma.jemaat.count({ where: { ...base, createdAt: { gte: from, lte: to } } }),
    prisma.jemaat.count({ where: { cabangId, isTamu: true, createdAt: { gte: from, lte: to } } }),
    prisma.jemaat.count({ where: { ...base, jenisKelamin: 'L' } }),
    prisma.jemaat.count({ where: { ...base, jenisKelamin: 'P' } }),
    prisma.jemaat.count({ where: { ...base, jemaatPelayanan: { some: { isActive: true } } } }),
    prisma.jemaat.count({ where: { ...base, homecellMembership: { some: { isActive: true } } } }),
    prisma.jemaat.count({
      where: {
        ...base,
        jemaatPelayanan: { some: { isActive: true } },
        homecellMembership: { some: { isActive: true } },
      },
    }),
    prisma.jemaat.count({ where: { ...base, user: { lastLoginAt: { not: null } } } }),
    prisma.jemaat.count({ where: { ...base, user: { lastLoginAt: { gte: since30 } } } }),
    prisma.jemaat.findMany({ where: { ...base, tanggalLahir: { not: null } }, select: { tanggalLahir: true } }),
    Promise.all(
      steps.length
        ? Array.from({ length: steps.length + 1 }, (_x, stage) =>
            prisma.jemaat.count({ where: { ...base, ...jemaatWhereForStage(steps, stage) } }),
          )
        : [],
    ),
    prisma.reservasi.groupBy({
      by: ['jemaatId'],
      where: { ibadah: { cabangId }, status: 'JOIN', tanggalIbadah: { gte: from, lte: to }, jemaat: { isTamu: false } },
    }),
    prisma.reservasi.groupBy({
      by: ['jemaatId'],
      where: {
        ibadah: { cabangId },
        status: 'JOIN',
        tanggalIbadah: { gte: from, lte: to },
        OR: [{ jemaat: { isTamu: true } }, { guestSource: { not: null } }],
      },
    }),
    prisma.reservasi.groupBy({
      by: ['ibadahId', 'tanggalIbadah'],
      where: { ibadah: { cabangId }, status: 'JOIN', tanggalIbadah: { gte: from, lte: to } },
    }),
    prisma.reservasi.count({
      where: { ibadah: { cabangId }, status: 'JOIN', tanggalIbadah: { gte: from, lte: to } },
    }),
  ]);

  const today = new Date();
  const ageGroups = AGE_GROUPS.map((g) => ({ label: g.label, count: 0 }));
  for (const r of lahir) {
    const a = ageOf(r.tanggalLahir!, today);
    const idx = AGE_GROUPS.findIndex((g) => a >= g.min && a <= g.max);
    if (idx >= 0) ageGroups[idx]!.count++;
  }
  const pct = (n: number) => (aktif ? Math.round((n * 1000) / aktif) / 10 : 0);
  const terhubung = pelayanan + homecell - keduanya;

  return {
    jemaat: {
      aktif,
      tamu: tamuTotal,
      baru: jemaatBaru,
      tamuBaru,
      pria,
      wanita,
      tanpaGender: aktif - pria - wanita,
      tanpaTanggalLahir: aktif - lahir.length,
    },
    ageGroups,
    journey: {
      total: steps.length,
      stages: stageCounts.map((count, stage) => ({
        stage,
        label: stage === 0 ? 'Belum mulai' : `Tahap ${stage} · ${steps[stage - 1]!.judul}`,
        count,
        pct: pct(count),
      })),
    },
    keterlibatan: {
      pelayanan,
      pelayananPct: pct(pelayanan),
      homecell,
      homecellPct: pct(homecell),
      keduanya,
      keduanyaPct: pct(keduanya),
      belumTerhubung: aktif - terhubung,
      belumTerhubungPct: pct(aktif - terhubung),
    },
    app: { pernahLogin, pernahLoginPct: pct(pernahLogin), aktif30Hari: aktifApp30, aktif30HariPct: pct(aktifApp30) },
    ibadah: {
      jemaatHadirUnik: hadirUnik.length,
      jemaatHadirPct: pct(hadirUnik.length),
      tamuHadirUnik: tamuHadirUnik.length,
      pertemuan: pertemuan.length,
      rataRataPerPertemuan: pertemuan.length ? Math.round((totalHadir / pertemuan.length) * 10) / 10 : 0,
    },
  };
}

cabangRouter.get('/:id/stats', async (req, res) => {
  res.json({ success: true, data: await computeCabangStats(req) });
});

/**
 * GET /admin/cabang/:id/stats/export?format=pdf|csv&from&to
 * Laporan cabang untuk rapat eksekutif (PDF print view / Excel CSV).
 */
cabangRouter.get('/:id/stats/export', async (req, res) => {
  const d = await computeCabangStats(req);
  const x = d.executive;
  const format = String(req.query.format ?? 'pdf').toLowerCase();
  const period = { from: d.periode.from, to: d.periode.to, label: `${d.periode.days} hari` };
  const n = (v: number) => v.toLocaleString('id-ID');
  const fname = `laporan-cabang-${d.cabang.kode}-${d.periode.from}_${d.periode.to}`;

  if (format === 'csv' || format === 'excel') {
    const lines: unknown[][] = [
      ['LAPORAN CABANG', `${d.cabang.nama} (${d.cabang.kode})`],
      ['Periode', `${d.periode.from} s.d. ${d.periode.to}`],
      [],
      ['RINGKASAN', 'Nilai', 'Catatan'],
      ['Jemaat aktif', x.jemaat.aktif, ''],
      ['Jemaat baru (periode)', x.jemaat.baru, 'terdaftar di periode'],
      ['Tamu (data tamu)', x.jemaat.tamu, ''],
      ['Tamu baru (periode)', x.jemaat.tamuBaru, ''],
      ['Jemaat hadir ibadah (unik)', x.ibadah.jemaatHadirUnik, `${x.ibadah.jemaatHadirPct}% dari jemaat aktif`],
      ['Tamu hadir ibadah (unik)', x.ibadah.tamuHadirUnik, ''],
      ['Total kehadiran ibadah', d.kpi.totalIbadahCheckin, `${x.ibadah.pertemuan} pertemuan, rata-rata ${x.ibadah.rataRataPerPertemuan}`],
      ['Kehadiran event', d.kpi.totalEventCheckin, `${d.kpi.eventDiPeriode} event`],
      ['Kehadiran homecell', d.kpi.totalHomecellKehadiran, `${d.kpi.totalHomecellPertemuan} pertemuan`],
      ['Ibadah aktif', d.kpi.ibadahAktif, ''],
      ['Homecell aktif', d.kpi.homecellAktif, `${d.kpi.homecellArea} area`],
      ['Pengguna app (pernah login)', x.app.pernahLogin, `${x.app.pernahLoginPct}%`],
      ['Aktif di app 30 hari terakhir', x.app.aktif30Hari, `${x.app.aktif30HariPct}%`],
      [],
      ['KETERLIBATAN', 'Jemaat', '% jemaat aktif'],
      ['Terlibat pelayanan', x.keterlibatan.pelayanan, x.keterlibatan.pelayananPct],
      ['Terlibat homecell', x.keterlibatan.homecell, x.keterlibatan.homecellPct],
      ['Pelayanan & homecell', x.keterlibatan.keduanya, x.keterlibatan.keduanyaPct],
      ['Belum terhubung', x.keterlibatan.belumTerhubung, x.keterlibatan.belumTerhubungPct],
      [],
      ['SPIRITUAL JOURNEY (tahap saat ini)', 'Jemaat', '% jemaat aktif'],
      ...x.journey.stages.map((st) => [st.label, st.count, st.pct]),
      [],
      ['DEMOGRAFI', 'Jemaat'],
      ['Laki-laki', x.jemaat.pria],
      ['Perempuan', x.jemaat.wanita],
      ['Jenis kelamin belum diisi', x.jemaat.tanpaGender],
      ...x.ageGroups.map((g) => [g.label, g.count]),
      ['Tanggal lahir belum diisi', x.jemaat.tanpaTanggalLahir],
      [],
      ['IBADAH TERPOPULER', 'Kategori', 'Kehadiran'],
      ...d.topIbadah.map((i) => [i.ibadahNama, i.kategori ?? '', i.kehadiran]),
      [],
      ['EVENT', 'Tanggal', 'Daftar', 'Bayar', 'Hadir', 'Total'],
      ...d.topEvent.map((e) => [e.judul, new Date(e.tanggalMulai).toISOString().slice(0, 10), e.daftar, e.bayar, e.hadir, e.totalPartisipasi]),
      [],
      ['HOMECELL', 'Area', 'Anggota', 'Anggota baru', 'Pertemuan', 'Kehadiran', 'Rata-rata hadir (%)'],
      ...d.homecells.map((h) => [h.nama, h.area, h.memberAktif, h.memberBaru, h.scheduleCount, h.totalAttendance, h.avgAttendancePercent ?? '']),
    ];
    return sendCsv(res, `${fname}.csv`, lines);
  }

  const bar = (p: number, color: string) =>
    `<div style="height:8px;background:#f1f5f9;border-radius:4px;overflow:hidden;width:160px"><div style="height:100%;width:${Math.min(100, p)}%;background:${color}"></div></div>`;
  const pctRow = (label: string, count: number, p: number, color: string) =>
    `<tr><td>${esc(label)}</td><td class="r b">${n(count)}</td><td class="r">${p}%</td><td>${bar(p, color)}</td></tr>`;
  const body = `
<p class="meta">${esc(d.cabang.nama)} (${esc(d.cabang.kode)}) · Sinode ${esc(d.cabang.sinode.nama)}${d.cabang.alamat ? ` · ${esc(d.cabang.alamat)}` : ''}</p>
${summaryCards([
  ['Jemaat aktif', n(x.jemaat.aktif)],
  ['Jemaat baru (periode)', n(x.jemaat.baru)],
  ['Hadir ibadah (unik)', `${n(x.ibadah.jemaatHadirUnik)} · ${x.ibadah.jemaatHadirPct}%`],
  ['Tamu hadir (unik)', n(x.ibadah.tamuHadirUnik)],
  ['Terlibat pelayanan', `${x.keterlibatan.pelayananPct}%`],
  ['Terlibat homecell', `${x.keterlibatan.homecellPct}%`],
])}
${summaryCards([
  ['Kehadiran ibadah', n(d.kpi.totalIbadahCheckin)],
  ['Rata-rata / pertemuan', n(x.ibadah.rataRataPerPertemuan)],
  ['Kehadiran event', n(d.kpi.totalEventCheckin)],
  ['Kehadiran homecell', n(d.kpi.totalHomecellKehadiran)],
  ['Homecell aktif', `${n(d.kpi.homecellAktif)} di ${n(d.kpi.homecellArea)} area`],
  ['Aktif di app (30 hr)', `${x.app.aktif30HariPct}%`],
])}
<div style="display:flex;gap:16px">
  <div style="flex:1">
    <h2>Spiritual Journey — tahap saat ini</h2>
    ${
      x.journey.total
        ? `<table><thead><tr><th>Tahap</th><th class="r">Jemaat</th><th class="r">%</th><th></th></tr></thead><tbody>
      ${x.journey.stages.map((st) => pctRow(st.label, st.count, st.pct, '#10b981')).join('')}</tbody></table>`
        : '<p class="muted">Belum ada tahap Spiritual Journey.</p>'
    }
  </div>
  <div style="flex:1">
    <h2>Keterlibatan jemaat aktif</h2>
    <table><thead><tr><th></th><th class="r">Jemaat</th><th class="r">%</th><th></th></tr></thead><tbody>
      ${pctRow('Terlibat pelayanan', x.keterlibatan.pelayanan, x.keterlibatan.pelayananPct, '#ec4899')}
      ${pctRow('Terlibat homecell', x.keterlibatan.homecell, x.keterlibatan.homecellPct, '#8b5cf6')}
      ${pctRow('Pelayanan & homecell', x.keterlibatan.keduanya, x.keterlibatan.keduanyaPct, '#f97316')}
      ${pctRow('Belum terhubung', x.keterlibatan.belumTerhubung, x.keterlibatan.belumTerhubungPct, '#94a3b8')}
    </tbody></table>
    <h2>Demografi</h2>
    <table><tbody>
      <tr><td>Laki-laki / Perempuan</td><td class="r b">${n(x.jemaat.pria)} / ${n(x.jemaat.wanita)}</td><td class="muted">${x.jemaat.tanpaGender ? `${n(x.jemaat.tanpaGender)} belum diisi` : ''}</td></tr>
      ${x.ageGroups.map((g) => `<tr><td>${esc(g.label)}</td><td class="r b">${n(g.count)}</td><td></td></tr>`).join('')}
      ${x.jemaat.tanpaTanggalLahir ? `<tr><td class="muted">Tanggal lahir belum diisi</td><td class="r">${n(x.jemaat.tanpaTanggalLahir)}</td><td></td></tr>` : ''}
    </tbody></table>
  </div>
</div>
<h2>Ibadah terpopuler</h2>
${
  d.topIbadah.length
    ? `<table><thead><tr><th>Ibadah</th><th>Kategori</th><th class="r">Kehadiran</th></tr></thead><tbody>
  ${d.topIbadah.map((i) => `<tr><td>${esc(i.ibadahNama)}</td><td>${esc(i.kategori ?? '')}</td><td class="r b">${n(i.kehadiran)}</td></tr>`).join('')}</tbody></table>`
    : '<p class="muted">Belum ada kehadiran ibadah.</p>'
}
<h2>Event di periode</h2>
${
  d.topEvent.length
    ? `<table><thead><tr><th>Event</th><th>Tanggal</th><th class="r">Daftar</th><th class="r">Bayar</th><th class="r">Hadir</th><th class="r">Total</th></tr></thead><tbody>
  ${d.topEvent
    .map(
      (e) =>
        `<tr><td>${esc(e.judul)}</td><td>${fmtTgl(new Date(e.tanggalMulai).toISOString().slice(0, 10))}</td><td class="r">${e.daftar}</td><td class="r">${e.bayar}</td><td class="r b">${e.hadir}</td><td class="r">${e.totalPartisipasi}</td></tr>`,
    )
    .join('')}</tbody></table>`
    : '<p class="muted">Tidak ada event di periode ini.</p>'
}
<h2>Homecell</h2>
${
  d.homecells.length
    ? `<table><thead><tr><th>Homecell</th><th>Area</th><th class="r">Anggota</th><th class="r">Baru</th><th class="r">Pertemuan</th><th class="r">Hadir</th><th class="r">Rata² hadir</th></tr></thead><tbody>
  ${d.homecells
    .map(
      (h) =>
        `<tr${h.isActive ? '' : ' class="muted"'}><td>${esc(h.nama)}</td><td>${esc(h.area)}</td><td class="r">${h.memberAktif}</td><td class="r">${h.memberBaru || ''}</td><td class="r">${h.scheduleCount}</td><td class="r">${h.totalAttendance}</td><td class="r b">${h.avgAttendancePercent == null ? '—' : `${h.avgAttendancePercent}%`}</td></tr>`,
    )
    .join('')}</tbody></table>`
    : '<p class="muted">Belum ada homecell.</p>'
}`;
  sendPrintHtml(req, res, `Laporan Cabang ${d.cabang.nama}`, period, [], body, 'Persentase dihitung dari jumlah jemaat aktif (anggota) cabang saat ini.');
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
