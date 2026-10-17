/**
 * Admin portal — Visit (Movement) read-only + moderation delete.
 *
 * Tidak ada create/edit dari portal. Aktivitas Visit dilakukan di mobile
 * app (scan QR + notes oleh jemaat). Portal hanya untuk:
 *   - GET    /admin/visit              → paginated list dgn filter
 *   - GET    /admin/visit/summary      → jumlah visit + jemaat paling aktif
 *   - GET    /admin/visit/export       → ?format=pdf|csv, mengikuti filter
 *   - GET    /admin/visit/:id          → detail
 *   - DELETE /admin/visit/:id          → moderation delete (audit logged)
 *
 * Filter: lihat parseVisitFilter di bawah (cabang, area, homecell, role,
 * sub role, status, pelayanan, nama, pihak, judul/lokasi, catatan, periode).
 */
import { Router, type Request } from 'express';
import { prisma, type Prisma } from '@ecc/database';
import { NotFound } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { resolvePeriod, ymd } from '../../lib/last-attendance.js';
import { DEFAULT_TZ, addDays, tzOr, wallToInstant } from '../../lib/tz.js';
import { buildVisitWhere, summarizeVisits, type VisitFilter } from '../../lib/visit-filter.js';
import { esc, sendCsv, sendPrintHtml, summaryCards } from '../../lib/print-report.js';

export const visitRouter = Router();

const jemaatLite = {
  id: true,
  namaLengkap: true,
  fotoUrl: true,
  noHp: true,
  cabang: { select: { id: true, nama: true } },
} as const;

// ============================================================
//  FILTER (dipakai list, ringkasan, export)
// ============================================================
//   Orang  : cabangId, homecellAreaId, homecellId, roleId, subRoleId,
//            subRoleStatusId, pelayananId, nama, side (any|initiator|target)
//   Visit  : q (judul/lokasi), catatan (ada|belum), jemaatId, search (lama)
//   Periode: periode (last_7d|this_week|last_week|last_30d|this_month|
//            last_month|custom) + from/to (YYYY-MM-DD). Tanpa periode tapi ada
//            from/to → custom (kompatibel dengan portal lama).
//   Tanggal periode dihitung di zona waktu cabang yang difilter (default WIB).

const PERIOD_LABEL: Record<string, string> = {
  last_7d: '7 hari terakhir',
  this_week: 'Minggu ini',
  last_week: 'Minggu lalu',
  last_30d: '30 hari terakhir',
  this_month: 'Bulan ini',
  last_month: 'Bulan lalu',
  custom: 'Rentang tanggal',
};
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function qs(req: Request, k: string): string | undefined {
  const v = req.query[k];
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}
function qid(req: Request, k: string): string | undefined {
  const v = qs(req, k);
  return v && UUID_RE.test(v) ? v : undefined;
}

async function parseVisitFilter(req: Request) {
  const cabangId = qid(req, 'cabangId');
  const side = qs(req, 'side');
  const catatan = qs(req, 'catatan');
  const filter: VisitFilter = {
    cabangId,
    homecellAreaId: qid(req, 'homecellAreaId'),
    homecellId: qid(req, 'homecellId'),
    roleId: qid(req, 'roleId'),
    subRoleId: qid(req, 'subRoleId'),
    subRoleStatusId: qid(req, 'subRoleStatusId'),
    pelayananId: qid(req, 'pelayananId'),
    nama: qs(req, 'nama'),
    side: side === 'initiator' || side === 'target' ? side : 'any',
    q: qs(req, 'q'),
    catatan: catatan === 'ada' || catatan === 'belum' ? catatan : undefined,
  };
  const from = qs(req, 'from');
  const to = qs(req, 'to');
  const preset = qs(req, 'periode') ?? (from || to ? 'custom' : undefined);
  const range = resolvePeriod(preset, from, to);
  const tz = cabangId
    ? tzOr((await prisma.cabangGereja.findUnique({ where: { id: cabangId }, select: { timezone: true } }))?.timezone)
    : DEFAULT_TZ;
  if (range) {
    filter.from = wallToInstant(range.from, 0, tz);
    filter.toExclusive = wallToInstant(addDays(range.to, 1), 0, tz);
  }
  const where = buildVisitWhere(filter);
  const extra: Prisma.VisitWhereInput[] = [];
  // Kompatibel: jemaatId & search lama (judul/lokasi/nama peserta).
  const jemaatId = qid(req, 'jemaatId');
  if (jemaatId) extra.push({ OR: [{ initiatorJemaatId: jemaatId }, { targetJemaatId: jemaatId }] });
  const search = qs(req, 'search');
  if (search) {
    extra.push({
      OR: [
        { judul: { contains: search, mode: 'insensitive' } },
        { lokasi: { contains: search, mode: 'insensitive' } },
        { initiator: { namaLengkap: { contains: search, mode: 'insensitive' } } },
        { target: { namaLengkap: { contains: search, mode: 'insensitive' } } },
      ],
    });
  }
  const finalWhere: Prisma.VisitWhereInput = extra.length ? { AND: [where, ...extra] } : where;
  const period = range
    ? { from: ymd(range.from), to: ymd(range.to), preset: preset!, label: PERIOD_LABEL[preset!] ?? '' }
    : null;
  return { filter, where: finalWhere, period, tz };
}

/** Label filter untuk judul export. */
async function filterLabels(f: VisitFilter): Promise<string[]> {
  const [cabang, area, hc, role, subRole, status, pel] = await Promise.all([
    f.cabangId ? prisma.cabangGereja.findUnique({ where: { id: f.cabangId }, select: { nama: true } }) : null,
    f.homecellAreaId ? prisma.homecellArea.findUnique({ where: { id: f.homecellAreaId }, select: { nama: true } }) : null,
    f.homecellId ? prisma.homecell.findUnique({ where: { id: f.homecellId }, select: { nama: true } }) : null,
    f.roleId ? prisma.role.findUnique({ where: { id: f.roleId }, select: { nama: true } }) : null,
    f.subRoleId ? prisma.subRole.findUnique({ where: { id: f.subRoleId }, select: { nama: true } }) : null,
    f.subRoleStatusId ? prisma.subRoleStatus.findUnique({ where: { id: f.subRoleStatusId }, select: { nama: true } }) : null,
    f.pelayananId ? prisma.pelayanan.findUnique({ where: { id: f.pelayananId }, select: { nama: true } }) : null,
  ]);
  const sideLabel = f.side === 'initiator' ? 'Pengunjung' : f.side === 'target' ? 'Yang dikunjungi' : null;
  const out = [
    cabang && `Cabang: ${cabang.nama}`,
    area && `Area: ${area.nama}`,
    hc && `Homecell: ${hc.nama}`,
    role && `Role: ${role.nama}`,
    subRole && `Sub role: ${subRole.nama}`,
    status && `Status: ${status.nama}`,
    pel && `Pelayanan: ${pel.nama}`,
    f.nama && `Nama: "${f.nama}"`,
    f.q && `Judul/lokasi: "${f.q}"`,
    f.catatan === 'ada' ? 'Ada catatan' : f.catatan === 'belum' ? 'Belum ada catatan' : null,
  ].filter(Boolean) as string[];
  if (sideLabel && out.length) out.unshift(`Berlaku untuk: ${sideLabel}`);
  return out;
}

const summarySelect = {
  initiatorJemaatId: true,
  targetJemaatId: true,
  noteDariInitiator: true,
  noteDariTarget: true,
  initiator: { select: { id: true, namaLengkap: true, cabang: { select: { nama: true } } } },
  target: { select: { id: true, namaLengkap: true, cabang: { select: { nama: true } } } },
} as const;

// ============================================================
//  LIST
// ============================================================
visitRouter.get('/', async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 25));
  const sortBy = qs(req, 'sortBy') === 'createdAt' ? 'createdAt' : 'tanggalVisit';
  const sortOrder = qs(req, 'sortOrder') === 'asc' ? 'asc' : 'desc';
  const { where } = await parseVisitFilter(req);

  const [rows, total] = await Promise.all([
    prisma.visit.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { [sortBy]: sortOrder },
      include: {
        initiator: { select: jemaatLite },
        target: { select: jemaatLite },
      },
    }),
    prisma.visit.count({ where }),
  ]);

  res.json({
    success: true,
    data: rows,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

// ============================================================
//  RINGKASAN (jumlah visit di filter ini + jemaat paling aktif)
// ============================================================
visitRouter.get('/summary', async (req, res) => {
  const { where, period } = await parseVisitFilter(req);
  const rows = await prisma.visit.findMany({ where, select: summarySelect, take: 50_000 });
  res.json({ success: true, data: { period, summary: summarizeVisits(rows, 10) } });
});

// ============================================================
//  EXPORT ?format=pdf|csv — mengikuti filter yang sama
// ============================================================
visitRouter.get('/export', async (req, res) => {
  const format = qs(req, 'format') === 'csv' ? 'csv' : 'pdf';
  const { where, period, filter, tz } = await parseVisitFilter(req);
  const [rows, labels] = await Promise.all([
    prisma.visit.findMany({
      where,
      orderBy: { tanggalVisit: 'desc' },
      take: 5000,
      include: {
        initiator: { select: { id: true, namaLengkap: true, cabang: { select: { nama: true } } } },
        target: { select: { id: true, namaLengkap: true, cabang: { select: { nama: true } } } },
      },
    }),
    filterLabels(filter),
  ]);
  const summary = summarizeVisits(rows, 15);
  const when = (d: Date) =>
    d.toLocaleString('id-ID', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const stamp = new Date().toISOString().slice(0, 10);

  if (format === 'csv') {
    sendCsv(res, `visit-${stamp}.csv`, [
      ['Tanggal & jam', 'Judul', 'Lokasi', 'Pengunjung', 'Cabang pengunjung', 'Dikunjungi', 'Cabang dikunjungi', 'Catatan pengunjung', 'Catatan dikunjungi'],
      ...rows.map((v) => [
        when(v.tanggalVisit),
        v.judul,
        v.lokasi ?? '',
        v.initiator.namaLengkap,
        v.initiator.cabang?.nama ?? '',
        v.target.namaLengkap,
        v.target.cabang?.nama ?? '',
        v.noteDariInitiator ?? '',
        v.noteDariTarget ?? '',
      ]),
    ]);
    return;
  }

  const body = `
${summaryCards([
  ['Jumlah visit', summary.total],
  ['Pengunjung (unik)', summary.pengunjungUnik],
  ['Dikunjungi (unik)', summary.dikunjungiUnik],
  ['Ada catatan', summary.denganCatatan],
])}
<h2>Jemaat paling aktif</h2>
${
  summary.top.length
    ? `<table><thead><tr><th>#</th><th>Nama</th><th>Cabang</th><th class="r">Mengunjungi</th><th class="r">Dikunjungi</th><th class="r">Total</th></tr></thead><tbody>${summary.top
        .map(
          (t, i) =>
            `<tr><td>${i + 1}</td><td>${esc(t.namaLengkap)}</td><td>${esc(t.cabang ?? '')}</td><td class="r">${t.sebagaiPengunjung}</td><td class="r">${t.sebagaiDikunjungi}</td><td class="r b">${t.total}</td></tr>`,
        )
        .join('')}</tbody></table>`
    : '<p class="muted">Tidak ada visit.</p>'
}
<h2>Daftar visit (${rows.length}${rows.length >= 5000 ? ', maks. 5000' : ''})</h2>
<table><thead><tr><th>Tanggal</th><th>Judul / lokasi</th><th>Pengunjung</th><th>Dikunjungi</th><th>Catatan</th></tr></thead><tbody>${rows
    .map(
      (v) =>
        `<tr><td>${esc(when(v.tanggalVisit))}</td><td><b>${esc(v.judul)}</b>${v.lokasi ? `<br><span class="muted">${esc(v.lokasi)}</span>` : ''}</td><td>${esc(v.initiator.namaLengkap)}<br><span class="muted">${esc(v.initiator.cabang?.nama ?? '')}</span></td><td>${esc(v.target.namaLengkap)}<br><span class="muted">${esc(v.target.cabang?.nama ?? '')}</span></td><td>${[
          v.noteDariInitiator ? `<b>${esc(v.initiator.namaLengkap)}:</b> ${esc(v.noteDariInitiator)}` : '',
          v.noteDariTarget ? `<b>${esc(v.target.namaLengkap)}:</b> ${esc(v.noteDariTarget)}` : '',
        ]
          .filter(Boolean)
          .join('<br>') || '<span class="muted">—</span>'}</td></tr>`,
    )
    .join('')}</tbody></table>`;
  sendPrintHtml(req, res, 'Laporan Visit', period, labels, body, `Waktu dalam zona ${tz}`);
});

// ============================================================
//  DETAIL
// ============================================================
visitRouter.get('/:id', async (req, res) => {
  const visit = await prisma.visit.findUnique({
    where: { id: req.params.id },
    include: {
      initiator: { select: jemaatLite },
      target: { select: jemaatLite },
    },
  });
  if (!visit) throw NotFound('Visit tidak ditemukan');
  res.json({ success: true, data: visit });
});

// ============================================================
//  DELETE (moderation)
// ============================================================
visitRouter.delete('/:id', async (req, res) => {
  const before = await prisma.visit.findUnique({
    where: { id: req.params.id },
    include: {
      initiator: { select: { namaLengkap: true } },
      target: { select: { namaLengkap: true } },
    },
  });
  if (!before) throw NotFound('Visit tidak ditemukan');

  await prisma.visit.delete({ where: { id: before.id } });
  audit(req, {
    action: 'DELETE',
    resource: 'visit',
    resourceId: before.id,
    resourceLabel: `[moderation] ${before.initiator.namaLengkap} ↔ ${before.target.namaLengkap}: ${before.judul}`,
    before,
  });
  res.status(204).end();
});
