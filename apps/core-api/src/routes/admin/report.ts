/**
 * Laporan kehadiran — /admin/report
 *
 *   GET /ibadah          → ringkasan, tren mingguan, per pertemuan, daftar tamu
 *   GET /ibadah/export   → format=pdf (print view, "Powered by IDEA") | csv
 *   GET /event           → ringkasan, per event, daftar tamu
 *   GET /event/export    → format=pdf | csv
 *
 * Filter: cabangId, ibadahId / eventId, periode (last_7d … custom + from/to).
 * Akses: fulltimer, atau menu "laporan-ibadah" / "laporan-event" (baca).
 */
import { Router, type Request, type Response } from 'express';
import { prisma, type Prisma } from '@ecc/database';
import { BadRequest, Forbidden, Unauthorized } from '../../lib/errors.js';
import { resolveJemaatAccess } from '../../lib/menu-access.js';
import { generateOccurrences } from '../../lib/ibadah-occurrences.js';
import { resolvePeriod, todayWib, ymd } from '../../lib/last-attendance.js';
import {
  CHECKIN_METHODS,
  METHOD_LABEL,
  buildEventReport,
  buildIbadahReport,
  type MethodCount,
} from '../../lib/attendance-report.js';

export const reportRouter = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PERIOD_LABEL: Record<string, string> = {
  last_7d: '7 hari terakhir',
  this_week: 'Minggu ini',
  last_week: 'Minggu lalu',
  last_30d: '30 hari terakhir',
  this_month: 'Bulan ini',
  last_month: 'Bulan lalu',
  custom: 'Rentang tanggal',
};

async function assertAccess(req: Request, menuKey: string) {
  if (!req.user) throw Unauthorized();
  if (req.user.isFulltimer) return;
  const access = await resolveJemaatAccess(req.user.jemaatId);
  if (!access.menuAccess[menuKey]?.canRead) throw Forbidden('Anda tidak punya akses ke laporan ini.');
}

function q(req: Request, k: string) {
  const v = req.query[k];
  return typeof v === 'string' && v ? v : undefined;
}

/** Periode laporan (default 30 hari terakhir). Maks 366 hari. */
function reportPeriod(req: Request) {
  const preset = q(req, 'periode') ?? 'last_30d';
  const p = resolvePeriod(preset, q(req, 'from'), q(req, 'to'));
  if (!p) throw BadRequest('Periode tidak valid.');
  if ((p.to.getTime() - p.from.getTime()) / 86_400_000 > 366) throw BadRequest('Rentang maksimal 366 hari.');
  return { ...p, preset };
}

async function namesOf(ids: string[]) {
  if (!ids.length) return new Map<string, string>();
  const rows = await prisma.jemaat.findMany({ where: { id: { in: ids } }, select: { id: true, namaLengkap: true } });
  return new Map(rows.map((r) => [r.id, r.namaLengkap]));
}

// ============================================================
// IBADAH
// ============================================================

async function ibadahReportData(req: Request) {
  const period = reportPeriod(req);
  const cabangId = q(req, 'cabangId');
  const ibadahId = q(req, 'ibadahId');
  const where: Prisma.IbadahWhereInput = {};
  if (cabangId && UUID_RE.test(cabangId)) where.cabangId = cabangId;
  if (ibadahId && UUID_RE.test(ibadahId)) where.id = ibadahId;

  const ibadahs = await prisma.ibadah.findMany({
    where,
    select: {
      id: true,
      nama: true,
      jamMulai: true,
      tipeJadwal: true,
      tanggalMulai: true,
      hari: true,
      isActive: true,
      isKidsIbadah: true,
      cabang: { select: { id: true, nama: true } },
      kategoriIbadah: { select: { nama: true } },
    },
    orderBy: [{ nama: 'asc' }],
  });
  const ids = ibadahs.map((i) => i.id);

  // Pertemuan terjadwal di periode, s.d. hari ini (WIB), tanpa yang dibatalkan.
  const today = todayWib();
  const until = period.to.getTime() < today.getTime() ? period.to : today;
  const cancelled = ids.length
    ? await prisma.ibadahOccurrenceStatus.findMany({
        where: { ibadahId: { in: ids }, status: 'CANCELLED', tanggalIbadah: { gte: period.from, lte: period.to } },
        select: { ibadahId: true, tanggalIbadah: true },
      })
    : [];
  const cancelledSet = new Set(cancelled.map((c) => `${c.ibadahId}|${ymd(c.tanggalIbadah)}`));
  const scheduled = ibadahs
    .filter((i) => i.isActive)
    .flatMap((i) =>
      until.getTime() < period.from.getTime()
        ? []
        : generateOccurrences(i, period.from, until).map((dt) => ({ ibadahId: i.id, tanggal: ymd(dt) })),
    )
    .filter((o) => !cancelledSet.has(`${o.ibadahId}|${o.tanggal}`));

  const rows = ids.length
    ? await prisma.reservasi.findMany({
        where: { ibadahId: { in: ids }, status: 'JOIN', tanggalIbadah: { gte: period.from, lte: period.to } },
        select: {
          ibadahId: true,
          tanggalIbadah: true,
          checkinMethod: true,
          guestSource: true,
          invitedByJemaatId: true,
          jemaat: { select: { id: true, namaLengkap: true, noHp: true, isTamu: true } },
        },
      })
    : [];

  // Kunjungan pertama sepanjang waktu (semua ibadah) untuk tamu → tamu baru vs berulang.
  const guestIds = [...new Set(rows.filter((r) => r.jemaat.isTamu || r.guestSource).map((r) => r.jemaat.id))];
  const firstRows = guestIds.length
    ? await prisma.reservasi.groupBy({
        by: ['jemaatId'],
        where: { jemaatId: { in: guestIds }, status: 'JOIN' },
        _min: { tanggalIbadah: true },
      })
    : [];
  const firstVisit = new Map(
    firstRows.filter((f) => f._min.tanggalIbadah).map((f) => [f.jemaatId, f._min.tanggalIbadah!]),
  );

  const report = buildIbadahReport(scheduled, rows, firstVisit, period.from);
  const inviterNames = await namesOf([...new Set(report.guests.flatMap((g) => g.inviterIds))]);
  const ibadahById = new Map(ibadahs.map((i) => [i.id, i]));
  const ibadahLabel = (id: string) => {
    const i = ibadahById.get(id);
    return i ? { id, nama: i.nama, jamMulai: i.jamMulai, cabang: i.cabang?.nama ?? null, isKidsIbadah: i.isKidsIbadah } : { id, nama: '—', jamMulai: '', cabang: null, isKidsIbadah: false };
  };

  return {
    period: { from: ymd(period.from), to: ymd(period.to), preset: period.preset, label: PERIOD_LABEL[period.preset] ?? '' },
    summary: report.summary,
    trend: report.trend,
    occurrences: report.occurrences.map((o) => ({ ...o, ibadah: ibadahLabel(o.ibadahId) })),
    guests: report.guests.map((g) => ({
      ...g,
      ibadah: g.ibadahIds.map((id) => ibadahLabel(id).nama),
      inviters: g.inviterIds.map((id) => inviterNames.get(id) ?? '—'),
    })),
    filters: {
      cabang: cabangId ? (ibadahs[0]?.cabang?.nama ?? null) : null,
      ibadah: ibadahId ? (ibadahs[0]?.nama ?? null) : null,
    },
  };
}

reportRouter.get('/ibadah', async (req, res) => {
  await assertAccess(req, 'laporan-ibadah');
  res.json({ success: true, data: await ibadahReportData(req) });
});

reportRouter.get('/ibadah/export', async (req, res) => {
  await assertAccess(req, 'laporan-ibadah');
  const d = await ibadahReportData(req);
  const format = (q(req, 'format') ?? 'pdf').toLowerCase();
  if (format === 'csv') {
    const lines = [
      ['Tanggal', 'Ibadah', 'Jam', 'Cabang', 'Total hadir', 'Jemaat', 'Tamu', 'Tamu baru', ...CHECKIN_METHODS.map((m) => METHOD_LABEL[m])],
      ...d.occurrences.map((o) => [
        o.tanggal,
        o.ibadah.nama,
        o.ibadah.jamMulai,
        o.ibadah.cabang ?? '',
        o.total,
        o.jemaat,
        o.tamu,
        o.tamuBaru,
        ...CHECKIN_METHODS.map((m) => o.methods[m]),
      ]),
      [],
      ['DAFTAR TAMU'],
      ['Nama', 'No HP', 'Status', 'Kunjungan (periode)', 'Kunjungan pertama', 'Kunjungan terakhir', 'Ibadah', 'Dibawa oleh', 'Walk-in'],
      ...d.guests.map((g) => [
        g.namaLengkap,
        g.noHp ?? '',
        g.isBaru ? 'Baru' : 'Berulang',
        g.kunjungan,
        g.kunjunganPertama ?? '',
        g.kunjunganTerakhir,
        g.ibadah.join('; '),
        g.inviters.join('; '),
        g.walkIn ? 'Ya' : '',
      ]),
    ];
    return sendCsv(res, `laporan-ibadah-${d.period.from}_${d.period.to}.csv`, lines);
  }
  const s = d.summary;
  const body = `
${summaryCards([
  ['Total hadir', s.totalHadir],
  ['Jemaat (unik)', s.uniqueJemaat],
  ['Tamu (unik)', s.uniqueTamu],
  ['Tamu baru', s.tamuBaru],
  ['Pertemuan', `${s.pertemuanAdaKehadiran}/${s.pertemuan}`],
  ['Rata-rata / pertemuan', s.rataRata],
])}
${methodLine(s.methods)}
<h2>Tren mingguan</h2>
${trendTable(d.trend)}
<h2>Per pertemuan</h2>
<table><thead><tr><th>Tanggal</th><th>Ibadah</th><th>Cabang</th><th class="r">Hadir</th><th class="r">Jemaat</th><th class="r">Tamu</th><th class="r">Tamu baru</th><th>Cara check-in</th></tr></thead><tbody>
${d.occurrences
  .map(
    (o) =>
      `<tr><td>${fmtTgl(o.tanggal)}</td><td>${esc(o.ibadah.nama)} <span class="muted">${esc(o.ibadah.jamMulai)}</span></td><td>${esc(o.ibadah.cabang ?? '')}</td><td class="r b">${o.total}</td><td class="r">${o.jemaat}</td><td class="r">${o.tamu}</td><td class="r">${o.tamuBaru}</td><td class="muted">${methodInline(o.methods)}</td></tr>`,
  )
  .join('')}
</tbody></table>
<h2>Daftar tamu (${d.guests.length})</h2>
${
  d.guests.length
    ? `<table><thead><tr><th>Nama</th><th>No HP</th><th>Status</th><th class="r">Kunjungan</th><th>Terakhir</th><th>Ibadah</th><th>Dibawa oleh</th></tr></thead><tbody>
${d.guests
  .map(
    (g) =>
      `<tr><td>${esc(g.namaLengkap)}</td><td>${esc(g.noHp ?? '')}</td><td>${g.isBaru ? '<span class="ok">Baru</span>' : 'Berulang'}</td><td class="r">${g.kunjungan}</td><td>${fmtTgl(g.kunjunganTerakhir)}</td><td>${esc(g.ibadah.join(', '))}</td><td>${esc(g.walkIn && !g.inviters.length ? 'Walk-in' : g.inviters.join(', '))}</td></tr>`,
  )
  .join('')}
</tbody></table>`
    : '<p class="muted">Tidak ada tamu di periode ini.</p>'
}`;
  sendPrintHtml(req, res, 'Laporan Ibadah', d.period, [d.filters.cabang, d.filters.ibadah], body);
});

// ============================================================
// EVENT
// ============================================================

async function eventReportData(req: Request) {
  const eventId = q(req, 'eventId');
  const cabangId = q(req, 'cabangId');
  const period = eventId && UUID_RE.test(eventId) ? null : reportPeriod(req);
  const where: Prisma.EventWhereInput = {};
  if (eventId && UUID_RE.test(eventId)) where.id = eventId;
  if (cabangId && UUID_RE.test(cabangId)) where.cabangId = cabangId;
  if (period) {
    // Event yang berlangsung (sebagian) di periode.
    const toEnd = new Date(period.to.getTime() + 86_400_000 - 1);
    where.AND = [
      { tanggalMulai: { lte: toEnd } },
      { OR: [{ tanggalSelesai: { gte: period.from } }, { tanggalSelesai: null, tanggalMulai: { gte: period.from } }] },
    ];
  }
  const events = await prisma.event.findMany({
    where,
    orderBy: { tanggalMulai: 'desc' },
    take: 500,
    select: {
      id: true,
      judul: true,
      tanggalMulai: true,
      tanggalSelesai: true,
      jamMulai: true,
      butuhKehadiran: true,
      allowSelfCheckin: true,
      tipeBayar: true,
      quotaPeserta: true,
      cabang: { select: { nama: true } },
    },
  });
  const ids = events.map((e) => e.id);
  const rows = ids.length
    ? await prisma.eventParticipation.findMany({
        where: { eventId: { in: ids } },
        select: {
          eventId: true,
          status: true,
          checkinMethod: true,
          guestSource: true,
          invitedByJemaatId: true,
          jemaat: { select: { id: true, namaLengkap: true, noHp: true, isTamu: true } },
        },
      })
    : [];
  const report = buildEventReport(ids, rows);
  const inviterNames = await namesOf([...new Set(report.guests.map((g) => g.inviterId).filter((x): x is string => !!x))]);
  const evById = new Map(events.map((e) => [e.id, e]));
  return {
    period: period
      ? { from: ymd(period.from), to: ymd(period.to), preset: period.preset, label: PERIOD_LABEL[period.preset] ?? '' }
      : null,
    summary: report.summary,
    events: report.events.map((r) => {
      const e = evById.get(r.eventId)!;
      return {
        ...r,
        judul: e.judul,
        tanggalMulai: e.tanggalMulai,
        tanggalSelesai: e.tanggalSelesai,
        jamMulai: e.jamMulai,
        cabang: e.cabang?.nama ?? null,
        butuhKehadiran: e.butuhKehadiran,
        allowSelfCheckin: e.allowSelfCheckin,
        quotaPeserta: e.quotaPeserta,
      };
    }),
    guests: report.guests.map((g) => ({
      ...g,
      eventJudul: evById.get(g.eventId)?.judul ?? '—',
      inviter: g.inviterId ? (inviterNames.get(g.inviterId) ?? '—') : null,
    })),
    filters: { cabang: cabangId ? (events[0]?.cabang?.nama ?? null) : null, event: eventId ? (events[0]?.judul ?? null) : null },
  };
}

reportRouter.get('/event', async (req, res) => {
  await assertAccess(req, 'laporan-event');
  res.json({ success: true, data: await eventReportData(req) });
});

const STATUS_LABEL: Record<string, string> = {
  DAFTAR: 'Daftar',
  MENUNGGU_VERIFIKASI: 'Menunggu verifikasi',
  BAYAR: 'Bayar',
  HADIR: 'Hadir',
};

reportRouter.get('/event/export', async (req, res) => {
  await assertAccess(req, 'laporan-event');
  const d = await eventReportData(req);
  const format = (q(req, 'format') ?? 'pdf').toLowerCase();
  if (format === 'csv') {
    const lines = [
      ['Tanggal', 'Event', 'Cabang', 'Terdaftar', 'Hadir', '% Hadir', 'Batal', 'Tamu terdaftar', 'Tamu hadir', ...CHECKIN_METHODS.map((m) => METHOD_LABEL[m])],
      ...d.events.map((e) => [
        ymd(e.tanggalMulai),
        e.judul,
        e.cabang ?? '',
        e.terdaftar,
        e.hadir,
        e.persenHadir ?? '',
        e.batal,
        e.tamuTerdaftar,
        e.tamuHadir,
        ...CHECKIN_METHODS.map((m) => e.methods[m]),
      ]),
      [],
      ['DAFTAR TAMU'],
      ['Event', 'Nama', 'No HP', 'Status', 'Dibawa oleh / walk-in'],
      ...d.guests.map((g) => [g.eventJudul, g.namaLengkap, g.noHp ?? '', STATUS_LABEL[g.status] ?? g.status, g.walkIn ? 'Walk-in' : (g.inviter ?? '')]),
    ];
    return sendCsv(res, `laporan-event-${d.period?.from ?? 'event'}.csv`, lines);
  }
  const s = d.summary;
  const body = `
${summaryCards([
  ['Event', s.event],
  ['Terdaftar', s.terdaftar],
  ['Hadir', s.hadir],
  ['% Hadir', s.persenHadir != null ? `${s.persenHadir}%` : '—'],
  ['Tamu hadir', s.tamuHadir],
  ['Tamu unik', s.tamuUnik],
])}
${methodLine(s.methods)}
<h2>Per event</h2>
<table><thead><tr><th>Tanggal</th><th>Event</th><th>Cabang</th><th class="r">Terdaftar</th><th class="r">Hadir</th><th class="r">%</th><th class="r">Batal</th><th class="r">Tamu</th><th>Cara check-in</th></tr></thead><tbody>
${d.events
  .map(
    (e) =>
      `<tr><td>${fmtTgl(ymd(e.tanggalMulai))}</td><td>${esc(e.judul)}</td><td>${esc(e.cabang ?? 'Global')}</td><td class="r">${e.terdaftar}</td><td class="r b">${e.hadir}</td><td class="r">${e.persenHadir != null ? `${e.persenHadir}%` : '—'}</td><td class="r">${e.batal}</td><td class="r">${e.tamuHadir}/${e.tamuTerdaftar}</td><td class="muted">${methodInline(e.methods)}</td></tr>`,
  )
  .join('')}
</tbody></table>
<h2>Daftar tamu (${d.guests.length})</h2>
${
  d.guests.length
    ? `<table><thead><tr><th>Event</th><th>Nama</th><th>No HP</th><th>Status</th><th>Dibawa oleh</th></tr></thead><tbody>
${d.guests
  .map(
    (g) =>
      `<tr><td>${esc(g.eventJudul)}</td><td>${esc(g.namaLengkap)}</td><td>${esc(g.noHp ?? '')}</td><td>${esc(STATUS_LABEL[g.status] ?? g.status)}</td><td>${esc(g.walkIn ? 'Walk-in' : (g.inviter ?? ''))}</td></tr>`,
  )
  .join('')}
</tbody></table>`
    : '<p class="muted">Tidak ada tamu.</p>'
}`;
  sendPrintHtml(req, res, 'Laporan Event', d.period, [d.filters.cabang, d.filters.event], body);
});

// ============================================================
// Helpers export
// ============================================================

function esc(s: unknown): string {
  if (s === null || s === undefined) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
const fmtTgl = (ymdStr: string) =>
  new Date(`${ymdStr}T00:00:00Z`).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

function csvCell(v: unknown) {
  const s = v == null ? '' : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function sendCsv(res: Response, filename: string, lines: unknown[][]) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send('﻿' + lines.map((l) => l.map(csvCell).join(',')).join('\n'));
}

function summaryCards(items: [string, string | number][]) {
  return `<div class="cards">${items
    .map(([k, v]) => `<div class="card"><div class="v">${esc(v)}</div><div class="k">${esc(k)}</div></div>`)
    .join('')}</div>`;
}
function methodInline(m: MethodCount) {
  return CHECKIN_METHODS.filter((k) => m[k] > 0)
    .map((k) => `${METHOD_LABEL[k]} ${m[k]}`)
    .join(' · ');
}
function methodLine(m: MethodCount) {
  const total = CHECKIN_METHODS.reduce((n, k) => n + m[k], 0);
  if (!total) return '';
  return `<p class="meth"><b>Cara check-in:</b> ${CHECKIN_METHODS.filter((k) => m[k] > 0)
    .map((k) => `${METHOD_LABEL[k]} ${m[k]} (${Math.round((m[k] / total) * 100)}%)`)
    .join(' · ')}</p>`;
}
function trendTable(trend: { week: string; jemaat: number; tamu: number }[]) {
  if (!trend.length) return '<p class="muted">Belum ada kehadiran.</p>';
  const max = Math.max(1, ...trend.map((t) => t.jemaat + t.tamu));
  return `<table class="trend"><tbody>${trend
    .map((t) => {
      const wj = (t.jemaat / max) * 100;
      const wt = (t.tamu / max) * 100;
      return `<tr><td class="w">Mg ${fmtTgl(t.week)}</td><td><div class="bar"><span class="j" style="width:${wj}%"></span><span class="t" style="width:${wt}%"></span></div></td><td class="r">${t.jemaat} + ${t.tamu} tamu</td></tr>`;
    })
    .join('')}</tbody></table>`;
}

function sendPrintHtml(
  req: Request,
  res: Response,
  title: string,
  period: { from: string; to: string; label: string } | null,
  filters: (string | null)[],
  body: string,
) {
  const timestamp = new Date().toISOString().slice(0, 10);
  const isMobileUa = /mobi|android|iphone|ipad|ipod/.test((req.get('user-agent') ?? '').toLowerCase());
  const ideaLogo = `${(process.env.PORTAL_URL ?? 'https://portal.eccchurch.global').replace(/\/$/, '')}/logo-idea.webp`;
  const meta = [
    period ? `${period.label ? `${period.label} · ` : ''}${fmtTgl(period.from)} – ${fmtTgl(period.to)}` : null,
    ...filters,
  ].filter(Boolean);
  const html = `<!doctype html>
<html lang="id"><head><meta charset="utf-8"><title>${esc(title)} — ${timestamp}</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 10px; color: #0f172a; margin: 0; }
  h1 { font-size: 17px; margin: 0 0 4px; } h2 { font-size: 12.5px; margin: 16px 0 6px; }
  .meta { font-size: 11px; color: #64748b; margin-bottom: 10px; }
  .cards { display: flex; gap: 8px; margin: 8px 0; }
  .card { flex: 1; border: 1px solid #fed7aa; background: #fff7ed; border-radius: 8px; padding: 8px 10px; }
  .card .v { font-size: 18px; font-weight: 700; color: #c2410c; } .card .k { font-size: 10px; color: #9a3412; }
  .meth { font-size: 10.5px; color: #334155; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #e2e8f0; padding: 3px 6px; text-align: left; vertical-align: top; }
  thead { background: #f8fafc; font-weight: 600; } .r { text-align: right; } .b { font-weight: 700; }
  .muted { color: #64748b; } .ok { color: #15803d; font-weight: 600; }
  .trend td { border: none; padding: 2px 6px; } .trend .w { width: 120px; color: #475569; }
  .bar { display: flex; height: 10px; background: #f1f5f9; border-radius: 3px; overflow: hidden; }
  .bar .j { background: #f97316; } .bar .t { background: #8b5cf6; }
  .footer-row { display: flex; justify-content: space-between; align-items: center; margin-top: 14px; padding-top: 8px; border-top: 1px solid #e2e8f0; font-size: 9.5px; color: #94a3b8; }
  .powered { display: flex; align-items: center; gap: 6px; color: #64748b; }
  @media print { .noprint { display: none !important; } }
  .noprint { padding: 10px; background: #fff7ed; border-bottom: 1px solid #fed7aa; }
  .noprint button { padding: 6px 12px; background: #ea580c; color: white; border: none; border-radius: 4px; font-size: 13px; cursor: pointer; }
</style></head><body>
${isMobileUa ? '' : `<div class="noprint"><strong>Print Preview — ${esc(title)}</strong> · Tekan <kbd>Ctrl/Cmd + P</kbd> untuk simpan PDF. <button onclick="window.print()">Print / Save as PDF</button></div>`}
${isMobileUa ? '<script>setTimeout(() => window.print(), 600);</script>' : ''}
<div style="padding: 8mm;">
<h1>${esc(title)} ECC</h1>
<div class="meta">${meta.map(esc).join(' · ')} · Export ${timestamp}</div>
${body}
<div class="footer-row">
  <div>© ${new Date().getFullYear()} Elshaddai Creative Community · Oranye = jemaat, ungu = tamu</div>
  <div class="powered"><span>Powered by</span><img src="${ideaLogo}" alt="IDEA" onerror="this.style.display='none'" style="height:20px;width:auto;"/></div>
</div>
</div></body></html>`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
}
