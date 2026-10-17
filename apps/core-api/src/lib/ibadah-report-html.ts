/**
 * Laporan Ibadah (PDF via print browser) — visual untuk rapat eksekutif:
 * ringkasan + perbandingan periode sebelumnya, jangkauan jemaat, frekuensi
 * hadir, tren mingguan, cara check-in, ringkasan & okupansi per ibadah,
 * pertemuan tertinggi/terendah, dan tamu.
 */
import { esc, fmtTgl } from './print-report.js';
import { CHECKIN_METHODS, METHOD_LABEL, type MethodCount } from './attendance-report.js';
import { REPORT_CSS, barRow, columnChart, donut, kpi, n, pctTxt, section } from './cabang-report-html.js';

/** Bentuk data dari routes/admin/report.ts → ibadahReportData(). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type IbadahReportData = any;

const growthBadge = (g: number | null | undefined) =>
  g == null
    ? '<span class="gb gb-n">— vs periode lalu</span>'
    : g >= 0
      ? `<span class="gb gb-up">▲ ${pctTxt(g)} vs periode lalu</span>`
      : `<span class="gb gb-down">▼ ${pctTxt(Math.abs(g))} vs periode lalu</span>`;

const METHOD_COLOR: Record<string, string> = {
  SCAN: '#f97316',
  SELF: '#10b981',
  WALK_IN: '#8b5cf6',
  MANUAL: '#3b82f6',
  UNKNOWN: '#cbd5e1',
};

export function renderIbadahReportHtml(d: IbadahReportData, opts: { isMobileUa: boolean }): string {
  const s = d.summary;
  const ins = d.insights;
  const ideaLogo = `${(process.env.PORTAL_URL ?? 'https://portal.eccchurch.global').replace(/\/$/, '')}/logo-idea.webp`;
  const generated = new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' });
  const scope = [d.filters.cabang ? `Cabang ${d.filters.cabang}` : 'Semua cabang', d.filters.ibadah ? `Ibadah ${d.filters.ibadah}` : 'Semua ibadah'].join(' · ');

  const kpis = `
  <div class="kpis">
    ${kpi('🙌', 'Total kehadiran', n(s.totalHadir), `${n(s.jemaatHadir)} jemaat + ${n(s.tamuHadir)} tamu`, '#f97316').replace('</div></div>', `</div>${growthBadge(ins.growth.totalHadir)}</div>`)}
    ${kpi('✅', 'Jemaat hadir (unik)', n(s.uniqueJemaat), `${pctTxt(ins.jangkauan.pct)} dari ${n(ins.jangkauan.jemaatAktif)} jemaat aktif`, '#3b82f6').replace('</div></div>', `</div>${growthBadge(ins.growth.uniqueJemaat)}</div>`)}
    ${kpi('📊', 'Rata-rata / pertemuan', n(s.rataRata), `${n(s.pertemuanAdaKehadiran)} dari ${n(s.pertemuan)} pertemuan ada kehadiran`, '#0ea5e9').replace('</div></div>', `</div>${growthBadge(ins.growth.rataRata)}</div>`)}
    ${kpi('🙋', 'Tamu (unik)', n(s.uniqueTamu), `${n(ins.tamu.baru)} baru · ${n(ins.tamu.berulang)} berulang`, '#8b5cf6').replace('</div></div>', `</div>${growthBadge(ins.growth.uniqueTamu)}</div>`)}
    ${kpi('🪑', 'Okupansi rata-rata', pctTxt(s.okupansi.rataOkupansi), s.okupansi.melebihi ? `${s.okupansi.melebihi}× melebihi seat` : 'hadir ÷ jumlah seat', '#14b8a6')}
    ${kpi('🫥', 'Belum hadir', n(ins.jangkauan.belumHadir), 'jemaat aktif tanpa kehadiran di periode', '#94a3b8')}
  </div>`;

  const freqMax = Math.max(1, ...ins.frekuensi.map((f: { count: number }) => f.count));
  const frekuensi = ins.frekuensi
    .map((f: { label: string; count: number }) => barRow(f.label, `${n(f.count)} jemaat`, (f.count / freqMax) * 100, '#3b82f6'))
    .join('');
  const jangkauan = `
    <div class="big"><div class="big-v" style="color:#1d4ed8">${pctTxt(ins.jangkauan.pct)}</div><div class="big-s">jemaat aktif hadir minimal sekali</div></div>
    ${barRow('Hadir', n(ins.jangkauan.hadirUnik), ins.jangkauan.pct, '#3b82f6')}
    ${barRow('Belum hadir', n(ins.jangkauan.belumHadir), 100 - ins.jangkauan.pct, '#cbd5e1')}
    <div class="sub-t" style="margin-top:10px">Frekuensi hadir</div>${frekuensi}`;

  const trend = columnChart(
    d.trend.map((t: { week: string; jemaat: number; tamu: number }) => ({ label: fmtTgl(t.week).replace(/ \d{4}$/, ''), value: t.jemaat + t.tamu })),
    '#f97316',
    720,
    150,
  );

  const methods = donut(
    CHECKIN_METHODS.map((m) => ({ label: METHOD_LABEL[m], value: (s.methods as MethodCount)[m], color: METHOD_COLOR[m] ?? '#cbd5e1' })),
    n(s.totalHadir),
    'check-in',
  );

  const perMax = Math.max(1, ...ins.perIbadah.map((p: { total: number }) => p.total));
  const perIbadahTable = ins.perIbadah.length
    ? `<table><thead><tr><th>Ibadah</th><th class="r">Pertemuan</th><th class="r">Total</th><th style="width:22%"></th><th class="r">Rata²</th><th class="r">Tamu</th><th class="r">Okupansi</th><th class="r">vs lalu</th></tr></thead><tbody>${ins.perIbadah
        .map(
          (p: {
            ibadah: { nama: string; jamMulai: string; cabang: string | null; isKidsIbadah: boolean };
            pertemuan: number;
            terjadwal: number;
            total: number;
            rataRata: number;
            tamu: number;
            okupansi: number | null;
            growth: number | null;
          }) =>
            `<tr><td><b>${esc(p.ibadah.nama)}</b> <span class="muted">${esc(p.ibadah.jamMulai)}${p.ibadah.isKidsIbadah ? ' · 🧒' : ''}${
              d.filters.cabang ? '' : p.ibadah.cabang ? ` · ${esc(p.ibadah.cabang)}` : ''
            }</span></td><td class="r">${p.pertemuan}/${p.terjadwal}</td><td class="r b">${n(p.total)}</td><td><div class="br-t"><div class="br-f" style="width:${
              (p.total / perMax) * 100
            }%;background:#f97316"></div></div></td><td class="r">${n(p.rataRata)}</td><td class="r" style="color:#7c3aed">${n(p.tamu)}</td><td class="r b" style="color:${
              p.okupansi == null ? '#94a3b8' : p.okupansi > 100 ? '#dc2626' : p.okupansi >= 80 ? '#b45309' : '#0f766e'
            }">${pctTxt(p.okupansi)}</td><td class="r" style="white-space:nowrap;color:${p.growth == null ? '#94a3b8' : p.growth >= 0 ? '#15803d' : '#dc2626'}">${
              p.growth == null ? '—' : `${p.growth >= 0 ? '▲' : '▼'} ${pctTxt(Math.abs(p.growth))}`
            }</td></tr>`,
        )
        .join('')}</tbody></table>`
    : '<p class="muted">Belum ada kehadiran di periode ini.</p>';

  const occList = (list: { ibadah: string; jam: string; tanggal: string; total: number }[], color: string) =>
    list.length
      ? list
          .map(
            (o) =>
              `<div class="dl" style="grid-template-columns:1fr auto"><span><b>${esc(o.ibadah)}</b> <span class="muted">${esc(o.jam)} · ${fmtTgl(o.tanggal)}</span></span><b style="color:${color}">${n(o.total)}</b></div>`,
          )
          .join('')
      : '<p class="muted">—</p>';
  const highlights = `<div class="two"><div><div class="sub-t">Kehadiran tertinggi</div>${occList(ins.tertinggi, '#15803d')}</div><div><div class="sub-t">Kehadiran terendah</div>${occList(
    ins.terendah,
    '#dc2626',
  )}${ins.pertemuanTanpaKehadiran ? `<p class="muted small">${ins.pertemuanTanpaKehadiran} pertemuan terjadwal tanpa data kehadiran.</p>` : ''}</div></div>`;

  const guests = d.guests.length
    ? `<table><thead><tr><th>Nama</th><th>No HP</th><th>Status</th><th class="r">Kunjungan</th><th>Terakhir</th><th>Dibawa oleh</th></tr></thead><tbody>${d.guests
        .slice(0, 40)
        .map(
          (g: { namaLengkap: string; noHp: string | null; isBaru: boolean; kunjungan: number; kunjunganTerakhir: string; inviters: string[]; walkIn: boolean }) =>
            `<tr><td>${esc(g.namaLengkap)}</td><td>${esc(g.noHp ?? '')}</td><td>${g.isBaru ? '<b style="color:#15803d">Baru</b>' : 'Berulang'}</td><td class="r">${g.kunjungan}</td><td>${fmtTgl(
              g.kunjunganTerakhir,
            )}</td><td>${esc(g.walkIn && !g.inviters.length ? 'Walk-in' : g.inviters.join(', '))}</td></tr>`,
        )
        .join('')}</tbody></table>${d.guests.length > 40 ? `<p class="muted small">+${d.guests.length - 40} tamu lainnya — lihat export Excel.</p>` : ''}`
    : '<p class="muted">Tidak ada tamu di periode ini.</p>';

  return `<!doctype html>
<html lang="id"><head><meta charset="utf-8"><title>Laporan Ibadah — ${d.period.from} s.d. ${d.period.to}</title>
<style>${REPORT_CSS}
  .gb { display: inline-block; margin-top: 4px; font-size: 8.5px; font-weight: 700; padding: 1px 6px; border-radius: 999px; }
  .gb-up { background: #dcfce7; color: #15803d; } .gb-down { background: #fee2e2; color: #b91c1c; } .gb-n { background: #f1f5f9; color: #94a3b8; }
</style></head><body>
${opts.isMobileUa ? '<script>setTimeout(() => window.print(), 800);</script>' : '<div class="noprint"><strong>Print Preview — Laporan Ibadah</strong> · Tekan <kbd>Ctrl/Cmd + P</kbd> lalu pilih “Save as PDF” (aktifkan “Background graphics”).<button onclick="window.print()">Print / Save as PDF</button></div>'}
<div class="page">
  <div class="hero">
    <div class="eyebrow">Laporan Ibadah · Ringkasan Eksekutif</div>
    <h1>Kehadiran Ibadah</h1>
    <div class="meta">${esc(scope)}</div>
    <div class="period">📅 ${d.period.label ? `${esc(d.period.label)} · ` : ''}${fmtTgl(d.period.from)} – ${fmtTgl(d.period.to)}</div>
  </div>

  <h2 class="sec">Ringkasan</h2>
  ${kpis}
  <p class="muted small">Pembanding: periode sebelumnya dengan panjang sama (${fmtTgl(ins.prev.from)} – ${fmtTgl(ins.prev.to)}) — total ${n(ins.prev.totalHadir)}, jemaat unik ${n(ins.prev.uniqueJemaat)}, rata-rata ${n(ins.prev.rataRata)}.</p>

  ${section('Tren Mingguan', '📈', '#f97316', trend, 'Total kehadiran (jemaat + tamu) per minggu')}

  <div class="grid2">
    ${section('Jangkauan Jemaat', '🎯', '#3b82f6', jangkauan, d.filters.cabang ? `Jemaat aktif cabang ${d.filters.cabang}` : 'Jemaat aktif semua cabang')}
    ${section('Cara Check-in', '📲', '#10b981', methods, 'Distribusi metode check-in')}
  </div>

  ${section('Ringkasan per Ibadah', '⛪', '#f97316', perIbadahTable, 'Pertemuan ada kehadiran / terjadwal · okupansi = rata-rata hadir ÷ seat · vs lalu = total dibanding periode sebelumnya')}
  ${section('Sorotan Pertemuan', '⭐', '#f59e0b', highlights)}
  ${section(`Tamu (${n(d.guests.length)})`, '🙋', '#8b5cf6', guests, 'Untuk tindak lanjut tim penyambutan')}

  <div class="foot">
    <div>Dibuat ${esc(generated)} WIB · Okupansi hanya pendataan (check-in tidak dibatasi).</div>
    <div style="display:flex;align-items:center;gap:6px">Powered by <img src="${ideaLogo}" alt="IDEA" style="height:16px" onerror="this.style.display='none'"/></div>
  </div>
</div></body></html>`;
}
