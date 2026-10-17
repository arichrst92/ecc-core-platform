/**
 * Laporan cabang (PDF via print browser) — tampilan visual seperti halaman
 * detail cabang di portal: kartu KPI berwarna, bar, grafik garis & donut
 * (SVG inline, ikut tercetak), dan tabel ringkas. A4 portrait.
 */
import { esc, fmtTgl } from './print-report.js';
import type { CabangStats } from '../routes/admin/cabang.js';

const n = (v: number | null | undefined) => (v ?? 0).toLocaleString('id-ID');
const pctTxt = (v: number | null | undefined) => (v == null ? '—' : `${v.toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`);

function kpi(icon: string, label: string, value: string, sub: string, color: string) {
  return `<div class="kpi"><div class="kpi-top"><span class="kpi-label">${esc(label)}</span><span class="kpi-ic" style="background:${color}">${icon}</span></div>
  <div class="kpi-v">${esc(value)}</div><div class="kpi-s">${esc(sub)}</div></div>`;
}

function barRow(label: string, value: string, pct: number, color: string, extra = '') {
  const w = Math.max(0, Math.min(100, pct));
  return `<div class="br"><div class="br-h"><span>${esc(label)}</span><span><b>${esc(value)}</b>${extra}</span></div>
  <div class="br-t"><div class="br-f" style="width:${w}%;background:${color}"></div></div></div>`;
}

function section(title: string, icon: string, color: string, inner: string, sub = '') {
  return `<div class="card"><div class="card-h"><span class="card-ic" style="background:${color}">${icon}</span><div><div class="card-t">${esc(title)}</div>${
    sub ? `<div class="card-s">${esc(sub)}</div>` : ''
  }</div></div>${inner}</div>`;
}

/** Grafik garis (SVG) — beberapa seri, sumbu x = tanggal. */
function lineChart(labels: string[], series: { name: string; color: string; data: number[]; fill?: boolean }[], w = 720, h = 170) {
  const pad = { l: 34, r: 10, t: 10, b: 22 };
  const max = Math.max(1, ...series.flatMap((s) => s.data));
  const nice = Math.ceil(max / 5) * 5 || 5;
  const iw = w - pad.l - pad.r;
  const ih = h - pad.t - pad.b;
  const x = (i: number) => pad.l + (labels.length <= 1 ? iw / 2 : (i * iw) / (labels.length - 1));
  const y = (v: number) => pad.t + ih - (v / nice) * ih;
  const grid = [0, 0.25, 0.5, 0.75, 1]
    .map((g) => {
      const yy = pad.t + ih - g * ih;
      return `<line x1="${pad.l}" x2="${w - pad.r}" y1="${yy}" y2="${yy}" stroke="#eef2f7"/><text x="${pad.l - 4}" y="${yy + 3}" font-size="8" text-anchor="end" fill="#94a3b8">${Math.round(nice * g)}</text>`;
    })
    .join('');
  const step = Math.max(1, Math.ceil(labels.length / 8));
  const xl = labels
    .map((l, i) =>
      i % step === 0
        ? `<text x="${x(i)}" y="${h - 6}" font-size="8" text-anchor="middle" fill="#94a3b8">${esc(fmtTgl(l).replace(/ \d{4}$/, ''))}</text>`
        : '',
    )
    .join('');
  const paths = series
    .map((s) => {
      const pts = s.data.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
      const area = s.fill
        ? `<polygon points="${x(0)},${pad.t + ih} ${pts} ${x(s.data.length - 1)},${pad.t + ih}" fill="${s.color}" opacity="0.12"/>`
        : '';
      return `${area}<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round"/>`;
    })
    .join('');
  const legend = series
    .map((s) => `<span class="lg"><i style="background:${s.color}"></i>${esc(s.name)}</span>`)
    .join('');
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" style="height:auto">${grid}${paths}${xl}</svg><div class="legend">${legend}</div>`;
}

/** Donut (SVG) + legenda. */
function donut(items: { label: string; value: number; color: string }[], center: string, centerSub: string) {
  const total = items.reduce((a, b) => a + b.value, 0);
  const r = 46;
  const c = 2 * Math.PI * r;
  let off = 0;
  const arcs = total
    ? items
        .filter((i) => i.value > 0)
        .map((i) => {
          const len = (i.value / total) * c;
          const el = `<circle r="${r}" cx="60" cy="60" fill="none" stroke="${i.color}" stroke-width="18" stroke-dasharray="${len} ${c - len}" stroke-dashoffset="${-off}" transform="rotate(-90 60 60)"/>`;
          off += len;
          return el;
        })
        .join('')
    : `<circle r="${r}" cx="60" cy="60" fill="none" stroke="#e2e8f0" stroke-width="18"/>`;
  const legend = items
    .map(
      (i) =>
        `<div class="dl"><i style="background:${i.color}"></i><span>${esc(i.label)}</span><b>${n(i.value)}</b><em>${
          total ? pctTxt(Math.round((i.value * 1000) / total) / 10) : ''
        }</em></div>`,
    )
    .join('');
  return `<div class="donut"><svg viewBox="0 0 120 120" width="120" height="120">${arcs}<text x="60" y="58" text-anchor="middle" font-size="16" font-weight="700" fill="#0f172a">${esc(
    center,
  )}</text><text x="60" y="72" text-anchor="middle" font-size="8" fill="#64748b">${esc(centerSub)}</text></svg><div class="dls">${legend}</div></div>`;
}

/** Bar vertikal (SVG) — mis. visit per minggu. */
function columnChart(data: { label: string; value: number }[], color: string, w = 340, h = 120) {
  if (!data.length) return '<p class="muted">Belum ada data.</p>';
  const max = Math.max(1, ...data.map((d) => d.value));
  const pad = { l: 6, r: 6, t: 12, b: 18 };
  const bw = (w - pad.l - pad.r) / data.length;
  const ih = h - pad.t - pad.b;
  const bars = data
    .map((d, i) => {
      const bh = (d.value / max) * ih;
      const x = pad.l + i * bw + bw * 0.15;
      const yy = pad.t + ih - bh;
      return `<rect x="${x}" y="${yy}" width="${bw * 0.7}" height="${bh}" rx="2" fill="${color}"/><text x="${x + bw * 0.35}" y="${yy - 3}" font-size="7.5" text-anchor="middle" fill="#334155">${d.value}</text><text x="${
        x + bw * 0.35
      }" y="${h - 5}" font-size="7" text-anchor="middle" fill="#94a3b8">${esc(d.label)}</text>`;
    })
    .join('');
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" style="height:${h}px">${bars}</svg>`;
}

export function renderCabangReportHtml(d: CabangStats, opts: { isMobileUa: boolean }): string {
  const x = d.executive;
  const o = x.okupansi;
  const v = x.visit;
  const k = x.ckids;
  const ideaLogo = `${(process.env.PORTAL_URL ?? 'https://portal.eccchurch.global').replace(/\/$/, '')}/logo-idea.webp`;
  const generated = new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' });

  const journey = x.journey.total
    ? x.journey.stages
        .map((st) => barRow(st.label, n(st.count), st.pct, st.stage === 0 ? '#cbd5e1' : '#10b981', ` <span class="muted">· ${pctTxt(st.pct)}</span>`))
        .join('')
    : '<p class="muted">Belum ada tahap Spiritual Journey.</p>';

  const ket = x.keterlibatan;
  const keterlibatan = [
    barRow('Terlibat pelayanan', n(ket.pelayanan), ket.pelayananPct, '#ec4899', ` <span class="muted">· ${pctTxt(ket.pelayananPct)}</span>`),
    barRow('Terlibat homecell', n(ket.homecell), ket.homecellPct, '#8b5cf6', ` <span class="muted">· ${pctTxt(ket.homecellPct)}</span>`),
    barRow('Pelayanan & homecell', n(ket.keduanya), ket.keduanyaPct, '#f97316', ` <span class="muted">· ${pctTxt(ket.keduanyaPct)}</span>`),
    barRow('Belum terhubung', n(ket.belumTerhubung), ket.belumTerhubungPct, '#94a3b8', ` <span class="muted">· ${pctTxt(ket.belumTerhubungPct)}</span>`),
  ].join('');

  const okupansiBody =
    o.perIbadah.length || o.rataOkupansi != null
      ? `<div class="big"><div class="big-v" style="color:${(o.rataOkupansi ?? 0) > 100 ? '#dc2626' : '#0f766e'}">${pctTxt(o.rataOkupansi)}</div><div class="big-s">rata-rata okupansi${
          o.melebihi ? ` · <b style="color:#dc2626">${o.melebihi}× melebihi seat</b>` : ''
        }</div></div>
      ${o.perIbadah
        .slice(0, 8)
        .map((r) =>
          r.rataOkupansi == null
            ? barRow(`${r.nama} ${r.jamMulai}`, `${n(r.rataHadir)} hadir`, 0, '#e2e8f0', ' <span class="muted">· seat belum diisi</span>')
            : barRow(
                `${r.nama} ${r.jamMulai}`,
                pctTxt(r.rataOkupansi),
                r.rataOkupansi,
                r.rataOkupansi > 100 ? '#ef4444' : r.rataOkupansi >= 80 ? '#f59e0b' : '#14b8a6',
                ` <span class="muted">· ${n(r.rataHadir)}/${n(r.seat)}</span>`,
              ),
        )
        .join('')}
      ${o.ibadahTanpaSeat ? `<p class="muted small">${o.ibadahTanpaSeat} ibadah belum mengisi jumlah seat.</p>` : ''}`
      : '<p class="muted">Belum ada kehadiran ibadah di periode ini.</p>';

  const ageMax = Math.max(1, ...x.ageGroups.map((g) => g.count));
  const demografi = `
    <div class="gender"><div class="gbar"><div style="width:${x.jemaat.aktif ? (x.jemaat.pria / x.jemaat.aktif) * 100 : 0}%;background:#0ea5e9"></div><div style="width:${
      x.jemaat.aktif ? (x.jemaat.wanita / x.jemaat.aktif) * 100 : 0
    }%;background:#f472b6"></div></div>
    <div class="gl"><span style="color:#0369a1">♂ Laki-laki <b>${n(x.jemaat.pria)}</b></span><span style="color:#be185d">♀ Perempuan <b>${n(x.jemaat.wanita)}</b></span></div></div>
    ${x.ageGroups.map((g) => barRow(g.label, n(g.count), (g.count / ageMax) * 100, '#f59e0b')).join('')}
    ${x.jemaat.tanpaTanggalLahir ? `<p class="muted small">${n(x.jemaat.tanpaTanggalLahir)} belum mengisi tanggal lahir.</p>` : ''}`;

  const topIbadahMax = Math.max(1, ...d.topIbadah.map((i) => i.kehadiran));
  const topIbadah = d.topIbadah.length
    ? d.topIbadah.slice(0, 8).map((i) => barRow(i.ibadahNama, n(i.kehadiran), (i.kehadiran / topIbadahMax) * 100, '#3b82f6')).join('')
    : '<p class="muted">Belum ada kehadiran ibadah.</p>';

  const visitBody = `
    <div class="mini4">
      <div><b>${n(v.total)}</b><span>Total visit</span></div>
      <div><b>${n(v.pelakuUnik)}</b><span>Pelaku</span></div>
      <div><b>${n(v.dikunjungiUnik)}</b><span>Dikunjungi</span></div>
      <div><b>${n(v.rataPerPelaku)}</b><span>Rata² / pelaku</span></div>
    </div>
    <div class="two"><div><div class="sub-t">Visit per minggu</div>${columnChart(
      v.perMinggu.map((w) => ({ label: fmtTgl(w.week).replace(/ \d{4}$/, ''), value: w.count })),
      '#f43f5e',
    )}</div><div><div class="sub-t">Paling aktif</div>${
      v.topPelaku.length
        ? v.topPelaku.map((p) => barRow(p.nama, `${p.count}×`, (p.count / Math.max(1, v.topPelaku[0]!.count)) * 100, '#fb7185')).join('')
        : '<p class="muted">Belum ada visit.</p>'
    }</div></div>`;

  const ckidsBody = `
    <div class="mini4">
      <div><b>${n(k.anakTerdaftar)}</b><span>Anak terdaftar (≤13)</span></div>
      <div><b>${n(k.anakHadirUnik)}</b><span>Anak hadir · ${pctTxt(k.anakHadirPct)}</span></div>
      <div><b>${n(k.rataRataPerPertemuan)}</b><span>Rata² / pertemuan</span></div>
      <div><b>${n(k.penukaranHadiah)}</b><span>Penukaran hadiah</span></div>
    </div>
    <div class="two"><div>
      ${barRow('Poin diberikan', n(k.poinDiberikan), 100, '#22c55e')}
      ${barRow('Poin ditukar', n(k.poinDitukar), k.poinDiberikan ? (k.poinDitukar / k.poinDiberikan) * 100 : 0, '#f59e0b')}
      <p class="muted small">${n(k.hadiahAktif)} hadiah aktif · stok ${n(k.stokHadiah)}${k.hadiahStokHabis ? ` · <b style="color:#dc2626">${k.hadiahStokHabis} habis</b>` : ''} · ${n(
        k.ibadahAnak,
      )} ibadah anak · ${n(k.pertemuan)} pertemuan</p>
    </div><div><div class="sub-t">Hadiah favorit</div>${
      k.topHadiah.length
        ? k.topHadiah.map((h) => barRow(h.nama, `${h.count}×`, (h.count / Math.max(1, k.topHadiah[0]!.count)) * 100, '#a855f7')).join('')
        : '<p class="muted">Belum ada penukaran.</p>'
    }</div></div>`;

  const eventTable = d.topEvent.length
    ? `<table><thead><tr><th>Event</th><th>Tanggal</th><th class="r">Daftar</th><th class="r">Bayar</th><th class="r">Hadir</th><th class="r">Total</th></tr></thead><tbody>${d.topEvent
        .map(
          (e) =>
            `<tr><td>${esc(e.judul)}</td><td>${fmtTgl(new Date(e.tanggalMulai).toISOString().slice(0, 10))}</td><td class="r">${e.daftar}</td><td class="r">${e.bayar}</td><td class="r b ok">${e.hadir}</td><td class="r b">${e.totalPartisipasi}</td></tr>`,
        )
        .join('')}</tbody></table>`
    : '<p class="muted">Tidak ada event di periode ini.</p>';

  const hcTable = d.homecells.length
    ? `<table><thead><tr><th>Homecell</th><th>Area</th><th class="r">Anggota</th><th class="r">Baru</th><th class="r">Pertemuan</th><th class="r">Hadir</th><th class="r">Rata² hadir</th></tr></thead><tbody>${d.homecells
        .map((h) => {
          const p = h.avgAttendancePercent;
          const c = p == null ? '#94a3b8' : p >= 75 ? '#15803d' : p >= 50 ? '#b45309' : '#dc2626';
          return `<tr${h.isActive ? '' : ' style="opacity:.5"'}><td>${esc(h.nama)}</td><td>${esc(h.area)}</td><td class="r">${h.memberAktif}</td><td class="r ok">${h.memberBaru ? `+${h.memberBaru}` : ''}</td><td class="r">${h.scheduleCount}</td><td class="r">${h.totalAttendance}</td><td class="r b" style="color:${c}">${p == null ? '—' : `${p}%`}</td></tr>`;
        })
        .join('')}</tbody></table>`
    : '<p class="muted">Belum ada homecell.</p>';

  const rsRaw = d.reservasiStatusBreakdown;
  const rs = { JOIN: rsRaw.JOIN ?? 0, RESERVE: rsRaw.RESERVE ?? 0, CANCEL: rsRaw.CANCEL ?? 0 };

  return `<!doctype html>
<html lang="id"><head><meta charset="utf-8"><title>Laporan Cabang ${esc(d.cabang.nama)} — ${d.periode.from} s.d. ${d.periode.to}</title>
<style>
  @page { size: A4 portrait; margin: 10mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 10px; color: #0f172a; margin: 0; background: #f8fafc; }
  .page { max-width: 210mm; margin: 0 auto; padding: 6mm; }
  .hero { background: linear-gradient(135deg, #f97316, #c2410c); color: #fff; border-radius: 14px; padding: 16px 18px; position: relative; overflow: hidden; }
  .hero:after { content: ''; position: absolute; right: -40px; top: -40px; width: 160px; height: 160px; border-radius: 50%; background: rgba(255,255,255,.12); }
  .hero .eyebrow { font-size: 9px; letter-spacing: .14em; text-transform: uppercase; opacity: .85; font-weight: 700; }
  .hero h1 { font-size: 22px; margin: 4px 0 2px; }
  .hero .code { font-family: ui-monospace, monospace; background: rgba(255,255,255,.2); padding: 1px 7px; border-radius: 6px; font-size: 12px; margin-left: 6px; }
  .hero .meta { font-size: 10.5px; opacity: .92; }
  .hero .period { display: inline-block; margin-top: 8px; background: #fff; color: #c2410c; font-weight: 700; border-radius: 999px; padding: 3px 10px; font-size: 10px; }
  h2.sec { font-size: 12.5px; margin: 16px 2px 8px; color: #0f172a; display: flex; align-items: center; gap: 6px; }
  h2.sec:before { content: ''; width: 4px; height: 14px; border-radius: 2px; background: #f97316; display: inline-block; }
  .kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .kpi { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 10px 12px; break-inside: avoid; }
  .kpi-top { display: flex; justify-content: space-between; align-items: center; }
  .kpi-label { font-size: 8.5px; text-transform: uppercase; letter-spacing: .08em; color: #64748b; font-weight: 700; }
  .kpi-ic { width: 22px; height: 22px; border-radius: 7px; color: #fff; display: inline-flex; align-items: center; justify-content: center; font-size: 11px; }
  .kpi-v { font-size: 20px; font-weight: 800; margin-top: 4px; }
  .kpi-s { font-size: 9px; color: #64748b; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px; }
  .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px; break-inside: avoid; margin-top: 8px; }
  .grid2 .card { margin-top: 0; }
  .card-h { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
  .card-ic { width: 24px; height: 24px; border-radius: 8px; color: #fff; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; }
  .card-t { font-weight: 700; font-size: 11.5px; } .card-s { font-size: 9px; color: #64748b; }
  .br { margin: 6px 0; } .br-h { display: flex; justify-content: space-between; gap: 8px; font-size: 9.5px; color: #334155; }
  .br-h span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .br-t { height: 7px; background: #f1f5f9; border-radius: 4px; overflow: hidden; margin-top: 3px; } .br-f { height: 100%; border-radius: 4px; }
  .big { display: flex; align-items: baseline; gap: 8px; margin-bottom: 6px; } .big-v { font-size: 26px; font-weight: 800; } .big-s { font-size: 9.5px; color: #64748b; }
  .legend { display: flex; gap: 12px; justify-content: center; font-size: 9px; color: #475569; margin-top: 4px; }
  .lg i, .dl i { display: inline-block; width: 9px; height: 9px; border-radius: 3px; margin-right: 4px; vertical-align: -1px; }
  .donut { display: flex; align-items: center; gap: 12px; } .dls { flex: 1; } .dl { display: grid; grid-template-columns: 14px 1fr auto 44px; gap: 6px; align-items: center; font-size: 9.5px; padding: 3px 0; border-bottom: 1px dashed #eef2f7; }
  .dl b { text-align: right; } .dl em { text-align: right; font-style: normal; color: #64748b; }
  .gender .gbar { display: flex; height: 10px; border-radius: 5px; overflow: hidden; background: #f1f5f9; } .gender .gl { display: flex; justify-content: space-between; font-size: 9.5px; margin: 4px 0 8px; }
  .mini4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-bottom: 8px; }
  .mini4 div { background: #f8fafc; border: 1px solid #eef2f7; border-radius: 8px; padding: 6px 8px; } .mini4 b { display: block; font-size: 15px; } .mini4 span { font-size: 8.5px; color: #64748b; }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; } .sub-t { font-size: 9px; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: .06em; margin-bottom: 4px; }
  table { border-collapse: collapse; width: 100%; font-size: 9.5px; } th { background: #f8fafc; color: #475569; font-weight: 700; text-align: left; }
  th, td { padding: 4px 6px; border-bottom: 1px solid #eef2f7; } .r { text-align: right; } .b { font-weight: 700; } .ok { color: #15803d; }
  .muted { color: #94a3b8; } .small { font-size: 8.5px; margin: 6px 0 0; }
  .foot { display: flex; justify-content: space-between; align-items: center; margin-top: 14px; padding-top: 8px; border-top: 1px solid #e2e8f0; font-size: 8.5px; color: #94a3b8; }
  .noprint { padding: 10px; background: #fff7ed; border-bottom: 1px solid #fed7aa; font-size: 12px; }
  .noprint button { padding: 6px 12px; background: #ea580c; color: #fff; border: none; border-radius: 6px; font-size: 12px; cursor: pointer; margin-left: 8px; }
  @media print { .noprint { display: none !important; } body { background: #fff; } .page { padding: 0; } }
</style></head><body>
${opts.isMobileUa ? '<script>setTimeout(() => window.print(), 800);</script>' : '<div class="noprint"><strong>Print Preview — Laporan Cabang</strong> · Tekan <kbd>Ctrl/Cmd + P</kbd> lalu pilih “Save as PDF” (aktifkan “Background graphics”).<button onclick="window.print()">Print / Save as PDF</button></div>'}
<div class="page">
  <div class="hero">
    <div class="eyebrow">Laporan Cabang · Ringkasan Eksekutif</div>
    <h1>${esc(d.cabang.nama)}<span class="code">${esc(d.cabang.kode)}</span></h1>
    <div class="meta">Sinode ${esc(d.cabang.sinode.nama)}${d.cabang.alamat ? ` · ${esc(d.cabang.alamat)}` : ''}</div>
    <div class="period">📅 ${fmtTgl(d.periode.from)} – ${fmtTgl(d.periode.to)} · ${d.periode.days} hari</div>
  </div>

  <h2 class="sec">Ringkasan</h2>
  <div class="kpis">
    ${kpi('👥', 'Jemaat aktif', n(x.jemaat.aktif), `+${n(x.jemaat.baru)} baru di periode · ${n(x.jemaat.tamu)} tamu tercatat`, '#f97316')}
    ${kpi('✅', 'Hadir ibadah (unik)', n(x.ibadah.jemaatHadirUnik), `${pctTxt(x.ibadah.jemaatHadirPct)} dari jemaat aktif`, '#3b82f6')}
    ${kpi('🪑', 'Okupansi ibadah', pctTxt(o.rataOkupansi), `rata-rata ${n(x.ibadah.rataRataPerPertemuan)} hadir / pertemuan`, '#14b8a6')}
    ${kpi('🤝', 'Terlibat pelayanan', pctTxt(ket.pelayananPct), `${n(ket.pelayanan)} jemaat`, '#ec4899')}
    ${kpi('🏠', 'Terlibat homecell', pctTxt(ket.homecellPct), `${n(ket.homecell)} jemaat · ${n(d.kpi.homecellAktif)} homecell`, '#8b5cf6')}
    ${kpi('📱', 'Aktif di app', pctTxt(x.app.aktif30HariPct), `${n(x.app.aktif30Hari)} jemaat · 30 hari terakhir`, '#10b981')}
    ${kpi('🙋', 'Tamu hadir (unik)', n(x.ibadah.tamuHadirUnik), `${n(x.jemaat.tamuBaru)} tamu baru tercatat`, '#7c3aed')}
    ${kpi('🎉', 'Kehadiran event', n(d.kpi.totalEventCheckin), `${n(d.kpi.eventDiPeriode)} event di periode`, '#f59e0b')}
    ${kpi('🚶', 'Visit', n(v.total), `${n(v.pelakuUnik)} pelaku · ${n(v.dikunjungiUnik)} dikunjungi`, '#f43f5e')}
  </div>

  <div class="grid2">
    ${section('Spiritual Journey', '👣', '#10b981', journey, 'Jemaat aktif per tahap saat ini')}
    ${section('Keterlibatan Jemaat', '🧩', '#ec4899', keterlibatan, 'Terhubung ke pelayanan & homecell')}
  </div>

  ${section(
    'Tren Kehadiran',
    '📈',
    '#3b82f6',
    lineChart(
      d.timeSeries.map((t) => t.tanggal),
      [
        { name: 'Ibadah', color: '#3b82f6', data: d.timeSeries.map((t) => t.ibadahCheckin), fill: true },
        { name: 'Event', color: '#f59e0b', data: d.timeSeries.map((t) => t.eventCheckin) },
      ],
    ),
    'Kehadiran ibadah & event per hari',
  )}

  <div class="grid2">
    ${section('Okupansi Ibadah', '🪑', '#14b8a6', okupansiBody, 'Hadir ÷ jumlah seat (pendataan)')}
    ${section(
      'Status Reservasi Ibadah',
      '🎟️',
      '#6366f1',
      donut(
        [
          { label: 'Hadir', value: rs.JOIN, color: '#22c55e' },
          { label: 'Reservasi', value: rs.RESERVE, color: '#3b82f6' },
          { label: 'Batal', value: rs.CANCEL, color: '#ef4444' },
        ],
        n(rs.JOIN + rs.RESERVE + rs.CANCEL),
        'total',
      ),
    )}
  </div>

  <div class="grid2">
    ${section('Ibadah Terpopuler', '⛪', '#3b82f6', topIbadah, 'Berdasarkan total check-in')}
    ${section('Demografi', '🧑‍🤝‍🧑', '#f59e0b', demografi, 'Jemaat aktif')}
  </div>

  ${section('Aktivitas Visit', '🚶', '#f43f5e', visitBody, 'Kunjungan oleh / kepada jemaat cabang ini')}
  ${section('CKids', '🧒', '#a855f7', ckidsBody, 'Anak ≤13 tahun, ibadah anak, poin & hadiah')}
  ${section('Partisipasi Event', '🎉', '#f59e0b', eventTable)}
  ${section('Aktivitas Homecell', '🏠', '#8b5cf6', hcTable, `${n(d.kpi.homecellAktif)} homecell · ${n(d.kpi.homecellArea)} area · ${n(d.kpi.totalHomecellPertemuan)} pertemuan`)}

  <div class="foot">
    <div>Dibuat ${esc(generated)} WIB · Persentase dari jemaat aktif (anggota) cabang saat ini.</div>
    <div style="display:flex;align-items:center;gap:6px">Powered by <img src="${ideaLogo}" alt="IDEA" style="height:16px" onerror="this.style.display='none'"/></div>
  </div>
</div></body></html>`;
}
