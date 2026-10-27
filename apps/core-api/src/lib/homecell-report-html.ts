/**
 * Laporan Homecell (PDF via print browser) — A4 portrait, gaya sama dengan
 * Laporan Homecell Area: hero, KPI berikon, performa kehadiran, komposisi
 * kategori, "perlu perhatian", lalu kartu tiap homecell + tabel anggota
 * (usia, kehadiran di periode, terakhir hadir).
 */
import { esc, fmtTgl } from './print-report.js';
import { REPORT_CSS, barRow, donut, n } from './cabang-report-html.js';
import { EXTRA_CSS, ICON_PATHS, TIER, ic, pctBadge, tierOf } from './homecell-area-report-html.js';
import { HOMECELL_KATEGORI_LABEL, homecellUsiaLabel, type HomecellAttendanceTier } from '@ecc/shared-types';

export interface HcMemberRow {
  nama: string;
  kode: string | null;
  noHp: string | null;
  usia: number | null;
  bergabung: string;
  hadir: number;
  lastAt: string | null;
  lastDaysAgo: number | null;
}

export interface HcReportRow {
  nama: string;
  isActive: boolean;
  area: string;
  cabang: string;
  pic: string | null;
  kategori: 'SINGLE' | 'COUPLE' | null;
  usiaMin: number | null;
  usiaMax: number | null;
  meetingCount: number;
  attendanceTotal: number;
  attendancePercent: number | null;
  avgAge: number | null;
  lastMeetingAt: string | null;
  lastMeetingDaysAgo: number | null;
  members: HcMemberRow[];
}

const CSS = `
  .hc-tag { display: inline-block; font-size: 8px; font-weight: 700; padding: 1px 6px; border-radius: 5px; background: #e2e8f0; color: #475569; margin-left: 4px; }
  .rel { font-size: 8.5px; font-weight: 700; }
  .rel.ok { color: #15803d; } .rel.warn { color: #b45309; } .rel.bad { color: #dc2626; }
  .mini { display: inline-block; min-width: 34px; text-align: center; padding: 0 5px; border-radius: 999px; font-weight: 700; font-size: 8.5px; }
  .area-h.hc { background: linear-gradient(90deg, #f5f3ff, #fff); border-bottom-color: #e9d5ff; }
  .area-ic.hc { background: #8b5cf6; }
  .sub2 { font-size: 9px; color: #64748b; margin-top: 2px; }
`;

const relHari = (d: number | null) => {
  if (d == null) return '<span class="muted">belum pernah</span>';
  const t = d === 0 ? 'hari ini' : d === 1 ? 'kemarin' : `${d} hari lalu`;
  const cls = d <= 7 ? 'ok' : d <= 30 ? 'warn' : 'bad';
  return `<span class="rel ${cls}">${t}</span>`;
};

const segChips = (k: 'SINGLE' | 'COUPLE' | null, min: number | null, max: number | null) =>
  [
    k ? `<span class="seg ${k.toLowerCase()}">${HOMECELL_KATEGORI_LABEL[k]}</span>` : '',
    homecellUsiaLabel(min, max) ? `<span class="seg">${esc(homecellUsiaLabel(min, max))}</span>` : '',
  ].join('');

export function renderHomecellReportHtml(
  rows: HcReportRow[],
  opts: { isMobileUa: boolean; title: string; filterParts: string[]; periodLabel: string },
): string {
  const ideaLogo = `${(process.env.PORTAL_URL ?? 'https://portal.eccchurch.global').replace(/\/$/, '')}/logo-idea.webp`;
  const generated = new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' });

  const tot = rows.reduce(
    (a, r) => {
      a.mem += r.members.length;
      a.meet += r.meetingCount;
      a.hadir += r.attendanceTotal;
      a.pot += r.members.length * r.meetingCount;
      for (const m of r.members) if (m.usia != null) (a.ageSum += m.usia), a.ageKnown++;
      a.kat[r.kategori ?? 'UMUM']++;
      if (r.attendanceTotal === 0) a.noMeet++;
      return a;
    },
    { mem: 0, meet: 0, hadir: 0, pot: 0, ageSum: 0, ageKnown: 0, noMeet: 0, kat: { SINGLE: 0, COUPLE: 0, UMUM: 0 } },
  );
  const avgAge = tot.ageKnown ? Math.round(tot.ageSum / tot.ageKnown) : null;
  const avgPct = tot.pot ? Math.min(100, Math.round((tot.hadir / tot.pot) * 100)) : null;
  const tAll = tierOf(avgPct);

  const kpiBox = (icon: keyof typeof ICON_PATHS, color: string, label: string, value: string, sub: string) =>
    `<div class="kpi"><div class="kpi-top"><span class="kpi-label">${esc(label)}</span><span class="kpi-ic" style="background:${color}">${ic(icon, 12)}</span></div>
     <div class="kpi-v">${value}</div><div class="kpi-s">${esc(sub)}</div></div>`;

  const ranked = [...rows].sort((a, b) => (b.attendancePercent ?? -1) - (a.attendancePercent ?? -1));
  const perf = ranked
    .slice(0, 25)
    .map((r) => {
      const p = r.attendancePercent;
      const t = tierOf(p);
      return p == null || r.attendanceTotal === 0
        ? barRow(r.nama, '—', 0, '#e2e8f0', ' <span class="muted">· belum ada pertemuan</span>')
        : barRow(r.nama, `${p}%`, p, t ? TIER[t].bar : '#94a3b8', ` <span class="muted">· ${esc(r.area)} · ${n(r.meetingCount)} pertemuan</span>`);
    })
    .join('');
  const perfMore = rows.length > 25 ? `<p class="muted small">+${rows.length - 25} homecell lain di detail di bawah.</p>` : '';

  const legend = `<div class="legend-tier">Indikator kehadiran: ${(Object.keys(TIER) as HomecellAttendanceTier[])
    .map((k) => `<span class="pill" style="background:${TIER[k].bg};color:${TIER[k].fg}">${TIER[k].label}</span>`)
    .join(' ')}</div>`;

  const komposisi = donut(
    [
      { label: 'Single', value: tot.kat.SINGLE, color: '#0ea5e9' },
      { label: 'Couple', value: tot.kat.COUPLE, color: '#ec4899' },
      { label: 'Umum', value: tot.kat.UMUM, color: '#94a3b8' },
    ],
    n(rows.length),
    'homecell',
  );

  const attention = ranked
    .filter((r) => r.attendanceTotal === 0 || (r.attendancePercent ?? 0) <= 25)
    .reverse()
    .slice(0, 12);
  const attentionBody = attention.length
    ? attention
        .map(
          (r) =>
            `<div class="warn-row"><span><b>${esc(r.nama)}</b> <span class="muted">· ${esc(r.area)}</span></span><span>${
              r.attendanceTotal === 0 ? '<span class="pill" style="background:#f1f5f9;color:#475569">Belum ada pertemuan</span>' : pctBadge(r.attendancePercent)
            }</span></div>`,
        )
        .join('')
    : '<p class="muted">Semua homecell di atas 25% kehadiran.</p>';

  const cards = rows
    .map((r) => {
      const t = tierOf(r.attendancePercent);
      const st = (icon: keyof typeof ICON_PATHS, color: string, v: string, l: string) =>
        `<div class="st"><span class="i" style="background:${color}">${ic(icon, 11)}</span><div><b>${v}</b><span>${esc(l)}</span></div></div>`;
      const memberTable = r.members.length
        ? `<table><thead><tr><th>#</th><th>Nama</th><th>Kode</th><th class="r">Usia</th><th>Bergabung</th><th class="r">Hadir di periode</th><th>Terakhir hadir</th></tr></thead><tbody>${r.members
            .map((m, i) => {
              const rate = r.meetingCount > 0 ? Math.round((m.hadir / r.meetingCount) * 100) : null;
              const mt = tierOf(rate);
              const outRange =
                m.usia != null && ((r.usiaMin != null && m.usia < r.usiaMin) || (r.usiaMax != null && m.usia > r.usiaMax));
              return `<tr><td class="n">${i + 1}</td><td><b>${esc(m.nama)}</b></td><td>${esc(m.kode ?? '')}</td><td class="r"${
                outRange ? ' style="color:#b45309;font-weight:700" title="Di luar rentang usia homecell"' : ''
              }>${m.usia != null ? `${m.usia} th` : '<span class="muted">—</span>'}</td><td>${fmtTgl(m.bergabung)}</td><td class="r">${
                r.meetingCount > 0
                  ? `${m.hadir}/${r.meetingCount} <span class="mini" style="background:${mt ? TIER[mt].bg : '#f1f5f9'};color:${mt ? TIER[mt].fg : '#475569'}">${rate}%</span>`
                  : '<span class="muted">—</span>'
              }</td><td>${m.lastAt ? `${fmtTgl(m.lastAt)} · ${relHari(m.lastDaysAgo)}` : relHari(null)}</td></tr>`;
            })
            .join('')}</tbody></table>`
        : '<p class="muted">Belum ada anggota aktif.</p>';
      return `<div class="area">
  <div class="area-h hc">
    <span class="area-ic hc">${ic('home', 15)}</span>
    <div><div class="area-t">${esc(r.nama)}${r.isActive ? '' : '<span class="hc-tag">nonaktif</span>'}${segChips(r.kategori, r.usiaMin, r.usiaMax)}</div>
      <div class="area-s">${esc(r.area)} · ${esc(r.cabang)} · PIC: ${esc(r.pic ?? '—')}</div></div>
    <div class="area-p"><div class="v" style="color:${t ? TIER[t].fg : '#94a3b8'}">${r.attendancePercent != null && r.attendanceTotal > 0 ? `${r.attendancePercent}%` : '—'}</div><div class="l">Kehadiran</div></div>
  </div>
  <div class="area-b">
    <div class="stats4">
      ${st('users', '#f97316', n(r.members.length), 'Anggota aktif')}
      ${st('cake', '#f59e0b', r.avgAge != null ? `${r.avgAge} th` : '—', 'Usia rata-rata')}
      ${st('calendarCheck', '#3b82f6', n(r.meetingCount), 'Pertemuan di periode')}
      ${st('userCheck', '#10b981', r.lastMeetingAt ? fmtTgl(r.lastMeetingAt) : '—', 'Pertemuan terakhir')}
    </div>
    ${memberTable}
  </div>
</div>`;
    })
    .join('');

  return `<!doctype html>
<html lang="id"><head><meta charset="utf-8"><title>Laporan Homecell — ${esc(opts.periodLabel)}</title>
<style>
${REPORT_CSS}${EXTRA_CSS}${CSS}</style></head><body>
${opts.isMobileUa ? '<script>setTimeout(() => window.print(), 800);</script>' : '<div class="noprint"><strong>Print Preview — Laporan Homecell</strong> · Tekan <kbd>Ctrl/Cmd + P</kbd> lalu pilih “Save as PDF” (aktifkan “Background graphics”).<button onclick="window.print()">Print / Save as PDF</button></div>'}
<div class="page">
  <div class="hero">
    <div class="eyebrow">Laporan Penggembalaan · Homecell</div>
    <h1>${esc(opts.title)}</h1>
    <div class="meta">${n(rows.length)} homecell · ${n(tot.mem)} anggota aktif · dibuat ${esc(generated)}</div>
    ${opts.filterParts.length ? `<div class="meta" style="margin-top:2px">${opts.filterParts.map(esc).join(' · ')}</div>` : ''}
    <div class="period">${ic('calendarCheck', 10, '#c2410c')} ${esc(opts.periodLabel)}</div>
  </div>

  <h2 class="sec">Ringkasan</h2>
  <div class="kpis six">
    ${kpiBox('home', '#8b5cf6', 'Homecell', n(rows.length), `${n(tot.kat.SINGLE)} single · ${n(tot.kat.COUPLE)} couple · ${n(tot.kat.UMUM)} umum`)}
    ${kpiBox('users', '#0ea5e9', 'Anggota aktif', n(tot.mem), rows.length ? `rata-rata ${Math.round(tot.mem / rows.length)} per homecell` : '')}
    ${kpiBox('cake', '#f59e0b', 'Usia rata-rata', avgAge != null ? `${avgAge} th` : '—', `dari ${n(tot.ageKnown)} anggota dengan tanggal lahir`)}
    ${kpiBox('calendarCheck', '#3b82f6', 'Pertemuan', n(tot.meet), 'jadwal pertemuan di periode')}
    ${kpiBox('trendingUp', tAll ? TIER[tAll].bar : '#94a3b8', 'Kehadiran rata-rata', avgPct != null ? `<span style="color:${tAll ? TIER[tAll].fg : '#0f172a'}">${avgPct}%</span>` : '—', 'hadir ÷ (anggota × pertemuan)')}
    ${kpiBox('alertTriangle', '#ef4444', 'Tanpa pertemuan', n(tot.noMeet), 'homecell tanpa kehadiran di periode')}
  </div>

  <div class="card"><div class="card-h"><span class="card-ic" style="background:#22c55e">${ic('trendingUp', 12)}</span><div><div class="card-t">Performa kehadiran homecell</div><div class="card-s">Diurutkan dari tertinggi</div></div></div>
    ${perf || '<p class="muted">Tidak ada homecell.</p>'}${perfMore}
    ${legend}
  </div>

  <div class="grid2">
    <div class="card"><div class="card-h"><span class="card-ic" style="background:#ec4899">${ic('layers', 12)}</span><div><div class="card-t">Komposisi kategori</div><div class="card-s">Single · Couple · Umum</div></div></div>${komposisi}</div>
    <div class="card"><div class="card-h"><span class="card-ic" style="background:#ef4444">${ic('alertTriangle', 12)}</span><div><div class="card-t">Perlu perhatian</div><div class="card-s">Kehadiran ≤ 25% atau belum ada pertemuan</div></div></div>${attentionBody}</div>
  </div>

  <h2 class="sec">Detail per homecell</h2>
  ${cards || '<p class="muted">Tidak ada homecell yang sesuai filter.</p>'}

  <div class="foot">
    <div>© ${new Date().getFullYear()} Elshaddai Creative Community · Terakhir hadir: hijau ≤ 7 hari, kuning ≤ 30 hari, merah &gt; 30 hari · Usia oranye = di luar rentang usia homecell</div>
    <div style="display:flex;align-items:center;gap:6px">Powered by <img src="${ideaLogo}" alt="IDEA" onerror="this.style.display='none'" style="height:18px"/></div>
  </div>
</div>
</body></html>`;
}
