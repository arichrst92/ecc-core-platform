/**
 * ECC Worship — penyelarasan lirik ke transkrip ber-timestamp (murni, tanpa DB).
 *
 * Dipakai "Sinkronkan dengan Elsa": whisper.cpp menghasilkan kata + waktu,
 * lalu kata-kata itu dicocokkan ke lirik yang sudah diketik admin (urutan
 * tetap, toleran salah dengar, reff berulang) dengan global alignment
 * (Needleman–Wunsch) + kemiripan Levenshtein per kata.
 */

export interface TimedWord {
  text: string;
  /** detik */
  start: number;
  end: number;
}

export interface AlignedLine {
  t: number;
  line: string;
  /** 0..1 — porsi kata di baris yang cocok dengan transkrip. */
  confidence: number;
}

/** Baris label bagian lagu ("Reff:", "[Verse 2]", "Bridge") — bukan lirik yang dinyanyikan. */
const LABEL_RE = /^[[(]?\s*(reff?|chorus|verse|bait|bridge|intro|outro|interlude|pre-?chorus|coda|ending|musik|instrumen\w*)\b[^a-z]*\d*\s*[\])]?\s*:?\s*(\d+x)?$/i;

export function isLabelLine(line: string): boolean {
  return LABEL_RE.test(line.trim());
}

export function normalizeWord(w: string): string {
  return w
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

export function tokenize(line: string): string[] {
  return line.split(/\s+/).map(normalizeWord).filter(Boolean);
}

/** Kemiripan 0..1 berbasis jarak Levenshtein. */
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const prev = new Array<number>(b.length + 1);
  const cur = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j]!;
  }
  return 1 - prev[b.length]! / Math.max(a.length, b.length);
}

const MATCH_MIN = 0.6;
const GAP_LYRIC = -0.6; // kata lirik tidak terdengar
const GAP_WORD = -0.25; // kata transkrip ekstra (noise, ad-lib)

/**
 * Selaraskan baris lirik (urut) ke kata-kata transkrip.
 * Baris kosong dilewati; baris label diberi waktu baris lirik berikutnya.
 */
export function alignLyrics(rawLines: string[], words: TimedWord[], duration?: number): AlignedLine[] {
  const lines = rawLines.map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  // Token lirik + indeks barisnya.
  const lt: { tok: string; line: number }[] = [];
  lines.forEach((l, i) => {
    if (isLabelLine(l)) return;
    for (const tok of tokenize(l)) lt.push({ tok, line: i });
  });
  const ww = words.map((w) => ({ ...w, tok: normalizeWord(w.text) })).filter((w) => w.tok);

  const N = lt.length;
  const M = ww.length;
  const firstTimeOfLine = new Array<number | null>(lines.length).fill(null);
  const matchedCount = new Array<number>(lines.length).fill(0);
  const tokenCount = new Array<number>(lines.length).fill(0);
  for (const t of lt) tokenCount[t.line]! += 1;

  if (N > 0 && M > 0) {
    const W = M + 1;
    const score = new Float32Array((N + 1) * W);
    const ptr = new Uint8Array((N + 1) * W); // 1=diag 2=up(skip lirik) 3=left(skip kata)
    for (let i = 1; i <= N; i++) {
      score[i * W] = i * GAP_LYRIC;
      ptr[i * W] = 2;
    }
    // Awal transkrip boleh dilewati gratis (intro musik).
    for (let j = 1; j <= M; j++) ptr[j] = 3;
    for (let i = 1; i <= N; i++) {
      const a = lt[i - 1]!.tok;
      for (let j = 1; j <= M; j++) {
        const sim = similarity(a, ww[j - 1]!.tok);
        const diag = score[(i - 1) * W + j - 1]! + (sim >= MATCH_MIN ? 2 * sim : -1);
        const up = score[(i - 1) * W + j]! + GAP_LYRIC;
        const left = score[i * W + j - 1]! + GAP_WORD;
        let best = diag;
        let p = 1;
        if (up > best) [best, p] = [up, 2];
        if (left > best) [best, p] = [left, 3];
        score[i * W + j] = best;
        ptr[i * W + j] = p;
      }
    }
    // Akhir transkrip juga boleh dilewati gratis (outro).
    let j = 0;
    for (let k = 0; k <= M; k++) if (score[N * W + k]! > score[N * W + j]!) j = k;
    let i = N;
    while (i > 0 && j > 0) {
      const p = ptr[i * W + j];
      if (p === 1) {
        const tok = lt[i - 1]!;
        if (similarity(tok.tok, ww[j - 1]!.tok) >= MATCH_MIN) {
          matchedCount[tok.line]! += 1;
          const st = ww[j - 1]!.start;
          const cur = firstTimeOfLine[tok.line];
          if (cur === null || cur === undefined || st < cur) firstTimeOfLine[tok.line] = st;
        }
        i -= 1;
        j -= 1;
      } else if (p === 2) i -= 1;
      else j -= 1;
    }
  }

  // Bangun hasil + isi baris tanpa waktu (interpolasi) + label.
  const out: AlignedLine[] = lines.map((line, idx) => ({
    line,
    t: firstTimeOfLine[idx] ?? NaN,
    confidence: tokenCount[idx] ? Math.round((matchedCount[idx]! / tokenCount[idx]!) * 100) / 100 : 1,
  }));
  const end = duration ?? (ww.length ? ww[ww.length - 1]!.end : 0);
  for (let k = 0; k < out.length; k++) {
    if (!Number.isNaN(out[k]!.t)) continue;
    if (isLabelLine(out[k]!.line)) continue;
    let p = k - 1;
    while (p >= 0 && Number.isNaN(out[p]!.t)) p--;
    let n = k + 1;
    while (n < out.length && Number.isNaN(out[n]!.t)) n++;
    const t0 = p >= 0 ? out[p]!.t : 0;
    const t1 = n < out.length ? out[n]!.t : end;
    const span = n - p;
    out[k]!.t = t0 + ((t1 - t0) * (k - p)) / span;
    out[k]!.confidence = 0;
  }
  // Label → waktu baris berikutnya.
  for (let k = out.length - 1; k >= 0; k--) {
    if (!Number.isNaN(out[k]!.t)) continue;
    out[k]!.t = k + 1 < out.length ? out[k + 1]!.t : end;
  }
  // Monoton naik; baris yang harus digeser ditandai ragu.
  for (let k = 1; k < out.length; k++) {
    if (out[k]!.t < out[k - 1]!.t) {
      out[k]!.t = out[k - 1]!.t + 0.1;
      out[k]!.confidence = Math.min(out[k]!.confidence, 0.3);
    }
  }
  return out.map((o) => ({ ...o, t: Math.round(o.t * 10) / 10 }));
}

/** Baris dengan keyakinan rendah (perlu dicek admin). */
export const LOW_CONFIDENCE = 0.5;

// ------------------------------------------------------------
//  Parser output whisper.cpp
// ------------------------------------------------------------

/** "whisper_print_progress_callback: progress =  45%" → 45 */
export function parseWhisperProgress(chunk: string): number | null {
  const m = [...chunk.matchAll(/progress\s*=\s*(\d+)%/g)].pop();
  return m ? Number(m[1]) : null;
}

/** Baris stdout "[00:01:02.340 --> 00:01:03.000]  kata" → detik akhir + teks. */
export function parseWhisperSegmentLine(line: string): { start: number; end: number; text: string } | null {
  const m = line.match(/\[(\d+):(\d+):(\d+(?:\.\d+)?)\s*-->\s*(\d+):(\d+):(\d+(?:\.\d+)?)\]\s*(.*)$/);
  if (!m) return null;
  const sec = (h: string, mi: string, s: string) => Number(h) * 3600 + Number(mi) * 60 + Number(s);
  return { start: sec(m[1]!, m[2]!, m[3]!), end: sec(m[4]!, m[5]!, m[6]!), text: m[7]!.trim() };
}

/** JSON whisper.cpp (-oj, -ml 1) → kata ber-timestamp. */
export function wordsFromWhisperJson(json: unknown): TimedWord[] {
  const segs = (json as { transcription?: { offsets?: { from: number; to: number }; text?: string }[] })?.transcription ?? [];
  const out: TimedWord[] = [];
  for (const s of segs) {
    const text = (s.text ?? '').trim();
    if (!text || !s.offsets) continue;
    // -ml 1 biasanya 1 kata per segmen; kalau lebih, bagi rata.
    const parts = text.split(/\s+/);
    const from = s.offsets.from / 1000;
    const to = s.offsets.to / 1000;
    const step = (to - from) / parts.length;
    parts.forEach((p, i) => out.push({ text: p, start: from + i * step, end: from + (i + 1) * step }));
  }
  return out;
}

/** Parse file .lrc → [{ t, line }]. */
export function parseLrc(text: string): { t: number; line: string }[] {
  const out: { t: number; line: string }[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const tags = [...raw.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
    if (!tags.length) continue;
    const line = raw.replace(/\[[^\]]*\]/g, '').trim();
    for (const tg of tags) out.push({ t: Math.round((Number(tg[1]) * 60 + Number(tg[2])) * 100) / 100, line });
  }
  return out.filter((l) => l.line).sort((a, b) => a.t - b.t);
}
