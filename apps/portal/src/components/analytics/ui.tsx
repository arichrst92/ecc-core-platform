'use client';

/** Komponen & format kecil yang dipakai bersama tab-tab Analitik. */
import type { LucideIcon } from 'lucide-react';
import { Loader2 } from 'lucide-react';

export const fmtNum = (n: number) => Math.round(n).toLocaleString('id-ID');

export const fmtDur = (sec: number) => {
  const s = Math.round(sec);
  if (s < 60) return `${s} dtk`;
  const m = Math.floor(s / 60);
  return `${m}m ${String(s % 60).padStart(2, '0')}d`;
};

export const fmtMs = (ms: number) =>
  ms >= 1000 ? `${(ms / 1000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} dtk` : `${Math.round(ms)} ms`;

export const fmtPct = (p: number, digits = 1) =>
  `${p.toLocaleString('id-ID', { maximumFractionDigits: p >= 99.9 && p < 100 ? 2 : digits })}%`;

/** Retensi: hijau ≥ 50%, kuning 30–49%, merah < 30%. */
export const retentionClass = (p: number) => (p >= 50 ? 'text-green-700' : p >= 30 ? 'text-amber-700' : 'text-red-600');

/** Success rate: hijau ≥ 99,5%, kuning 98–99,4%, merah < 98%. */
export const successClass = (p: number) => (p >= 99.5 ? 'text-green-700' : p >= 98 ? 'text-amber-700' : 'text-red-600');

export function Kpi({
  icon: Icon,
  color,
  label,
  value,
  sub,
  valueClass = 'text-neutral-900',
}: {
  icon: LucideIcon;
  color: string;
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  valueClass?: string;
}) {
  return (
    <div className="rounded-xl bg-white border border-neutral-200 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-neutral-500">{label}</span>
        <span className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${color}1a` }}>
          <Icon className="w-4 h-4" style={{ color }} />
        </span>
      </div>
      <div className={`text-2xl font-bold mt-1 tabular-nums ${valueClass}`}>{value}</div>
      {sub ? <div className="text-[11px] text-neutral-500 mt-0.5">{sub}</div> : null}
    </div>
  );
}

export function Card({
  title,
  sub,
  right,
  children,
  className = '',
}: {
  title: string;
  sub?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-white border border-neutral-200 rounded-xl ${className}`}>
      <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-2">
        <div>
          <div className="text-sm font-semibold text-neutral-900">{title}</div>
          {sub ? <div className="text-xs text-neutral-500 mt-0.5">{sub}</div> : null}
        </div>
        {right}
      </div>
      <div className="px-4 pb-4">{children}</div>
    </div>
  );
}

export function Loading({ text = 'Memuat…' }: { text?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-sm text-neutral-500">
      <Loader2 className="w-4 h-4 animate-spin" /> {text}
    </div>
  );
}

/** Garis kecil tanpa sumbu (tren singkat). */
export function Sparkline({ data, color = '#2563eb', height = 56 }: { data: number[]; color?: string; height?: number }) {
  if (data.length < 2) return null;
  const w = 300;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const span = Math.max(1, max - min);
  const pts = data.map((v, i) => [(i / (data.length - 1)) * w, height - 4 - ((v - min) / span) * (height - 8)] as const);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }} aria-hidden>
      <path d={`${line} L${w} ${height} L0 ${height} Z`} fill={color} fillOpacity={0.1} />
      <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Pembagian iOS / Android / Web. */
export function PlatformBar({ android, ios, web }: { android: number; ios: number; web: number }) {
  const tot = Math.max(1, android + ios + web);
  const items = [
    { k: 'Android', v: android, c: '#16a34a' },
    { k: 'iOS', v: ios, c: '#2563eb' },
    { k: 'Web', v: web, c: '#f59e0b' },
  ];
  return (
    <div>
      <div className="flex h-2.5 rounded-full overflow-hidden gap-0.5 bg-neutral-100">
        {items.map((x) => (
          <div key={x.k} style={{ width: `${(x.v / tot) * 100}%`, background: x.c }} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-xs text-neutral-600">
        {items.map((x) => (
          <span key={x.k} className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: x.c }} />
            {x.k} {Math.round((x.v / tot) * 100)}%
          </span>
        ))}
      </div>
    </div>
  );
}
