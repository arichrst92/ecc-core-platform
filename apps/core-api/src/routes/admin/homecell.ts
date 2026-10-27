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

function esc(s: unknown): string {
  if (s === null || s === undefined) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const fmtTgl = (ymdStr: string | null) =>
  ymdStr
    ? new Date(`${ymdStr}T00:00:00Z`).toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      })
    : '—';

function relHari(days: number | null): string {
  if (days == null) return '<span class="muted">belum pernah</span>';
  const cls = days <= 7 ? 'ok' : days <= 30 ? 'warn' : 'bad';
  const txt = days === 0 ? 'hari ini' : days === 1 ? 'kemarin' : `${days} hari lalu`;
  return `<span class="${cls}">${txt}</span>`;
}

homecellRouter.get('/export', async (req, res) => {
  const format = (typeof req.query.format === 'string' ? req.query.format : 'pdf').toLowerCase();
  if (!['pdf', 'html', 'print'].includes(format)) throw BadRequest('Format tidak dikenali. Pakai format=pdf.');
  const search = typeof req.query.search === 'string' && req.query.search.trim() ? req.query.search.trim() : undefined;
  const { where, period, heldSchedule } = homecellFilter(req, search);

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
      picJemaat: { select: { namaLengkap: true, noHp: true } },
      schedules: { select: { _count: { select: { attendances: true } } } },
      members: {
        where: { isActive: true },
        orderBy: { jemaat: { namaLengkap: 'asc' } },
        select: {
          tanggalBergabung: true,
          jemaat: { select: { id: true, namaLengkap: true, kode: true, noHp: true } },
        },
      },
    },
  });
  const ids = rows.map((r) => r.id);
  const [lastMap, memberMap, periodCounts] = await Promise.all([
    getLastMeetingMap(ids),
    getMemberLastAttendanceMulti(ids),
    period ? periodMeetingCounts(ids, heldSchedule) : Promise.resolve(null),
  ]);

  // Ringkasan filter untuk header laporan.
  const str = (k: string) => (typeof req.query[k] === 'string' ? (req.query[k] as string) : undefined);
  const [cabang, area] = await Promise.all([
    str('cabangId') ? prisma.cabangGereja.findUnique({ where: { id: str('cabangId')! }, select: { nama: true } }) : null,
    str('areaId') ? prisma.homecellArea.findUnique({ where: { id: str('areaId')! }, select: { nama: true } }) : null,
  ]);
  const filterParts = [
    cabang ? `Cabang: ${cabang.nama}` : null,
    area ? `Area: ${area.nama}` : null,
    period
      ? `Periode: ${PERIOD_LABEL[str('periode') ?? ''] ?? ''} (${fmtTgl(ymd(period.from))} – ${fmtTgl(ymd(period.to))})`
      : null,
    str('pertemuan') === 'ada' ? 'Ada pertemuan' : str('pertemuan') === 'tidak' ? 'Tidak ada pertemuan' : null,
    str('status') === 'aktif' ? 'Status: aktif' : str('status') === 'nonaktif' ? 'Status: nonaktif' : null,
    search ? `Cari: "${search}"` : null,
  ].filter(Boolean);

  const totalMembers = rows.reduce((n, r) => n + r.members.length, 0);
  const timestamp = new Date().toISOString().slice(0, 10);
  const uaStr = (req.get('user-agent') ?? '').toLowerCase();
  const isMobileUa = /mobi|android|iphone|ipad|ipod/.test(uaStr);
  const ideaLogo = `${(process.env.PORTAL_URL ?? 'https://portal.eccchurch.global').replace(/\/$/, '')}/logo-idea.webp`;

  const sections = rows
    .map((h) => {
      const lm = lastMeetingOf(h.id, lastMap);
      // Rata-rata kehadiran (sama dengan kolom "Rata² Hadir" di portal).
      const totalHadir = h.schedules.reduce((n, s) => n + s._count.attendances, 0);
      const pct = h.members.length > 0 && h.schedules.length > 0
        ? Math.round((totalHadir / (h.members.length * h.schedules.length)) * 100)
        : null;
      const segmen = [h.kategori ? HOMECELL_KATEGORI_LABEL[h.kategori] : null, homecellUsiaLabel(h.usiaMin, h.usiaMax)]
        .filter(Boolean)
        .join(' · ');
      const memberRows = h.members
        .map((m, i) => {
          const la = memberMap.get(`${h.id}:${m.jemaat.id}`);
          return `<tr>
  <td class="num">${i + 1}</td>
  <td>${esc(m.jemaat.namaLengkap)}</td>
  <td>${esc(m.jemaat.kode ?? '')}</td>
  <td>${esc(m.jemaat.noHp ?? '')}</td>
  <td>${fmtTgl(ymd(m.tanggalBergabung))}</td>
  <td>${la ? fmtTgl(ymd(la.lastAttendedAt)) : '—'}</td>
  <td>${relHari(la ? la.lastAttendedDaysAgo : null)}</td>
</tr>`;
        })
        .join('');
      return `<section class="hc">
  <div class="hc-head">
    <div>
      <h2>${esc(h.nama)}${h.isActive ? '' : ' <span class="tag">nonaktif</span>'}</h2>
      <div class="sub">${esc(h.area?.nama ?? '')} · ${esc(h.area?.cabang?.nama ?? '')} · PIC: ${esc(h.picJemaat?.namaLengkap ?? '—')}${segmen ? ` · ${esc(segmen)}` : ''}</div>
    </div>
    <div class="last">
      <div>Rata² hadir: ${pct == null ? '<span class="muted">—</span>' : `<span class="tier tier-${homecellAttendanceTier(pct)}">${pct}%</span>`}</div>
      <div>Terakhir homecell: <strong>${fmtTgl(lm.lastMeetingAt)}</strong></div>
      <div>${relHari(lm.lastMeetingDaysAgo)}</div>
      ${periodCounts ? `<div class="muted">${periodCounts.get(h.id) ?? 0} pertemuan dalam periode</div>` : ''}
    </div>
  </div>
  ${
    h.members.length === 0
      ? '<p class="muted">Belum ada anggota aktif.</p>'
      : `<table>
  <thead><tr><th class="num">#</th><th>Nama</th><th>Kode</th><th>No HP</th><th>Bergabung</th><th>Terakhir hadir</th><th></th></tr></thead>
  <tbody>${memberRows}</tbody>
</table>`
  }
</section>`;
    })
    .join('');

  const html = `<!doctype html>
<html lang="id"><head><meta charset="utf-8">
<title>Laporan Homecell — ${timestamp}</title>
<style>
  @page { size: A4 portrait; margin: 12mm; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 10px; color: #0f172a; margin: 0; }
  h1 { font-size: 16px; margin: 0 0 4px; }
  h2 { font-size: 12.5px; margin: 0; }
  .meta { font-size: 11px; color: #64748b; margin-bottom: 4px; }
  .filters { font-size: 10.5px; color: #9a3412; background: #fff7ed; border: 1px solid #fed7aa; border-radius: 6px; padding: 4px 8px; margin: 6px 0 12px; }
  .hc { border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 10px; margin-bottom: 10px; page-break-inside: avoid; }
  .hc-head { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 6px; }
  .sub { color: #64748b; font-size: 10px; margin-top: 2px; }
  .last { text-align: right; font-size: 10px; white-space: nowrap; }
  .tag { font-size: 9px; background: #e2e8f0; color: #475569; border-radius: 4px; padding: 1px 4px; font-weight: 500; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #e2e8f0; padding: 3px 5px; text-align: left; vertical-align: top; }
  thead { background: #f8fafc; font-weight: 600; }
  td.num, th.num { width: 18px; text-align: right; color: #94a3b8; }
  .ok { color: #15803d; font-weight: 600; }
  .warn { color: #b45309; font-weight: 600; }
  .bad { color: #dc2626; font-weight: 600; }
  .muted { color: #94a3b8; }
  .tier { display: inline-block; padding: 0 6px; border-radius: 8px; font-weight: 700; }
  .tier-merah { background: #fee2e2; color: #b91c1c; }
  .tier-oranye { background: #ffedd5; color: #c2410c; }
  .tier-kuning { background: #fef9c3; color: #a16207; }
  .tier-hijau { background: #dcfce7; color: #15803d; }
  .footer-row { display: flex; align-items: center; justify-content: space-between; margin-top: 14px; padding-top: 8px; border-top: 1px solid #e2e8f0; font-size: 9.5px; color: #94a3b8; }
  .powered { display: flex; align-items: center; gap: 6px; color: #64748b; }
  @media print {
    .noprint, .noprint * { display: none !important; visibility: hidden !important; height: 0 !important; padding: 0 !important; margin: 0 !important; border: 0 !important; }
  }
  .noprint { padding: 10px; background: #fff7ed; border-bottom: 1px solid #fed7aa; }
  .noprint button { padding: 6px 12px; background: #ea580c; color: white; border: none; border-radius: 4px; font-size: 13px; cursor: pointer; }
</style>
</head><body>
${
  isMobileUa
    ? ''
    : `<div class="noprint">
  <strong>Print Preview — Laporan Homecell</strong>
  &nbsp;·&nbsp; Tekan <kbd>Ctrl/Cmd + P</kbd> untuk simpan sebagai PDF.
  <button onclick="doPrint()">Print / Save as PDF</button>
</div>`
}
<script>
  function doPrint() {
    document.querySelectorAll('.noprint').forEach(el => el.remove());
    setTimeout(() => window.print(), 50);
  }
  window.addEventListener('beforeprint', () => {
    document.querySelectorAll('.noprint').forEach(el => el.style.display = 'none');
  });
  ${isMobileUa ? 'setTimeout(() => window.print(), 600);' : ''}
</script>
<div style="padding: 10mm;">
<h1>Laporan Homecell ECC</h1>
<div class="meta">${rows.length} homecell · ${totalMembers} anggota aktif · Export ${timestamp}</div>
${filterParts.length ? `<div class="filters">${filterParts.map(esc).join(' · ')}</div>` : ''}
${sections || '<p class="muted">Tidak ada homecell yang sesuai filter.</p>'}
<div class="footer-row">
  <div>© ${new Date().getFullYear()} Elshaddai Creative Community · Terakhir hadir: hijau ≤7 hari, kuning ≤30 hari, merah &gt;30 hari · Rata² hadir: <span class="tier tier-merah">0–25%</span> <span class="tier tier-oranye">26–50%</span> <span class="tier tier-kuning">51–75%</span> <span class="tier tier-hijau">76–100%</span></div>
  <div class="powered">
    <span>Powered by</span>
    <img src="${ideaLogo}" alt="IDEA" onerror="this.style.display='none'" style="height:20px;width:auto;"/>
  </div>
</div>
</div>
</body></html>`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
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
