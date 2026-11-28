/**
 * Export PDF Forecast — slide 16:9 (13,33 × 7,5 inci, ukuran PowerPoint), satu
 * slide per halaman. Bahasa sederhana. Penutup: logo ECC Church × IDEA +
 * pernyataan pertumbuhan + ayat. Peringatan "perkiraan awal" bila data masih dini.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { esc } from './print-report.js';
import { ideaLogoSvg } from './idea-logo.js';
import type { Forecast } from './forecast.js';

const nf = (v: number | null | undefined) => (v == null ? '—' : Math.round(v).toLocaleString('id-ID'));
const mLabel = (k: string, long = false) =>
  new Date(`${k}-01T00:00:00.000Z`).toLocaleDateString('id-ID', { month: long ? 'long' : 'short', year: 'numeric', timeZone: 'UTC' });
const naikTurun = (p: number | null | undefined) =>
  p == null ? '' : p >= 0 ? `<span class="up"><b>naik ${p.toLocaleString('id-ID')}%</b></span>` : `<span class="down"><b>turun ${Math.abs(p).toLocaleString('id-ID')}%</b></span>`;

/** Logo ECC Church disisipkan langsung (data URI) supaya tetap tampil saat dicetak / offline. */
let eccLogo: string | null | undefined;
function eccLogoSrc(portalUrl: string): string {
  if (eccLogo === undefined) {
    eccLogo = null;
    for (const p of [resolve(process.cwd(), '../portal/public/logo-ecc-church.webp'), resolve(process.cwd(), 'apps/portal/public/logo-ecc-church.webp')]) {
      try {
        eccLogo = `data:image/webp;base64,${readFileSync(p).toString('base64')}`;
        break;
      } catch {
        /* coba lokasi berikutnya */
      }
    }
  }
  return eccLogo ?? `${portalUrl}/logo-ecc-church.webp`;
}

export function renderForecastPdf(d: Forecast, o: { cabang: string | null; isMobileUa: boolean; portalUrl: string }): string {
  const scope = o.cabang ?? 'Seluruh Sinode';
  const logo = eccLogoSrc(o.portalUrl);
  const period = d.months.length ? `${mLabel(d.months[0]!, true)} – ${mLabel(d.months[d.months.length - 1]!, true)}` : '';
  const dibuat = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' });
  const early = d.maturity.early;
  const r = d.ringkasan;
  let page = 1;
  const foot = () => `<div class="foot"><span>Laporan Pertumbuhan Jemaat · ${esc(scope)} · ${esc(r.bulan ? mLabel(r.bulan) : '')}</span><span class="pg">${++page}</span></div>`;
  const warn = early
    ? `<div class="warnbox"><b>Perkiraan awal.</b> Data Els App baru ${d.maturity.dataMonths} bulan (minimal ${d.maturity.trendMin} bulan untuk perkiraan yang lebih tepat). Angka ini akan makin tepat setiap bulan.</div>`
    : '';
  const slides: string[] = [];

  // 1. Sampul
  slides.push(`<section class="slide cover"><div class="in">
  <div class="logo"><img src="${logo}" alt="ECC Church" style="height:64px;display:block" onerror="this.parentElement.style.display='none'"></div>
  <h1>Laporan Pertumbuhan Jemaat</h1>
  <div class="meta">${esc(scope)} · ${esc(period)}</div>
  <div class="pills">${d.forecast ? `<span class="pill">Perkiraan sampai ${esc(mLabel(d.forecast.months[d.forecast.months.length - 1]!))}</span>` : ''}<span class="pill">Dibuat ${esc(dibuat)}</span>${early ? `<span class="pill warnpill">Perkiraan awal — data baru ${d.maturity.dataMonths} bulan</span>` : ''}</div>
  <div class="pb">Powered by <span class="pbl">${ideaLogoSvg(26)}</span></div>
</div></section>`);

  // 2. Ringkasan
  slides.push(`<section class="slide"><div class="in">
  <div class="kick">Ringkasan ${esc(r.bulan ? mLabel(r.bulan, true) : '')}</div>
  <h2>${r.vsBulanLalu == null || r.vsBulanLalu >= 0 ? 'Jemaat yang aktif di Els App terus bertambah' : 'Jemaat yang aktif di Els App sedikit menurun'}</h2>
  <div class="lead">"Jemaat aktif" artinya jemaat yang membuka Els App minimal sekali dalam sebulan.</div>
  <div class="big">
    <div class="bn"><div class="v">${nf(r.aktif)}</div><div class="l">jemaat aktif</div><div class="s">${naikTurun(r.vsBulanLalu)} dari bulan sebelumnya${r.vsTahunLalu != null ? `, ${naikTurun(r.vsTahunLalu)} dari tahun lalu` : ''}</div></div>
    <div class="bn"><div class="v" style="color:#047857">+${nf(r.baru)}</div><div class="l">jemaat baru</div><div class="s">pertama kali memakai Els App</div></div>
    <div class="bn"><div class="v" style="color:#B91C1C">−${nf(r.berhenti)}</div><div class="l">berhenti aktif</div><div class="s">tidak membuka Els App selama 2 bulan</div></div>
    <div class="bn"><div class="v" style="color:#6D28D9">${nf(d.tamu.bulanIni.tamu)}</div><div class="l">tamu hadir</div><div class="s">${nf(d.tamu.bulanIni.newComer)} orang baru yang berpotensi berjemaat</div></div>
  </div>
  <div class="say">Jemaat aktif ${r.bersih >= 0 ? 'bertambah' : 'berkurang'} <b>${nf(Math.abs(r.bersih))} orang</b> (${nf(r.baru)} baru + ${nf(r.kembali)} kembali aktif − ${nf(r.berhenti)} berhenti).${r.tumbuh6 != null ? ` Rata-rata 6 bulan terakhir <b>${r.tumbuh6 >= 0 ? 'naik' : 'turun'} ${Math.abs(r.tumbuh6).toLocaleString('id-ID')}% per bulan</b>.` : ''}</div>
  ${foot()}
</div></section>`);

  // 3. Grafik perkiraan
  if (d.forecast) {
    slides.push(`<section class="slide"><div class="in">
  <div class="kick">Pertumbuhan & perkiraan</div>
  <h2>Perkiraan ${Math.round(d.horizon / 12) >= 1 ? `${Math.round(d.horizon / 12)} tahun` : `${d.horizon} bulan`} ke depan</h2>
  <div class="lead">Garis oranye = yang sudah terjadi. Garis ungu putus-putus = perkiraan. Daerah ungu = kemungkinan naik-turunnya.</div>
  ${mainChart(d)}
  ${warn}
  <div class="lg"><span><b style="background:#F97316"></b>Sudah terjadi</span><span><b style="background:#8B5CF6;height:3px"></b>Perkiraan</span><span><b style="background:#EDE9FE"></b>Kemungkinan naik-turun</span>${d.horizon > 24 ? '<span><b style="background:#F8FAFC;border:1px solid #E2E8F0"></b>Lebih dari 2 tahun: gambaran arah saja</span>' : ''}</div>
  ${foot()}
</div></section>`);

    // 4. Per tahun
    slides.push(`<section class="slide"><div class="in">
  <div class="kick">Perkiraan per tahun</div>
  <h2>Jika keadaan seperti sekarang terus berlanjut…</h2>
  <div class="two">
    <div><table><thead><tr><th>Akhir tahun</th><th class="num">Perkiraan</th><th class="num">Paling rendah</th><th class="num">Paling tinggi</th><th class="num">Dibanding sekarang</th></tr></thead><tbody>
      ${d.perTahun
        .map(
          (y) =>
            `<tr><td><b>${y.tahun}</b>${y.jangkaPanjang ? ' <span class="muted">(gambaran arah)</span>' : ''}</td><td class="num"><b>${nf(y.value)}</b></td><td class="num muted">${nf(y.lo)}</td><td class="num muted">${nf(y.hi)}</td><td class="num">${naikTurun(r.aktif ? Math.round((y.value / r.aktif - 1) * 100) : null)}</td></tr>`,
        )
        .join('') || '<tr><td colspan="5" class="muted">Perkiraan belum sampai akhir tahun.</td></tr>'}
    </tbody></table>
    <div style="margin-top:10px"><span class="warn">${early ? `Data baru ${d.maturity.dataMonths} bulan — semua angka di tabel ini masih perkiraan awal. ` : ''}Angka lebih dari 2 tahun adalah gambaran arah, bukan janji. Dihitung ulang setiap bulan.</span></div></div>
    <div class="box"><h4>Kapan angka penting tercapai?</h4><ul class="pts">
      ${d.milestones.map((m) => `<li><b>${nf(m.target)} jemaat aktif</b> — sekitar <b>${esc(mLabel(m.month, true))}</b></li>`).join('') || '<li>Belum ada tonggak dalam rentang perkiraan.</li>'}
      <li>Makin besar jumlah jemaat, persentase kenaikannya biasanya makin kecil — perkiraan sudah memperhitungkan hal ini.</li></ul></div>
  </div>
  ${foot()}
</div></section>`);
  }

  // 5. Tamu
  const t = d.tamu;
  const stages: [string, number, string][] = [
    ['Datang pertama kali', t.perjalanan.datang, '#8B5CF6'],
    ['Datang lagi', t.perjalanan.datangLagi, '#7C3AED'],
    ['Dihubungi / ikut homecell', t.perjalanan.dihubungi, '#0EA5E9'],
    ['Daftar Els App', t.perjalanan.daftar, '#F97316'],
    ['Menjadi jemaat aktif', t.perjalanan.aktif, '#C2410C'],
  ];
  const sMax = Math.max(1, t.perjalanan.datang);
  slides.push(`<section class="slide"><div class="in">
  <div class="kick">Tamu</div>
  <h2>Dari tamu menjadi jemaat</h2>
  <div class="lead">Dari ${nf(t.perjalanan.datang)} tamu dalam 3 bulan terakhir, <b>${nf(t.perjalanan.aktif)} orang (${t.konversi.total ?? 0}%)</b> kini sudah menjadi jemaat aktif di Els App.</div>
  <div class="two">
    <div class="box"><h4>Perjalanan tamu (3 bulan)</h4>${stages.map(([l, v, c]) => `<div style="margin:9px 0"><div style="display:flex;justify-content:space-between;font-size:16px"><span>${l}</span><b>${nf(v)} orang</b></div><div class="fbar"><div style="width:${(v / sMax) * 100}%;background:linear-gradient(90deg,${c},${c}cc)"></div></div></div>`).join('')}</div>
    <div class="box"><h4>Yang bisa kita lakukan</h4><ul class="pts">
      ${t.konversi.newComer != null ? `<li>Tamu <b>New Comer</b> ${t.konversi.newComer}% menjadi jemaat aktif, Visitor ${t.konversi.visitor ?? 0}%.</li>` : ''}
      ${t.belumFollowUp ? `<li><b>${nf(t.belumFollowUp)} New Comer</b> belum dihubungi tim follow-up.</li>` : '<li>Semua New Comer sudah dihubungi tim follow-up.</li>'}
      <li>Ajak tamu ke <b>homecell</b> — tamu yang terhubung lebih sering kembali.</li></ul></div>
  </div>
  ${foot()}
</div></section>`);

  // 6. Kapasitas
  const st = (p: number | null) => (p == null ? ['#F1F5F9', '#475569', '—'] : p >= 90 ? ['#FEE2E2', '#B91C1C', 'penuh'] : p >= 75 ? ['#FEF3C7', '#B45309', 'mulai padat'] : ['#DCFCE7', '#15803D', 'longgar']);
  const kap = d.kapasitas.list.filter((x) => x.kursi).slice(0, 7);
  const firstFull = d.kapasitas.list.find((x) => x.penuhMulai);
  const alt = firstFull ? d.kapasitas.list.filter((x) => x.cabangId === firstFull.cabangId && x.id !== firstFull.id && (x.okupansi ?? 100) < 60).sort((a, b) => (a.okupansi ?? 0) - (b.okupansi ?? 0))[0] : undefined;
  slides.push(`<section class="slide"><div class="in">
  <div class="kick">Kesiapan tempat ibadah</div>
  <h2>${firstFull ? 'Beberapa ibadah akan segera penuh' : 'Tempat ibadah masih cukup'}</h2>
  <div class="lead">Hijau = masih longgar · kuning = mulai padat · merah = penuh (90% kursi terisi atau lebih).</div>
  <table style="margin-top:14px"><thead><tr><th>Ibadah</th><th class="num">Kursi</th><th class="num">Rata-rata hadir</th><th class="num">Terisi sekarang</th><th class="num">Perkiraan 1 tahun lagi</th><th>Diperkirakan penuh</th></tr></thead><tbody>
  ${
    kap
      .map((x) => {
        const [b0, c0, t0] = st(x.okupansi);
        const [b1, c1, t1] = st(x.okupansi12);
        return `<tr><td><b>${esc(x.nama)}</b> <span class="muted">— ${esc(x.cabang)}</span></td><td class="num">${nf(x.kursi)}</td><td class="num">${nf(x.rataHadir)}</td><td class="num"><span class="chip" style="background:${b0};color:${c0}">${x.okupansi ?? '—'}% · ${t0}</span></td><td class="num"><span class="chip" style="background:${b1};color:${c1}">${x.okupansi12 ?? '—'}% · ${t1}</span></td><td style="font-weight:700;color:${x.penuhMulai ? '#B91C1C' : '#A3A3A3'}">${x.penuhMulai ? `± ${esc(mLabel(x.penuhMulai, true))}` : 'belum dalam rentang perkiraan'}</td></tr>`;
      })
      .join('') || '<tr><td colspan="6" class="muted">Belum ada ibadah dengan jumlah kursi. Isi di Ibadah → Edit ibadah.</td></tr>'
  }
  </tbody></table>
  ${firstFull ? `<div class="say" style="font-size:16.5px">Saran: siapkan tambahan kursi di <b>${esc(firstFull.nama)} ${esc(firstFull.cabang)}</b>${alt ? `, atau ajak sebagian jemaat ke <b>${esc(alt.nama)}</b> yang masih longgar (${alt.okupansi}%)` : ', atau tambah jam ibadah'}.</div>` : ''}
  ${foot()}
</div></section>`);

  // 7. Cabang & platform
  const pr = d.platform.ringkasan.filter((p) => p.platform !== 'lainnya');
  const pTot = Math.max(1, pr.reduce((a, p) => a + p.aktif, 0));
  const PCOL: Record<string, string> = { android: '#16A34A', ios: '#2563EB', web: '#F59E0B' };
  const PLAB: Record<string, string> = { android: 'Android', ios: 'iOS', web: 'Web' };
  const web = pr.find((p) => p.platform === 'web');
  slides.push(`<section class="slide"><div class="in">
  <div class="kick">Per cabang & perangkat</div>
  <h2>Cabang mana yang tumbuh paling cepat?</h2>
  <div class="two">
    <div><table><thead><tr><th>Cabang</th><th class="num">Jemaat aktif</th><th class="num">Dibanding bulan lalu</th><th class="num">Perkiraan 1 tahun</th></tr></thead><tbody>
      ${d.perCabang.slice(0, 7).map((c) => `<tr><td><b>${esc(c.nama)}</b></td><td class="num">${nf(c.aktif)}</td><td class="num">${naikTurun(c.tumbuhPersen)}</td><td class="num">${nf(c.prediksi12)}${c.kecil ? ' <span class="muted">*</span>' : ''}</td></tr>`).join('')}
    </tbody></table>${d.perCabang.some((c) => c.kecil) ? '<div class="muted" style="font-size:13px;margin-top:6px">* cabang kecil — perkiraan kurang pasti.</div>' : ''}</div>
    <div class="box"><h4>Jemaat memakai Els App dari…</h4>
      ${pr.map((p) => `<div style="margin:10px 0"><div style="display:flex;justify-content:space-between;font-size:16px"><b>${PLAB[p.platform]}</b><b>${Math.round((p.aktif / pTot) * 100)}%</b></div><div class="fbar" style="height:14px"><div style="width:${(p.aktif / pTot) * 100}%;background:${PCOL[p.platform]}"></div></div></div>`).join('')}
      ${web?.retensi1 != null ? `<ul class="pts" style="font-size:15px"><li>Pemakai web bertahan di bulan kedua: ${web.retensi1}%.</li></ul>` : ''}</div>
  </div>
  ${foot()}
</div></section>`);

  // 8. Homecell & event
  const hc = d.homecell;
  const topEv = d.event.perEvent.filter((e) => e.jadiJemaat > 0).sort((a, b) => (b.bertahanPersen ?? 0) - (a.bertahanPersen ?? 0))[0];
  const lowEv = d.event.perEvent.find((e) => e.tamu >= 20 && (e.bertahanPersen ?? 100) < 50);
  slides.push(`<section class="slide"><div class="in">
  <div class="kick">Homecell & event</div>
  <h2>Homecell menjaga, event menjangkau</h2>
  <div class="two">
    <div class="box"><h4>Homecell</h4><ul class="pts">
      ${hc.persenAktif != null ? `<li><b>${hc.persenAktif}%</b> jemaat aktif sudah ikut homecell.</li>` : ''}
      ${hc.stopIn != null && hc.stopOut != null ? `<li>Jemaat yang ikut homecell ${hc.stopIn <= hc.stopOut ? '<b>lebih jarang berhenti</b>' : 'berhenti'}: ${hc.stopIn} dari 100 orang per bulan, dibanding ${hc.stopOut} dari 100 yang tidak ikut.</li>` : ''}
      <li>${hc.perluDibuka > 0 ? `Sampai akhir ${hc.sampaiTahun} perlu dibuka sekitar <b>${nf(hc.perluDibuka)} homecell baru</b> (patokan ±${hc.ideal} orang per homecell).` : 'Jumlah homecell masih cukup untuk perkiraan pertumbuhan.'}</li></ul></div>
    <div class="box"><h4>Event</h4><ul class="pts">
      ${d.event.persenDariEvent != null ? `<li><b>${d.event.persenDariEvent}%</b> jemaat baru dalam 3 bulan terakhir datang lewat event.</li>` : ''}
      ${topEv ? `<li>Paling berhasil: <b>${esc(topEv.judul)}</b> — ${topEv.bertahanPersen ?? 0}% yang bergabung masih aktif setelah 2 bulan.</li>` : ''}
      ${lowEv ? `<li><b>${esc(lowEv.judul)}</b> mendatangkan banyak tamu, tapi sedikit yang bertahan — perlu tindak lanjut setelah acara.</li>` : ''}
      ${d.event.upcoming3 ? `<li>${d.event.upcoming3} event dijadwalkan dalam 3 bulan ke depan.</li>` : ''}</ul></div>
  </div>
  ${foot()}
</div></section>`);

  // 9. Langkah
  slides.push(`<section class="slide"><div class="in">
  <div class="kick">Langkah selanjutnya</div>
  <h2>Apa yang perlu gereja kerjakan</h2>
  <div class="lead">Disusun otomatis dari data bulan ini, diurutkan dari yang paling berdampak.</div>
  <div class="todo">${
    d.langkah
      .map(
        (a) =>
          `<div class="td"><div class="no" style="background:linear-gradient(135deg,${a.tone},${a.tone}bb)">${a.no}</div><div><div class="tt">${esc(a.judul)}</div><div class="ti">${esc(a.isi)}</div></div></div>`,
      )
      .join('') || '<div class="muted">Belum ada langkah khusus bulan ini — pertahankan yang sudah berjalan.</div>'
  }</div>
  ${foot()}
</div></section>`);

  // 10. Penutup
  slides.push(`<section class="slide end"><div class="in">
  <div class="collab"><img src="${logo}" alt="ECC Church" style="height:96px" onerror="this.style.display='none'"><span class="x">×</span>${ideaLogoSvg(64)}</div>
  <div class="statement">${esc(d.pernyataan)}</div>
  <div class="verse">“Tiap-tiap hari Tuhan menambah jumlah mereka dengan orang yang diselamatkan.” — Kisah Para Rasul 2:47 (TB)</div>
  <div class="sig">Laporan ini dibuat otomatis oleh Els App · El Shaddai Creative Community × IDEA · ${esc(dibuat)}</div>
</div></section>`);

  return `<!doctype html>
<html lang="id"><head><meta charset="utf-8"><title>Laporan Pertumbuhan Jemaat — ${esc(scope)}</title>
<style>${CSS}</style></head><body>
${o.isMobileUa ? '<script>setTimeout(() => window.print(), 900);</script>' : `<div class="bar"><b>Laporan Pertumbuhan Jemaat</b> · ukuran slide 16:9 · Tekan <kbd>Ctrl/Cmd + P</kbd> → Simpan sebagai PDF (atur "Margin: None").<button onclick="window.print()">Print / Simpan PDF</button></div>`}
${slides.join('\n')}
<script>
function fit(){var k=Math.min(1,(window.innerWidth-32)/1280);document.querySelectorAll('.slide').forEach(function(e){e.style.zoom=k;});}
window.addEventListener('resize',fit);fit();
window.addEventListener('beforeprint',function(){document.querySelectorAll('.slide').forEach(function(e){e.style.zoom=1;});});
window.addEventListener('afterprint',fit);
</script>
</body></html>`;
}

function mainChart(d: Forecast): string {
  const f = d.forecast!;
  const hist = d.series;
  const H = hist.length;
  const F = f.fc.length;
  const n = H + F;
  const W = 1168;
  const Hh = 360;
  const L = 60;
  const R = 20;
  const T = 30;
  const B = 30;
  const iw = W - L - R;
  const ih = Hh - T - B;
  const max = Math.max(10, Math.ceil(Math.max(...f.hi, ...hist, 1) / 100) * 100);
  const x = (i: number) => L + (n <= 1 ? iw / 2 : (i * iw) / (n - 1));
  const y = (v: number) => T + ih - (v / max) * ih;
  let s = '';
  if (F > 24) s += `<rect x="${x(H + 23)}" y="${T}" width="${x(n - 1) - x(H + 23)}" height="${ih}" fill="#F8FAFC"/>`;
  for (let k = 0; k <= 4; k++) {
    const vv = (max * k) / 4;
    s += `<line x1="${L}" x2="${W - R}" y1="${y(vv)}" y2="${y(vv)}" stroke="#F1F1F1"/><text x="${L - 8}" y="${y(vv) + 4}" text-anchor="end" font-size="13" fill="#A3A3A3">${nf(vv)}</text>`;
  }
  const last = hist[H - 1] ?? 0;
  let band = `M ${x(H - 1)} ${y(last)} `;
  for (let k = 0; k < F; k++) band += `L ${x(H + k)} ${y(f.hi[k]!)} `;
  for (let k = F - 1; k >= 0; k--) band += `L ${x(H + k)} ${y(f.lo[k]!)} `;
  s += `<path d="${band}Z" fill="#EDE9FE"/>`;
  s += `<path d="${hist.map((v, k) => `${k ? 'L' : 'M'} ${x(k)} ${y(v)}`).join(' ')}" fill="none" stroke="#F97316" stroke-width="4" stroke-linejoin="round"/>`;
  s += `<path d="M ${x(H - 1)} ${y(last)} ${f.fc.map((v, k) => `L ${x(H + k)} ${y(v)}`).join(' ')}" fill="none" stroke="#8B5CF6" stroke-width="3" stroke-dasharray="9 6"/>`;
  // Penanda Desember berikutnya yang cukup jauh dari "Sekarang" (≥ 6 bulan) supaya label tidak bertumpuk.
  const dec = f.months.findIndex((m, i) => i >= 5 && m.endsWith('-12'));
  const marks: [number, number, string, string][] = [[H - 1, last, 'Sekarang', '#C2410C']];
  if (dec >= 0 && dec < F - 6) marks.push([H + dec, f.fc[dec]!, mLabel(f.months[dec]!), '#6D28D9']);
  marks.push([n - 1, f.fc[F - 1]!, mLabel(f.months[F - 1]!), '#6D28D9']);
  for (const [i, val, t, c] of marks) {
    const anchor = i === n - 1 ? 'end' : 'middle';
    s += `<circle cx="${x(i)}" cy="${y(val)}" r="7" fill="${c}" stroke="#fff" stroke-width="3"/><text x="${x(i)}" y="${y(val) - 16}" text-anchor="${anchor}" font-size="15" font-weight="800" fill="${c}">${nf(val)}</text><text x="${x(i)}" y="${y(val) - 34}" text-anchor="${anchor}" font-size="12" fill="#737373">${esc(t)}</text>`;
  }
  const all = [...d.months, ...f.months];
  const step = n > 48 ? 12 : n > 24 ? 6 : 3;
  all.forEach((k, i) => {
    if (i % step === 0) s += `<text x="${x(i)}" y="${Hh - 6}" text-anchor="middle" font-size="13" fill="#A3A3A3">${esc(step === 12 ? k.slice(0, 4) : mLabel(k))}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${Hh}" width="${W}" style="margin-top:6px;display:block">${s}</svg>`;
}

const CSS = `
  @page { size: 13.333in 7.5in; margin: 0; }
  * { box-sizing: border-box; }
  body { margin:0; background:#E5E5E5; font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; color:#171717; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  .bar { position:sticky; top:0; z-index:9; background:#fff7ed; border-bottom:1px solid #fed7aa; padding:10px 16px; font-size:13px; }
  .bar button { margin-left:8px; padding:6px 12px; border:0; border-radius:6px; background:linear-gradient(135deg,#F97316,#C2410C); color:#fff; font-weight:600; cursor:pointer; }
  .slide { width:1280px; height:720px; margin:24px auto; background:#fff; position:relative; overflow:hidden; box-shadow:0 10px 30px rgba(0,0,0,.12); page-break-after:always; break-after:page; }
  @media print { body { background:#fff; } .bar { display:none; } .slide { margin:0; box-shadow:none; } }
  .in { width:1280px; height:720px; position:relative; padding:44px 56px 0; }
  .kick { font-size:13px; font-weight:800; letter-spacing:.12em; text-transform:uppercase; color:#C2410C; }
  h2 { font-size:34px; margin:4px 0 0; line-height:1.15; letter-spacing:-.01em; }
  .lead { font-size:18px; color:#404040; margin-top:8px; max-width:1050px; line-height:1.45; }
  .foot { position:absolute; left:56px; right:56px; bottom:22px; display:flex; justify-content:space-between; align-items:center; font-size:12px; color:#A3A3A3; border-top:1px solid #F1F1F1; padding-top:10px; }
  .foot .pg { font-weight:700; color:#737373; }
  .big { display:grid; grid-template-columns:repeat(4,1fr); gap:16px; margin-top:26px; }
  .bn { border-radius:20px; padding:22px 22px 20px; background:#FAFAFA; border:1px solid #EFEFEF; }
  .bn .v { font-size:48px; font-weight:800; letter-spacing:-.02em; line-height:1; }
  .bn .l { font-size:16px; font-weight:700; margin-top:10px; }
  .bn .s { font-size:14.5px; color:#525252; margin-top:6px; line-height:1.4; }
  .chip { display:inline-block; font-size:13px; font-weight:800; padding:3px 10px; border-radius:999px; }
  .up { color:#15803D; } .down { color:#DC2626; } .muted { color:#A3A3A3; font-weight:400; }
  .say { margin-top:22px; border-left:5px solid #F97316; background:linear-gradient(90deg,#FFF7ED,#fff); padding:14px 18px; border-radius:0 14px 14px 0; font-size:18px; line-height:1.5; }
  table { width:100%; border-collapse:separate; border-spacing:0; font-size:16px; }
  th { text-align:left; font-size:12.5px; text-transform:uppercase; letter-spacing:.06em; color:#9A3412; background:#FFF7ED; padding:10px 12px; border-bottom:1px solid #FED7AA; }
  td { padding:10px 12px; border-bottom:1px solid #F3F3F3; }
  .num { text-align:right; font-variant-numeric:tabular-nums; }
  .two { display:grid; grid-template-columns:1.5fr 1fr; gap:22px; margin-top:18px; }
  .box { border:1px solid #EFEFEF; border-radius:18px; padding:16px 18px; }
  .box h4 { margin:0 0 8px; font-size:16px; }
  .pts { margin:0; padding-left:20px; font-size:16.5px; line-height:1.6; color:#262626; }
  .fbar { height:16px; background:#F5F5F5; border-radius:8px; margin-top:4px; overflow:hidden; } .fbar > div { height:100%; border-radius:8px; }
  .lg { display:flex; flex-wrap:wrap; gap:16px; font-size:13.5px; color:#525252; margin-top:6px; }
  .lg span { display:inline-flex; align-items:center; gap:6px; } .lg b { width:14px; height:10px; border-radius:3px; display:inline-block; }
  .warn { font-size:13.5px; color:#92400E; background:#FEF3C7; border-radius:8px; padding:6px 10px; display:inline-block; }
  .warnbox { margin-top:6px; background:#FFFBEB; border:1px solid #FDE68A; border-radius:12px; padding:8px 14px; font-size:15px; color:#78350F; }
  .warnbox b { color:#92400E; }
  .todo { display:grid; grid-template-columns:repeat(2,1fr); gap:14px; margin-top:18px; }
  .td { display:flex; gap:14px; border:1px solid #EFEFEF; border-radius:16px; padding:14px 16px; align-items:flex-start; }
  .td .no { width:38px; height:38px; border-radius:12px; color:#fff; font-weight:800; font-size:18px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
  .td .tt { font-size:18px; font-weight:800; } .td .ti { font-size:15px; color:#525252; margin-top:4px; line-height:1.45; }
  .cover { background:linear-gradient(135deg,#F97316 0%,#C2410C 100%); color:#fff; }
  .cover .in { padding:64px 72px; }
  .cover .logo { background:#fff; border-radius:18px; padding:12px 16px; display:inline-block; }
  .cover h1 { font-size:64px; line-height:1.05; margin:56px 0 12px; letter-spacing:-.02em; }
  .cover .meta { font-size:22px; opacity:.92; }
  .cover .pills { margin-top:26px; display:flex; gap:10px; flex-wrap:wrap; }
  .cover .pill { background:rgba(255,255,255,.18); border-radius:999px; padding:8px 16px; font-size:16px; }
  .cover .warnpill { background:rgba(254,243,199,.95); color:#92400E; font-weight:700; }
  .cover .pb { position:absolute; right:72px; bottom:56px; display:flex; align-items:center; gap:10px; font-size:15px; opacity:.95; }
  .cover .pbl { background:#fff; border-radius:10px; padding:6px 10px; }
  .end { background:radial-gradient(circle at 20% 10%, #FFF7ED 0%, #fff 55%); }
  .end .in { display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:0 120px; }
  .collab { display:flex; align-items:center; gap:34px; margin-bottom:34px; }
  .collab .x { font-size:34px; font-weight:300; color:#A3A3A3; }
  .statement { font-size:26px; line-height:1.5; font-weight:600; color:#262626; max-width:1000px; }
  .sig { margin-top:26px; font-size:15px; color:#737373; }
  .verse { margin-top:18px; font-size:16px; color:#9A3412; font-style:italic; }
`;
