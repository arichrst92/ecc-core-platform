/**
 * Laporan Analitik Els App (PDF via print browser) — untuk pimpinan & tim
 * non-IT: ringkasan dalam kalimat sederhana, kartu angka utama, status
 * berwarna (Baik / Cukup / Perlu perhatian), grafik, dan penjelasan istilah.
 * Anonim: tidak ada data jemaat. A4 portrait.
 */
import { esc, fmtTgl } from './print-report.js';
import { REPORT_CSS, barRow, donut, lineChart, n } from './cabang-report-html.js';
import { pageLabel } from './page-labels.js';

// ------------------------------------------------------------------ bentuk data

export interface AnalyticsReportInput {
  periodeLabel: string;
  from: string; // YYYY-MM-DD
  to: string;
  platformLabel: string;
  modeLabel: string;
  isMobileUa: boolean;
  summary: {
    activeUsers: number;
    activeUsersDeltaPct: number | null;
    views: number;
    return7: number | null;
    avgSessionSec: number;
    avgSessionLoginSec: number;
    avgSessionTamuSec: number;
    platform: { android: number; ios: number; web: number };
  };
  daily: { date: string; users: number; views: number }[];
  pages: { route: string; views: number; visitors: number; avgDurationSec: number; return7: number | null; return30: number | null }[];
  api: {
    summary: {
      successApp: number | null;
      successServer: number | null;
      networkFailPct: number | null;
      err5xx: number;
      total: number;
      p50Server: number | null;
      p95Server: number | null;
      p50App: number | null;
      p95App: number | null;
      peakRpm: number;
      peakAt: string;
    };
    flows: { key: string; label: string; success: number | null; attempts: number }[];
  };
}

// ------------------------------------------------------------------ helper

const ICONS: Record<string, string> = {
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  eye: '<path d="M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0"/><circle cx="12" cy="12" r="3"/>',
  repeat: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  check: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
  zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  bulb: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>',
  phone: '<rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/>',
  trend: '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
  list: '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>',
  shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/>',
  book: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
};
const ic = (name: string, size = 12, color = '#fff') =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] ?? ''}</svg>`;

type Level = 'baik' | 'cukup' | 'perhatian' | 'kosong';
const LEVEL: Record<Level, { label: string; bg: string; fg: string; bar: string }> = {
  baik: { label: 'Baik', bg: '#dcfce7', fg: '#15803d', bar: '#22c55e' },
  cukup: { label: 'Cukup', bg: '#fef9c3', fg: '#a16207', bar: '#eab308' },
  perhatian: { label: 'Perlu perhatian', bg: '#fee2e2', fg: '#b91c1c', bar: '#ef4444' },
  kosong: { label: 'Belum ada data', bg: '#f1f5f9', fg: '#64748b', bar: '#cbd5e1' },
};
const chip = (l: Level, text?: string) =>
  `<span class="chip" style="background:${LEVEL[l].bg};color:${LEVEL[l].fg}">${esc(text ?? LEVEL[l].label)}</span>`;

const retLevel = (p: number | null): Level => (p == null ? 'kosong' : p >= 50 ? 'baik' : p >= 30 ? 'cukup' : 'perhatian');
const okLevel = (p: number | null): Level => (p == null ? 'kosong' : p >= 99.5 ? 'baik' : p >= 98 ? 'cukup' : 'perhatian');
const speedLevel = (ms: number | null): Level => (ms == null ? 'kosong' : ms <= 800 ? 'baik' : ms <= 2000 ? 'cukup' : 'perhatian');

const pct = (v: number | null, d = 1) => (v == null ? '—' : `${v.toLocaleString('id-ID', { maximumFractionDigits: d })}%`);
const dur = (sec: number) => {
  const s = Math.round(sec);
  if (s < 60) return `${s} detik`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m} menit ${r} detik` : `${m} menit`;
};
const secs = (ms: number | null) => (ms == null ? '—' : ms < 1000 ? `${(ms / 1000).toLocaleString('id-ID', { maximumFractionDigits: 2 })} detik` : `${(ms / 1000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} detik`);

function bigKpi(icon: string, color: string, label: string, value: string, sub: string, level: Level | null) {
  return `<div class="kpi"><div class="kpi-top"><span class="kpi-label">${esc(label)}</span><span class="kpi-ic" style="background:${color}">${ic(icon, 12)}</span></div>
  <div class="kpi-v">${value}</div><div class="kpi-s">${esc(sub)}</div>${level ? `<div style="margin-top:5px">${chip(level)}</div>` : ''}</div>`;
}

function card(icon: string, color: string, title: string, sub: string, inner: string, extraClass = '') {
  return `<div class="card ${extraClass}"><div class="card-h"><span class="card-ic" style="background:${color}">${ic(icon, 12)}</span><div><div class="card-t">${esc(
    title,
  )}</div>${sub ? `<div class="card-s">${esc(sub)}</div>` : ''}</div></div>${inner}</div>`;
}

const EXTRA_CSS = `
  .chip { display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 8.5px; font-weight: 700; }
  .insight { display: flex; gap: 8px; align-items: flex-start; padding: 7px 0; border-bottom: 1px dashed #eef2f7; font-size: 10.5px; line-height: 1.45; color: #1e293b; }
  .insight:last-child { border-bottom: none; }
  .insight .dot { width: 18px; height: 18px; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center; flex: none; margin-top: 1px; }
  .lead { font-size: 11px; color: #334155; line-height: 1.5; margin: 0 0 6px; }
  .todo { display: flex; gap: 8px; padding: 6px 8px; border-radius: 8px; background: #fff7ed; border: 1px solid #fed7aa; margin-top: 6px; font-size: 10px; line-height: 1.45; }
  .todo.ok { background: #f0fdf4; border-color: #bbf7d0; }
  .gl { display: grid; grid-template-columns: 120px 1fr; gap: 4px 10px; font-size: 9.5px; line-height: 1.45; }
  .gl b { color: #0f172a; } .gl span { color: #475569; }
  .rank { display: inline-flex; width: 16px; height: 16px; border-radius: 5px; background: #fff7ed; color: #c2410c; font-weight: 800; font-size: 8.5px; align-items: center; justify-content: center; margin-right: 6px; }
  td.c { text-align: center; }
  .flow { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
  .flow div { background: #f8fafc; border: 1px solid #eef2f7; border-radius: 8px; padding: 7px 8px; }
  .flow b { display: block; font-size: 14px; } .flow span { font-size: 8.5px; color: #64748b; }
  .pb { page-break-before: always; }
`;

// ------------------------------------------------------------------ narasi

function insights(d: AnalyticsReportInput): { icon: string; color: string; text: string }[] {
  const s = d.summary;
  const out: { icon: string; color: string; text: string }[] = [];
  const delta =
    s.activeUsersDeltaPct == null
      ? ''
      : s.activeUsersDeltaPct >= 0
        ? `, <b>naik ${s.activeUsersDeltaPct}%</b> dibanding periode sebelumnya`
        : `, <b>turun ${Math.abs(s.activeUsersDeltaPct)}%</b> dibanding periode sebelumnya`;
  out.push({
    icon: 'users',
    color: '#2563eb',
    text: `Selama ${esc(d.periodeLabel)}, Els App dibuka oleh <b>${n(s.activeUsers)} perangkat</b> (HP atau browser)${delta}. Totalnya ada <b>${n(s.views)} kali halaman dibuka</b>.`,
  });
  const top = d.pages.slice(0, 3).map((p) => `<b>${esc(pageLabel(p.route))}</b>`);
  if (top.length) out.push({ icon: 'eye', color: '#f97316', text: `Halaman yang paling sering dibuka: ${top.join(', ')}.` });
  if (s.return7 != null) {
    const verdict =
      s.return7 >= 50
        ? 'sangat baik — lebih dari separuh pengguna kembali memakai Els App dalam seminggu'
        : s.return7 >= 30
          ? 'cukup — sebagian pengguna kembali dalam seminggu'
          : 'masih rendah — banyak pengguna belum kembali dalam seminggu';
    out.push({ icon: 'repeat', color: '#16a34a', text: `<b>${s.return7}%</b> pengguna kembali dalam 7 hari: ${verdict}.` });
  }
  if (s.avgSessionSec > 0) {
    out.push({
      icon: 'clock',
      color: '#8b5cf6',
      text: `Rata-rata seseorang memakai Els App <b>${dur(s.avgSessionSec)} per hari</b>${
        s.avgSessionTamuSec ? ` (jemaat yang login ${dur(s.avgSessionLoginSec)}, mode tamu ${dur(s.avgSessionTamuSec)})` : ''
      }.`,
    });
  }
  const plat = Object.entries(s.platform).sort((a, b) => b[1] - a[1]);
  if (plat[0] && plat[0][1] > 0) {
    const nm: Record<string, string> = { android: 'Android', ios: 'iPhone (iOS)', web: 'browser (web)' };
    out.push({ icon: 'phone', color: '#0ea5e9', text: `Sebagian besar memakai <b>${nm[plat[0][0]]}</b> (${plat[0][1]}%).` });
  }
  const a = d.api.summary;
  if (a.successServer != null) {
    out.push({
      icon: 'shield',
      color: '#16a34a',
      text: `Sistem ${a.successServer >= 99.5 ? '<b>berjalan lancar</b>' : a.successServer >= 98 ? '<b>cukup lancar</b>' : '<b>sempat bermasalah</b>'}: ${pct(
        a.successServer,
        2,
      )} permintaan berhasil diproses, dengan waktu respons umumnya ${secs(a.p50Server)}.`,
    });
  }
  return out;
}

function todos(d: AnalyticsReportInput): string[] {
  const t: string[] = [];
  const s = d.summary;
  if (s.return7 != null && s.return7 < 30)
    t.push('Banyak pengguna belum kembali dalam seminggu. Pertimbangkan pengingat (notifikasi renungan / jadwal ibadah) dan konten mingguan yang menarik.');
  const oneTime = d.pages.filter((p) => p.visitors >= 20 && p.return7 != null && p.return7 < 20).slice(0, 3);
  if (oneTime.length)
    t.push(
      `Halaman ${oneTime.map((p) => `<b>${esc(pageLabel(p.route))}</b>`).join(', ')} banyak dikunjungi tetapi jarang dibuka lagi — periksa apakah isinya diperbarui rutin atau mudah ditemukan.`,
    );
  for (const f of d.api.flows) {
    if (f.success != null && f.attempts >= 20 && f.success < 98)
      t.push(`Proses <b>${esc(f.label)}</b> berhasil ${pct(f.success)} — di bawah target 98%. Tim IT perlu memeriksa.`);
  }
  if (d.api.summary.p95App != null && d.api.summary.p95App > 3000)
    t.push(`Sebagian jemaat merasakan app lambat (hingga ${secs(d.api.summary.p95App)}), kemungkinan karena koneksi internet di lokasi. Pertimbangkan WiFi gereja yang lebih stabil.`);
  if (s.platform.web === 0 && s.activeUsers > 0)
    t.push('Belum ada pengunjung dari Els App web. Bagikan tautan elsapp.eccchurch.global untuk jemaat yang belum memasang aplikasi.');
  return t;
}

// ------------------------------------------------------------------ render

export function renderAnalyticsReportHtml(d: AnalyticsReportInput): string {
  const ideaLogo = `${(process.env.PORTAL_URL ?? 'https://portal.eccchurch.global').replace(/\/$/, '')}/logo-idea.webp`;
  const generated = new Date().toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Jakarta' });
  const s = d.summary;
  const a = d.api.summary;
  const noData = s.activeUsers === 0 && d.pages.length === 0;

  const kpis = `<div class="kpis">
    ${bigKpi('users', '#2563eb', 'Pengguna aktif', n(s.activeUsers), s.activeUsersDeltaPct == null ? 'perangkat berbeda' : `${s.activeUsersDeltaPct >= 0 ? '+' : ''}${s.activeUsersDeltaPct}% vs periode lalu`, null)}
    ${bigKpi('eye', '#f97316', 'Halaman dibuka', n(s.views), s.activeUsers ? `±${Math.round(s.views / Math.max(1, s.activeUsers))} halaman per orang` : '—', null)}
    ${bigKpi('repeat', '#16a34a', 'Kembali dalam 7 hari', pct(s.return7, 0), 'dari pengguna baru di periode ini', retLevel(s.return7))}
    ${bigKpi('clock', '#8b5cf6', 'Waktu pakai per hari', s.avgSessionSec ? (s.avgSessionSec >= 60 ? `± ${Math.round(s.avgSessionSec / 60)} menit` : `${Math.round(s.avgSessionSec)} detik`) : '—', 'rata-rata per orang', null)}
    ${bigKpi('shield', '#0d9488', 'Keberhasilan sistem', pct(a.successServer, 2), `${n(a.err5xx)} gangguan dari ${n(a.total)} permintaan`, okLevel(a.successServer))}
    ${bigKpi('zap', '#eab308', 'Kecepatan respons', secs(a.p50Server), `95% permintaan ≤ ${secs(a.p95Server)}`, speedLevel(a.p95Server))}
  </div>`;

  const ins = insights(d);
  const td = todos(d);
  const summaryCard = card(
    'bulb',
    '#f97316',
    'Ringkasan',
    'Hal penting dalam bahasa sederhana',
    noData
      ? `<p class="lead">Belum ada data penggunaan pada periode ini. Data mulai masuk setelah jemaat memakai Els App versi 2.4.4 atau Els App web terbaru.</p>`
      : ins.map((x) => `<div class="insight"><span class="dot" style="background:${x.color}">${ic(x.icon, 11)}</span><div>${x.text}</div></div>`).join(''),
  );
  const todoCard = card(
    'flag',
    '#ef4444',
    'Yang perlu ditindaklanjuti',
    'Saran otomatis dari data periode ini',
    td.length
      ? td.map((x) => `<div class="todo">${ic('flag', 12, '#c2410c')}<div>${x}</div></div>`).join('')
      : `<div class="todo ok">${ic('check', 12, '#15803d')}<div>Tidak ada hal mendesak. Semua indikator dalam batas baik.</div></div>`,
  );

  const trend = d.daily.length
    ? card(
        'trend',
        '#2563eb',
        'Pengguna per hari',
        'Jumlah perangkat berbeda yang membuka Els App setiap hari',
        lineChart(
          d.daily.map((x) => x.date),
          [{ name: 'Pengguna', color: '#2563eb', data: d.daily.map((x) => x.users), fill: true }],
        ),
      )
    : '';

  const platformCard = card(
    'phone',
    '#0ea5e9',
    'Perangkat yang dipakai',
    'Jumlah perangkat (perkiraan) & persentase',
    donut(
      [
        { label: 'Android', value: Math.round((s.activeUsers * s.platform.android) / 100), color: '#16a34a' },
        { label: 'iPhone (iOS)', value: Math.round((s.activeUsers * s.platform.ios) / 100), color: '#2563eb' },
        { label: 'Browser (web)', value: Math.round((s.activeUsers * s.platform.web) / 100), color: '#f59e0b' },
      ],
      n(s.activeUsers),
      'perangkat',
    ),
  );

  const topPages = d.pages.slice(0, 10);
  const maxViews = Math.max(1, ...topPages.map((p) => p.views));
  const topCard = card(
    'list',
    '#f97316',
    '10 halaman paling sering dibuka',
    'Panjang batang = jumlah kali dibuka',
    topPages.length
      ? topPages
          .map((p, i) =>
            barRow(`${i + 1}. ${pageLabel(p.route)}`, n(p.views), (p.views / maxViews) * 100, '#f97316', ` <span class="muted">· ${n(p.visitors)} orang</span>`),
          )
          .join('')
      : '<p class="muted">Belum ada data.</p>',
  );

  const table = topPages.length
    ? card(
        'eye',
        '#8b5cf6',
        'Detail halaman',
        'Seberapa lama dibuka & apakah orang kembali lagi',
        `<table><thead><tr><th>Halaman</th><th class="r">Dibuka</th><th class="r">Orang</th><th class="r">Lama rata-rata</th><th class="c">Kembali dalam 7 hari</th></tr></thead><tbody>${d.pages
          .slice(0, 20)
          .map(
            (p, i) =>
              `<tr><td><span class="rank">${i + 1}</span>${esc(pageLabel(p.route))}</td><td class="r">${n(p.views)}</td><td class="r">${n(p.visitors)}</td><td class="r">${dur(
                p.avgDurationSec,
              )}</td><td class="c">${p.return7 == null ? chip('kosong', 'Belum cukup data') : chip(retLevel(p.return7), `${p.return7}% · ${LEVEL[retLevel(p.return7)].label}`)}</td></tr>`,
          )
          .join('')}</tbody></table>`,
      )
    : '';

  const flows = card(
    'shield',
    '#0d9488',
    'Proses penting jemaat',
    'Berapa persen yang berhasil tanpa kendala sistem (target ≥ 98%)',
    `<div class="flow">${d.api.flows
      .map(
        (f) =>
          `<div><span>${esc(f.label)}</span><b style="color:${LEVEL[okLevel(f.success)].fg}">${pct(f.success)}</b><span>${n(f.attempts)} kali · ${
            f.success == null ? 'belum ada data' : LEVEL[okLevel(f.success)].label
          }</span></div>`,
      )
      .join('')}</div>
    <p class="small muted">Contoh “tidak berhasil”: gangguan server atau koneksi putus. Kode OTP salah atau di luar radius check-in tidak dihitung sebagai kegagalan sistem.</p>`,
  );

  const speed = card(
    'zap',
    '#eab308',
    'Kecepatan Els App',
    'Waktu tunggu dari tombol ditekan sampai hasil muncul',
    `<div class="flow">
      <div><span>Di server</span><b>${secs(a.p50Server)}</b><span>umumnya · ${chip(speedLevel(a.p95Server))}</span></div>
      <div><span>Dirasakan jemaat</span><b>${secs(a.p50App)}</b><span>termasuk internet · ${chip(speedLevel(a.p95App))}</span></div>
      <div><span>Paling ramai</span><b>${n(a.peakRpm)}/menit</b><span>${esc(a.peakAt)}</span></div>
    </div>
    ${a.networkFailPct != null ? `<p class="small muted">${pct(a.networkFailPct)} permintaan dari HP gagal karena koneksi internet (bukan karena server).</p>` : ''}`,
  );

  const glossary = card(
    'book',
    '#64748b',
    'Cara membaca laporan ini',
    '',
    `<div class="gl">
      <b>Pengguna aktif</b><span>Jumlah HP / browser berbeda yang membuka Els App. Satu orang dengan HP dan laptop terhitung dua.</span>
      <b>Halaman dibuka</b><span>Berapa kali sebuah layar di Els App dibuka (mis. Beranda, Tiket, Bible 365).</span>
      <b>Kembali dalam 7 hari</b><span>Dari orang yang membuka sebuah halaman, berapa persen yang membukanya lagi dalam seminggu. Semakin tinggi semakin baik.</span>
      <b>Waktu pakai per hari</b><span>Rata-rata lama Els App dibuka dalam satu hari oleh satu orang.</span>
      <b>Keberhasilan sistem</b><span>Persentase permintaan yang diproses server tanpa gangguan.</span>
      <b>Kecepatan respons</b><span>Waktu tunggu jemaat. Di bawah 1 detik terasa cepat.</span>
      <b>Status</b><span>${chip('baik')} sesuai harapan · ${chip('cukup')} perlu dipantau · ${chip('perhatian')} perlu tindakan.</span>
    </div>
    <p class="small muted">Data dikumpulkan secara anonim (tanpa nama, no HP, atau isi data jemaat). Jemaat dapat mematikannya di Pengaturan → Privasi.</p>`,
  );

  return `<!doctype html>
<html lang="id"><head><meta charset="utf-8"><title>Laporan Analitik Els App — ${esc(d.periodeLabel)}</title>
<style>
${REPORT_CSS}${EXTRA_CSS}</style></head><body>
${
  d.isMobileUa
    ? '<script>setTimeout(() => window.print(), 800);</script>'
    : `<div class="noprint"><strong>Print Preview — Laporan Analitik</strong> · Tekan <kbd>Ctrl/Cmd + P</kbd> lalu pilih “Save as PDF” (aktifkan “Background graphics”).<button onclick="window.print()">Print / Save as PDF</button></div>`
}
<div class="page">
  <div class="hero">
    <div class="eyebrow">Laporan Analitik · Els App</div>
    <h1>Penggunaan Els App</h1>
    <div class="meta">${esc(d.platformLabel)} · ${esc(d.modeLabel)} · dibuat ${esc(generated)}</div>
    <div class="period">${esc(d.periodeLabel)} · ${esc(fmtTgl(d.from))} – ${esc(fmtTgl(d.to))}</div>
  </div>

  <h2 class="sec">Angka utama</h2>
  ${kpis}

  ${summaryCard}
  ${todoCard}

  <h2 class="sec">Penggunaan</h2>
  ${trend}
  <div class="grid2" style="margin-top:8px">${topCard}${platformCard}</div>
  ${table}

  <h2 class="sec">Kesehatan sistem</h2>
  ${flows}
  ${speed}

  ${glossary}

  <div class="foot">
    <div>© ${new Date().getFullYear()} Elshaddai Creative Community · Laporan Analitik Els App · anonim</div>
    <div style="display:flex;align-items:center;gap:6px">Powered by <img src="${ideaLogo}" alt="IDEA" onerror="this.style.display='none'" style="height:18px"/></div>
  </div>
</div>
</body></html>`;
}
