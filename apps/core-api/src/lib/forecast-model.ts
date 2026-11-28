/**
 * Model prediksi deret waktu bulanan untuk Forecast (2026-11).
 *
 * Holt (tren) dengan peredaman (damped trend) + indeks musiman bulanan opsional
 * (hanya bila data ≥ minimal musiman). Parameter dipilih dengan pencarian grid
 * yang meminimalkan galat satu langkah. Rentang 80% dari simpangan galat yang
 * melebar seiring jarak ramalan. Tanpa library luar — bisa dijelaskan.
 */

export type FitResult = {
  /** Prediksi titik h = 1..H. */
  fc: number[];
  lo: number[];
  hi: number[];
  pes: number[];
  opt: number[];
  params: { alpha: number; beta: number; phi: number; seasonal: boolean };
  sigma: number;
};

function seasonalIdx(y: number[], startMonth: number, use: boolean): number[] {
  const idx = Array.from({ length: 12 }, () => 0);
  if (!use) return idx;
  // Selisih terhadap rata-rata bergerak 12 bulan (aditif), dirata-rata per bulan kalender.
  const sums = Array.from({ length: 12 }, () => 0);
  const cnt = Array.from({ length: 12 }, () => 0);
  for (let i = 6; i < y.length - 6; i++) {
    let ma = 0;
    for (let k = i - 6; k < i + 6; k++) ma += y[k]!;
    ma /= 12;
    const m = (startMonth + i) % 12;
    sums[m]! += y[i]! - ma;
    cnt[m]!++;
  }
  for (let m = 0; m < 12; m++) idx[m] = cnt[m] ? sums[m]! / cnt[m]! : 0;
  const mean = idx.reduce((a, b) => a + b, 0) / 12;
  return idx.map((v) => v - mean);
}

function run(y: number[], s: number[], startMonth: number, a: number, b: number, phi: number) {
  let level = y[0]! - s[startMonth % 12]!;
  let trend = y.length > 1 ? y[1]! - y[0]! : 0;
  let sse = 0;
  const errs: number[] = [];
  for (let i = 1; i < y.length; i++) {
    const m = (startMonth + i) % 12;
    const pred = level + phi * trend + s[m]!;
    const e = y[i]! - pred;
    errs.push(e);
    sse += e * e;
    const prevLevel = level;
    level = a * (y[i]! - s[m]!) + (1 - a) * (prevLevel + phi * trend);
    trend = b * (level - prevLevel) + (1 - b) * phi * trend;
  }
  return { level, trend, sse, errs };
}

/**
 * @param y deret bulanan (bulan lengkap), @param startMonth bulan kalender (0–11) titik pertama,
 * @param H panjang ramalan, @param seasonal pakai musiman (butuh ≥ 24 titik).
 */
export function fitForecast(y: number[], startMonth: number, H: number, seasonal: boolean): FitResult | null {
  if (y.length < 3) return null;
  const useS = seasonal && y.length >= 24;
  const s = seasonalIdx(y, startMonth, useS);
  let best: { a: number; b: number; phi: number; r: ReturnType<typeof run> } | null = null;
  for (const a of [0.2, 0.35, 0.5, 0.65, 0.8]) {
    for (const b of [0.05, 0.1, 0.2, 0.3]) {
      for (const phi of [0.85, 0.9, 0.94, 0.97]) {
        const r = run(y, s, startMonth, a, b, phi);
        if (!best || r.sse < best.r.sse) best = { a, b, phi, r };
      }
    }
  }
  const { a, b, phi, r } = best!;
  const n = r.errs.length || 1;
  // Simpangan galat satu langkah; minimal 2% dari nilai terakhir supaya rentang tidak nol.
  const last = y[y.length - 1]!;
  const sigma = Math.max(Math.sqrt(r.errs.reduce((x, e) => x + e * e, 0) / n), Math.abs(last) * 0.02, 1);
  const fc: number[] = [];
  const lo: number[] = [];
  const hi: number[] = [];
  const pes: number[] = [];
  const opt: number[] = [];
  let damp = 0;
  for (let h = 1; h <= H; h++) {
    damp += Math.pow(phi, h);
    const m = (startMonth + y.length - 1 + h) % 12;
    const v = Math.max(0, r.level + damp * r.trend + s[m]!);
    // Variansi kira-kira naik linear dengan h (ditambah komponen tren).
    const w = 1.2816 * sigma * Math.sqrt(1 + (h - 1) * (a * a * (1 + h * b) + 0.15));
    fc.push(v);
    lo.push(Math.max(0, v - w));
    hi.push(v + w);
    pes.push(Math.max(0, v - w * 0.7));
    opt.push(v + w * 0.7);
  }
  return { fc, lo, hi, pes, opt, params: { alpha: a, beta: b, phi, seasonal: useS }, sigma };
}

/** Uji mundur: rata-rata galat persen absolut untuk ramalan h bulan (asal bergulir). */
export function backtest(y: number[], startMonth: number, h: number, seasonal: boolean): { mape: number | null; points: { idx: number; actual: number; pred: number }[] } {
  const points: { idx: number; actual: number; pred: number }[] = [];
  for (let end = Math.max(4, y.length - 12 - h + 1); end + h <= y.length; end++) {
    const f = fitForecast(y.slice(0, end), startMonth, h, seasonal);
    if (!f) continue;
    const idx = end + h - 1;
    points.push({ idx, actual: y[idx]!, pred: f.fc[h - 1]! });
  }
  const valid = points.filter((p) => p.actual > 0);
  const mape = valid.length ? (valid.reduce((a, p) => a + Math.abs(p.pred - p.actual) / p.actual, 0) / valid.length) * 100 : null;
  return { mape: mape == null ? null : Math.round(mape * 10) / 10, points };
}
