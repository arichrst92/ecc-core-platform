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
import { esc, sendCsv, sendPrintHtml, summaryCards } from './print-report.js';
import { CHECKIN_METHODS, METHOD_LABEL, type CheckinMethod } from './attendance-report.js';
import { paymentStatusOf, type PaymentStatus } from './event-payment.js';
import { buildReviewReport, eventReviews } from './service-review.js';
import { reviewSectionHtml } from './service-review-html.js';
import { eventDateLabel, jamWithZone, tzOr } from './tz.js';

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
    .sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9) || a.nama.localeCompare(b.nama));

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
  const body = `${eventSummaryHtml(d)}
<h2>Daftar peserta (${d.rows.length})</h2>
${eventPesertaTableHtml(d)}
<h2>Ulasan jemaat</h2>
${reviewSectionHtml(d.reviews, 'Event')}`;
  sendPrintHtml(req, res, 'Laporan Event', null, eventMeta(d), body, 'No HP → WhatsApp, email → kirim email (klik di PDF)');
}
