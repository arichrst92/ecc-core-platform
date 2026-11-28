'use client';

/** Grafik SVG untuk halaman Forecast (tanpa library). */
import { useState } from 'react';
import { mLabel, nf } from '@/lib/forecast-types';

// ------------------------------------------------------------------ grafik utama

export function ForecastChart({
  months,
  series,
  fc,
  scenario,
  milestones,
  riwayatSampai,
}: {
  months: string[];
  series: number[];
  fc: { months: string[]; fc: number[]; lo: number[]; hi: number[]; pes: number[]; opt: number[] } | null;
  scenario: 'pes' | 'normal' | 'opt';
  milestones: { target: number; month: string }[];
  /** Bulan riwayat (kurang lengkap) — diarsir & diberi label. */
  riwayatSampai?: string | null;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const H = series.length;
  const rw = riwayatSampai ? months.filter((m) => m <= riwayatSampai).length : 0;
  const F = fc?.fc.length ?? 0;
  const n = Math.max(2, H + F);
  const W = 1000;
  const Hh = 300;
  const L = 52;
  const R = 16;
  const T = 22;
  const B = 28;
  const iw = W - L - R;
  const ih = Hh - T - B;
  const max = Math.max(10, Math.ceil(Math.max(1, ...series, ...(fc?.hi ?? [])) / 100) * 100);
  const x = (i: number) => L + (i * iw) / (n - 1);
  const y = (v: number) => T + ih - (v / max) * ih;
  const main = fc ? (scenario === 'pes' ? fc.pes : scenario === 'opt' ? fc.opt : fc.fc) : [];
  const last = series[H - 1] ?? 0;
  const allMonths = [...months, ...(fc?.months ?? [])];
  const step = n > 48 ? 6 : n > 24 ? 3 : 2;
  const val = (i: number) => (i < H ? series[i]! : main[i - H]!);
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${Hh}`} className="w-full h-auto select-none" onMouseLeave={() => setHover(null)}>
        <defs>
          <linearGradient id="fc-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#F97316" stopOpacity=".28" />
            <stop offset="1" stopColor="#F97316" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="fc-line" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#F97316" />
            <stop offset="1" stopColor="#C2410C" />
          </linearGradient>
        </defs>
        {rw > 0 ? (
          <>
            <rect x={L} y={T} width={Math.max(0, x(rw - 1) + iw / (n - 1) / 2 - L)} height={ih} fill="#FAFAF9" />
            <text x={L + 6} y={T + ih - 8} fontSize={10} fill="#A8A29E">
              riwayat login (kurang lengkap)
            </text>
          </>
        ) : null}
        {F > 24 ? (
          <>
            <rect x={x(H + 23)} y={T} width={x(n - 1) - x(H + 23)} height={ih} fill="#F8FAFC" />
            <text x={(x(H + 23) + x(n - 1)) / 2} y={T + ih - 8} textAnchor="middle" fontSize={10} fill="#64748B">
              Proyeksi jangka panjang — gambaran arah, bukan kepastian
            </text>
          </>
        ) : null}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line x1={L} x2={W - R} y1={y(max * f)} y2={y(max * f)} stroke="#F1F1F1" />
            <text x={L - 6} y={y(max * f) + 3} textAnchor="end" fontSize={10} fill="#A3A3A3">
              {nf(max * f)}
            </text>
          </g>
        ))}
        {fc
          ? milestones.map((m) => {
              const k = fc.months.indexOf(m.month);
              if (k < 0) return null;
              return (
                <g key={m.target}>
                  <line x1={L} x2={W - R} y1={y(m.target)} y2={y(m.target)} stroke="#C4B5FD" strokeDasharray="2 4" />
                  <circle cx={x(H + k)} cy={y(m.target)} r={4} fill="#fff" stroke="#7C3AED" strokeWidth={2} />
                  <text x={x(H + k) + 6} y={y(m.target) - 6} fontSize={10} fontWeight={700} fill="#6D28D9">
                    {nf(m.target)} ±{mLabel(m.month)}
                  </text>
                </g>
              );
            })
          : null}
        {fc && F ? (
          <path
            d={`M ${x(H - 1)} ${y(last)} ${fc.hi.map((v, k) => `L ${x(H + k)} ${y(v)}`).join(' ')} ${fc.lo
              .map((v, k) => ({ v, k }))
              .reverse()
              .map(({ v, k }) => `L ${x(H + k)} ${y(v)}`)
              .join(' ')} Z`}
            fill="#EDE9FE"
            opacity={0.85}
          />
        ) : null}
        {H > 0 ? (
          <>
            <path d={`M ${x(0)} ${y(0)} ${series.map((v, k) => `L ${x(k)} ${y(v)}`).join(' ')} L ${x(H - 1)} ${y(0)} Z`} fill="url(#fc-area)" />
            <path d={series.map((v, k) => `${k ? 'L' : 'M'} ${x(k)} ${y(v)}`).join(' ')} fill="none" stroke="url(#fc-line)" strokeWidth={3} strokeLinejoin="round" />
          </>
        ) : null}
        {fc && F ? (
          <>
            {scenario === 'normal' ? (
              <>
                <path d={`M ${x(H - 1)} ${y(last)} ${fc.pes.map((v, k) => `L ${x(H + k)} ${y(v)}`).join(' ')}`} fill="none" stroke="#94A3B8" strokeWidth={1.5} strokeDasharray="3 4" />
                <path d={`M ${x(H - 1)} ${y(last)} ${fc.opt.map((v, k) => `L ${x(H + k)} ${y(v)}`).join(' ')}`} fill="none" stroke="#94A3B8" strokeWidth={1.5} strokeDasharray="3 4" />
              </>
            ) : null}
            <path d={`M ${x(H - 1)} ${y(last)} ${main.map((v, k) => `L ${x(H + k)} ${y(v)}`).join(' ')}`} fill="none" stroke="#8B5CF6" strokeWidth={2.5} strokeDasharray="7 5" />
            <circle cx={x(n - 1)} cy={y(main[F - 1]!)} r={5} fill="#8B5CF6" stroke="#fff" strokeWidth={2} />
            <text x={x(n - 1) - 8} y={y(main[F - 1]!) + 18} textAnchor="end" fontSize={11} fontWeight={700} fill="#6D28D9">
              {nf(main[F - 1]!)}
            </text>
          </>
        ) : null}
        {H > 0 ? (
          <>
            <line x1={x(H - 1)} x2={x(H - 1)} y1={T} y2={T + ih} stroke="#D4D4D4" strokeDasharray="2 3" />
            <text x={x(H - 1) + 6} y={T + 10} fontSize={10} fill="#737373">
              bulan lengkap terakhir
            </text>
            <circle cx={x(H - 1)} cy={y(last)} r={5} fill="#C2410C" stroke="#fff" strokeWidth={2} />
          </>
        ) : null}
        {allMonths.map((k, i) =>
          i % step === 0 || i === n - 1 ? (
            <text key={k} x={x(i)} y={Hh - 8} textAnchor="middle" fontSize={10} fill="#A3A3A3">
              {mLabel(k)}
            </text>
          ) : null,
        )}
        {allMonths.map((k, i) => (
          <rect key={`h${k}`} x={x(i) - iw / (n - 1) / 2} y={T} width={iw / (n - 1)} height={ih} fill={hover === i ? '#0000000A' : 'transparent'} onMouseEnter={() => setHover(i)} />
        ))}
      </svg>
      {hover != null && allMonths[hover] ? (
        <div
          className="absolute top-2 z-10 pointer-events-none bg-neutral-900/95 text-white text-[11px] rounded-lg px-2.5 py-2 shadow-lg min-w-[170px]"
          style={hover / n > 0.6 ? { right: `${100 - (hover / (n - 1)) * 100 + 2}%` } : { left: `${(hover / (n - 1)) * 100 + 2}%` }}
        >
          <div className="font-semibold mb-1">
            {mLabel(allMonths[hover]!, true)}
            {hover >= H && hover - H >= 24 ? <span className="text-white/60"> (jangka panjang)</span> : null}
          </div>
          {hover < H ? (
            <>
              <div>
                Jemaat aktif <b>{nf(val(hover))}</b>
              </div>
              {hover > 0 && series[hover - 1] ? (
                <div className="text-white/70">
                  {val(hover) >= series[hover - 1]! ? '▲' : '▼'} {Math.abs(Math.round(((val(hover) - series[hover - 1]!) / series[hover - 1]!) * 1000) / 10)}% vs bulan
                  sebelumnya
                </div>
              ) : null}
            </>
          ) : fc ? (
            <>
              <div>
                Perkiraan <b>{nf(val(hover))}</b>
              </div>
              <div className="text-white/70">
                Rentang {nf(fc.lo[hover - H])} – {nf(fc.hi[hover - H])}
              </div>
              <div className="text-white/70">
                Pesimis {nf(fc.pes[hover - H])} · Optimis {nf(fc.opt[hover - H])}
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------ batang bertumpuk

export type Stack = { label: string; color: string; data: number[] };

export function Bars({
  labels,
  up,
  down = [],
  line,
  height = 220,
  tick = (s: string) => s,
}: {
  labels: string[];
  up: Stack[];
  down?: Stack[];
  line?: { label: string; color: string; data: number[]; dashed?: boolean; offset?: number };
  height?: number;
  tick?: (s: string) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const n = labels.length;
  const W = 600;
  const Hh = height;
  const L = 36;
  const R = 8;
  const T = 10;
  const B = 22;
  const ih = Hh - T - B;
  const sumAt = (ss: Stack[], i: number) => ss.reduce((a, s) => a + (s.data[i] ?? 0), 0);
  const upMax = Math.max(1, ...labels.map((_, i) => sumAt(up, i)), ...(line?.data ?? []).filter((v) => v > 0));
  const dnMax = down.length ? Math.max(0, ...labels.map((_, i) => sumAt(down, i))) : 0;
  const uh = dnMax ? ih * (upMax / (upMax + dnMax)) : ih;
  const z = T + uh;
  const sc = uh / upMax;
  const bw = (W - L - R) / Math.max(1, n);
  if (!n || (!up.some((s) => s.data.some((v) => v > 0)) && !line?.data.some((v) => v > 0)))
    return <div className="h-32 flex items-center justify-center text-sm text-neutral-400 italic">Belum ada data</div>;
  const step = Math.max(1, Math.ceil(n / 8));
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${Hh}`} className="w-full h-auto select-none" onMouseLeave={() => setHover(null)}>
        <line x1={L} x2={W - R} y1={z} y2={z} stroke="#D4D4D4" />
        <text x={L - 4} y={T + 8} textAnchor="end" fontSize={9.5} fill="#A3A3A3">
          {nf(upMax)}
        </text>
        {dnMax ? (
          <text x={L - 4} y={Hh - B} textAnchor="end" fontSize={9.5} fill="#A3A3A3">
            -{nf(dnMax)}
          </text>
        ) : null}
        {labels.map((lab, i) => {
          const x0 = L + i * bw + Math.min(4, bw * 0.15);
          const w = Math.max(1, bw - Math.min(8, bw * 0.3));
          let yu = z;
          let yd = z;
          return (
            <g key={lab} onMouseEnter={() => setHover(i)}>
              <rect x={L + i * bw} y={T} width={bw} height={ih} fill={hover === i ? '#0000000A' : 'transparent'} />
              {up.map((s) => {
                const h = (s.data[i] ?? 0) * sc;
                if (h <= 0) return null;
                yu -= h;
                return <rect key={s.label} x={x0} y={yu} width={w} height={h} fill={s.color} rx={2} />;
              })}
              {down.map((s) => {
                const h = (s.data[i] ?? 0) * sc;
                if (h <= 0) return null;
                const y0 = yd;
                yd += h;
                return <rect key={s.label} x={x0} y={y0} width={w} height={h} fill={s.color} rx={2} />;
              })}
              {i % step === 0 || i === n - 1 ? (
                <text x={L + i * bw + bw / 2} y={Hh - 6} textAnchor="middle" fontSize={9.5} fill="#A3A3A3">
                  {tick(lab)}
                </text>
              ) : null}
            </g>
          );
        })}
        {line ? (
          <path
            d={line.data.map((v, i) => `${i ? 'L' : 'M'} ${L + (i + (line.offset ?? 0)) * bw + bw / 2} ${z - v * sc}`).join(' ')}
            fill="none"
            stroke={line.color}
            strokeWidth={2}
            strokeDasharray={line.dashed ? '6 4' : undefined}
            pointerEvents="none"
          />
        ) : null}
      </svg>
      {hover != null ? (
        <div
          className="absolute top-1 z-10 pointer-events-none bg-neutral-900/95 text-white text-[11px] rounded-lg px-2.5 py-2 shadow-lg min-w-[140px]"
          style={hover / n > 0.6 ? { right: `${100 - ((hover + 0.5) / n) * 100 + 2}%` } : { left: `${((hover + 0.5) / n) * 100 + 2}%` }}
        >
          <div className="font-semibold mb-1">{tick(labels[hover]!)}</div>
          {[...up, ...down].map((s) => (
            <div key={s.label} className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-sm" style={{ background: s.color }} />
              <span className="flex-1">{s.label}</span>
              <b className="tabular-nums">{nf(s.data[hover] ?? 0)}</b>
            </div>
          ))}
          {line && line.data[hover - (line.offset ?? 0)] != null ? (
            <div className="flex items-center gap-1.5 mt-1 pt-1 border-t border-white/20">
              <span className="flex-1">{line.label}</span>
              <b className="tabular-nums">{nf(line.data[hover - (line.offset ?? 0)]!)}</b>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------ garis

export function Lines({
  labels,
  series,
  height = 220,
  yMax,
  suffix = '',
  refLines = [],
}: {
  labels: string[];
  series: { label: string; color: string; data: (number | null)[]; dashed?: boolean; width?: number }[];
  height?: number;
  yMax?: number;
  suffix?: string;
  refLines?: { value: number; label: string; color: string; dashed?: boolean }[];
}) {
  const n = labels.length;
  const W = 600;
  const Hh = height;
  const L = 40;
  const R = 10;
  const T = 12;
  const B = 22;
  const ih = Hh - T - B;
  const vals = series.flatMap((s) => s.data.filter((v): v is number => v != null));
  const max = yMax ?? Math.max(1, ...vals, ...refLines.map((r) => r.value)) * 1.08;
  const x = (i: number) => L + (n <= 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (n - 1));
  const y = (v: number) => T + ih - (v / max) * ih;
  if (!vals.length) return <div className="h-32 flex items-center justify-center text-sm text-neutral-400 italic">Belum ada data</div>;
  const step = Math.max(1, Math.ceil(n / 8));
  const path = (d: (number | null)[]) => {
    let s = '';
    let pen = false;
    d.forEach((v, i) => {
      if (v == null) {
        pen = false;
        return;
      }
      s += `${pen ? 'L' : 'M'} ${x(i)} ${y(v)} `;
      pen = true;
    });
    return s;
  };
  return (
    <svg viewBox={`0 0 ${W} ${Hh}`} className="w-full h-auto">
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line x1={L} x2={W - R} y1={y(max * f)} y2={y(max * f)} stroke="#F1F1F1" />
          <text x={L - 5} y={y(max * f) + 3} textAnchor="end" fontSize={9.5} fill="#A3A3A3">
            {nf(max * f)}
            {suffix}
          </text>
        </g>
      ))}
      {refLines.map((r) => (
        <g key={r.label}>
          <line x1={L} x2={W - R} y1={y(r.value)} y2={y(r.value)} stroke={r.color} strokeWidth={1.5} strokeDasharray={r.dashed ? '4 3' : undefined} />
          <text x={W - R} y={y(r.value) - 4} textAnchor="end" fontSize={10} fontWeight={700} fill={r.color}>
            {r.label}
          </text>
        </g>
      ))}
      {series.map((s) => (
        <path key={s.label} d={path(s.data)} fill="none" stroke={s.color} strokeWidth={s.width ?? 2.5} strokeDasharray={s.dashed ? '6 4' : undefined} strokeLinejoin="round" />
      ))}
      {labels.map((l, i) =>
        i % step === 0 || i === n - 1 ? (
          <text key={`${l}${i}`} x={x(i)} y={Hh - 6} textAnchor="middle" fontSize={9.5} fill="#A3A3A3">
            {l}
          </text>
        ) : null,
      )}
    </svg>
  );
}

export function Legend({ items }: { items: { label: string; color: string; line?: boolean }[] }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
      {items.map((x) => (
        <span key={x.label} className="flex items-center gap-1.5 text-[11px] text-neutral-600">
          {x.line ? <span className="inline-block w-4 h-0.5 rounded" style={{ background: x.color }} /> : <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: x.color }} />}
          {x.label}
        </span>
      ))}
    </div>
  );
}

export function Spark({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return <span className="text-neutral-300">—</span>;
  const mx = Math.max(...data);
  const mn = Math.min(...data);
  return (
    <svg width="110" height="26">
      <path d={data.map((p, i) => `${i ? 'L' : 'M'} ${(i * 108) / (data.length - 1) + 1} ${24 - ((p - mn) / (mx - mn || 1)) * 20}`).join(' ')} fill="none" stroke={color} strokeWidth={2} />
    </svg>
  );
}
