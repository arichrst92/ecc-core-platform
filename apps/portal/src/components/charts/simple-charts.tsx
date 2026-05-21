'use client';

/**
 * Simple chart components — pakai CSS + SVG saja, tidak butuh library eksternal.
 * Cocok untuk dashboard analytics ringan. Styling konsisten dengan rest of
 * portal (Tailwind + warna brand).
 *
 * Komponen:
 *   - BarChart: horizontal bar chart untuk leaderboard (top N).
 *   - DonutChart: donut/pie chart kecil (SVG).
 *   - LineChart: time-series SVG dengan 1-2 series + area fill.
 */

import { useMemo } from 'react';

// ============== BarChart ==============

interface BarItem {
  label: string;
  value: number;
  sublabel?: string;
  /** Optional badge di kanan label (mis. kategori). */
  hint?: string;
}

export function BarChart({
  data,
  max,
  emptyText = 'Belum ada data',
  formatValue = (v) => v.toLocaleString('id-ID'),
  color = 'bg-brand-500',
}: {
  data: BarItem[];
  /** Optional max — kalau tidak set, ambil max dari data. */
  max?: number;
  emptyText?: string;
  formatValue?: (value: number) => string;
  color?: string;
}) {
  const peak = max ?? Math.max(1, ...data.map((d) => d.value));
  if (data.length === 0) {
    return (
      <p className="text-sm text-neutral-400 italic text-center py-6">{emptyText}</p>
    );
  }
  return (
    <div className="space-y-2">
      {data.map((d, i) => {
        const pct = Math.max(2, Math.round((d.value / peak) * 100));
        return (
          <div key={i}>
            <div className="flex justify-between items-baseline text-xs gap-2">
              <span className="font-medium text-neutral-800 truncate">
                {d.label}
                {d.hint && (
                  <span className="ml-1.5 inline-block px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-500 text-[10px]">
                    {d.hint}
                  </span>
                )}
              </span>
              <span className="font-mono tabular-nums text-neutral-900 shrink-0">
                {formatValue(d.value)}
                {d.sublabel && <span className="text-neutral-400 ml-1 font-normal">{d.sublabel}</span>}
              </span>
            </div>
            <div className="mt-1 h-2 bg-neutral-100 rounded-full overflow-hidden">
              <div
                className={`h-full ${color} rounded-full transition-all`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============== DonutChart ==============

interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

export function DonutChart({
  data,
  size = 140,
  thickness = 22,
  centerLabel,
  centerSublabel,
}: {
  data: DonutSegment[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerSublabel?: string;
}) {
  const total = data.reduce((a, b) => a + b.value, 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  let offsetAccum = 0;
  const segments = useMemo(() => {
    return data.map((s) => {
      const fraction = total === 0 ? 0 : s.value / total;
      const length = fraction * circumference;
      const result = {
        ...s,
        fraction,
        dashArray: `${length} ${circumference - length}`,
        dashOffset: -offsetAccum,
      };
      offsetAccum += length;
      return result;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, total, circumference]);

  return (
    <div className="flex items-center gap-4">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          {/* Track */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="#f3f4f6"
            strokeWidth={thickness}
          />
          {total > 0 &&
            segments.map((s, i) => (
              <circle
                key={i}
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke={s.color}
                strokeWidth={thickness}
                strokeDasharray={s.dashArray}
                strokeDashoffset={s.dashOffset}
                strokeLinecap="butt"
              />
            ))}
        </svg>
        {centerLabel && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-xl font-bold text-neutral-900 tabular-nums">{centerLabel}</span>
            {centerSublabel && (
              <span className="text-[10px] text-neutral-500 uppercase tracking-wider mt-0.5">
                {centerSublabel}
              </span>
            )}
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0 space-y-1.5">
        {data.map((s, i) => {
          const pct = total === 0 ? 0 : Math.round((s.value / total) * 100);
          return (
            <div key={i} className="flex items-center gap-2 text-xs">
              <div className="w-3 h-3 rounded shrink-0" style={{ background: s.color }} />
              <span className="text-neutral-700 truncate flex-1">{s.label}</span>
              <span className="font-mono tabular-nums text-neutral-900 font-medium shrink-0">
                {s.value.toLocaleString('id-ID')}
                <span className="text-neutral-400 font-normal ml-1">({pct}%)</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============== LineChart (time-series) ==============

interface LineSeries {
  label: string;
  color: string;
  data: number[];
  /** Apakah seri ini di-fill (area chart). Default true untuk series pertama. */
  fill?: boolean;
}

export function LineChart({
  xLabels,
  series,
  height = 200,
  emptyText = 'Belum ada data',
  yFormatter = (v) => v.toLocaleString('id-ID'),
}: {
  /** Label x-axis (mis. tanggal YYYY-MM-DD). Length = data length per series. */
  xLabels: string[];
  series: LineSeries[];
  height?: number;
  emptyText?: string;
  yFormatter?: (value: number) => string;
}) {
  const totalPoints = xLabels.length;
  const hasData = series.some((s) => s.data.some((v) => v > 0));
  const peak = Math.max(1, ...series.flatMap((s) => s.data));

  if (totalPoints === 0 || !hasData) {
    return (
      <div className="h-48 flex items-center justify-center text-sm text-neutral-400 italic">
        {emptyText}
      </div>
    );
  }

  const padLeft = 36;
  const padRight = 12;
  const padTop = 12;
  const padBottom = 28;
  const width = 800; // SVG viewBox lebar (akan di-scale ke 100% lewat CSS)
  const innerW = width - padLeft - padRight;
  const innerH = height - padTop - padBottom;

  function x(i: number) {
    return totalPoints <= 1 ? padLeft + innerW / 2 : padLeft + (i * innerW) / (totalPoints - 1);
  }
  function y(v: number) {
    return padTop + innerH - (v / peak) * innerH;
  }

  // Y-axis ticks: 0, peak/2, peak
  const yTicks = [0, Math.round(peak / 2), peak];
  // X-axis: tampilkan max ~6 label evenly distributed
  const xTickStride = Math.max(1, Math.floor(totalPoints / 6));
  const xTicks: number[] = [];
  for (let i = 0; i < totalPoints; i += xTickStride) xTicks.push(i);
  if (xTicks[xTicks.length - 1] !== totalPoints - 1) xTicks.push(totalPoints - 1);

  function pointsToPath(values: number[]): string {
    return values.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(v)}`).join(' ');
  }
  function pointsToAreaPath(values: number[]): string {
    if (values.length === 0) return '';
    const top = pointsToPath(values);
    return `${top} L ${x(values.length - 1)} ${y(0)} L ${x(0)} ${y(0)} Z`;
  }

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        preserveAspectRatio="none"
        style={{ height }}
      >
        {/* Y grid */}
        {yTicks.map((t, i) => (
          <g key={i}>
            <line
              x1={padLeft}
              x2={width - padRight}
              y1={y(t)}
              y2={y(t)}
              stroke="#f3f4f6"
              strokeWidth={1}
            />
            <text
              x={padLeft - 4}
              y={y(t) + 4}
              textAnchor="end"
              fontSize={10}
              fill="#9ca3af"
            >
              {yFormatter(t)}
            </text>
          </g>
        ))}
        {/* X ticks */}
        {xTicks.map((i) => (
          <text
            key={i}
            x={x(i)}
            y={height - padBottom + 14}
            textAnchor="middle"
            fontSize={9}
            fill="#9ca3af"
          >
            {xLabels[i]?.slice(5) /* drop YYYY- prefix; tampilkan MM-DD */}
          </text>
        ))}
        {/* Series */}
        {series.map((s, idx) => {
          const fill = s.fill ?? idx === 0;
          return (
            <g key={s.label}>
              {fill && (
                <path
                  d={pointsToAreaPath(s.data)}
                  fill={s.color}
                  fillOpacity={0.12}
                />
              )}
              <path
                d={pointsToPath(s.data)}
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
          );
        })}
      </svg>
      {/* Legend */}
      <div className="flex items-center gap-4 flex-wrap mt-2 px-1">
        {series.map((s) => (
          <div key={s.label} className="flex items-center gap-1.5 text-xs text-neutral-600">
            <span
              className="w-3 h-3 rounded-full"
              style={{ background: s.color }}
            />
            {s.label}
          </div>
        ))}
      </div>
    </div>
  );
}
