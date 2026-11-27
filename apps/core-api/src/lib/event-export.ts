/**
 * Export laporan SATU event (2026-11) — Portal → detail event → Export, dan
 * Laporan Event bila satu event dipilih.
 *
 *   format=pdf : tampilan cetak (Save as PDF) — ringkasan, cara check-in,
 *                daftar lengkap peserta (no HP → WhatsApp "Hi, <nama>", email
 *                → mailto), pembayaran, ulasan, "Powered by IDEA".
 *   format=csv : Excel — satu baris per peserta + ringkasan.
 */
import type { Request, Response } from 'express';
import { prisma } from '@ecc/database';
import { NotFound } from './errors.js';
import { esc, sendCsv, summaryCards } from './print-report.js';
import { CHECKIN_METHODS, METHOD_LABEL, type CheckinMethod } from './attendance-report.js';
import { paymentStatusOf, type PaymentStatus } from './event-payment.js';
import { buildReviewReport, eventReviews } from './service-review.js';
import { eventDateLabel, jamWithZone, tzOr } from './tz.js';
import { xi, type ExportIcon } from './export-icons.js';
import { buildEventVisual } from './event-visual.js';
import { eventVisualHtml } from './visual-html.js';
import { VISUAL_CSS } from './visual-svg.js';
import { ideaLogoSvg } from './idea-logo.js';

const STATUS_LABEL: Record<string, string> = {
  DAFTAR: 'Terdaftar',
  MENUNGGU_VERIFIKASI: 'Menunggu verifikasi',
  BAYAR: 'Lunas',
  HADIR: 'Hadir',
  BATAL: 'Batal',
};
const PAY_LABEL: Record<PaymentStatus, string> = {
  GRATIS: '',
  LUNAS: 'Lunas',
  MENUNGGU: 'Menunggu verifikasi',
  BELUM_BAYAR: 'Belum bayar',
};
const KATEGORI_LABEL: Record<string, string> = { NEW_COMER: 'New Comer', VISITOR: 'Visitor' };
const STATUS_ORDER: Record<string, number> = { HADIR: 0, BAYAR: 1, MENUNGGU_VERIFIKASI: 2, DAFTAR: 3, BATAL: 4 };

const rupiah = (n: number) => `Rp ${Math.round(n).toLocaleString('id-ID')}`;

export async function eventExportData(eventId: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(eventId)) throw NotFound('Event tidak ditemukan');
  const ev = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      judul: true,
      tanggalMulai: true,
      tanggalSelesai: true,
      jamMulai: true,
      jamSelesai: true,
      lokasi: true,
      heroImageUrl: true,
      tipeBayar: true,
      nominal: true,
      quotaPeserta: true,
      butuhKehadiran: true,
      cabang: { select: { nama: true, kota: true, timezone: true } },
      sinode: { select: { nama: true } },
    },
  });
  if (!ev) throw NotFound('Event tidak ditemukan');
  const tz = tzOr(ev.cabang?.timezone);

  const parts = await prisma.eventParticipation.findMany({
    where: { eventId },
    orderBy: [{ registeredAt: 'asc' }],
    select: {
      id: true,
      status: true,
      registeredAt: true,
      attendedAt: true,
      checkinMethod: true,
      checkedInBy: true,
      addedVia: true,
      guestSource: true,
      invitedByJemaatId: true,
      nominalBayar: true,
      catatan: true,
      cancelReason: true,
      donations: { select: { status: true, nominalBayar: true, tambahan: true } },
      jemaat: {
        select: { namaLengkap: true, kode: true, noHp: true, email: true, isTamu: true, tamuKategori: true, cabang: { select: { nama: true } } },
      },
    },
  });

  // Nama petugas scan (users) & pengundang tamu.
  const userIds = [...new Set(parts.map((p) => p.checkedInBy).filter((x): x is string => !!x))];
  const inviterIds = [...new Set(parts.map((p) => p.invitedByJemaatId).filter((x): x is string => !!x))];
  const [users, inviters] = await Promise.all([
    userIds.length
      ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, jemaat: { select: { namaLengkap: true } } } })
      : [],
    inviterIds.length ? prisma.jemaat.findMany({ where: { id: { in: inviterIds } }, select: { id: true, namaLengkap: true } }) : [],
  ]);
  const petugasBy = new Map(users.map((u) => [u.id, u.jemaat?.namaLengkap ?? null]));
  const inviterBy = new Map(inviters.map((j) => [j.id, j.namaLengkap]));

  const paid = ev.tipeBayar !== 'GRATIS';
  const rows = parts
    .map((p) => {
      const payment = paymentStatusOf(ev, p);
      const hasPrimary = p.donations.some((d) => !d.tambahan);
      const lunas = p.status === 'BAYAR' || p.status === 'HADIR';
      const confirmed =
        (lunas && !hasPrimary ? Number(p.nominalBayar ?? 0) : 0) +
        p.donations.filter((d) => d.status === 'BAYAR').reduce((a, d) => a + Number(d.nominalBayar), 0);
      const pending = p.donations.filter((d) => d.status === 'MENUNGGU_VERIFIKASI').reduce((a, d) => a + Number(d.nominalBayar), 0)
        + (p.status === 'MENUNGGU_VERIFIKASI' && !hasPrimary ? Number(p.nominalBayar ?? 0) : 0);
      const method = (p.status === 'HADIR' ? (p.checkinMethod ?? 'UNKNOWN') : null) as CheckinMethod | null;
      const label = p.jemaat.isTamu
        ? `Tamu${p.jemaat.tamuKategori ? ` · ${KATEGORI_LABEL[p.jemaat.tamuKategori] ?? p.jemaat.tamuKategori}` : ''}${
            p.guestSource === 'WALK_IN' ? ' · walk-in' : p.invitedByJemaatId ? ` · dibawa ${inviterBy.get(p.invitedByJemaatId) ?? '—'}` : ''
          }`
        : p.addedVia === 'PORTAL'
          ? 'Didaftarkan admin (Portal)'
          : p.checkinMethod === 'WALK_IN'
            ? 'Walk-in'
            : '';
      return {
        nama: p.jemaat.namaLengkap,
        kode: p.jemaat.kode ?? '',
        noHp: p.jemaat.noHp ?? '',
        email: p.jemaat.email ?? '',
        cabang: p.jemaat.cabang?.nama ?? '',
        isTamu: p.jemaat.isTamu,
        keterangan: label,
        status: p.status,
        statusLabel: p.status === 'BATAL' && p.cancelReason === 'NO_SHOW' ? 'Batal (tidak hadir)' : (STATUS_LABEL[p.status] ?? p.status),
        daftar: p.registeredAt,
        hadirAt: p.status === 'HADIR' ? p.attendedAt : null,
        metode: method ? METHOD_LABEL[method] ?? method : '',
        petugas: p.checkedInBy && (method === 'SCAN' || method === 'LATE' || method === 'MANUAL' || method === 'WALK_IN') ? (petugasBy.get(p.checkedInBy) ?? '') : '',
        payment: paid ? PAY_LABEL[payment] : '',
        nominalConfirmed: confirmed,
        nominalPending: pending,
        catatan: p.catatan ?? '',
        methodKey: method,
      };
    })
    // Hadir: check-in terbaru paling atas; status lain urut nama.
    .sort(
      (a, b) =>
        (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9) ||
        (a.status === 'HADIR' ? (b.hadirAt?.getTime() ?? 0) - (a.hadirAt?.getTime() ?? 0) : a.nama.localeCompare(b.nama)),
    );

  const active = rows.filter((r) => r.status !== 'BATAL');
  const hadir = rows.filter((r) => r.status === 'HADIR');
  const methods = Object.fromEntries(CHECKIN_METHODS.map((m) => [m, hadir.filter((r) => r.methodKey === m).length])) as Record<CheckinMethod, number>;
  const rv = buildReviewReport(await eventReviews([eventId]), (r) => r.eventId);

  return {
    ev,
    tz,
    paid,
    rows,
    reviews: { overall: rv.overall, perItem: [], comments: rv.comments.map((c) => ({ ...c, label: ev.judul })) },
    summary: {
      terdaftar: active.length,
      hadir: hadir.length,
      belumHadir: active.length - hadir.length,
      batal: rows.length - active.length,
      persenHadir: active.length ? Math.round((hadir.length / active.length) * 100) : null,
      tamuTerdaftar: active.filter((r) => r.isTamu).length,
      tamuHadir: hadir.filter((r) => r.isTamu).length,
      lunas: active.filter((r) => r.payment === 'Lunas').length,
      menunggu: active.filter((r) => r.payment === 'Menunggu verifikasi').length,
      belumBayar: active.filter((r) => r.payment === 'Belum bayar').length,
      totalConfirmed: rows.reduce((a, r) => a + r.nominalConfirmed, 0),
      totalPending: rows.reduce((a, r) => a + r.nominalPending, 0),
      methods,
    },
  };
}

type ExportData = Awaited<ReturnType<typeof eventExportData>>;

const dt = (d: Date | null, tz: string, withDate = true) =>
  d
    ? d.toLocaleString('id-ID', {
        ...(withDate ? { day: '2-digit', month: 'short', year: 'numeric' } : {}),
        hour: '2-digit',
        minute: '2-digit',
        timeZone: tz,
      })
    : '';

/** No HP → WhatsApp & email → mailto, sapaan "Hi, <nama>". */
function contactHtml(noHp: string, email: string, nama: string): string {
  const hi = `Hi, ${nama.trim()}`;
  let d = noHp.replace(/\D/g, '');
  if (d.startsWith('0')) d = `62${d.slice(1)}`;
  else if (d.startsWith('8')) d = `62${d}`;
  const phone = noHp
    ? d.length >= 8
      ? `<a class="lnk wa" href="https://wa.me/${d}?text=${encodeURIComponent(`${hi} `)}" target="_blank" rel="noopener">${esc(noHp)}</a>`
      : esc(noHp)
    : '';
  const mail = email ? `<a class="lnk" href="mailto:${esc(email)}?body=${encodeURIComponent(`${hi},\n\n`)}">${esc(email)}</a>` : '';
  return [phone, mail].filter(Boolean).join('<br>');
}

function eventMeta(d: ExportData): string[] {
  const { ev, tz } = d;
  const tgl =
    eventDateLabel(ev.tanggalMulai, tz) + (ev.tanggalSelesai && ev.tanggalSelesai.getTime() !== ev.tanggalMulai.getTime() ? ` – ${eventDateLabel(ev.tanggalSelesai, tz)}` : '');
  return [
    ev.judul,
    `${tgl} · ${jamWithZone(ev.jamMulai, ev.jamSelesai, tz, ev.cabang)}`,
    ev.lokasi ?? '',
    ev.cabang ? `Cabang ${ev.cabang.nama}` : ev.sinode ? `Sinode ${ev.sinode.nama}` : 'Global',
  ].filter(Boolean);
}

export function eventPesertaCsvLines(d: ExportData): unknown[][] {
  return [
    ['No', 'Nama', 'Kode', 'No HP', 'Email', 'Cabang', 'Keterangan', 'Status', 'Terdaftar', 'Hadir', 'Cara check-in', 'Petugas', ...(d.paid ? ['Pembayaran', 'Nominal terverifikasi', 'Nominal menunggu'] : []), 'Catatan'],
    ...d.rows.map((r, i) => [
      i + 1,
      r.nama,
      r.kode,
      r.noHp,
      r.email,
      r.cabang,
      r.keterangan,
      r.statusLabel,
      dt(r.daftar, d.tz),
      dt(r.hadirAt, d.tz),
      r.metode,
      r.petugas,
      ...(d.paid ? [r.payment, r.nominalConfirmed || '', r.nominalPending || ''] : []),
      r.catatan,
    ]),
  ];
}

export function eventPesertaTableHtml(d: ExportData): string {
  if (!d.rows.length) return '<p class="muted">Belum ada peserta.</p>';
  return `<style>
  a.lnk { color: #0f172a; text-decoration: none; } a.lnk.wa { color: #15803d; font-weight: 600; }
  .tag { display: inline-block; padding: 0 5px; border-radius: 6px; font-size: 8.5px; font-weight: 600; }
  .st-HADIR { background: #dcfce7; color: #15803d; } .st-BAYAR { background: #dbeafe; color: #1d4ed8; }
  .st-MENUNGGU_VERIFIKASI { background: #fef3c7; color: #b45309; } .st-DAFTAR { background: #f1f5f9; color: #334155; }
  .st-BATAL { background: #fee2e2; color: #b91c1c; } .tamu { color: #7c3aed; } .no { color: #94a3b8; width: 18px; }
  tr { page-break-inside: avoid; }
</style>
<table><thead><tr><th>#</th><th>Nama</th><th>Kontak</th><th>Cabang</th><th>Status</th><th>Hadir</th><th>Cara check-in</th>${
    d.paid ? '<th>Pembayaran</th><th class="r">Nominal</th>' : ''
  }<th>Catatan</th></tr></thead><tbody>
${d.rows
  .map(
    (r, i) => `<tr><td class="no">${i + 1}</td><td><b>${esc(r.nama)}</b>${r.kode ? ` <span class="muted">${esc(r.kode)}</span>` : ''}${
      r.keterangan ? `<div class="${r.isTamu ? 'tamu' : 'muted'}">${esc(r.keterangan)}</div>` : ''
    }<div class="muted">Daftar ${esc(dt(r.daftar, d.tz))}</div></td><td>${contactHtml(r.noHp, r.email, r.nama)}</td><td>${esc(r.cabang)}</td><td><span class="tag st-${esc(r.status)}">${esc(r.statusLabel)}</span></td><td>${esc(dt(r.hadirAt, d.tz))}</td><td>${esc(r.metode)}${
      r.petugas ? `<div class="muted">oleh ${esc(r.petugas)}</div>` : ''
    }</td>${
      d.paid
        ? `<td>${esc(r.payment)}</td><td class="r">${r.nominalConfirmed ? rupiah(r.nominalConfirmed) : ''}${
            r.nominalPending ? `<div class="muted">${rupiah(r.nominalPending)} menunggu</div>` : ''
          }</td>`
        : ''
    }<td class="muted">${esc(r.catatan)}</td></tr>`,
  )
  .join('')}
</tbody></table>`;
}

export function eventSummaryHtml(d: ExportData): string {
  const s = d.summary;
  const cards: [string, string | number][] = [
    ['Terdaftar', `${s.terdaftar}${d.ev.quotaPeserta != null ? ` / ${d.ev.quotaPeserta}` : ''}`],
    ['Hadir', s.hadir],
    ['% Hadir', s.persenHadir != null ? `${s.persenHadir}%` : '—'],
    ['Belum hadir', s.belumHadir],
    ['Batal', s.batal],
    ['Tamu hadir', `${s.tamuHadir} / ${s.tamuTerdaftar}`],
  ];
  if (d.paid) cards.push(['Terverifikasi', rupiah(s.totalConfirmed)]);
  if (d.reviews.overall.count) cards.push(['Rating', `${d.reviews.overall.avg} ★ (${d.reviews.overall.count})`]);
  const total = CHECKIN_METHODS.reduce((n, k) => n + s.methods[k], 0);
  const meth = total
    ? `<div class="meth"><b>Cara check-in:</b> ${CHECKIN_METHODS.filter((k) => s.methods[k] > 0)
        .map((k) => `${esc(METHOD_LABEL[k])} ${s.methods[k]}`)
        .join(' · ')}</div>`
    : '';
  const pay = d.paid
    ? `<div class="meth" style="margin-top:4px"><b>Pembayaran:</b> Lunas ${s.lunas} · Menunggu verifikasi ${s.menunggu}${
        s.totalPending ? ` (${rupiah(s.totalPending)})` : ''
      } · Belum bayar ${s.belumBayar}</div>`
    : '';
  return `${summaryCards(cards)}${meth}${pay}`;
}

export async function sendEventExport(req: Request, res: Response, eventId: string, format: string) {
  const d = await eventExportData(eventId);
  const slug = d.ev.judul.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'event';
  if (format === 'csv' || format === 'excel' || format === 'xlsx') {
    const s = d.summary;
    const lines: unknown[][] = [
      ['LAPORAN EVENT', ...eventMeta(d)],
      ['Terdaftar', s.terdaftar, 'Hadir', s.hadir, '% Hadir', s.persenHadir ?? '', 'Belum hadir', s.belumHadir, 'Batal', s.batal, 'Tamu hadir', s.tamuHadir],
      ...(d.paid ? [['Lunas', s.lunas, 'Menunggu verifikasi', s.menunggu, 'Belum bayar', s.belumBayar, 'Total terverifikasi', s.totalConfirmed, 'Total menunggu', s.totalPending]] : []),
      ['Cara check-in', ...CHECKIN_METHODS.flatMap((m) => [METHOD_LABEL[m], s.methods[m]])],
      [],
      ...eventPesertaCsvLines(d),
      ...(d.reviews.comments.length
        ? [[], ['ULASAN', 'Rating', 'Nama', 'Komentar'], ...d.reviews.comments.map((c) => ['', c.rating, c.nama, c.komentar ?? ''])]
        : []),
    ];
    return sendCsv(res, `event-${slug}.csv`, lines);
  }
  // Visualisasi Daftar & Absen (sama dengan tab di Portal). Gagal → laporan tetap jadi.
  let visual = '';
  try {
    const v = await buildEventVisual(eventId);
    const days = v.event.butuhKehadiran ? v.absensi.hari.filter((h) => h.hadir > 0).slice(0, 3) : [];
    const per =
      days.length <= 1
        ? [v.absensi]
        : await Promise.all(days.map((h) => (h.tanggal === v.absensi.tanggal ? v.absensi : buildEventVisual(eventId, h.tanggal).then((x) => x.absensi))));
    visual = eventVisualHtml(v, per);
  } catch {
    visual = '';
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(renderEventPdf(req, d, visual));
}

// ============================================================ PDF (tampilan cetak)

const METHOD_COLOR: Record<CheckinMethod, string> = {
  SCAN: '#EA580C',
  SELF: '#0EA5E9',
  WALK_IN: '#7C3AED',
  LATE: '#F59E0B',
  MANUAL: '#64748B',
  UNKNOWN: '#A3A3A3',
};
const STATUS_STYLE: Record<string, [string, string]> = {
  HADIR: ['#DCFCE7', '#15803D'],
  BAYAR: ['#DBEAFE', '#1D4ED8'],
  MENUNGGU_VERIFIKASI: ['#FEF3C7', '#B45309'],
  DAFTAR: ['#F1F5F9', '#334155'],
  BATAL: ['#FEE2E2', '#B91C1C'],
};

/** Laporan satu event yang rapi untuk dicetak / disimpan PDF (A4 landscape). */
export function renderEventPdf(req: Request, d: ExportData, visualHtml = ''): string {
  const { ev, tz, summary: s } = d;
  const isMobileUa = /mobi|android|iphone|ipad|ipod/.test((req.get('user-agent') ?? '').toLowerCase());
  const apiBase = (process.env.PUBLIC_API_URL ?? `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  const portalUrl = (process.env.PORTAL_URL ?? 'https://portal.eccchurch.global').replace(/\/$/, '');
  const hero = ev.heroImageUrl ? (/^https?:/.test(ev.heroImageUrl) ? ev.heroImageUrl : `${apiBase}${ev.heroImageUrl}`) : null;
  const tgl =
    eventDateLabel(ev.tanggalMulai, tz) +
    (ev.tanggalSelesai && ev.tanggalSelesai.getTime() !== ev.tanggalMulai.getTime() ? ` – ${eventDateLabel(ev.tanggalSelesai, tz)}` : '');
  const target = ev.cabang ? `Cabang ${ev.cabang.nama}` : ev.sinode ? `Sinode ${ev.sinode.nama}` : 'Semua cabang';
  const nf = (n: number) => n.toLocaleString('id-ID');
  const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);

  const kpi = (icon: ExportIcon, color: string, label: string, value: string, sub: string, bar?: number) => `
<div class="kpi"><div class="kpi-ic" style="background:${color}1A">${xi(icon, 16, color)}</div>
<div class="kpi-b"><div class="kpi-v">${value}</div><div class="kpi-l">${esc(label)}</div>${sub ? `<div class="kpi-s">${sub}</div>` : ''}
${bar != null ? `<div class="mini"><span style="width:${Math.min(100, bar)}%;background:${color}"></span></div>` : ''}</div></div>`;

  const quota = ev.quotaPeserta ? ` / ${nf(ev.quotaPeserta)}` : '';
  const kpis = [
    kpi('users', '#EA580C', 'Terdaftar aktif', `${nf(s.terdaftar)}${quota}`, ev.quotaPeserta ? `${pct(s.terdaftar, ev.quotaPeserta)}% kuota` : 'tanpa batas kuota', ev.quotaPeserta ? pct(s.terdaftar, ev.quotaPeserta) : undefined),
    ...(ev.butuhKehadiran
      ? [
          kpi('userCheck', '#15803D', 'Hadir', nf(s.hadir), `${s.persenHadir ?? 0}% dari terdaftar`, s.persenHadir ?? 0),
          kpi('hourglass', '#B45309', 'Belum hadir', nf(s.belumHadir), ''),
        ]
      : []),
    kpi('x', '#DC2626', 'Batal', nf(s.batal), ''),
    kpi('userPlus', '#7C3AED', 'Tamu', `${nf(s.tamuHadir)} / ${nf(s.tamuTerdaftar)}`, 'hadir / terdaftar'),
    ...(d.paid ? [kpi('wallet', '#1D4ED8', 'Terverifikasi', `Rp ${nf(s.totalConfirmed)}`, s.totalPending ? `Rp ${nf(s.totalPending)} menunggu` : `${nf(s.lunas)} lunas`)] : []),
    ...(d.reviews.overall.count ? [kpi('star', '#F59E0B', 'Rating', `${d.reviews.overall.avg} ★`, `${d.reviews.overall.count} ulasan`)] : []),
  ];

  // Komposisi kehadiran (bar bertumpuk) + cara check-in.
  const totalAll = Math.max(1, s.terdaftar + s.batal);
  const seg = (n: number, color: string, label: string) =>
    n ? `<span style="width:${(n / totalAll) * 100}%;background:${color}" title="${esc(label)} ${n}"></span>` : '';
  const legend = (color: string, label: string, n: number) => `<span class="lg"><i style="background:${color}"></i>${esc(label)} <b>${nf(n)}</b></span>`;
  const methodTotal = CHECKIN_METHODS.reduce((a, m) => a + s.methods[m], 0);
  const methodRows = CHECKIN_METHODS.filter((m) => s.methods[m] > 0)
    .map(
      (m) => `<div class="mrow"><span class="ml">${esc(METHOD_LABEL[m])}</span><span class="mbar"><span style="width:${pct(s.methods[m], methodTotal)}%;background:${METHOD_COLOR[m]}"></span></span><span class="mv">${nf(s.methods[m])}</span></div>`,
    )
    .join('');
  const panels = `
<div class="panels">
  <div class="panel">
    <div class="pt">${xi('users', 12, '#9A3412')} Komposisi peserta</div>
    <div class="stack">${seg(s.hadir, '#16A34A', 'Hadir')}${seg(s.belumHadir, '#F59E0B', 'Belum hadir')}${seg(s.batal, '#EF4444', 'Batal')}</div>
    <div class="lgs">${ev.butuhKehadiran ? legend('#16A34A', 'Hadir', s.hadir) + legend('#F59E0B', 'Belum hadir', s.belumHadir) : legend('#F59E0B', 'Terdaftar', s.terdaftar)}${legend('#EF4444', 'Batal', s.batal)}</div>
  </div>
  ${
    ev.butuhKehadiran
      ? `<div class="panel"><div class="pt">${xi('scan', 12, '#9A3412')} Cara check-in</div>${methodRows || '<div class="muted">Belum ada yang hadir.</div>'}</div>`
      : ''
  }
  ${
    d.paid
      ? `<div class="panel"><div class="pt">${xi('wallet', 12, '#9A3412')} Pembayaran</div>
      <div class="mrow"><span class="ml">Lunas</span><span class="mbar"><span style="width:${pct(s.lunas, s.terdaftar)}%;background:#16A34A"></span></span><span class="mv">${nf(s.lunas)}</span></div>
      <div class="mrow"><span class="ml">Menunggu verifikasi</span><span class="mbar"><span style="width:${pct(s.menunggu, s.terdaftar)}%;background:#F59E0B"></span></span><span class="mv">${nf(s.menunggu)}</span></div>
      <div class="mrow"><span class="ml">Belum bayar</span><span class="mbar"><span style="width:${pct(s.belumBayar, s.terdaftar)}%;background:#EF4444"></span></span><span class="mv">${nf(s.belumBayar)}</span></div>
      <div class="muted" style="margin-top:4px">Terverifikasi <b>Rp ${nf(s.totalConfirmed)}</b>${s.totalPending ? ` · menunggu Rp ${nf(s.totalPending)}` : ''}</div></div>`
      : ''
  }
</div>`;

  const dtf = (x: Date | null, withDate = true) =>
    x
      ? x.toLocaleString('id-ID', {
          ...(withDate ? { day: '2-digit', month: 'short' } : {}),
          hour: '2-digit',
          minute: '2-digit',
          timeZone: tz,
        })
      : '';
  const rowsHtml = d.rows
    .map((r, i) => {
      const [bg, fg] = STATUS_STYLE[r.status] ?? ['#F1F5F9', '#334155'];
      return `<tr>
  <td class="no">${i + 1}</td>
  <td><div class="nm">${esc(r.nama)}</div><div class="sub">${esc(r.kode)}${r.cabang ? ` · ${esc(r.cabang)}` : ''}</div>${r.keterangan ? `<div class="tag ${r.isTamu ? 'tamu' : ''}">${esc(r.keterangan)}</div>` : ''}</td>
  <td>${contactHtml(r.noHp, r.email, r.nama)}</td>
  <td><span class="bd" style="background:${bg};color:${fg}">${esc(r.statusLabel)}</span><div class="sub">Daftar ${esc(dtf(r.daftar))}</div></td>
  <td>${r.hadirAt ? `<div class="ok">${xi('check', 10, '#15803D')} ${esc(dtf(r.hadirAt))}</div><div class="sub">${esc(r.metode)}${r.petugas ? ` · ${esc(r.petugas)}` : ''}</div>` : '<span class="sub">—</span>'}</td>
  ${d.paid ? `<td>${r.payment ? `<div>${esc(r.payment)}</div>` : ''}${r.nominalConfirmed ? `<div class="sub">Rp ${nf(r.nominalConfirmed)}</div>` : ''}${r.nominalPending ? `<div class="sub warn">Rp ${nf(r.nominalPending)} menunggu</div>` : ''}</td>` : ''}
  <td class="sub">${esc(r.catatan)}</td>
</tr>`;
    })
    .join('');

  const stars = (v: number) => `<span class="stars">${'★'.repeat(Math.round(v))}<span>${'★'.repeat(5 - Math.round(v))}</span></span>`;
  const reviews = d.reviews.overall.count
    ? `<h2>${xi('star', 13, '#C2410C')} Ulasan jemaat</h2>
<div class="rv-head"><div class="rv-avg">${d.reviews.overall.avg}</div><div>${stars(d.reviews.overall.avg ?? 0)}<div class="sub">${nf(d.reviews.overall.count)} ulasan · ${nf(d.reviews.overall.withComment)} dengan komentar</div></div></div>
<div class="rv-grid">${d.reviews.comments
        .slice(0, 24)
        .map((c) => `<div class="rv">${stars(c.rating)}<div class="rv-t">“${esc(c.komentar ?? '')}”</div><div class="sub">— ${esc(c.isAnonim ? 'Anonim' : c.nama)}</div></div>`)
        .join('')}</div>`
    : '';

  return `<!doctype html>
<html lang="id"><head><meta charset="utf-8"><title>Laporan Event — ${esc(ev.judul)}</title>
<style>
  @page { size: A4 landscape; margin: 10mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 9.5px; color: #171717; margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .wrap { padding: 8mm; }
  .hero { display: flex; align-items: stretch; gap: 16px; padding: 14px; border-radius: 16px; background: linear-gradient(135deg, #F97316, #C2410C); color: #fff; }
  .hero-img { width: 190px; min-height: 110px; border-radius: 12px; background: rgba(255,255,255,.15) center/contain no-repeat; flex-shrink: 0; }
  .hero-b { flex: 1; display: flex; flex-direction: column; justify-content: center; min-width: 0; }
  .eyebrow { font-size: 9px; letter-spacing: 1.2px; text-transform: uppercase; opacity: .85; font-weight: 700; }
  .hero h1 { font-size: 21px; margin: 3px 0 7px; line-height: 1.2; }
  .hero .meta { display: flex; flex-wrap: wrap; gap: 6px; }
  .pill { display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: 999px; background: rgba(255,255,255,.18); font-size: 10px; }
  .logo { background: #fff; border-radius: 10px; padding: 6px 9px; display: flex; align-items: center; align-self: flex-start; }
  .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(128px, 1fr)); gap: 8px; margin: 12px 0; }
  .kpi { display: flex; gap: 8px; align-items: flex-start; padding: 9px 10px; border: 1px solid #EDEDED; border-radius: 12px; background: #fff; }
  .kpi-ic { width: 30px; height: 30px; border-radius: 9px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .kpi-b { flex: 1; min-width: 0; }
  .kpi-v { font-size: 15px; font-weight: 800; line-height: 1.15; }
  .kpi-l { font-size: 9px; color: #525252; font-weight: 600; }
  .kpi-s { font-size: 8.5px; color: #A3A3A3; }
  .mini { height: 4px; background: #F1F5F9; border-radius: 4px; margin-top: 4px; overflow: hidden; } .mini span { display: block; height: 100%; border-radius: 4px; }
  .panels { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 8px; margin-bottom: 12px; }
  .panel { border: 1px solid #FED7AA; background: #FFF7ED; border-radius: 12px; padding: 10px 12px; }
  .pt { font-size: 10px; font-weight: 800; color: #9A3412; text-transform: uppercase; letter-spacing: .4px; display: flex; align-items: center; gap: 5px; margin-bottom: 8px; }
  .stack { display: flex; height: 12px; border-radius: 999px; overflow: hidden; background: #fff; }
  .lgs { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 7px; }
  .lg { display: inline-flex; align-items: center; gap: 4px; color: #525252; } .lg i { width: 8px; height: 8px; border-radius: 3px; display: inline-block; }
  .mrow { display: flex; align-items: center; gap: 8px; margin: 3px 0; }
  .ml { width: 110px; color: #525252; } .mv { width: 34px; text-align: right; font-weight: 700; }
  .mbar { flex: 1; height: 7px; background: #fff; border-radius: 99px; overflow: hidden; } .mbar span { display: block; height: 100%; border-radius: 99px; }
  h2 { font-size: 12.5px; margin: 14px 0 7px; display: flex; align-items: center; gap: 6px; color: #171717; }
  table { border-collapse: separate; border-spacing: 0; width: 100%; border: 1px solid #EDEDED; border-radius: 12px; overflow: hidden; }
  thead th { background: #FFF7ED; color: #9A3412; font-size: 9px; text-transform: uppercase; letter-spacing: .3px; text-align: left; padding: 6px 7px; border-bottom: 1px solid #FED7AA; }
  thead { display: table-header-group; }
  td { padding: 5px 7px; border-bottom: 1px solid #F5F5F5; vertical-align: top; }
  tbody tr:nth-child(even) td { background: #FAFAFA; } tbody tr { page-break-inside: avoid; }
  td.no { color: #A3A3A3; width: 22px; }
  .nm { font-weight: 700; font-size: 10px; } .sub { color: #737373; font-size: 8.5px; margin-top: 1px; } .warn { color: #B45309; }
  .tag { display: inline-block; margin-top: 2px; font-size: 8px; font-weight: 700; color: #525252; background: #F5F5F5; border-radius: 6px; padding: 0 5px; } .tag.tamu { color: #6D28D9; background: #EDE9FE; }
  .bd { display: inline-block; padding: 1px 7px; border-radius: 999px; font-size: 8.5px; font-weight: 700; }
  .ok { display: inline-flex; align-items: center; gap: 3px; color: #15803D; font-weight: 700; }
  a.lnk { color: #171717; text-decoration: none; } a.lnk.wa { color: #15803D; font-weight: 600; }
  .muted { color: #737373; }
  .rv-head { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; } .rv-avg { font-size: 26px; font-weight: 800; color: #C2410C; }
  .stars { color: #F59E0B; letter-spacing: 1px; } .stars span { color: #E5E5E5; }
  .rv-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; } .rv { border: 1px solid #EDEDED; border-radius: 10px; padding: 8px 10px; page-break-inside: avoid; } .rv-t { margin: 3px 0; }
  .footer-row { display: flex; align-items: center; justify-content: space-between; margin-top: 14px; padding-top: 8px; border-top: 1px solid #EDEDED; font-size: 9px; color: #A3A3A3; }
  .powered { display: flex; align-items: center; gap: 6px; color: #737373; }
  .noprint { padding: 10px; background: #fff7ed; border-bottom: 1px solid #fed7aa; font-size: 13px; }
  .noprint button { padding: 6px 12px; background: #ea580c; color: white; border: none; border-radius: 6px; font-size: 13px; cursor: pointer; margin-left: 8px; }
  @media print { .noprint { display: none !important; } .wrap { padding: 0; } }
${VISUAL_CSS}
</style></head><body>
${isMobileUa ? '' : `<div class="noprint"><strong>Pratinjau — Laporan Event</strong> · Tekan <kbd>Ctrl/Cmd + P</kbd> untuk simpan sebagai PDF.<button onclick="window.print()">Print / Simpan PDF</button></div>`}
${isMobileUa ? '<script>setTimeout(() => window.print(), 800);</script>' : ''}
<div class="wrap">
<div class="hero">
  ${hero ? `<div class="hero-img" style="background-image:url('${esc(hero)}')"></div>` : ''}
  <div class="hero-b">
    <div class="eyebrow">Laporan Event</div>
    <h1>${esc(ev.judul)}</h1>
    <div class="meta">
      <span class="pill">${xi('calendar', 11)} ${esc(tgl)}</span>
      <span class="pill">${xi('clock', 11)} ${esc(jamWithZone(ev.jamMulai, ev.jamSelesai, tz, ev.cabang))}</span>
      ${ev.lokasi && ev.lokasi.trim() !== '-' ? `<span class="pill">${xi('mapPin', 11)} ${esc(ev.lokasi)}</span>` : ''}
      <span class="pill">${xi('building', 11)} ${esc(target)}</span>
      <span class="pill">${xi('ticket', 11)} ${esc(ev.tipeBayar === 'GRATIS' ? 'Gratis' : ev.tipeBayar === 'NOMINAL_BEBAS' ? 'Sukarela' : `Rp ${nf(Number(ev.nominal ?? 0))}`)}</span>
    </div>
  </div>
  <div class="logo"><img src="${portalUrl}/logo-ecc-church.webp" alt="ECC" onerror="this.parentElement.style.display='none'" style="height:28px;width:auto"/></div>
</div>
<div class="kpis">${kpis.join('')}</div>
${panels}
${visualHtml ? `<h2>${xi('chart', 13, '#C2410C')} Visualisasi Daftar &amp; Absen</h2>${visualHtml}` : ''}
<h2>${xi('users', 13, '#C2410C')} Daftar peserta (${nf(d.rows.length)})</h2>
<table>
<thead><tr><th>#</th><th>Peserta</th><th>Kontak</th><th>Status</th><th>Check-in</th>${d.paid ? '<th>Pembayaran</th>' : ''}<th>Catatan</th></tr></thead>
<tbody>${rowsHtml || `<tr><td colspan="${d.paid ? 7 : 6}" style="text-align:center;color:#A3A3A3;padding:16px">Belum ada peserta.</td></tr>`}</tbody>
</table>
${reviews}
<div class="footer-row">
  <div>© ${new Date().getFullYear()} Elshaddai Creative Community · Diekspor ${esc(new Date().toLocaleString('id-ID', { timeZone: tz, dateStyle: 'medium', timeStyle: 'short' }))} · No HP → WhatsApp, email → kirim email (klik)</div>
  <div class="powered"><span>Powered by</span>${ideaLogoSvg(16)}</div>
</div>
</div>
</body></html>`;
}
