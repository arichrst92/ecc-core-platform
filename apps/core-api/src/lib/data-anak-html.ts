/**
 * HTML siap cetak untuk menu Data Anak (CKids):
 *   - renderDataAnakPdfHtml : laporan tabel (Save as PDF) sesuai filter
 *   - renderDataAnakQrHtml  : lembar QR A4 — kotak 3×3 cm + nama, garis potong
 */
import { esc } from './print-report.js';

interface Row {
  namaLengkap: string;
  kode: string | null;
  fotoUrl: string | null;
  isTamu: boolean;
  cabang: { nama: string } | null;
  tanggalLahir: string | null;
  usia: number | null;
  orangTua: { nama: string; hubungan: string }[];
  jumlahHadir: number;
}
interface FilterLabel {
  cabang: string;
  search: string;
  dari: string;
  sampai: string;
}

const qr = (kode: string, px: number) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=${px}x${px}&margin=0&ecc=M&data=${encodeURIComponent(kode)}`;
const tgl = (ymd: string, withYear = true) =>
  new Date(`${ymd}T00:00:00Z`).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    ...(withYear ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  });
const now = () =>
  new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' });

/** Cetak setelah semua gambar (QR/foto) selesai dimuat. */
const PRINT_WHEN_READY = `<script>
(function(){
  function ready(){
    var imgs=[].slice.call(document.images);
    return Promise.all(imgs.map(function(i){return i.complete?1:new Promise(function(r){i.onload=i.onerror=r;});}));
  }
  window.printWhenReady=function(){ready().then(function(){setTimeout(function(){window.print();},200);});};
})();
</script>`;

function toolbar(title: string, hint: string, isMobileUa: boolean) {
  return isMobileUa
    ? `${PRINT_WHEN_READY}<script>window.addEventListener('load',function(){window.printWhenReady();});</script>`
    : `${PRINT_WHEN_READY}<div class="noprint bar"><div><strong>${esc(title)}</strong><br><span>${esc(hint)}</span></div><button onclick="window.printWhenReady()">Cetak / Save as PDF</button></div>`;
}

const BAR_CSS = `
.noprint.bar{position:sticky;top:0;z-index:5;display:flex;align-items:center;justify-content:space-between;gap:16px;
  background:#fff7ed;border-bottom:1px solid #fed7aa;padding:10px 16px;font:13px/1.4 system-ui,sans-serif;color:#7c2d12}
.noprint.bar span{color:#9a3412;font-size:12px}
.noprint.bar button{background:#ea580c;color:#fff;border:0;border-radius:8px;padding:8px 14px;font-weight:600;cursor:pointer}
@media print{.noprint{display:none!important}}`;

function filterText(f: FilterLabel) {
  return [
    `Cabang: ${f.cabang}`,
    f.search ? `Pencarian: “${f.search}”` : null,
    `Periode hadir: ${tgl(f.dari)} – ${tgl(f.sampai)}`,
  ]
    .filter(Boolean)
    .join(' · ');
}

// ------------------------------------------------------------------ laporan

export function renderDataAnakPdfHtml(d: {
  rows: Row[];
  total: number;
  max: number;
  filter: FilterLabel;
  apiBase: string;
  isMobileUa: boolean;
}): string {
  const img = (u: string | null) => (!u ? '' : /^https?:/i.test(u) ? u : d.apiBase + u);
  const body = d.rows
    .map((r, i) => {
      const foto = r.fotoUrl
        ? `<img class="foto" src="${esc(img(r.fotoUrl))}" alt="">`
        : `<div class="foto ph">${esc(r.namaLengkap.charAt(0).toUpperCase())}</div>`;
      const ortu = r.orangTua.length
        ? r.orangTua.map((o) => `${esc(o.nama)} <span class="mut">(${esc(o.hubungan)})</span>`).join('<br>')
        : '<span class="warn">Belum terhubung</span>';
      return `<tr>
  <td class="c mut">${i + 1}</td>
  <td class="c">${r.kode ? `<img class="qr" src="${esc(qr(r.kode, 160))}" alt="">` : '—'}</td>
  <td class="c">${foto}</td>
  <td><b>${esc(r.namaLengkap)}</b>${r.isTamu ? ' <span class="tag">Tamu</span>' : ''}<div class="mut">${esc([r.kode, r.cabang?.nama].filter(Boolean).join(' · '))}</div></td>
  <td class="c">${r.usia != null ? `${r.usia} th` : '—'}</td>
  <td>${r.tanggalLahir ? esc(tgl(r.tanggalLahir, false)) : '—'}</td>
  <td>${ortu}</td>
  <td class="c"><b>${r.jumlahHadir}×</b></td>
</tr>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="id"><head><meta charset="utf-8"><title>Data Anak CKids — ${esc(d.filter.cabang)}</title>
<style>
@page{size:A4 portrait;margin:12mm 10mm 14mm}
*{box-sizing:border-box}
body{margin:0;font:10pt/1.35 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#171717;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{padding:16px}
@media print{.page{padding:0}}
h1{font-size:18pt;margin:0 0 2px}
.eyebrow{font-size:8pt;letter-spacing:.08em;text-transform:uppercase;color:#db2777;font-weight:700}
.meta{color:#525252;font-size:9pt;margin:4px 0 10px}
.sum{display:inline-block;background:#fdf2f8;color:#9d174d;border-radius:6px;padding:3px 8px;font-weight:600;font-size:9pt;margin-bottom:10px}
table{width:100%;border-collapse:collapse}
thead{display:table-header-group}
th{background:#f5f5f5;font-size:8pt;text-transform:uppercase;letter-spacing:.03em;color:#525252;text-align:left;padding:6px 5px;border-bottom:1px solid #d4d4d4}
td{padding:5px;border-bottom:1px solid #e5e5e5;vertical-align:middle}
tr{page-break-inside:avoid;break-inside:avoid}
.c{text-align:center}
.mut{color:#737373;font-size:8.5pt}
.warn{color:#b45309;font-size:8.5pt}
.tag{background:#ede9fe;color:#6d28d9;border-radius:4px;padding:0 4px;font-size:7.5pt}
.qr{width:16mm;height:16mm;display:block;margin:auto}
.foto{width:11mm;height:11mm;border-radius:50%;object-fit:cover;display:block;margin:auto}
.foto.ph{background:#fce7f3;color:#be185d;font-weight:700;display:flex;align-items:center;justify-content:center}
.foot{margin-top:10px;font-size:8pt;color:#737373}
${BAR_CSS}
</style></head><body>
${toolbar('Laporan Data Anak', 'Pilih “Save as PDF” sebagai printer untuk menyimpan PDF. Aktifkan “Background graphics”.', d.isMobileUa)}
<div class="page">
  <div class="eyebrow">CKids · ECC</div>
  <h1>Data Anak</h1>
  <div class="meta">${esc(filterText(d.filter))} · dicetak ${esc(now())}</div>
  <div class="sum">${d.total.toLocaleString('id-ID')} anak di bawah 13 tahun${d.total > d.rows.length ? ` · ditampilkan ${d.rows.length.toLocaleString('id-ID')} pertama` : ''}</div>
  <table>
    <thead><tr>
      <th class="c" style="width:7mm">No</th><th class="c" style="width:19mm">QR</th><th class="c" style="width:14mm">Foto</th>
      <th>Nama</th><th class="c" style="width:13mm">Usia</th><th style="width:24mm">Ulang tahun</th>
      <th>Orang tua / Wali</th><th class="c" style="width:16mm">Hadir</th>
    </tr></thead>
    <tbody>
${body || '<tr><td colspan="8" class="c mut" style="padding:20px">Tidak ada anak yang cocok dengan filter.</td></tr>'}
    </tbody>
  </table>
  <div class="foot">Hadir = jumlah check-in di ibadah anak dalam periode. Data hanya untuk keperluan pelayanan anak — jangan disebarluaskan.</div>
</div>
</body></html>`;
}

// ------------------------------------------------------------------ lembar QR

/** Kotak potong: 38 × 44 mm (QR 30 × 30 mm + nama). 5 kolom × 6 baris = 30 per A4. */
const COLS = 5;
const ROWS = 6;

export function renderDataAnakQrHtml(d: {
  rows: Row[];
  tanpaKode: number;
  total: number;
  max: number;
  filter: FilterLabel;
  isMobileUa: boolean;
}): string {
  const per = COLS * ROWS;
  const pages: Row[][] = [];
  for (let i = 0; i < d.rows.length; i += per) pages.push(d.rows.slice(i, i + per));

  const sheet = (rows: Row[]) => {
    const trs: string[] = [];
    for (let r = 0; r < Math.ceil(rows.length / COLS); r++) {
      const tds: string[] = [];
      for (let c = 0; c < COLS; c++) {
        const a = rows[r * COLS + c];
        tds.push(
          a
            ? `<td><img src="${esc(qr(a.kode!, 360))}" alt=""><div class="nm">${esc(a.namaLengkap)}</div></td>`
            : '<td class="empty"></td>',
        );
      }
      trs.push(`<tr>${tds.join('')}</tr>`);
    }
    return `<section class="sheet"><table>${trs.join('')}</table></section>`;
  };

  const info = [
    `${d.rows.length.toLocaleString('id-ID')} QR · ${pages.length} lembar A4`,
    d.tanpaKode ? `${d.tanpaKode} anak tanpa kode dilewati` : null,
    d.total > d.max ? `dibatasi ${d.max.toLocaleString('id-ID')} anak pertama` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return `<!doctype html>
<html lang="id"><head><meta charset="utf-8"><title>QR Anak CKids — ${esc(d.filter.cabang)}</title>
<style>
@page{size:A4 portrait;margin:10mm}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#000;background:#e5e5e5;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.sheet{width:210mm;height:297mm;padding:10mm;margin:12px auto;background:#fff;box-shadow:0 1px 6px rgba(0,0,0,.15);page-break-after:always;break-after:page}
.sheet:last-child{page-break-after:auto;break-after:auto}
table{border-collapse:collapse;table-layout:fixed;width:${COLS * 38}mm}
td{width:38mm;height:44mm;border:0.25mm dashed #8a8a8a;text-align:center;vertical-align:top;padding:3mm 2mm 0;overflow:hidden}
td.empty{border-color:transparent}
td img{width:30mm;height:30mm;display:block;margin:0 auto;image-rendering:pixelated}
.nm{margin-top:1.8mm;font-size:8.5pt;line-height:1.15;font-weight:600;max-height:2.3em;overflow:hidden;word-break:break-word}
.info{font:12px system-ui,sans-serif;color:#525252;text-align:center;margin:10px 0 0}
@media print{
  body{background:#fff}
  .sheet{width:auto;height:auto;padding:0;margin:0;box-shadow:none}
  .info{display:none}
}
${BAR_CSS}
</style></head><body>
${toolbar('Cetak QR Anak — A4', 'Kertas A4, skala 100% (jangan "Fit to page"). Potong mengikuti garis putus-putus — tiap QR 3 × 3 cm.', d.isMobileUa)}
<p class="info noprint">${esc(filterText(d.filter))} · ${esc(info)}</p>
${pages.length ? pages.map(sheet).join('\n') : '<p class="info">Tidak ada anak dengan kode QR pada filter ini.</p>'}
</body></html>`;
}
