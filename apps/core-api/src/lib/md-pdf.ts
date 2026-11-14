/**
 * Markdown → PDF sederhana tanpa dependency (font standar PDF: Helvetica,
 * Helvetica-Bold, Courier). Untuk unduhan dokumentasi Developer Tools.
 *
 * Mendukung: judul (#..####), paragraf, daftar (-, *, 1.), kutipan (>),
 * blok kode (```), tabel (| a | b |, ditata sebagai teks monospace), garis (---).
 * Format inline (**tebal**, `kode`, [teks](url)) diratakan jadi teks biasa.
 * Karakter di luar Latin-1 diganti padanan ASCII (font standar = WinAnsi).
 */

const HELV = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556,
  278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667,
  611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833,
  556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];
const HELV_B = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556,
  333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667,
  611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889,
  611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];

type Font = 'R' | 'B' | 'M';
const FONT_REF: Record<Font, string> = { R: 'F1', B: 'F2', M: 'F3' };

const REPL: Record<string, string> = {
  '—': '-', '–': '-', '−': '-', '→': '->', '←': '<-', '↔': '<->', '⇒': '=>',
  '‘': "'", '’': "'", '“': '"', '”': '"', '…': '...', '•': '-', '·': '-',
  '≥': '>=', '≤': '<=', '≠': '!=', '✓': 'v', '✔': 'v', '✗': 'x', '❌': 'x',
  '✅': 'v', '⚠': '!', ' ': ' ', '→️': '->', '│': '|', '├': '|', '└': '`', '─': '-',
};
/** Teks → Latin-1 aman untuk font standar PDF. */
export function toLatin1(s: string): string {
  let out = '';
  for (const ch of s) {
    if (REPL[ch] !== undefined) out += REPL[ch];
    else {
      const c = ch.codePointAt(0)!;
      if (c === 9) out += '    ';
      else if (c >= 32 && c <= 126) out += ch;
      else if (c >= 160 && c <= 255) out += ch;
      else if (c > 0xffff || (c >= 0x2600 && c <= 0x27bf)) out += ''; // emoji / simbol
      else out += '?';
    }
  }
  return out;
}

function charW(c: number, f: Font): number {
  if (f === 'M') return 600;
  const t = f === 'B' ? HELV_B : HELV;
  return c >= 32 && c <= 126 ? t[c - 32]! : 556;
}
const textW = (s: string, f: Font, size: number) => {
  let w = 0;
  for (let i = 0; i < s.length; i++) w += charW(s.charCodeAt(i), f);
  return (w * size) / 1000;
};

/** Pecah teks jadi baris yang muat `maxW` (kata panjang dipotong paksa). */
function wrap(text: string, f: Font, size: number, maxW: number): string[] {
  const words = text.split(/ +/);
  const lines: string[] = [];
  let cur = '';
  const push = (w: string) => {
    // kata lebih panjang dari baris → potong
    while (textW(w, f, size) > maxW) {
      let n = w.length;
      while (n > 1 && textW(w.slice(0, n), f, size) > maxW) n--;
      lines.push(w.slice(0, n));
      w = w.slice(n);
    }
    return w;
  };
  for (const w0 of words) {
    if (!w0) continue;
    const cand = cur ? `${cur} ${w0}` : w0;
    if (textW(cand, f, size) <= maxW) cur = cand;
    else {
      if (cur) lines.push(cur);
      cur = push(w0);
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

/** Format inline markdown → teks polos. */
function inline(s: string): string {
  return s
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, t, u) => (t === u ? t : `${t} (${u})`))
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/(^|\W)\*([^*\n]+)\*(?=\W|$)/g, '$1$2');
}

interface Line {
  text: string;
  font: Font;
  size: number;
  x: number;
  gapBefore: number;
  color?: [number, number, number];
  rule?: boolean;
  shade?: boolean; // latar abu-abu (kode)
}

export function markdownToPdf(markdown: string, opts: { title: string; subtitle?: string }): Buffer {
  const W = 595.28;
  const H = 841.89;
  const M = 48;
  const maxW = W - M * 2;
  const lines: Line[] = [];
  const add = (text: string, font: Font, size: number, x = 0, gapBefore = 0, extra: Partial<Line> = {}) =>
    lines.push({ text: toLatin1(text), font, size, x, gapBefore, ...extra });
  const para = (text: string, font: Font, size: number, indent = 0, gapBefore = 0, extra: Partial<Line> = {}, bullet?: string) => {
    const t = toLatin1(text);
    const bw = bullet ? textW(toLatin1(bullet), font, size) + 4 : 0;
    const wrapped = wrap(t, font, size, maxW - indent - bw);
    wrapped.forEach((l, i) =>
      lines.push({ text: i === 0 && bullet ? `${toLatin1(bullet)} ${l}` : l, font, size, x: indent + (i === 0 ? 0 : bw), gapBefore: i === 0 ? gapBefore : 0, ...extra }),
    );
  };

  // Sampul ringkas
  add(opts.title, 'B', 22, 0, 0, { color: [0.76, 0.25, 0.05] });
  if (opts.subtitle) para(opts.subtitle, 'R', 10, 0, 6, { color: [0.35, 0.35, 0.35] });
  lines.push({ text: '', font: 'R', size: 6, x: 0, gapBefore: 4, rule: true });

  const src = markdown.replace(/\r\n/g, '\n').split('\n');
  let buf: string[] = [];
  const flush = () => {
    if (buf.length) para(inline(buf.join(' ')), 'R', 10, 0, 6);
    buf = [];
  };
  for (let i = 0; i < src.length; i++) {
    const raw = src[i]!;
    const line = raw.trimEnd();
    if (/^```/.test(line)) {
      flush();
      const code: string[] = [];
      i++;
      while (i < src.length && !/^```/.test(src[i]!)) code.push(src[i++]!);
      let first = true;
      for (const c of code.length ? code : ['']) {
        const parts = wrap(toLatin1(c).replace(/ /g, '\u0000'), 'M', 8, maxW - 12).map((p) => p.replace(/\u0000/g, ' '));
        for (const p of parts) {
          lines.push({ text: p, font: 'M', size: 8, x: 6, gapBefore: first ? 6 : 0, shade: true, color: [0.15, 0.15, 0.15] });
          first = false;
        }
      }
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      flush();
      const lvl = h[1]!.length;
      const size = [0, 17, 14, 12, 11][lvl]!;
      para(inline(h[2]!), 'B', size, 0, lvl <= 2 ? 14 : 9, { color: lvl <= 2 ? [0.76, 0.25, 0.05] : [0.1, 0.1, 0.1] });
      if (lvl === 1) lines.push({ text: '', font: 'R', size: 4, x: 0, gapBefore: 2, rule: true });
      continue;
    }
    if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
      flush();
      lines.push({ text: '', font: 'R', size: 6, x: 0, gapBefore: 6, rule: true });
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line)) {
      flush();
      const rows: string[][] = [];
      while (i < src.length && /^\s*\|.*\|\s*$/.test(src[i]!)) {
        const cells = src[i]!.trim().slice(1, -1).split('|').map((c) => inline(c.trim()));
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells);
        i++;
      }
      i--;
      const cols = Math.max(...rows.map((r) => r.length));
      const maxChars = Math.floor((maxW - 12) / 4.8); // Courier 8pt
      const widths = Array.from({ length: cols }, (_, c) => Math.max(...rows.map((r) => toLatin1(r[c] ?? '').length), 3));
      // Kolom terlalu lebar → batasi proporsional.
      const total = widths.reduce((a, b) => a + b, 0) + (cols - 1) * 3;
      if (total > maxChars) {
        const room = maxChars - (cols - 1) * 3;
        for (let c = 0; c < cols; c++) widths[c] = Math.max(4, Math.floor((widths[c]! / (total - (cols - 1) * 3)) * room));
      }
      rows.forEach((r, ri) => {
        // sel panjang → bungkus jadi beberapa baris
        const cellLines = widths.map((w, c) => {
          const t = toLatin1(r[c] ?? '');
          const out: string[] = [];
          for (let k = 0; k < t.length; k += w) out.push(t.slice(k, k + w));
          return out.length ? out : [''];
        });
        const n = Math.max(...cellLines.map((x) => x.length));
        for (let k = 0; k < n; k++) {
          const txt = cellLines.map((cl, c) => (cl[k] ?? '').padEnd(widths[c]!)).join(' | ');
          lines.push({ text: txt, font: 'M', size: 8, x: 6, gapBefore: ri === 0 && k === 0 ? 6 : 0, shade: ri === 0, color: [0.15, 0.15, 0.15] });
        }
      });
      continue;
    }
    const li = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (li) {
      flush();
      const depth = Math.min(3, Math.floor(li[1]!.length / 2));
      const bullet = /\d/.test(li[2]!) ? li[2]! : '-';
      para(inline(li[3]!), 'R', 10, 12 + depth * 12, 2, {}, bullet);
      continue;
    }
    const q = /^>\s?(.*)$/.exec(line);
    if (q) {
      flush();
      para(inline(q[1]!), 'R', 10, 12, 4, { color: [0.4, 0.4, 0.4] });
      continue;
    }
    buf.push(line.trim());
  }
  flush();

  // ---- Tata letak halaman ----
  const pages: string[][] = [];
  let ops: string[] = [];
  let y = H - M;
  const footerY = 26;
  const newPage = () => {
    if (ops.length) pages.push(ops);
    ops = [];
    y = H - M;
  };
  for (const l of lines) {
    const lh = l.size * 1.35;
    if (y - l.gapBefore - lh < M) newPage();
    else y -= l.gapBefore;
    y -= lh;
    if (l.rule) {
      ops.push(`0.92 0.55 0.3 RG 0.6 w ${M} ${(y + lh / 2).toFixed(2)} m ${W - M} ${(y + lh / 2).toFixed(2)} l S`);
      continue;
    }
    if (l.shade) ops.push(`0.96 0.95 0.94 rg ${M} ${(y - 2).toFixed(2)} ${maxW} ${lh.toFixed(2)} re f`);
    const [r, g, b] = l.color ?? [0.12, 0.12, 0.12];
    ops.push(`BT ${r} ${g} ${b} rg /${FONT_REF[l.font]} ${l.size} Tf ${(M + l.x).toFixed(2)} ${(y + l.size * 0.25).toFixed(2)} Td (${esc(l.text)}) Tj ET`);
  }
  newPage();

  // ---- Rakit file PDF ----
  const objs: string[] = [];
  const addObj = (body: string) => {
    objs.push(body);
    return objs.length;
  };
  const catalogId = addObj(''); // placeholder
  const pagesId = addObj('');
  const f1 = addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const f2 = addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const f3 = addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>');
  const pageIds: number[] = [];
  const title = toLatin1(opts.title);
  pages.forEach((p, idx) => {
    const footer = `BT 0.55 0.55 0.55 rg /F1 8 Tf ${M} ${footerY} Td (${esc(title)}) Tj ET BT 0.55 0.55 0.55 rg /F1 8 Tf ${W - M - 40} ${footerY} Td (${idx + 1} / ${pages.length}) Tj ET`;
    const stream = [...p, footer].join('\n');
    const contentId = addObj(`<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`);
    pageIds.push(
      addObj(
        `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${W} ${H}] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R /F3 ${f3} 0 R >> >> >>`,
      ),
    );
  });
  objs[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objs[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((i) => `${i} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
  const info = addObj(`<< /Title (${esc(title)}) /Producer (ECC Core API) /CreationDate (D:${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}) >>`);

  let out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const offsets: number[] = [];
  objs.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out, 'latin1'));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) out += `${String(o).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalogId} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
