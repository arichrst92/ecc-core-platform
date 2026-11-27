/**
 * Bagian "Visualisasi Daftar & Absen" di laporan PDF event & ibadah.
 */
import { esc } from './print-report.js';
import type { EventVisual } from './event-visual.js';
import type { IbadahVisual } from './ibadah-visual.js';
import { BATAL_COLORS, GROUP_COLORS, GROUP_LABEL, WHO_COLORS, donutSvg, stackedBarsSvg } from './visual-svg.js';

const nf = (n: number) => n.toLocaleString('id-ID');
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : '—');
const WHO = [
  ['JEMAAT', 'Jemaat'],
  ['NEW_COMER', 'New Comer'],
  ['VISITOR', 'Visitor'],
] as const;
const GROUPS = ['SELF', 'PETUGAS', 'PORTAL', 'LAINNYA'] as const;
const dLabel = (ymd: string) => new Date(`${ymd}T00:00:00Z`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', timeZone: 'UTC' });

const box = (title: string, sub: string, inner: string) =>
  `<div class="vz"><div class="vz-t">${esc(title)}</div>${sub ? `<div class="vz-s">${esc(sub)}</div>` : ''}${inner}</div>`;

function donuts(
  proporsi: Record<(typeof GROUPS)[number], number>,
  hadirPer: Record<'JEMAAT' | 'NEW_COMER' | 'VISITOR', number>,
  tepat: { sebelum: number; telat15: number; telatLebih: number },
  hadir: number,
) {
  return `<div class="vz-grid">
${box('Proporsi cara absen', 'Dari semua yang hadir', donutSvg(GROUPS.filter((g) => g !== 'LAINNYA' || proporsi.LAINNYA > 0).map((g) => ({ label: GROUP_LABEL[g], value: proporsi[g], color: GROUP_COLORS[g] })), nf(hadir), 'hadir'))}
${box('Yang hadir', 'Jemaat & tamu', donutSvg(WHO.map(([k, l]) => ({ label: l, value: hadirPer[k], color: WHO_COLORS[k] })), nf(hadir), 'hadir'))}
${box('Ketepatan waktu', 'Check-in terhadap jam mulai', donutSvg([
    { label: 'Sebelum mulai', value: tepat.sebelum, color: '#10B981' },
    { label: 'Telat ≤ 15 menit', value: tepat.telat15, color: '#F59E0B' },
    { label: 'Telat > 15 menit', value: tepat.telatLebih, color: '#EF4444' },
  ], pct(tepat.sebelum, hadir), 'tepat waktu'))}
</div>`;
}

/** Event: pendaftaran H-30 + absensi per hari (maks 3 hari) + donat. */
export function eventVisualHtml(v: EventVisual, absensiPerHari: EventVisual['absensi'][]): string {
  const p = v.pendaftaran;
  const first = p.tanggal.indexOf(p.hariAcara[0] ?? '');
  const last = p.tanggal.indexOf(p.hariAcara[p.hariAcara.length - 1] ?? '');
  const evIdx = first >= 0 ? first : p.tanggal.length - 1;
  const reg = stackedBarsSvg({
    labels: p.tanggal,
    up: WHO.map(([k, l]) => ({ label: `Daftar ${l}`, color: WHO_COLORS[k], data: p.daftar[k] })),
    down: WHO.map(([k, l]) => ({ label: `Batal ${l}`, color: BATAL_COLORS[k], data: p.batal[k] })),
    line: { label: 'Pendaftar aktif (kumulatif)', color: '#171717', data: p.kumulatif },
    shade: first >= 0 ? [first, last >= 0 ? last : first] : undefined,
    tickEvery: Math.max(1, Math.ceil(p.tanggal.length / 10)),
    tickLabel: (i) => {
      const h = i - evIdx;
      return h < 0 ? `H${h}` : h === 0 ? 'Hari H' : dLabel(p.tanggal[i]!);
    },
  });
  const notes = [
    p.sebelumRentang ? `${nf(p.sebelumRentang)} pendaftaran sebelum H-30 (masuk garis kumulatif)` : '',
    p.setelahRentang ? `${nf(p.setelahRentang)} pendaftaran setelah event` : '',
  ].filter(Boolean);
  let html = box(
    'Pendaftaran harian',
    `H-30 s/d hari terakhir event · batang atas = daftar, bawah = batal · garis = pendaftar aktif kumulatif · hari acara diarsir`,
    reg + (notes.length ? `<div class="vz-note">${esc(notes.join(' · '))}</div>` : ''),
  );
  if (v.event.butuhKehadiran) {
    for (const a of absensiPerHari) {
      const chart = stackedBarsSvg({
        labels: a.jam,
        up: GROUPS.map((g) => ({ label: GROUP_LABEL[g], color: GROUP_COLORS[g], data: a.metode[g] })),
        line: { label: 'Hadir (kumulatif)', color: '#171717', data: a.kumulatif },
        shade: [a.mulaiIdx, a.selesaiIdx],
        tickEvery: Math.max(1, Math.ceil(a.jam.length / 12)),
        tickLabel: (i) => a.jam[i] ?? '',
      });
      html += box(
        `Absensi per 15 menit${absensiPerHari.length > 1 ? ` — ${dLabel(a.tanggal)}` : ''}`,
        `720 menit sebelum mulai s/d 60 menit setelah selesai · jam acara diarsir${a.puncak ? ` · puncak ${a.puncak.jam} (${nf(a.puncak.jumlah)} orang)` : ''}`,
        chart + (a.diluarRentang ? `<div class="vz-note">${nf(a.diluarRentang)} check-in di luar rentang grafik.</div>` : ''),
      );
    }
    html += donuts(v.proporsi, v.ringkasan.hadirPer, v.ketepatan, v.ringkasan.hadir);
  }
  return html;
}

/** Ibadah (periode): reservasi relatif H-30…H + absensi relatif + donat. */
export function ibadahVisualHtml(v: IbadahVisual): string {
  const r = v.reservasi;
  const reg = stackedBarsSvg({
    labels: r.labels.map(String),
    up: WHO.map(([k, l]) => ({ label: `Reservasi ${l}`, color: WHO_COLORS[k], data: r.daftar[k] })),
    down: WHO.map(([k, l]) => ({ label: `Batal ${l}`, color: BATAL_COLORS[k], data: r.batal[k] })),
    shade: [r.labels.length - 1, r.labels.length - 1],
    tickEvery: 5,
    tickLabel: (i) => (r.labels[i] === 0 ? 'Hari H' : `H${r.labels[i]}`),
  });
  const a = v.absensi;
  const att = stackedBarsSvg({
    labels: a.labels,
    up: GROUPS.map((g) => ({ label: GROUP_LABEL[g], color: GROUP_COLORS[g], data: a.metode[g] })),
    line: { label: 'Hadir (kumulatif)', color: '#171717', data: a.kumulatif },
    shade: [a.mulaiIdx, a.selesaiIdx],
    tickEvery: Math.max(1, Math.ceil(a.labels.length / 12)),
    tickLabel: (i) => a.labels[i] ?? '',
  });
  return (
    box(
      'Kapan jemaat reservasi',
      'Gabungan semua pertemuan di periode ini · H-30 s/d hari ibadah · batang atas = reservasi dibuat, bawah = dibatalkan',
      reg +
        `<div class="vz-note">${nf(r.total)} reservasi · ${nf(r.tanpaReservasi)} datang tanpa reservasi · ${nf(r.tidakHadir)} batal otomatis (tidak hadir)</div>`,
    ) +
    box(
      'Absensi per 15 menit',
      'Relatif terhadap jam mulai tiap pertemuan · 720 menit sebelum mulai s/d 60 menit setelah selesai · jam ibadah diarsir',
      att + (a.diluarRentang ? `<div class="vz-note">${nf(a.diluarRentang)} check-in di luar rentang grafik.</div>` : ''),
    ) +
    donuts(v.proporsi, v.hadirPer, v.ketepatan, a.hadir)
  );
}
