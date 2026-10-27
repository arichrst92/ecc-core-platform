import { Router } from 'express';
import { OPEN_GATE, privacyGate } from '../../lib/privacy.js';
import { isMobileClient } from '../../lib/client-kind.js';
import { prisma, type Prisma } from '@ecc/database';
import {
  createHomecellAreaSchema,
  updateHomecellAreaSchema,
  paginationQuerySchema,
} from '@ecc/shared-types';
import { BadRequest, NotFound } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { assertPenggembalaanRole, PENGGEMBALAAN } from '../../lib/homecell-pic.js';
import { resolvePeriod, ymd } from '../../lib/last-attendance.js';
import { DEMO_AGE_GROUPS, computeAreaStats } from '../../lib/homecell-area-stats.js';
import { renderHomecellAreaReportHtml } from '../../lib/homecell-area-report-html.js';
import { fmtTgl } from '../../lib/print-report.js';

export const homecellAreaRouter = Router();

// ===== List =====
homecellAreaRouter.get('/', async (req, res) => {
  const q = paginationQuerySchema.parse(req.query);
  const cabangId = typeof req.query.cabangId === 'string' ? req.query.cabangId : undefined;
  const sinodeId = typeof req.query.sinodeId === 'string' ? req.query.sinodeId : undefined;

  const where: Prisma.HomecellAreaWhereInput = {};
  if (q.search) where.nama = { contains: q.search, mode: 'insensitive' };
  if (cabangId) where.cabangId = cabangId;
  if (sinodeId) where.cabang = { sinodeId };

  const [rows, total] = await Promise.all([
    prisma.homecellArea.findMany({
      where,
      skip: (q.page - 1) * q.limit,
      take: q.limit,
      orderBy: { [q.sortBy ?? 'nama']: q.sortOrder },
      include: {
        cabang: { select: { id: true, nama: true, kode: true } },
        picJemaat: { select: { id: true, namaLengkap: true, fotoUrl: true } },
        _count: { select: { homecells: true } },
      },
    }),
    prisma.homecellArea.count({ where }),
  ]);

  // Statistik per area (anggota, usia rata-rata, kehadiran) — periode opsional.
  const str = (k: string) => (typeof req.query[k] === 'string' ? (req.query[k] as string) : undefined);
  const period = resolvePeriod(str('periode'), str('from'), str('to'));
  const stats = await computeAreaStats(rows.map((r) => r.id), period);
  const data = rows.map((r) => {
    const s = stats.get(r.id);
    return {
      ...r,
      homecellCount: r._count.homecells,
      homecellAktif: s?.homecellCount ?? 0,
      memberCount: s?.memberCount ?? 0,
      avgAge: s?.avgAge ?? null,
      meetingCount: s?.meetingCount ?? 0,
      attendancePercent: s?.attendancePercent ?? null,
      homecellNoMeeting: s?.homecellNoMeeting ?? 0,
      demografi: s?.demografi ?? null,
      tamuVisits: s?.tamuVisits ?? 0,
      tamuUnique: s?.tamuUnique ?? 0,
    };
  });

  res.json({
    success: true,
    data,
    meta: { page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit) },
  });
});

// ===== Export laporan (PDF via print view) =====
// GET /admin/homecell-area/export?format=pdf&cabangId=&periode=&from=&to=&search=
const PERIOD_LABEL: Record<string, string> = {
  last_7d: '7 hari terakhir',
  this_week: 'Minggu ini',
  last_week: 'Minggu lalu',
  last_30d: '30 hari terakhir',
  this_month: 'Bulan ini',
  last_month: 'Bulan lalu',
  custom: 'Rentang tanggal',
};
homecellAreaRouter.get('/export', async (req, res) => {
  const format = (typeof req.query.format === 'string' ? req.query.format : 'pdf').toLowerCase();
  if (!['pdf', 'html', 'print'].includes(format)) throw BadRequest('Format tidak dikenali. Pakai format=pdf.');
  const str = (k: string) => (typeof req.query[k] === 'string' && (req.query[k] as string).trim() ? (req.query[k] as string).trim() : undefined);
  const cabangId = str('cabangId');
  const areaId = str('areaId');
  const search = str('search');
  const period = resolvePeriod(str('periode'), str('from'), str('to'));

  const where: Prisma.HomecellAreaWhereInput = areaId ? { id: areaId } : { isActive: true };
  if (cabangId) where.cabangId = cabangId;
  if (search) where.nama = { contains: search, mode: 'insensitive' };
  const areas = await prisma.homecellArea.findMany({
    where,
    orderBy: [{ cabang: { nama: 'asc' } }, { nama: 'asc' }],
    take: 300,
    select: {
      id: true,
      nama: true,
      deskripsi: true,
      cabang: { select: { nama: true } },
      picJemaat: { select: { namaLengkap: true } },
    },
  });
  const stats = await computeAreaStats(areas.map((a) => a.id), period);
  const cabang = cabangId ? await prisma.cabangGereja.findUnique({ where: { id: cabangId }, select: { nama: true } }) : null;

  const periodLabel = period
    ? `${PERIOD_LABEL[str('periode') ?? ''] ?? 'Periode'} · ${fmtTgl(ymd(period.from))} – ${fmtTgl(ymd(period.to))}`
    : 'Semua waktu (sampai hari ini)';
  const filterLabel =
    areaId && areas[0] ? `Homecell Area — ${areas[0].nama}` : cabang ? `Homecell Area — ${cabang.nama}` : 'Homecell Area — Semua Cabang';
  const ua = (req.get('user-agent') ?? '').toLowerCase();
  const html = renderHomecellAreaReportHtml(
    areas.map((a) => ({
      id: a.id,
      nama: a.nama,
      deskripsi: a.deskripsi,
      cabang: a.cabang.nama,
      pic: a.picJemaat?.namaLengkap ?? null,
      stat: stats.get(a.id)!,
    })),
    { isMobileUa: /mobi|android|iphone|ipad|ipod/.test(ua), filterLabel: search ? `${filterLabel} · "${search}"` : filterLabel, periodLabel },
  );
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

// ===== Statistik satu area (halaman detail portal, isi sama dengan PDF) =====
// GET /admin/homecell-area/:id/stats?periode=&from=&to=
homecellAreaRouter.get('/:id/stats', async (req, res) => {
  const area = await prisma.homecellArea.findUnique({
    where: { id: req.params.id },
    select: {
      id: true,
      nama: true,
      deskripsi: true,
      isActive: true,
      cabang: { select: { id: true, nama: true } },
      picJemaat: { select: { id: true, namaLengkap: true, noHp: true } },
    },
  });
  if (!area) throw NotFound('Homecell Area tidak ditemukan');
  const str = (k: string) => (typeof req.query[k] === 'string' && (req.query[k] as string).trim() ? (req.query[k] as string).trim() : undefined);
  const period = resolvePeriod(str('periode'), str('from'), str('to'));
  const stats = await computeAreaStats([area.id], period);
  res.json({
    success: true,
    data: {
      area,
      period: period ? { from: ymd(period.from), to: ymd(period.to) } : null,
      stat: stats.get(area.id),
      ageGroups: DEMO_AGE_GROUPS.map((g) => g.label),
    },
  });
});

// ============================================================
// List homecells per area — mobile PIC area flow.
// ============================================================
// Mobile PIC area buka detail area → tampil SEMUA homecell di area itu,
// termasuk yang user-nya bukan PIC homecell-nya. Endpoint detail area
// (GET /:id) sudah include `homecells[]` tapi response shape-nya lebih
// untuk admin (include sinodeId di cabang, dll). Endpoint ini khusus
// untuk list homecells per area dengan shape yang ringkas untuk mobile.
//
// Authorization: PIC area atau admin. Saat ini permissive — semua user
// yang punya akses /admin/* di-allow (RBAC strict via menu access nanti).
homecellAreaRouter.get('/:id/homecells', async (req, res) => {
  const area = await prisma.homecellArea.findUnique({
    where: { id: req.params.id },
    select: { id: true },
  });
  if (!area) throw NotFound('Homecell Area tidak ditemukan');

  const data = await prisma.homecell.findMany({
    where: { areaId: area.id, isActive: true },
    orderBy: { nama: 'asc' },
    include: {
      picJemaat: { select: { id: true, namaLengkap: true, fotoUrl: true, noHp: true } },
      _count: {
        select: {
          members: { where: { isActive: true } },
          schedules: true,
        },
      },
      // Untuk rata-rata % kehadiran (sama dengan kolom "Rata² Hadir" portal).
      schedules: { select: { _count: { select: { attendances: true } } } },
    },
  });

  // Privasi no HP PIC — hanya untuk app mobile; portal tidak berubah.
  const gate =
    !isMobileClient(req)
      ? OPEN_GATE
      : await privacyGate(req.user!.jemaatId, data.flatMap((hc) => (hc.picJemaat ? [hc.picJemaat.id] : [])));
  const result = data.map((hc) => ({
    id: hc.id,
    nama: hc.nama,
    alamat: hc.alamat,
    hari: hc.hari,
    jam: hc.jam,
    isActive: hc.isActive,
    picJemaat: hc.picJemaat
      ? { ...hc.picJemaat, noHp: gate.can(hc.picJemaat.id, 'noHp') ? hc.picJemaat.noHp : null }
      : null,
    memberCount: hc._count.members,
    scheduleCount: hc._count.schedules,
    kategori: hc.kategori,
    usiaMin: hc.usiaMin,
    usiaMax: hc.usiaMax,
    // Rata² hadir = total hadir / (anggota aktif × jumlah pertemuan); null bila belum ada data.
    avgAttendancePercent:
      hc._count.members > 0 && hc._count.schedules > 0
        ? Math.round(
            (hc.schedules.reduce((n, sc) => n + sc._count.attendances, 0) / (hc._count.members * hc._count.schedules)) * 100,
          )
        : null,
  }));

  res.json({ success: true, data: result });
});

// ===== Detail =====
homecellAreaRouter.get('/:id', async (req, res) => {
  const item = await prisma.homecellArea.findUnique({
    where: { id: req.params.id },
    include: {
      cabang: { select: { id: true, nama: true, kode: true, sinodeId: true } },
      picJemaat: { select: { id: true, namaLengkap: true, fotoUrl: true, noHp: true } },
      homecells: {
        orderBy: { nama: 'asc' },
        include: {
          picJemaat: { select: { id: true, namaLengkap: true } },
          _count: { select: { members: { where: { isActive: true } } } },
        },
      },
    },
  });
  if (!item) throw NotFound('Homecell Area tidak ditemukan');
  // Privasi no HP PIC area — hanya untuk app mobile; portal tidak berubah.
  if (item.picJemaat && isMobileClient(req)) {
    const gate = await privacyGate(req.user!.jemaatId, [item.picJemaat.id]);
    if (!gate.can(item.picJemaat.id, 'noHp')) item.picJemaat.noHp = null;
  }
  res.json({ success: true, data: item });
});

// ===== Create =====
homecellAreaRouter.post('/', async (req, res) => {
  const input = createHomecellAreaSchema.parse(req.body);
  // Validasi PIC: harus Zone Leader
  if (input.picJemaatId) {
    await assertPenggembalaanRole(input.picJemaatId, PENGGEMBALAAN.ZONE_LEADER);
  }
  const created = await prisma.homecellArea.create({ data: input });
  audit(req, {
    action: 'CREATE',
    resource: 'homecell_area',
    resourceId: created.id,
    resourceLabel: created.nama,
    after: created,
  });
  res.status(201).json({ success: true, data: created });
});

// ===== Update =====
homecellAreaRouter.patch('/:id', async (req, res) => {
  const input = updateHomecellAreaSchema.parse(req.body);
  if (input.picJemaatId) {
    await assertPenggembalaanRole(input.picJemaatId, PENGGEMBALAAN.ZONE_LEADER);
  }
  const before = await prisma.homecellArea.findUnique({ where: { id: req.params.id } });
  if (!before) throw NotFound('Homecell Area tidak ditemukan');
  const updated = await prisma.homecellArea.update({ where: { id: req.params.id }, data: input });
  audit(req, {
    action: 'UPDATE',
    resource: 'homecell_area',
    resourceId: updated.id,
    resourceLabel: updated.nama,
    before,
    after: updated,
  });
  res.json({ success: true, data: updated });
});

// ===== Delete =====
homecellAreaRouter.delete('/:id', async (req, res) => {
  const before = await prisma.homecellArea.findUnique({
    where: { id: req.params.id },
    include: { _count: { select: { homecells: true } } },
  });
  if (!before) throw NotFound('Homecell Area tidak ditemukan');
  if (before._count.homecells > 0) {
    throw BadRequest(`Area masih punya ${before._count.homecells} homecell — hapus dulu`);
  }
  await prisma.homecellArea.delete({ where: { id: req.params.id } });
  audit(req, {
    action: 'DELETE',
    resource: 'homecell_area',
    resourceId: before.id,
    resourceLabel: before.nama,
    before,
  });
  res.status(204).end();
});
