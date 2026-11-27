/**
 * Grafik SVG statis untuk laporan PDF (cetak) — "Visualisasi Daftar & Absen".
 * Sama dengan grafik tab Visualisasi di Portal (components/event/event-visual-tab.tsx):
 * batang bertumpuk (atas = daftar / hadir, bawah = batal), garis kumulatif
 * (skala kanan), dan rentang acara yang diarsir.
 */
import { esc } from './print-report.js';

export type SvgStack = { label: string; color: string; data: number[] };

const nf = (n: number) => Math.round(n).toLocaleString('id-ID');

export function stackedBarsSvg(o: {
  labels: string[];
  up: SvgStack[];
  down?: SvgStack[];
  line?: { label: string; color: string; data: number[] };
  shade?: [number, number];
  tickEvery: number;
  tickLabel: (i: number) => string;
  width?: number;
  height?: number;
}): string {
  const { labels, up, down = [], line, shade } = o;
  const n = labels.length;
  const W = o.width ?? 760;
  const H = o.height ?? 190;
  const padL = 30;
  const padR = line ? 34 : 8;
  const padT = 8;
  const padB = 20;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const sumAt = (ss: SvgStack[], i: number) => ss.reduce((a, s) => a + (s.data[i] ?? 0), 0);
  const maxUp = Math.max(1, ...labels.map((_, i) => sumAt(up, i)));
  const maxDown = down.length ? Math.max(0, ...labels.map((_, i) => sumAt(down, i))) : 0;
  const upH = maxDown > 0 ? innerH * (maxUp / (maxUp + maxDown)) : innerH;
  const zeroY = padT + upH;
  const scale = upH / maxUp;
  const bw = innerW / Math.max(1, n);
  const x = (i: number) => padL + i * bw;
  const has = up.some((s) => s.data.some((v) => v > 0)) || down.some((s) => s.data.some((v) => v > 0));
  if (!n || !has) return `<div class="vz-empty">Belum ada data</div>`;
  const gap = bw > 6 ? 1.2 : 0.4;
  const parts: string[] = [];
  if (shade) parts.push(`<rect x="${x(shade[0])}" y="${padT}" width="${Math.max(bw, (shade[1] - shade[0] + 1) * bw)}" height="${innerH}" fill="#FFF7ED"/>`);
  for (const f of [0, 0.5, 1]) {
    const yy = zeroY - upH * f;
    parts.push(`<line x1="${padL}" x2="${W - padR}" y1="${yy}" y2="${yy}" stroke="#F1F1F1"/>`);
    parts.push(`<text x="${padL - 3}" y="${yy + 3}" text-anchor="end" font-size="8" fill="#9CA3AF">${nf(maxUp * f)}</text>`);
  }
  if (maxDown > 0) parts.push(`<text x="${padL - 3}" y="${padT + innerH}" text-anchor="end" font-size="8" fill="#9CA3AF">-${nf(maxDown)}</text>`);
  parts.push(`<line x1="${padL}" x2="${W - padR}" y1="${zeroY}" y2="${zeroY}" stroke="#D4D4D4"/>`);
  for (let i = 0; i < n; i++) {
    let yUp = zeroY;
    for (const s of up) {
      const h = (s.data[i] ?? 0) * scale;
      if (h <= 0) continue;
      yUp -= h;
      parts.push(`<rect x="${x(i) + gap}" y="${yUp}" width="${Math.max(0.4, bw - gap * 2)}" height="${h}" fill="${s.color}"/>`);
    }
    let yDn = zeroY;
    for (const s of down) {
      const h = (s.data[i] ?? 0) * scale;
      if (h <= 0) continue;
      parts.push(`<rect x="${x(i) + gap}" y="${yDn}" width="${Math.max(0.4, bw - gap * 2)}" height="${h}" fill="${s.color}"/>`);
      yDn += h;
    }
  }
  if (line) {
    const lmax = Math.max(1, ...line.data);
    const ly = (v: number) => padT + innerH - (v / lmax) * innerH;
    parts.push(
      `<path d="${line.data.map((v, i) => `${i ? 'L' : 'M'} ${x(i) + bw / 2} ${ly(v)}`).join(' ')}" fill="none" stroke="${line.color}" stroke-width="1.6" stroke-linejoin="round"/>`,
    );
    parts.push(`<text x="${W - padR + 3}" y="${padT + 7}" font-size="8" fill="${line.color}">${nf(lmax)}</text>`);
    parts.push(`<text x="${W - padR + 3}" y="${padT + innerH}" font-size="8" fill="${line.color}">0</text>`);
  }
  for (let i = 0; i < n; i++) {
    if (i % o.tickEvery === 0 || i === n - 1) {
      parts.push(`<text x="${x(i) + bw / 2}" y="${H - 6}" text-anchor="middle" font-size="8" fill="#9CA3AF">${esc(o.tickLabel(i))}</text>`);
    }
  }
  const legend = [...up.map((s) => [s.label, s.color, false] as const), ...(down.length ? [['Batal', down[0]!.color, false] as const] : []), ...(line ? [[line.label, line.color, true] as const] : [])]
    .map(
      ([l, c, isLine]) =>
        `<span class="vz-lg"><i style="background:${c};${isLine ? 'height:2px;width:12px;border-radius:1px' : ''}"></i>${esc(l)}</span>`,
    )
    .join('');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block">${parts.join('')}</svg><div class="vz-lgs">${legend}</div>`;
}

/** Donat kecil + legenda (persentase). */
export function donutSvg(items: { label: string; value: number; color: string }[], center: string, centerSub: string): string {
  const total = items.reduce((a, b) => a + b.value, 0);
  const r = 34;
  const c = 2 * Math.PI * r;
  let off = 0;
  const arcs = total
    ? items
        .filter((i) => i.value > 0)
        .map((i) => {
          const len = (i.value / total) * c;
          const el = `<circle r="${r}" cx="44" cy="44" fill="none" stroke="${i.color}" stroke-width="13" stroke-dasharray="${len} ${c - len}" stroke-dashoffset="${-off}" transform="rotate(-90 44 44)"/>`;
          off += len;
          return el;
        })
        .join('')
    : `<circle r="${r}" cx="44" cy="44" fill="none" stroke="#E5E7EB" stroke-width="13"/>`;
  const legend = items
    .map(
      (i) =>
        `<div class="vz-dl"><i style="background:${i.color}"></i><span>${esc(i.label)}</span><b>${nf(i.value)}</b><em>${
          total ? `${Math.round((i.value / total) * 100)}%` : ''
        }</em></div>`,
    )
    .join('');
  return `<div class="vz-donut"><svg viewBox="0 0 88 88" width="88" height="88">${arcs}<text x="44" y="44" text-anchor="middle" font-size="13" font-weight="800" fill="#171717">${esc(
    center,
  )}</text><text x="44" y="55" text-anchor="middle" font-size="7" fill="#737373">${esc(centerSub)}</text></svg><div class="vz-dls">${legend}</div></div>`;
}

/** CSS bersama grafik visualisasi (disisipkan ke <style> laporan). */
export const VISUAL_CSS = `
  .vz { border: 1px solid #EDEDED; border-radius: 12px; padding: 10px 12px; background: #fff; margin-bottom: 8px; page-break-inside: avoid; }
  .vz-t { font-size: 10.5px; font-weight: 800; color: #171717; } .vz-s { font-size: 8.5px; color: #737373; margin-bottom: 6px; }
  .vz-lgs { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px; }
  .vz-lg { display: inline-flex; align-items: center; gap: 4px; font-size: 8.5px; color: #525252; } .vz-lg i { width: 8px; height: 8px; border-radius: 2px; display: inline-block; }
  .vz-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .vz-donut { display: flex; align-items: center; gap: 10px; } .vz-dls { flex: 1; min-width: 0; }
  .vz-dl { display: flex; align-items: center; gap: 5px; font-size: 8.5px; margin: 2px 0; } .vz-dl i { width: 8px; height: 8px; border-radius: 2px; flex-shrink: 0; }
  .vz-dl span { flex: 1; color: #525252; } .vz-dl em { font-style: normal; color: #A3A3A3; width: 26px; text-align: right; }
  .vz-empty { padding: 16px; text-align: center; color: #A3A3A3; font-size: 9px; }
  .vz-note { font-size: 8.5px; color: #737373; margin-top: 4px; }
`;

export const WHO_COLORS = { JEMAAT: '#F97316', NEW_COMER: '#10B981', VISITOR: '#0EA5E9' } as const;
export const BATAL_COLORS = { JEMAAT: '#F87171', NEW_COMER: '#FCA5A5', VISITOR: '#FECACA' } as const;
export const GROUP_COLORS = { SELF: '#F97316', PETUGAS: '#7C3AED', PORTAL: '#0EA5E9', LAINNYA: '#A3A3A3' } as const;
export const GROUP_LABEL = { SELF: 'Self check-in', PETUGAS: 'Scan petugas', PORTAL: 'Absen Portal', LAINNYA: 'Tidak tercatat' } as const;
