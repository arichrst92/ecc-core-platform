import { Router } from 'express';
import { OPEN_GATE, privacyGate } from '../../lib/privacy.js';
import { isMobileClient } from '../../lib/client-kind.js';
import { prisma, type Prisma } from '@ecc/database';
import {
  createHomecellSchema,
  updateHomecellSchema,
  HOMECELL_KATEGORI_LABEL,
  homecellAttendanceTier,
  homecellUsiaLabel,
  addHomecellMemberSchema,
  updateHomecellMemberSchema,
  paginationQuerySchema,
} from '@ecc/shared-types';
import { BadRequest, NotFound } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { resolveMapsLocation } from '../../lib/geo.js';
import { assertPenggembalaanRole, PENGGEMBALAAN } from '../../lib/homecell-pic.js';
import { homecellBoardRouter } from './homecell-board.js';
import {
  getLastAttendanceMap,
  getLastMeetingMap,
  getMemberLastAttendanceMulti,
  lastMeetingOf,
  withLastAttendance,
} from '../../lib/homecell-last-attendance.js';
import { resolvePeriod, ymd } from '../../lib/last-attendance.js';
import { renderHomecellReportHtml, type HcReportRow } from '../../lib/homecell-report-html.js';
import { homecellScheduleRouter } from './homecell-schedule.js';

export const homecellRouter = Router();

// Sub-router: /:homecellId/schedule/* — jadwal pertemuan + QR attendance.
// Lihat docs/backend-request-homecell-schedule-attendance.md (2026-05-24).
homecellRouter.use('/:homecellId/schedule', homecellScheduleRouter);
// Pengumuman & voting homecell → homecell-board.ts
homecellRouter.use('/:homecellId', homecellBoardRouter);

// ===== Filter bersama (list + export) =====
// Query:
//   search, areaId, cabangId, sinodeId
//   status=aktif|nonaktif
//   periode=last_7d|this_week|last_week|last_30d|this_month|last_month|custom (+ from, to YYYY-MM-DD)
//   pertemuan=ada|tidak   → homecell yang ADA / TIDAK ADA pertemuan (jadwal
//                           dengan ≥1 kehadiran) dalam periode. Tanpa periode
//                           → "tidak" = belum pernah ada pertemuan sama sekali.
function homecellFilter(req: import('express').Request, search?: string) {
  const str = (k: string) => (typeof req.query[k] === 'string' ? (req.query[k] as string) : undefined);
  const areaId = str('areaId');
  const cabangId = str('cabangId');
  const sinodeId = str('sinodeId');
  const status = str('status');
  const pertemuan = str('pertemuan');
  const period = resolvePeriod(str('periode'), str('from'), str('to'));

  const where: Prisma.HomecellWhereInput = {};
  if (search) where.nama = { contains: search, mode: 'insensitive' };
  if (areaId) where.areaId = areaId;
  // area filter — gabungkan cabang & sinode kalau keduanya disebut.
  const areaFilter: Prisma.HomecellAreaWhereInput = {};
  if (cabangId) areaFilter.cabangId = cabangId;
  if (sinodeId) areaFilter.cabang = { sinodeId };
  if (Object.keys(areaFilter).length > 0) where.area = areaFilter;
  const homecellId = str('homecellId');
  if (homecellId) where.id = homecellId;
  const kategori = str('kategori');
  if (kategori === 'SINGLE' || kategori === 'COUPLE') where.kategori = kategori;
  if (kategori === 'UMUM') where.kategori = null;
  if (status === 'aktif') where.isActive = true;
  if (status === 'nonaktif') where.isActive = false;

  const heldSchedule: Prisma.HomecellScheduleWhereInput = {
    attendances: { some: {} },
    ...(period ? { tanggal: { gte: period.from, lte: period.to } } : {}),
  };
  if (pertemuan === 'ada') where.schedules = { some: heldSchedule };
  if (pertemuan === 'tidak') where.schedules = { none: heldSchedule };

  return { where, period, heldSchedule };
}

/** Jumlah pertemuan (jadwal dengan ≥1 hadir) per homecell dalam periode. */
async function periodMeetingCounts(ids: string[], heldSchedule: Prisma.HomecellScheduleWhereInput) {
  const m = new Map<string, number>();
  if (ids.length === 0) return m;
  const g = await prisma.homecellSchedule.groupBy({
    by: ['homecellId'],
    where: { ...heldSchedule, homecellId: { in: ids } },
    _count: { _all: true },
  });
  for (const x of g) m.set(x.homecellId, x._count._all);
  return m;
}

// ===== List =====
homecellRouter.get('/', async (req, res) => {
  const q = paginationQuerySchema.parse(req.query);
  const { where, period, heldSchedule } = homecellFilter(req, q.search);

  const [rows, total] = await Promise.all([
    prisma.homecell.findMany({
      where,
      skip: (q.page - 1) * q.limit,
      take: q.limit,
      orderBy: { [q.sortBy ?? 'nama']: q.sortOrder },
      include: {
        area: {
          select: {
            id: true,
            nama: true,
            cabang: { select: { id: true, nama: true } },
          },
        },
        picJemaat: { select: { id: true, namaLengkap: true, fotoUrl: true } },
        _count: {
          select: {
            members: { where: { isActive: true } },
            schedules: true,
          },
        },
        // Schedule attendance untuk hitung rata-rata % kehadiran.
        // Tiap schedule cuma return _count attendances — payload tetap kecil.
        schedules: {
          select: { _count: { select: { attendances: true } } },
        },
      },
    }),
    prisma.homecell.count({ where }),
  ]);

  const ids = rows.map((r) => r.id);
  const [lastMap, periodCounts] = await Promise.all([
    getLastMeetingMap(ids),
    period ? periodMeetingCounts(ids, heldSchedule) : Promise.resolve(null),
  ]);

  const data = rows.map((r) => {
    const memberCount = r._count.members;
    const scheduleCount = r._count.schedules;
    const totalAttendance = r.schedules.reduce(
      (sum, s) => sum + s._count.attendances,
      0,
    );
    // Avg % = total attendance / (member aktif × jumlah pertemuan) × 100.
    // Kalau belum ada member atau pertemuan → null (UI render '-' biar
    // tidak ambigu sama "0%").
    const avgAttendancePercent =
      memberCount > 0 && scheduleCount > 0
        ? Math.round((totalAttendance / (memberCount * scheduleCount)) * 100)
        : null;

    // Strip schedules array dari response — informasinya sudah ke-summarize
    // via counter di atas. Tetap return _count + flat counter buat backwards
    // compat dengan client lama yang baca memberCount langsung.
    const { schedules: _schedules, _count, ...rest } = r;
    return {
      ...rest,
      memberCount,
      scheduleCount,
      totalAttendance,
      avgAttendancePercent,
      ...lastMeetingOf(r.id, lastMap),
      periodMeetingCount: periodCounts ? (periodCounts.get(r.id) ?? 0) : null,
    };
  });

  res.json({
    success: true,
    data,
    meta: { page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit) },
  });
});

/** Data laporan homecell (dipakai Export PDF & halaman detail portal). */
async function buildHomecellReportRows(
  where: Prisma.HomecellWhereInput,
  period: { from: Date; to: Date } | null,
): Promise<HcReportRow[]> {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const upper = period && period.to < today ? period.to : today;
  const rows = await prisma.homecell.findMany({
    where,
    orderBy: [{ area: { cabang: { nama: 'asc' } } }, { area: { nama: 'asc' } }, { nama: 'asc' }],
    take: 1000,
    select: {
      id: true,
      nama: true,
      isActive: true,
      kategori: true,
      usiaMin: true,
      usiaMax: true,
      area: { select: { nama: true, cabang: { select: { nama: true } } } },
      picJemaat: { select: { namaLengkap: true } },
      // Pertemuan di periode (tanggal ≤ hari ini) untuk hitung kehadiran.
      schedules: {
        where: { tanggal: { lte: upper, ...(period ? { gte: period.from } : {}) } },
        select: { id: true, _count: { select: { attendances: true } } },
      },
      members: {
        where: { isActive: true },
        orderBy: { jemaat: { namaLengkap: 'asc' } },
        select: {
          tanggalBergabung: true,
          jemaat: { select: { id: true, namaLengkap: true, kode: true, noHp: true, tanggalLahir: true, jenisKelamin: true } },
        },
      },
    },
  });
  const ids = rows.map((r) => r.id);
  const scheduleHc = new Map<string, string>();
  for (const r of rows) for (const sc of r.schedules) scheduleHc.set(sc.id, r.id);
  const [lastMap, memberMap, hadirRows] = await Promise.all([
    getLastMeetingMap(ids),
    getMemberLastAttendanceMulti(ids),
    scheduleHc.size
      ? prisma.homecellAttendance.groupBy({
          by: ['scheduleId', 'jemaatId'],
          where: { scheduleId: { in: [...scheduleHc.keys()] } },
          _count: { _all: true },
        })
      : Promise.resolve([] as { scheduleId: string; jemaatId: string; _count: { _all: number } }[]),
  ]);
  // Kehadiran tiap anggota di periode: key homecellId:jemaatId → jumlah pertemuan dihadiri.
  const hadirMap = new Map<string, number>();
  for (const h of hadirRows) {
    const key = `${scheduleHc.get(h.scheduleId)}:${h.jemaatId}`;
    hadirMap.set(key, (hadirMap.get(key) ?? 0) + 1);
  }
  const ageOf = (lahir: Date | null) => {
    if (!lahir) return null;
    let u = now.getUTCFullYear() - lahir.getUTCFullYear();
    const mm = now.getUTCMonth() - lahir.getUTCMonth();
    if (mm < 0 || (mm === 0 && now.getUTCDate() < lahir.getUTCDate())) u--;
    return u >= 0 && u < 130 ? u : null;
  };

  return rows.map((h) => {
    const lm = lastMeetingOf(h.id, lastMap);
    const hadirTotal = h.schedules.reduce((x, sc) => x + sc._count.attendances, 0);
    const potensi = h.members.length * h.schedules.length;
    const ages = h.members.map((m) => ageOf(m.jemaat.tanggalLahir)).filter((x): x is number => x != null);
    return {
      id: h.id,
      nama: h.nama,
      isActive: h.isActive,
      area: h.area?.nama ?? '',
      cabang: h.area?.cabang?.nama ?? '',
      pic: h.picJemaat?.namaLengkap ?? null,
      kategori: h.kategori,
      usiaMin: h.usiaMin,
      usiaMax: h.usiaMax,
      meetingCount: h.schedules.length,
      attendanceTotal: hadirTotal,
      attendancePercent: potensi > 0 ? Math.min(100, Math.round((hadirTotal / potensi) * 100)) : null,
      avgAge: ages.length ? Math.round(ages.reduce((x, y) => x + y, 0) / ages.length) : null,
      lastMeetingAt: lm.lastMeetingAt,
      lastMeetingDaysAgo: lm.lastMeetingDaysAgo,
      members: h.members.map((m) => {
        const la = memberMap.get(`${h.id}:${m.jemaat.id}`);
        return {
          nama: m.jemaat.namaLengkap,
          kode: m.jemaat.kode,
          noHp: m.jemaat.noHp,
          usia: ageOf(m.jemaat.tanggalLahir),
          jenisKelamin: m.jemaat.jenisKelamin,
          bergabung: ymd(m.tanggalBergabung),
          hadir: hadirMap.get(`${h.id}:${m.jemaat.id}`) ?? 0,
          lastAt: la ? ymd(la.lastAttendedAt) : null,
          lastDaysAgo: la ? la.lastAttendedDaysAgo : null,
        };
      }),
    };
  });

}

// ===== Export laporan (PDF via print view) =====
// GET /admin/homecell/export?format=pdf&<filter sama dengan list>
// Per homecell: info + pertemuan terakhir, lalu daftar anggota aktif lengkap
// dengan kehadiran terakhir masing-masing.
const PERIOD_LABEL: Record<string, string> = {
  last_7d: '7 hari terakhir',
  this_week: 'Minggu ini',
  last_week: 'Minggu lalu',
  last_30d: '30 hari terakhir',
  this_month: 'Bulan ini',
  last_month: 'Bulan lalu',
  custom: 'Rentang tanggal',
};


const fmtTgl = (ymdStr: string | null) =>
  ymdStr
    ? new Date(`${ymdStr}T00:00:00Z`).toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      })
    : '—';


homecellRouter.get('/export', async (req, res) => {
  const format = (typeof req.query.format === 'string' ? req.query.format : 'pdf').toLowerCase();
  if (!['pdf', 'html', 'print'].includes(format)) throw BadRequest('Format tidak dikenali. Pakai format=pdf.');
  const search = typeof req.query.search === 'string' && req.query.search.trim() ? req.query.search.trim() : undefined;
  const { where, period } = homecellFilter(req, search);

  const reportRows = await buildHomecellReportRows(where, period);

  // Ringkasan filter untuk header laporan.
  const str = (k: string) => (typeof req.query[k] === 'string' ? (req.query[k] as string) : undefined);
  const [cabang, area] = await Promise.all([
    str('cabangId') ? prisma.cabangGereja.findUnique({ where: { id: str('cabangId')! }, select: { nama: true } }) : null,
    str('areaId') ? prisma.homecellArea.findUnique({ where: { id: str('areaId')! }, select: { nama: true } }) : null,
  ]);
  const kat = str('kategori');
  const filterParts = [
    area ? `Area: ${area.nama}` : null,
    kat === 'SINGLE' ? 'Kategori: Single' : kat === 'COUPLE' ? 'Kategori: Couple' : kat === 'UMUM' ? 'Kategori: Umum' : null,
    str('pertemuan') === 'ada' ? 'Ada pertemuan' : str('pertemuan') === 'tidak' ? 'Tidak ada pertemuan' : null,
    str('status') === 'aktif' ? 'Status: aktif' : str('status') === 'nonaktif' ? 'Status: nonaktif' : null,
    search ? `Cari: "${search}"` : null,
  ].filter((x): x is string => !!x);
  const periodLabel = period
    ? `${PERIOD_LABEL[str('periode') ?? ''] ?? 'Periode'} · ${fmtTgl(ymd(period.from))} – ${fmtTgl(ymd(period.to))}`
    : 'Semua waktu (sampai hari ini)';

  const uaStr = (req.get('user-agent') ?? '').toLowerCase();
  const html = renderHomecellReportHtml(reportRows, {
    isMobileUa: /mobi|android|iphone|ipad|ipod/.test(uaStr),
    title:
      str('homecellId') && reportRows[0]
        ? `Homecell — ${reportRows[0].nama}`
        : cabang
          ? `Homecell — ${cabang.nama}`
          : 'Homecell — Semua Cabang',
    filterParts,
    periodLabel,
  });
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

// ===== Statistik satu homecell (halaman detail portal; isi sama dengan PDF) =====
// GET /admin/homecell/:id/stats?periode=&from=&to=
homecellRouter.get('/:id/stats', async (req, res) => {
  const str = (k: string) => (typeof req.query[k] === 'string' && (req.query[k] as string).trim() ? (req.query[k] as string).trim() : undefined);
  const period = resolvePeriod(str('periode'), str('from'), str('to'));
  const rows = await buildHomecellReportRows({ id: req.params.id }, period);
  if (!rows[0]) throw NotFound('Homecell tidak ditemukan');
  res.json({
    success: true,
    data: { ...rows[0], period: period ? { from: ymd(period.from), to: ymd(period.to) } : null },
  });
});

// ===== Detail =====
homecellRouter.get('/:id', async (req, res) => {
  const item = await prisma.homecell.findUnique({
    where: { id: req.params.id },
    include: {
      area: {
        select: {
          id: true,
          nama: true,
          // pic Area juga di-include supaya mobile bisa check area-PIC authorization
          picJemaatId: true,
          cabang: { select: { id: true, nama: true, kode: true } },
        },
      },
      picJemaat: { select: { id: true, namaLengkap: true, fotoUrl: true, noHp: true } },
      members: {
        orderBy: [{ isActive: 'desc' }, { tanggalBergabung: 'desc' }],
        include: {
          jemaat: {
            // Field tambahan (kode, jenisKelamin) per request mobile M9.
            select: {
              id: true,
              namaLengkap: true,
              kode: true,
              fotoUrl: true,
              noHp: true,
              jenisKelamin: true,
              // Hanya dipakai untuk menghitung usia (tanggal lahir tidak dikirim).
              tanggalLahir: true,
            },
          },
        },
      },
      _count: { select: { schedules: true } },
      // Last schedule untuk display "Last meeting" di header detail page.
      // Pakai take:1 + orderBy desc.
      schedules: {
        orderBy: { tanggal: 'desc' },
        take: 1,
        select: {
          id: true,
          tanggal: true,
          lokasi: true,
          _count: { select: { attendances: true } },
        },
      },
    },
  });
  if (!item) throw NotFound('Homecell tidak ditemukan');

  // Flatten _count + lastSchedule untuk response yang clean.
  const { _count, schedules, members, ...rest } = item;
  // Kehadiran terakhir tiap anggota di homecell ini (+ berapa hari lalu).
  const lastMap = await getLastAttendanceMap(item.id);
  const lastSchedule = schedules[0]
    ? {
        id: schedules[0].id,
        tanggal: schedules[0].tanggal,
        lokasi: schedules[0].lokasi,
        attendanceCount: schedules[0]._count.attendances,
      }
    : null;

  // Privasi no HP (pengaturan masing-masing). PIC homecell / area selalu
  // lihat semua; admin portal (bukan app mobile) juga.
  const gate =
    req.user?.isFulltimer && !isMobileClient(req)
      ? OPEN_GATE
      : req.user?.jemaatId
        ? await privacyGate(req.user.jemaatId, [
            ...(rest.picJemaat ? [rest.picJemaat.id] : []),
            ...members.map((m) => m.jemaat.id),
          ])
        : null;
  const hp = <T extends { id: string; noHp: string | null }>(j: T): T => ({
    ...j,
    noHp: gate?.can(j.id, 'noHp') ? j.noHp : null,
  });
  // Usia anggota (tahun) untuk PIC — mengikuti privasi tanggal lahir; tanggal
  // lahirnya sendiri tidak dikirim.
  const now = new Date();
  const usiaOf = (id: string, lahir: Date | null): number | null => {
    if (!lahir || !gate?.can(id, 'tanggalLahir')) return null;
    let u = now.getUTCFullYear() - lahir.getUTCFullYear();
    const m = now.getUTCMonth() - lahir.getUTCMonth();
    if (m < 0 || (m === 0 && now.getUTCDate() < lahir.getUTCDate())) u--;
    return u >= 0 && u < 130 ? u : null;
  };
  res.json({
    success: true,
    data: {
      ...rest,
      picJemaat: rest.picJemaat ? hp(rest.picJemaat) : null,
      members: members.map((m) => {
        const { tanggalLahir, ...jemaat } = m.jemaat;
        return withLastAttendance(
          m.jemaatId,
          { ...m, jemaat: { ...hp(jemaat), usia: usiaOf(m.jemaat.id, tanggalLahir) } },
          lastMap,
        );
      }),
      scheduleCount: _count.schedules,
      lastSchedule,
    },
  });
});

/** Link/koordinat Google Maps → { mapsUrl, latitude, longitude }. Kosong = hapus. */
async function resolveLokasi(mapsUrl: string | null | undefined) {
  if (!mapsUrl) return { mapsUrl: null, latitude: null, longitude: null };
  const loc = await resolveMapsLocation(mapsUrl);
  if (!loc) {
    throw BadRequest(
      'Koordinat tidak ditemukan di link Google Maps. Tempel koordinat (mis. -6.2088, 106.8456) atau link "Bagikan" dari Google Maps.',
    );
  }
  return { mapsUrl, latitude: loc.lat, longitude: loc.lng };
}

// ===== Create =====
homecellRouter.post('/', async (req, res) => {
  const input = createHomecellSchema.parse(req.body);
  if (input.picJemaatId) {
    await assertPenggembalaanRole(input.picJemaatId, PENGGEMBALAAN.HOMECELL_LEADER);
  }
  const { mapsUrl, ...rest } = input;
  const created = await prisma.homecell.create({ data: { ...rest, ...(await resolveLokasi(mapsUrl)) } });
  audit(req, {
    action: 'CREATE',
    resource: 'homecell',
    resourceId: created.id,
    resourceLabel: created.nama,
    after: created,
  });
  res.status(201).json({ success: true, data: created });
});

// ===== Update =====
homecellRouter.patch('/:id', async (req, res) => {
  const input = updateHomecellSchema.parse(req.body);
  if (input.picJemaatId) {
    await assertPenggembalaanRole(input.picJemaatId, PENGGEMBALAAN.HOMECELL_LEADER);
  }
  const before = await prisma.homecell.findUnique({ where: { id: req.params.id } });
  if (!before) throw NotFound('Homecell tidak ditemukan');
  // PATCH parsial: cek rentang usia terhadap nilai yang sudah tersimpan juga.
  const nextMin = input.usiaMin === undefined ? before.usiaMin : input.usiaMin;
  const nextMax = input.usiaMax === undefined ? before.usiaMax : input.usiaMax;
  if (nextMin != null && nextMax != null && nextMin > nextMax) {
    throw BadRequest('Usia minimal tidak boleh lebih besar dari usia maksimal.');
  }
  const { mapsUrl, ...rest } = input;
  const updated = await prisma.homecell.update({
    where: { id: req.params.id },
    data: { ...rest, ...(mapsUrl === undefined ? {} : await resolveLokasi(mapsUrl)) },
  });
  audit(req, {
    action: 'UPDATE',
    resource: 'homecell',
    resourceId: updated.id,
    resourceLabel: updated.nama,
    before,
    after: updated,
  });
  res.json({ success: true, data: updated });
});

// ===== Delete =====
homecellRouter.delete('/:id', async (req, res) => {
  const before = await prisma.homecell.findUnique({ where: { id: req.params.id } });
  if (!before) throw NotFound('Homecell tidak ditemukan');
  await prisma.homecell.delete({ where: { id: req.params.id } }); // CASCADE members
  audit(req, {
    action: 'DELETE',
    resource: 'homecell',
    resourceId: before.id,
    resourceLabel: before.nama,
    before,
  });
  res.status(204).end();
});

// ============================================================
//  MEMBERS
// ============================================================

// Add member by jemaatId
homecellRouter.post('/:id/members', async (req, res) => {
  const homecellId = req.params.id;
  const input = addHomecellMemberSchema.parse(req.body);

  const homecell = await prisma.homecell.findUnique({ where: { id: homecellId } });
  if (!homecell) throw NotFound('Homecell tidak ditemukan');

  try {
    const created = await prisma.homecellMember.create({
      data: {
        homecellId,
        jemaatId: input.jemaatId,
        tanggalBergabung: input.tanggalBergabung ? new Date(input.tanggalBergabung) : undefined,
        catatan: input.catatan,
        isActive: true,
      },
      include: { jemaat: { select: { namaLengkap: true } } },
    });
    audit(req, {
      action: 'CREATE',
      resource: 'homecell_member',
      resourceId: created.id,
      resourceLabel: `${created.jemaat.namaLengkap} → ${homecell.nama}`,
      after: created,
    });
    res.status(201).json({ success: true, data: created });
  } catch (err: any) {
    if (err.code === 'P2002') {
      throw BadRequest('Jemaat sudah jadi member homecell ini');
    }
    throw err;
  }
});

// Add member by kode jemaat (scan QR di mobile PIC homecell)
homecellRouter.post('/:id/members/by-kode', async (req, res) => {
  const homecellId = req.params.id;
  const kode = typeof req.body?.kode === 'string' ? req.body.kode.toUpperCase().trim() : '';
  if (!kode) throw BadRequest('Field "kode" wajib');

  const homecell = await prisma.homecell.findUnique({ where: { id: homecellId } });
  if (!homecell) throw NotFound('Homecell tidak ditemukan');

  const jemaat = await prisma.jemaat.findUnique({
    where: { kode },
    select: { id: true, namaLengkap: true },
  });
  if (!jemaat) throw NotFound(`Kode jemaat "${kode}" tidak ditemukan`);

  try {
    const created = await prisma.homecellMember.create({
      data: {
        homecellId,
        jemaatId: jemaat.id,
        isActive: true,
      },
      include: { jemaat: { select: { namaLengkap: true, kode: true, fotoUrl: true } } },
    });
    audit(req, {
      action: 'CREATE',
      resource: 'homecell_member',
      resourceId: created.id,
      resourceLabel: `${created.jemaat.namaLengkap} → ${homecell.nama} (via QR)`,
      after: created,
      metadata: { kind: 'homecell-add-by-kode' },
    });
    res.status(201).json({ success: true, data: created });
  } catch (err: any) {
    if (err.code === 'P2002') {
      throw BadRequest('Jemaat sudah jadi member homecell ini');
    }
    throw err;
  }
});

// Update member (mark keluar / catatan)
homecellRouter.patch('/:id/members/:memberId', async (req, res) => {
  const input = updateHomecellMemberSchema.parse(req.body);
  const before = await prisma.homecellMember.findUnique({
    where: { id: req.params.memberId },
    include: { jemaat: { select: { namaLengkap: true } }, homecell: { select: { nama: true } } },
  });
  if (!before || before.homecellId !== req.params.id) throw NotFound('Member tidak ditemukan');

  const data: Prisma.HomecellMemberUpdateInput = {
    catatan: input.catatan,
    isActive: input.isActive,
    tanggalKeluar: input.tanggalKeluar ? new Date(input.tanggalKeluar) : undefined,
  };
  // Kalau di-mark non-aktif dan belum ada tanggalKeluar, set tanggal hari ini
  if (input.isActive === false && !before.tanggalKeluar && !input.tanggalKeluar) {
    data.tanggalKeluar = new Date();
  }
  // Kalau di-reactivate, clear tanggalKeluar
  if (input.isActive === true) {
    data.tanggalKeluar = null;
  }

  const updated = await prisma.homecellMember.update({
    where: { id: req.params.memberId },
    data,
  });
  audit(req, {
    action: 'UPDATE',
    resource: 'homecell_member',
    resourceId: updated.id,
    resourceLabel: `${before.jemaat.namaLengkap} @ ${before.homecell.nama}`,
    before,
    after: updated,
  });
  res.json({ success: true, data: updated });
});

// ============================================================
// Soft-remove member by jemaatId — mobile PIC homecell flow.
// ============================================================
// Berbeda dengan DELETE /:memberId di bawah (hard delete by member row ID,
// untuk admin portal). Endpoint ini:
//   - Lookup by jemaatId (yang mobile punya dari list members)
//   - SOFT delete (set isActive=false + tanggalKeluar=today)
//   - Idempotent: kalau sudah isActive=false, return existing dengan
//     meta.alreadyRemoved=true
//
// Authorization: PIC homecell-nya, atau PIC area parent-nya, atau admin
// (RBAC strict via menu access nanti). Saat ini permissive — semua user
// yang lewat /admin/* di-allow (sama dengan endpoint admin lain). Mobile
// authorization di-enforce via filter di list endpoint.
homecellRouter.delete('/:id/members/by-jemaat/:jemaatId', async (req, res) => {
  const before = await prisma.homecellMember.findFirst({
    where: { homecellId: req.params.id, jemaatId: req.params.jemaatId },
    include: { jemaat: { select: { namaLengkap: true } }, homecell: { select: { nama: true } } },
  });
  if (!before) throw NotFound('Member tidak ditemukan di homecell ini.');

  // Idempotent — sudah dikeluarkan, return existing.
  if (!before.isActive) {
    return res.json({
      success: true,
      data: before,
      meta: { alreadyRemoved: true },
    });
  }

  const updated = await prisma.homecellMember.update({
    where: { id: before.id },
    data: {
      isActive: false,
      tanggalKeluar: new Date(),
    },
  });
  audit(req, {
    action: 'UPDATE',
    resource: 'homecell_member',
    resourceId: updated.id,
    resourceLabel: `Remove ${before.jemaat.namaLengkap} from ${before.homecell.nama}`,
    before,
    after: updated,
    metadata: { kind: 'homecell-member-soft-remove' },
  });
  res.json({ success: true, data: updated });
});

// Remove member (hard delete)
homecellRouter.delete('/:id/members/:memberId', async (req, res) => {
  const before = await prisma.homecellMember.findUnique({
    where: { id: req.params.memberId },
    include: { jemaat: { select: { namaLengkap: true } }, homecell: { select: { nama: true } } },
  });
  if (!before || before.homecellId !== req.params.id) throw NotFound('Member tidak ditemukan');
  await prisma.homecellMember.delete({ where: { id: req.params.memberId } });
  audit(req, {
    action: 'DELETE',
    resource: 'homecell_member',
    resourceId: before.id,
    resourceLabel: `${before.jemaat.namaLengkap} @ ${before.homecell.nama}`,
    before,
  });
  res.status(204).end();
});
