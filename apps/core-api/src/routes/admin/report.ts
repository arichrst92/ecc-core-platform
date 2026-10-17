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
import { esc, fmtTgl, sendCsv, sendPrintHtml, summaryCards } from '../../lib/print-report.js';
import { renderIbadahReportHtml } from '../../lib/ibadah-report-html.js';
import {
  CHECKIN_METHODS,
  METHOD_LABEL,
  buildEventReport,
  buildIbadahReport,
  buildOccupancy,
  occupancyPct,
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
  const kategoriId = q(req, 'kategoriIbadahId');
  const where: Prisma.IbadahWhereInput = {};
  if (cabangId && UUID_RE.test(cabangId)) where.cabangId = cabangId;
  if (ibadahId && UUID_RE.test(ibadahId)) where.id = ibadahId;
  if (kategoriId && UUID_RE.test(kategoriId)) where.kategoriIbadahId = kategoriId;

  const ibadahs = await prisma.ibadah.findMany({
    where,
    select: {
      requiresCheckout: true,
      id: true,
      nama: true,
      jamMulai: true,
      tipeJadwal: true,
      tanggalMulai: true,
      hari: true,
      isActive: true,
      isKidsIbadah: true,
      kapasitasSeat: true,
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
          id: true,
          ibadahId: true,
          tanggalIbadah: true,
          checkinMethod: true,
          guestSource: true,
          invitedByJemaatId: true,
          checkedOutAt: true,
          pickedUpAt: true,
          jemaat: { select: { id: true, namaLengkap: true, noHp: true, isTamu: true, jenisKelamin: true, tanggalLahir: true } },
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
    return i
      ? { id, nama: i.nama, jamMulai: i.jamMulai, cabang: i.cabang?.nama ?? null, isKidsIbadah: i.isKidsIbadah, kapasitasSeat: i.kapasitasSeat }
      : { id, nama: '—', jamMulai: '', cabang: null, isKidsIbadah: false, kapasitasSeat: null };
  };
  // Okupansi memakai jumlah seat saat ini (pendataan saja, tidak membatasi check-in).
  const seatById = new Map(ibadahs.map((i) => [i.id, i.kapasitasSeat]));
  const occ = buildOccupancy(report.occurrences, seatById);
  const scopeCabangId = cabangId && UUID_RE.test(cabangId) ? cabangId : ibadahId ? (ibadahs[0]?.cabang?.id ?? null) : null;
  const kidsIds = new Set(ibadahs.filter((i) => i.isKidsIbadah).map((i) => i.id));
  const kidsOnly = ibadahs.length > 0 && kidsIds.size === ibadahs.length;
  const kids = kidsIds.size
    ? await kidsReport({ ibadahs: ibadahs.filter((i) => kidsIds.has(i.id)), rows: rows.filter((r) => kidsIds.has(r.ibadahId)), report, cabangId: scopeCabangId })
    : null;
  const insights = await ibadahInsights({
    ids,
    ibadahs,
    period,
    cabangId: scopeCabangId,
    kidsOnly,
    rows,
    report,
    seatById,
    occ,
    ibadahLabel,
  });

  return {
    period: { from: ymd(period.from), to: ymd(period.to), preset: period.preset, label: PERIOD_LABEL[period.preset] ?? '' },
    summary: { ...report.summary, okupansi: occ.overall },
    insights,
    kids,
    trend: report.trend,
    occurrences: report.occurrences.map((o) => ({
      ...o,
      ibadah: ibadahLabel(o.ibadahId),
      seat: seatById.get(o.ibadahId) ?? null,
      okupansi: o.total > 0 ? occupancyPct(o.total, seatById.get(o.ibadahId)) : null,
    })),
    occupancy: occ.perIbadah.map((x) => ({ ...x, ibadah: ibadahLabel(x.ibadahId) })),
    guests: report.guests.map((g) => ({
      ...g,
      ibadah: g.ibadahIds.map((id) => ibadahLabel(id).nama),
      inviters: g.inviterIds.map((id) => inviterNames.get(id) ?? '—'),
    })),
    filters: {
      cabang: cabangId ? (ibadahs[0]?.cabang?.nama ?? null) : null,
      ibadah: ibadahId ? (ibadahs[0]?.nama ?? null) : null,
      kategori: kategoriId ? (ibadahs[0]?.kategoriIbadah?.nama ?? null) : null,
      kidsOnly,
    },
  };
}

// ------------------------------------------------------------
// Insight eksekutif laporan ibadah: perbandingan periode sebelumnya,
// jangkauan jemaat, frekuensi hadir, ringkasan per ibadah, pertemuan
// tertinggi/terendah.
// ------------------------------------------------------------
/** Lahir pada/setelah tanggal ini = usia ≤13 tahun (batas CKids). */
function kidsBirthLimit(today = new Date()): Date {
  return new Date(Date.UTC(today.getUTCFullYear() - 14, today.getUTCMonth(), today.getUTCDate() + 1));
}

const KIDS_AGE = [
  { label: 'Balita (0–3)', min: 0, max: 3 },
  { label: 'Prasekolah (4–6)', min: 4, max: 6 },
  { label: 'SD kecil (7–9)', min: 7, max: 9 },
  { label: 'SD besar (10–13)', min: 10, max: 13 },
  { label: 'Di atas 13', min: 14, max: 200 },
];

/** Data khusus ibadah anak (CKids) dalam cakupan laporan. */
async function kidsReport(a: {
  ibadahs: { id: string; nama: string; jamMulai: string; requiresCheckout: boolean }[];
  rows: {
    id: string;
    ibadahId: string;
    tanggalIbadah: Date;
    guestSource: string | null;
    checkedOutAt: Date | null;
    pickedUpAt: Date | null;
    jemaat: { id: string; isTamu: boolean; jenisKelamin: 'L' | 'P' | null; tanggalLahir: Date | null };
  }[];
  report: ReturnType<typeof buildIbadahReport>;
  cabangId: string | null;
}) {
  const today = new Date();
  const ageOf = (d: Date) => {
    let x = today.getFullYear() - d.getFullYear();
    const m = today.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < d.getDate())) x -= 1;
    return x;
  };
  const anak = new Map<string, (typeof a.rows)[number]['jemaat']>();
  for (const r of a.rows) anak.set(r.jemaat.id, r.jemaat);
  const usia = KIDS_AGE.map((g) => ({ label: g.label, count: 0 }));
  let tanpaUsia = 0;
  let L = 0;
  let P = 0;
  for (const j of anak.values()) {
    if (j.jenisKelamin === 'L') L++;
    else if (j.jenisKelamin === 'P') P++;
    if (!j.tanggalLahir) tanpaUsia++;
    else {
      const age = ageOf(j.tanggalLahir);
      const idx = KIDS_AGE.findIndex((g) => age >= g.min && age <= g.max);
      if (idx >= 0) usia[idx]!.count++;
    }
  }
  const checkoutIbadah = new Set(a.ibadahs.filter((i) => i.requiresCheckout).map((i) => i.id));
  const wajib = a.rows.filter((r) => checkoutIbadah.has(r.ibadahId));
  const occ = new Set(a.rows.map((r) => `${r.ibadahId}|${ymd(r.tanggalIbadah)}`));
  const [anakTerdaftar, poin] = await Promise.all([
    prisma.jemaat.count({
      where: { isActive: true, isTamu: false, tanggalLahir: { gte: kidsBirthLimit() }, ...(a.cabangId ? { cabangId: a.cabangId } : {}) },
    }),
    a.rows.length
      ? prisma.pointTransaction.aggregate({
          where: { source: 'KEHADIRAN_KIDS', referenceId: { in: a.rows.map((r) => r.id) } },
          _sum: { amount: true },
        })
      : Promise.resolve({ _sum: { amount: 0 } }),
  ]);
  const perIbadah = a.ibadahs
    .map((i) => {
      const rs = a.rows.filter((r) => r.ibadahId === i.id);
      const o = new Set(rs.map((r) => ymd(r.tanggalIbadah)));
      return {
        nama: i.nama,
        jamMulai: i.jamMulai,
        kehadiran: rs.length,
        anakUnik: new Set(rs.map((r) => r.jemaat.id)).size,
        pertemuan: o.size,
        rataRata: o.size ? Math.round((rs.length / o.size) * 10) / 10 : 0,
        wajibCheckout: i.requiresCheckout,
      };
    })
    .sort((x, y) => y.kehadiran - x.kehadiran);
  return {
    ibadah: a.ibadahs.map((i) => i.nama),
    kehadiran: a.rows.length,
    anakHadirUnik: anak.size,
    anakTerdaftar,
    jangkauanPct: anakTerdaftar ? Math.round((anak.size * 1000) / anakTerdaftar) / 10 : 0,
    pertemuan: occ.size,
    rataRataPerPertemuan: occ.size ? Math.round((a.rows.length / occ.size) * 10) / 10 : 0,
    tamuAnak: new Set(a.rows.filter((r) => r.jemaat.isTamu || r.guestSource).map((r) => r.jemaat.id)).size,
    gender: { L, P, tanpa: anak.size - L - P },
    usia,
    tanpaUsia,
    checkout: {
      wajib: wajib.length,
      sudahCheckout: wajib.filter((r) => r.checkedOutAt).length,
      dijemput: wajib.filter((r) => r.pickedUpAt).length,
      belum: wajib.filter((r) => !r.checkedOutAt && !r.pickedUpAt).length,
    },
    poinDiberikan: poin._sum.amount ?? 0,
    perIbadah,
  };
}

const growthPct = (cur: number, prev: number): number | null =>
  prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : null;

async function ibadahInsights(a: {
  ids: string[];
  ibadahs: { id: string; isActive: boolean }[];
  period: { from: Date; to: Date };
  cabangId: string | null;
  /** Semua ibadah dalam cakupan = ibadah anak → jangkauan dihitung dari anak ≤13 th. */
  kidsOnly: boolean;
  rows: { ibadahId: string; tanggalIbadah: Date; guestSource: string | null; jemaat: { id: string; isTamu: boolean } }[];
  report: ReturnType<typeof buildIbadahReport>;
  seatById: Map<string, number | null>;
  occ: ReturnType<typeof buildOccupancy>;
  ibadahLabel: (id: string) => { id: string; nama: string; jamMulai: string; cabang: string | null; isKidsIbadah: boolean };
}) {
  const { ids, period, report } = a;
  const DAY = 86_400_000;
  const len = Math.round((period.to.getTime() - period.from.getTime()) / DAY) + 1;
  const prevTo = new Date(period.from.getTime() - DAY);
  const prevFrom = new Date(period.from.getTime() - len * DAY);
  const isGuest = (r: { guestSource: string | null; jemaat: { isTamu: boolean } }) => r.jemaat.isTamu || !!r.guestSource;

  const [prevRows, jemaatAktif] = await Promise.all([
    ids.length
      ? prisma.reservasi.findMany({
          where: { ibadahId: { in: ids }, status: 'JOIN', tanggalIbadah: { gte: prevFrom, lte: prevTo } },
          select: { ibadahId: true, tanggalIbadah: true, guestSource: true, jemaat: { select: { id: true, isTamu: true } } },
        })
      : Promise.resolve([]),
    prisma.jemaat.count({
      where: {
        isActive: true,
        isTamu: false,
        ...(a.cabangId ? { cabangId: a.cabangId } : {}),
        ...(a.kidsOnly ? { tanggalLahir: { gte: kidsBirthLimit() } } : {}),
      },
    }),
  ]);

  const summarize = (rs: typeof prevRows) => {
    const occ = new Set(rs.map((r) => `${r.ibadahId}|${ymd(r.tanggalIbadah)}`));
    const jem = new Set(rs.filter((r) => !isGuest(r)).map((r) => r.jemaat.id));
    const tam = new Set(rs.filter(isGuest).map((r) => r.jemaat.id));
    return {
      totalHadir: rs.length,
      uniqueJemaat: jem.size,
      uniqueTamu: tam.size,
      pertemuan: occ.size,
      rataRata: occ.size ? Math.round((rs.length / occ.size) * 10) / 10 : 0,
    };
  };
  const cur = summarize(a.rows);
  const prev = summarize(prevRows);

  // Frekuensi hadir jemaat (bukan tamu) di periode.
  const freq = new Map<string, number>();
  for (const r of a.rows) if (!isGuest(r)) freq.set(r.jemaat.id, (freq.get(r.jemaat.id) ?? 0) + 1);
  const buckets = [
    { label: '1 kali', min: 1, max: 1, count: 0 },
    { label: '2–3 kali', min: 2, max: 3, count: 0 },
    { label: '4–7 kali', min: 4, max: 7, count: 0 },
    { label: '8 kali atau lebih', min: 8, max: Infinity, count: 0 },
  ];
  for (const c of freq.values()) buckets.find((b) => c >= b.min && c <= b.max)!.count++;

  // Ringkasan per ibadah.
  const per = new Map<string, { terjadwal: number; pertemuan: number; total: number; jemaat: number; tamu: number; tamuBaru: number; puncak: number }>();
  for (const o of report.occurrences) {
    const x = per.get(o.ibadahId) ?? { terjadwal: 0, pertemuan: 0, total: 0, jemaat: 0, tamu: 0, tamuBaru: 0, puncak: 0 };
    x.terjadwal++;
    if (o.total > 0) x.pertemuan++;
    x.total += o.total;
    x.jemaat += o.jemaat;
    x.tamu += o.tamu;
    x.tamuBaru += o.tamuBaru;
    x.puncak = Math.max(x.puncak, o.total);
    per.set(o.ibadahId, x);
  }
  const prevPer = new Map<string, number>();
  for (const r of prevRows) prevPer.set(r.ibadahId, (prevPer.get(r.ibadahId) ?? 0) + 1);
  const occById = new Map(a.occ.perIbadah.map((o) => [o.ibadahId, o]));
  const perIbadah = [...per.entries()]
    .map(([id, x]) => ({
      ibadah: a.ibadahLabel(id),
      ...x,
      rataRata: x.pertemuan ? Math.round((x.total / x.pertemuan) * 10) / 10 : 0,
      seat: a.seatById.get(id) ?? null,
      okupansi: occById.get(id)?.rataOkupansi ?? null,
      growth: growthPct(x.total, prevPer.get(id) ?? 0),
    }))
    .sort((p, q2) => q2.total - p.total);

  const held = report.occurrences.filter((o) => o.total > 0);
  const toOcc = (o: (typeof held)[number]) => ({ ibadah: a.ibadahLabel(o.ibadahId).nama, jam: a.ibadahLabel(o.ibadahId).jamMulai, tanggal: o.tanggal, total: o.total });
  const tamuBaru = report.guests.filter((g) => g.isBaru).length;

  return {
    prev: { from: ymd(prevFrom), to: ymd(prevTo), ...prev },
    growth: {
      totalHadir: growthPct(cur.totalHadir, prev.totalHadir),
      uniqueJemaat: growthPct(cur.uniqueJemaat, prev.uniqueJemaat),
      uniqueTamu: growthPct(cur.uniqueTamu, prev.uniqueTamu),
      rataRata: growthPct(cur.rataRata, prev.rataRata),
    },
    jangkauan: {
      jemaatAktif,
      hadirUnik: cur.uniqueJemaat,
      pct: jemaatAktif ? Math.round((cur.uniqueJemaat * 1000) / jemaatAktif) / 10 : 0,
      belumHadir: Math.max(0, jemaatAktif - cur.uniqueJemaat),
    },
    frekuensi: buckets.map((b) => ({ label: b.label, count: b.count })),
    tamu: { baru: tamuBaru, berulang: report.guests.length - tamuBaru, total: report.guests.length },
    perIbadah,
    tertinggi: [...held].sort((p, q2) => q2.total - p.total).slice(0, 3).map(toOcc),
    terendah: [...held].sort((p, q2) => p.total - q2.total).slice(0, 3).map(toOcc),
    pertemuanTanpaKehadiran: report.occurrences.length - held.length,
  };
}

const pctTxt = (p: number) => `${p.toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`;
/** Sel % okupansi untuk PDF; > 100% ditandai merah (overflow). */
const pctCell = (p: number | null) =>
  p == null ? '<span class="muted">—</span>' : p > 100 ? `<span style="color:#dc2626;font-weight:700">${pctTxt(p)}</span>` : pctTxt(p);

reportRouter.get('/ibadah', async (req, res) => {
  await assertAccess(req, 'laporan-ibadah');
  res.json({ success: true, data: await ibadahReportData(req) });
});

reportRouter.get('/ibadah/export', async (req, res) => {
  await assertAccess(req, 'laporan-ibadah');
  const d = await ibadahReportData(req);
  const format = (q(req, 'format') ?? 'pdf').toLowerCase();
  if (format === 'csv') {
    const ins = d.insights;
    const g = (v: number | null) => (v == null ? '' : v);
    const lines = [
      ['LAPORAN IBADAH', d.filters.cabang ?? 'Semua cabang', d.filters.kategori ? `Kategori ${d.filters.kategori}` : 'Semua kategori', d.filters.ibadah ?? 'Semua ibadah'],
      ['Periode', `${d.period.from} s.d. ${d.period.to}`, `Pembanding: ${ins.prev.from} s.d. ${ins.prev.to}`],
      [],
      ['RINGKASAN', 'Periode ini', 'Periode lalu', 'Perubahan (%)'],
      ['Total kehadiran', d.summary.totalHadir, ins.prev.totalHadir, g(ins.growth.totalHadir)],
      ['Jemaat hadir (unik)', d.summary.uniqueJemaat, ins.prev.uniqueJemaat, g(ins.growth.uniqueJemaat)],
      ['Tamu (unik)', d.summary.uniqueTamu, ins.prev.uniqueTamu, g(ins.growth.uniqueTamu)],
      ['Rata-rata hadir / pertemuan', d.summary.rataRata, ins.prev.rataRata, g(ins.growth.rataRata)],
      ['Pertemuan ada kehadiran / terjadwal', `${d.summary.pertemuanAdaKehadiran}/${d.summary.pertemuan}`, ins.prev.pertemuan, ''],
      ['Tamu baru', ins.tamu.baru, '', ''],
      ['Tamu berulang', ins.tamu.berulang, '', ''],
      ['Okupansi rata-rata (%)', d.summary.okupansi.rataOkupansi ?? '', '', ''],
      [],
      ['JANGKAUAN JEMAAT', 'Jemaat'],
      ['Jemaat aktif', ins.jangkauan.jemaatAktif],
      ['Hadir minimal sekali', ins.jangkauan.hadirUnik],
      ['Hadir (% jemaat aktif)', ins.jangkauan.pct],
      ['Belum hadir', ins.jangkauan.belumHadir],
      [],
      ['FREKUENSI HADIR JEMAAT', 'Jemaat'],
      ...ins.frekuensi.map((f) => [f.label, f.count]),
      [],
      ['CARA CHECK-IN', 'Jumlah'],
      ...CHECKIN_METHODS.map((m) => [METHOD_LABEL[m], d.summary.methods[m]]),
      [],
      ['RINGKASAN PER IBADAH'],
      ['Ibadah', 'Jam', 'Cabang', 'Pertemuan (ada kehadiran)', 'Terjadwal', 'Total hadir', 'Jemaat', 'Tamu', 'Tamu baru', 'Rata-rata', 'Puncak', 'Seat', 'Okupansi (%)', 'vs periode lalu (%)'],
      ...ins.perIbadah.map((p) => [
        p.ibadah.nama,
        p.ibadah.jamMulai,
        p.ibadah.cabang ?? '',
        p.pertemuan,
        p.terjadwal,
        p.total,
        p.jemaat,
        p.tamu,
        p.tamuBaru,
        p.rataRata,
        p.puncak,
        p.seat ?? '',
        p.okupansi ?? '',
        g(p.growth),
      ]),
      [],
      ['KEHADIRAN TERTINGGI', 'Tanggal', 'Hadir'],
      ...ins.tertinggi.map((o) => [`${o.ibadah} ${o.jam}`, o.tanggal, o.total]),
      ['KEHADIRAN TERENDAH', 'Tanggal', 'Hadir'],
      ...ins.terendah.map((o) => [`${o.ibadah} ${o.jam}`, o.tanggal, o.total]),
      [],
      ...(d.kids
        ? [
            ['IBADAH ANAK (CKIDS)', 'Nilai', 'Catatan'],
            ['Ibadah anak', d.kids.ibadah.join('; '), ''],
            ['Kehadiran anak', d.kids.kehadiran, `${d.kids.pertemuan} pertemuan`],
            ['Anak hadir (unik)', d.kids.anakHadirUnik, `${d.kids.jangkauanPct}% dari ${d.kids.anakTerdaftar} anak terdaftar (≤13 th)`],
            ['Rata-rata hadir / pertemuan', d.kids.rataRataPerPertemuan, ''],
            ['Tamu anak (unik)', d.kids.tamuAnak, ''],
            ['Laki-laki / Perempuan', `${d.kids.gender.L} / ${d.kids.gender.P}`, d.kids.gender.tanpa ? `${d.kids.gender.tanpa} belum diisi` : ''],
            ...d.kids.usia.map((u) => [`Usia ${u.label}`, u.count, '']),
            ['Tanggal lahir belum diisi', d.kids.tanpaUsia, ''],
            ['Kehadiran wajib checkout', d.kids.checkout.wajib, ''],
            ['Sudah checkout', d.kids.checkout.sudahCheckout, ''],
            ['Sudah dijemput (kode jemput)', d.kids.checkout.dijemput, ''],
            ['Belum checkout / dijemput', d.kids.checkout.belum, ''],
            ['Poin kehadiran diberikan', d.kids.poinDiberikan, ''],
            ['Per ibadah anak', 'Kehadiran', 'Anak unik', 'Pertemuan', 'Rata-rata'],
            ...d.kids.perIbadah.map((p) => [`${p.nama} ${p.jamMulai}`, p.kehadiran, p.anakUnik, p.pertemuan, p.rataRata]),
            [],
          ]
        : []),
      ['TREN MINGGUAN (mulai Senin)', 'Jemaat', 'Tamu', 'Total'],
      ...d.trend.map((t) => [t.week, t.jemaat, t.tamu, t.jemaat + t.tamu]),
      [],
      ['OKUPANSI PER IBADAH'],
      ['Ibadah', 'Jam', 'Cabang', 'Seat', 'Pertemuan', 'Rata-rata hadir', 'Rata-rata okupansi (%)', 'Puncak hadir', 'Puncak okupansi (%)', 'Pertemuan melebihi seat'],
      ...d.occupancy.map((x) => [
        x.ibadah.nama,
        x.ibadah.jamMulai,
        x.ibadah.cabang ?? '',
        x.seat ?? '',
        x.pertemuan,
        x.rataHadir,
        x.rataOkupansi ?? '',
        x.puncakHadir,
        x.puncakOkupansi ?? '',
        x.melebihi,
      ]),
      [],
      ['PER PERTEMUAN'],
      ['Tanggal', 'Ibadah', 'Jam', 'Cabang', 'Total hadir', 'Seat', 'Okupansi (%)', 'Jemaat', 'Tamu', 'Tamu baru', ...CHECKIN_METHODS.map((m) => METHOD_LABEL[m])],
      ...d.occurrences.map((o) => [
        o.tanggal,
        o.ibadah.nama,
        o.ibadah.jamMulai,
        o.ibadah.cabang ?? '',
        o.total,
        o.seat ?? '',
        o.okupansi ?? '',
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
  const isMobileUa = /mobi|android|iphone|ipad|ipod/.test((req.get('user-agent') ?? '').toLowerCase());
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(renderIbadahReportHtml(d, { isMobileUa }));
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

