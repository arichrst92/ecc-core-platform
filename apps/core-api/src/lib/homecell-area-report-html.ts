/**
 * Laporan Homecell Area (PDF via print browser) — A4 portrait.
 * Hero, KPI berikon, grafik performa kehadiran per area, komposisi kategori,
 * daftar "perlu perhatian", lalu kartu tiap area + tabel homecell-nya.
 */
import { esc, fmtTgl } from './print-report.js';
import { REPORT_CSS, barRow, donut, n } from './cabang-report-html.js';
import type { AreaStat } from './homecell-area-stats.js';
import { HOMECELL_KATEGORI_LABEL, homecellUsiaLabel, type HomecellAttendanceTier } from '@ecc/shared-types';

const ICON_PATHS: Record<string, string> = {
  "mapPinned": "<path d=\"M18 8c0 4.5-6 9-6 9s-6-4.5-6-9a6 6 0 0 1 12 0\"/><circle cx=\"12\" cy=\"8\" r=\"2\"/><path d=\"M8.835 14H5a1 1 0 0 0-.9.7l-2 6c-.1.1-.1.2-.1.3 0 .6.4 1 1 1h18c.6 0 1-.4 1-1 0-.1 0-.2-.1-.3l-2-6a1 1 0 0 0-.9-.7h-3.835\"/>",
  "home": "<path d=\"M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8\"/><path d=\"M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z\"/>",
  "users": "<path d=\"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2\"/><circle cx=\"9\" cy=\"7\" r=\"4\"/><path d=\"M22 21v-2a4 4 0 0 0-3-3.87\"/><path d=\"M16 3.13a4 4 0 0 1 0 7.75\"/>",
  "cake": "<path d=\"M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8\"/><path d=\"M4 16s.5-1 2-1 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2-1 2-1\"/><path d=\"M2 21h20\"/><path d=\"M7 8v3\"/><path d=\"M12 8v3\"/><path d=\"M17 8v3\"/><path d=\"M7 4h.01\"/><path d=\"M12 4h.01\"/><path d=\"M17 4h.01\"/>",
  "calendarCheck": "<path d=\"M8 2v4\"/><path d=\"M16 2v4\"/><rect width=\"18\" height=\"18\" x=\"3\" y=\"4\" rx=\"2\"/><path d=\"M3 10h18\"/><path d=\"m9 16 2 2 4-4\"/>",
  "trendingUp": "<polyline points=\"22 7 13.5 15.5 8.5 10.5 2 17\"/><polyline points=\"16 7 22 7 22 13\"/>",
  "userCheck": "<path d=\"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2\"/><circle cx=\"9\" cy=\"7\" r=\"4\"/><polyline points=\"16 11 18 13 22 9\"/>",
  "alertTriangle": "<path d=\"m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3\"/><path d=\"M12 9v4\"/><path d=\"M12 17h.01\"/>",
  "layers": "<path d=\"m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z\"/><path d=\"m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65\"/><path d=\"m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65\"/>",
  "award": "<path d=\"m15.477 12.89 1.515 8.526a.5.5 0 0 1-.81.47l-3.58-2.687a1 1 0 0 0-1.197 0l-3.586 2.686a.5.5 0 0 1-.81-.469l1.514-8.526\"/><circle cx=\"12\" cy=\"8\" r=\"6\"/>",
  "user": "<path d=\"M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2\"/><circle cx=\"12\" cy=\"7\" r=\"4\"/>"
};

/** Ikon Lucide (SVG, garis putih) — ikut tercetak, tidak bergantung font emoji. */
const ic = (name: keyof typeof ICON_PATHS, size = 13, color = '#fff') =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${ICON_PATHS[name]}</svg>`;

const TIER: Record<HomecellAttendanceTier, { bg: string; fg: string; bar: string; label: string }> = {
  merah: { bg: '#fee2e2', fg: '#b91c1c', bar: '#ef4444', label: '0–25%' },
  oranye: { bg: '#ffedd5', fg: '#c2410c', bar: '#f97316', label: '26–50%' },
  kuning: { bg: '#fef9c3', fg: '#a16207', bar: '#eab308', label: '51–75%' },
  hijau: { bg: '#dcfce7', fg: '#15803d', bar: '#22c55e', label: '76–100%' },
};
const tierOf = (p: number | null): HomecellAttendanceTier | null =>
  p == null ? null : p <= 25 ? 'merah' : p <= 50 ? 'oranye' : p <= 75 ? 'kuning' : 'hijau';
const pctBadge = (p: number | null) => {
  const t = tierOf(p);
  return t ? `<span class="pill" style="background:${TIER[t].bg};color:${TIER[t].fg}">${p}%</span>` : '<span class="muted">—</span>';
};

export interface AreaReportRow {
  id: string;
  nama: string;
  deskripsi: string | null;
  cabang: string;
  pic: string | null;
  stat: AreaStat;
}

const EXTRA_CSS = `
  .kpis.six { grid-template-columns: repeat(3, 1fr); }
  .pill { display: inline-block; padding: 1px 7px; border-radius: 999px; font-weight: 800; font-size: 9px; }
  .seg { display: inline-block; margin-left: 4px; padding: 0 5px; border-radius: 5px; font-size: 8px; font-weight: 700; background: #f1f5f9; color: #475569; }
  .seg.single { background: #e0f2fe; color: #0369a1; } .seg.couple { background: #fce7f3; color: #be185d; }
  .area { background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; margin-top: 10px; overflow: hidden; break-inside: avoid; }
  .area-h { display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: linear-gradient(90deg, #fff7ed, #fff); border-bottom: 1px solid #fde4cc; }
  .area-ic { width: 30px; height: 30px; border-radius: 9px; background: #f97316; display: inline-flex; align-items: center; justify-content: center; }
  .area-t { font-size: 12.5px; font-weight: 800; } .area-s { font-size: 9px; color: #64748b; margin-top: 1px; }
  .area-p { margin-left: auto; text-align: right; }
  .area-p .v { font-size: 18px; font-weight: 800; } .area-p .l { font-size: 8px; color: #64748b; text-transform: uppercase; letter-spacing: .08em; }
  .area-b { padding: 10px 12px; }
  .stats4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-bottom: 8px; }
  .st { display: flex; align-items: center; gap: 6px; background: #f8fafc; border: 1px solid #eef2f7; border-radius: 9px; padding: 6px 8px; }
  .st .i { width: 20px; height: 20px; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center; }
  .st b { display: block; font-size: 13px; } .st span { font-size: 8px; color: #64748b; }
  td.n { color: #94a3b8; width: 16px; } .hc-n { font-weight: 700; }
  .warn-row { display: flex; justify-content: space-between; gap: 8px; padding: 5px 0; border-bottom: 1px dashed #eef2f7; font-size: 9.5px; }
  .legend-tier { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; font-size: 8.5px; color: #64748b; margin-top: 6px; }
  .desc { font-size: 9px; color: #475569; margin: 0 0 8px; }
`;

export function renderHomecellAreaReportHtml(
  rows: AreaReportRow[],
  opts: { isMobileUa: boolean; filterLabel: string; periodLabel: string },
): string {
  const ideaLogo = `${(process.env.PORTAL_URL ?? 'https://portal.eccchurch.global').replace(/\/$/, '')}/logo-idea.webp`;
  const generated = new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' });

  // ---- ringkasan semua area
  const tot = rows.reduce(
    (a, r) => {
      a.hc += r.stat.homecellCount;
      a.mem += r.stat.memberCount;
      a.meet += r.stat.meetingCount;
      a.ageKnown += r.stat.ageKnown;
      a.ageSum += (r.stat.avgAge ?? 0) * r.stat.ageKnown;
      for (const h of r.stat.homecells) {
        a.hadir += h.attendanceTotal;
        a.pot += h.memberCount * h.meetingCount;
      }
      a.kat.SINGLE += r.stat.kategori.SINGLE;
      a.kat.COUPLE += r.stat.kategori.COUPLE;
      a.kat.UMUM += r.stat.kategori.UMUM;
      return a;
    },
    { hc: 0, mem: 0, meet: 0, ageKnown: 0, ageSum: 0, hadir: 0, pot: 0, kat: { SINGLE: 0, COUPLE: 0, UMUM: 0 } },
  );
  const avgAge = tot.ageKnown ? Math.round(tot.ageSum / tot.ageKnown) : null;
  const avgPct = tot.pot ? Math.min(100, Math.round((tot.hadir / tot.pot) * 100)) : null;
  const tAll = tierOf(avgPct);

  const kpiBox = (icon: keyof typeof ICON_PATHS, color: string, label: string, value: string, sub: string) =>
    `<div class="kpi"><div class="kpi-top"><span class="kpi-label">${esc(label)}</span><span class="kpi-ic" style="background:${color}">${ic(icon, 12)}</span></div>
     <div class="kpi-v">${value}</div><div class="kpi-s">${esc(sub)}</div></div>`;

  const perfRows = [...rows]
    .sort((a, b) => (b.stat.attendancePercent ?? -1) - (a.stat.attendancePercent ?? -1))
    .map((r) => {
      const p = r.stat.attendancePercent;
      const t = tierOf(p);
      return p == null
        ? barRow(r.nama, '—', 0, '#e2e8f0', ' <span class="muted">· belum ada pertemuan</span>')
        : barRow(r.nama, `${p}%`, p, t ? TIER[t].bar : '#94a3b8', ` <span class="muted">· ${n(r.stat.meetingCount)} pertemuan</span>`);
    })
    .join('');

  const legend = `<div class="legend-tier">Indikator kehadiran: ${(Object.keys(TIER) as HomecellAttendanceTier[])
    .map((k) => `<span class="pill" style="background:${TIER[k].bg};color:${TIER[k].fg}">${TIER[k].label}</span>`)
    .join(' ')}</div>`;

  const komposisi = donut(
    [
      { label: 'Single', value: tot.kat.SINGLE, color: '#0ea5e9' },
      { label: 'Couple', value: tot.kat.COUPLE, color: '#ec4899' },
      { label: 'Umum', value: tot.kat.UMUM, color: '#94a3b8' },
    ],
    n(tot.hc),
    'homecell',
  );

  // ---- perlu perhatian: homecell kehadiran merah / tanpa pertemuan
  const attention = rows
    .flatMap((r) => r.stat.homecells.map((h) => ({ area: r.nama, h })))
    .filter(({ h }) => h.attendancePercent == null || h.attendanceTotal === 0 || (h.attendancePercent ?? 0) <= 25)
    .sort((a, b) => (a.h.attendancePercent ?? -1) - (b.h.attendancePercent ?? -1))
    .slice(0, 12);
  const attentionBody = attention.length
    ? attention
        .map(
          ({ area, h }) =>
            `<div class="warn-row"><span><b>${esc(h.nama)}</b> <span class="muted">· ${esc(area)}</span></span><span>${
              h.attendanceTotal === 0 ? '<span class="pill" style="background:#f1f5f9;color:#475569">Belum ada pertemuan</span>' : pctBadge(h.attendancePercent)
            }</span></div>`,
        )
        .join('')
    : '<p class="muted">Semua homecell di atas 25% kehadiran.</p>';

  // ---- kartu per area
  const areaCards = rows
    .map((r) => {
      const s = r.stat;
      const t = tierOf(s.attendancePercent);
      const st = (icon: keyof typeof ICON_PATHS, color: string, v: string, l: string) =>
        `<div class="st"><span class="i" style="background:${color}">${ic(icon, 11)}</span><div><b>${v}</b><span>${esc(l)}</span></div></div>`;
      const table = s.homecells.length
        ? `<table><thead><tr><th>#</th><th>Homecell</th><th>PIC</th><th class="r">Anggota</th><th class="r">Usia rata²</th><th class="r">Pertemuan</th><th class="r">Kehadiran</th><th>Terakhir</th></tr></thead><tbody>${s.homecells
            .map((h, i) => {
              const seg = [
                h.kategori ? `<span class="seg ${h.kategori.toLowerCase()}">${HOMECELL_KATEGORI_LABEL[h.kategori]}</span>` : '',
                homecellUsiaLabel(h.usiaMin, h.usiaMax) ? `<span class="seg">${esc(homecellUsiaLabel(h.usiaMin, h.usiaMax))}</span>` : '',
              ].join('');
              return `<tr><td class="n">${i + 1}</td><td><span class="hc-n">${esc(h.nama)}</span>${seg}</td><td>${esc(h.pic ?? '—')}</td><td class="r">${n(
                h.memberCount,
              )}</td><td class="r">${h.avgAge != null ? `${h.avgAge} th` : '<span class="muted">—</span>'}</td><td class="r">${n(h.meetingCount)}</td><td class="r">${pctBadge(
                h.attendancePercent,
              )}</td><td>${h.lastMeetingAt ? fmtTgl(h.lastMeetingAt) : '<span class="muted">—</span>'}</td></tr>`;
            })
            .join('')}</tbody></table>`
        : '<p class="muted">Belum ada homecell aktif di area ini.</p>';
      return `<div class="area">
  <div class="area-h">
    <span class="area-ic">${ic('mapPinned', 15)}</span>
    <div><div class="area-t">${esc(r.nama)}</div><div class="area-s">${esc(r.cabang)} · PIC: ${esc(r.pic ?? '—')}</div></div>
    <div class="area-p"><div class="v" style="color:${t ? TIER[t].fg : '#94a3b8'}">${s.attendancePercent != null ? `${s.attendancePercent}%` : '—'}</div><div class="l">Kehadiran</div></div>
  </div>
  <div class="area-b">
    ${r.deskripsi ? `<p class="desc">${esc(r.deskripsi)}</p>` : ''}
    <div class="stats4">
      ${st('home', '#8b5cf6', n(s.homecellCount), 'Homecell aktif')}
      ${st('users', '#f97316', n(s.memberCount), 'Anggota aktif')}
      ${st('cake', '#f59e0b', s.avgAge != null ? `${s.avgAge} th` : '—', `Usia rata² (${n(s.ageKnown)} data)`)}
      ${st('calendarCheck', '#3b82f6', n(s.meetingCount), `Pertemuan · ${n(s.homecellNoMeeting)} tanpa pertemuan`)}
    </div>
    ${table}
  </div>
</div>`;
    })
    .join('');

  return `<!doctype html>
<html lang="id"><head><meta charset="utf-8"><title>Laporan Homecell Area — ${esc(opts.periodLabel)}</title>
<style>
${REPORT_CSS}${EXTRA_CSS}</style></head><body>
${opts.isMobileUa ? '<script>setTimeout(() => window.print(), 800);</script>' : '<div class="noprint"><strong>Print Preview — Laporan Homecell Area</strong> · Tekan <kbd>Ctrl/Cmd + P</kbd> lalu pilih “Save as PDF” (aktifkan “Background graphics”).<button onclick="window.print()">Print / Save as PDF</button></div>'}
<div class="page">
  <div class="hero">
    <div class="eyebrow">Laporan Penggembalaan · Homecell Area</div>
    <h1>${esc(opts.filterLabel)}</h1>
    <div class="meta">${n(rows.length)} area · ${n(tot.hc)} homecell aktif · ${n(tot.mem)} anggota · dibuat ${esc(generated)}</div>
    <div class="period">${ic('calendarCheck', 10, '#c2410c')} ${esc(opts.periodLabel)}</div>
  </div>

  <h2 class="sec">Ringkasan</h2>
  <div class="kpis six">
    ${kpiBox('mapPinned', '#f97316', 'Homecell Area', n(rows.length), 'area dalam laporan')}
    ${kpiBox('home', '#8b5cf6', 'Homecell aktif', n(tot.hc), `${n(tot.kat.SINGLE)} single · ${n(tot.kat.COUPLE)} couple · ${n(tot.kat.UMUM)} umum`)}
    ${kpiBox('users', '#0ea5e9', 'Anggota aktif', n(tot.mem), 'anggota homecell aktif')}
    ${kpiBox('cake', '#f59e0b', 'Usia rata-rata', avgAge != null ? `${avgAge} th` : '—', `dari ${n(tot.ageKnown)} anggota dengan tanggal lahir`)}
    ${kpiBox('calendarCheck', '#3b82f6', 'Pertemuan', n(tot.meet), 'jadwal pertemuan di periode')}
    ${kpiBox('trendingUp', tAll ? TIER[tAll].bar : '#94a3b8', 'Kehadiran rata-rata', avgPct != null ? `<span style="color:${tAll ? TIER[tAll].fg : '#0f172a'}">${avgPct}%</span>` : '—', 'hadir ÷ (anggota × pertemuan)')}
  </div>

  <div class="card"><div class="card-h"><span class="card-ic" style="background:#22c55e">${ic('trendingUp', 12)}</span><div><div class="card-t">Performa kehadiran per area</div><div class="card-s">Diurutkan dari tertinggi</div></div></div>
    ${perfRows || '<p class="muted">Tidak ada area.</p>'}
    ${legend}
  </div>

  <div class="grid2">
    <div class="card"><div class="card-h"><span class="card-ic" style="background:#ec4899">${ic('layers', 12)}</span><div><div class="card-t">Komposisi kategori homecell</div><div class="card-s">Single · Couple · Umum</div></div></div>${komposisi}</div>
    <div class="card"><div class="card-h"><span class="card-ic" style="background:#ef4444">${ic('alertTriangle', 12)}</span><div><div class="card-t">Perlu perhatian</div><div class="card-s">Kehadiran ≤ 25% atau belum ada pertemuan</div></div></div>${attentionBody}</div>
  </div>

  <h2 class="sec">Detail per area</h2>
  ${areaCards || '<p class="muted">Tidak ada area yang sesuai filter.</p>'}

  <div class="foot">
    <div>© ${new Date().getFullYear()} Elshaddai Creative Community · Kehadiran = total hadir ÷ (anggota aktif × jumlah pertemuan)</div>
    <div style="display:flex;align-items:center;gap:6px">Powered by <img src="${ideaLogo}" alt="IDEA" onerror="this.style.display='none'" style="height:18px"/></div>
  </div>
</div>
</body></html>`;
}
