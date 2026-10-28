'use client';

/** Tab "Performa API": latency (server & dirasakan di app) dan success rate. */
import { useMemo, useState } from 'react';
import { Activity, AlertTriangle, ArrowDown, CheckCircle2, Gauge, Server, Smartphone } from 'lucide-react';
import { useApiPerformance } from '@/lib/analytics/use-analytics';
import type { AnalyticsFilter, ApiHourly, EndpointRow } from '@/lib/analytics/types';
import { Card, Kpi, Loading, fmtMs, fmtNum, fmtPct, successClass } from './ui';

const MIX = [
  { k: 'ok', label: '2xx', c: '#16a34a' },
  { k: 'c4xx', label: '4xx ditolak wajar', c: '#f59e0b' },
  { k: 'c5xx', label: '5xx', c: '#dc2626' },
  { k: 'network', label: 'jaringan', c: '#a3a3a3' },
] as const;

type SortKey = 'path' | 'count' | 'p95' | 'success';

export function ApiTab({ filter }: { filter: AnalyticsFilter }) {
  const q = useApiPerformance(filter);
  const [sort, setSort] = useState<SortKey>('count');
  const eps = useMemo(() => {
    const r = [...(q.data?.endpoints ?? [])];
    r.sort((a, b) =>
      sort === 'path' ? a.path.localeCompare(b.path) : sort === 'success' ? a.success - b.success : b[sort] - a[sort],
    );
    return r;
  }, [q.data, sort]);
  const d = q.data;
  if (!d) return <Loading />;
  const s = d.summary;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi icon={Smartphone} color="#16a34a" label="Success rate app" value={fmtPct(s.successApp)} valueClass={successClass(s.successApp)} sub={`gagal jaringan ${fmtPct(s.networkFailPct)}`} />
        <Kpi icon={Server} color="#16a34a" label="Success rate server" value={fmtPct(s.successServer, 2)} valueClass={successClass(s.successServer)} sub={`5xx: ${fmtNum(s.err5xx)} dari ${fmtNum(s.total)}`} />
        <Kpi icon={Gauge} color="#f97316" label="p95 server" value={fmtMs(s.p95Server)} sub={`p50 ${fmtMs(s.p50Server)}`} />
        <Kpi icon={Smartphone} color="#2563eb" label="p95 di app" value={fmtMs(s.p95App)} sub={`p50 ${fmtMs(s.p50App)} · termasuk jaringan`} />
        <Kpi icon={Activity} color="#8b5cf6" label="Request / menit" value={fmtNum(s.rpm)} sub={`puncak ${fmtNum(s.peakRpm)} · ${s.peakAt}`} />
      </div>

      <Card title="Latency p95 per jam" sub="Server = waktu proses core-api · app = dirasakan jemaat (termasuk jaringan) · batang = pengguna aktif">
        <LatencyChart data={d.hourly} />
      </Card>

      <Card title="Aksi penting" sub="Success rate per alur, bukan per endpoint">
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
          {d.flows.map((f) => (
            <div key={f.key} className="rounded-lg bg-neutral-50 p-3">
              <div className="text-xs text-neutral-500">{f.label}</div>
              <div className={`text-xl font-bold tabular-nums ${successClass(f.success)}`}>{fmtPct(f.success)}</div>
              <div className="text-[11px] text-neutral-500">{fmtNum(f.attempts)} percobaan</div>
              {f.note ? <div className="text-[11px] text-neutral-500 mt-1 leading-snug">{f.note}</div> : null}
            </div>
          ))}
        </div>
      </Card>

      <Card title="Endpoint" sub="Klik judul kolom untuk mengurutkan · Sukses diurutkan dari yang terendah">
        <div className="overflow-x-auto -mx-4">
          <table className="w-full text-sm min-w-[760px]">
            <thead className="text-xs text-neutral-500 bg-neutral-50">
              <tr>
                <SortTh k="path" sort={sort} set={setSort} left>
                  Endpoint
                </SortTh>
                <SortTh k="count" sort={sort} set={setSort}>
                  Request
                </SortTh>
                <th className="px-4 py-2 font-medium text-right">p50</th>
                <SortTh k="p95" sort={sort} set={setSort}>
                  p95
                </SortTh>
                <SortTh k="success" sort={sort} set={setSort}>
                  Sukses
                </SortTh>
                <th className="px-4 py-2 font-medium text-left w-56">2xx · 4xx · 5xx · jaringan</th>
              </tr>
            </thead>
            <tbody>
              {eps.map((e) => (
                <EndpointTr key={`${e.method} ${e.path}`} e={e} />
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] text-neutral-500">
          {MIX.map((m) => (
            <span key={m.k} className="inline-flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: m.c }} />
              {m.label}
            </span>
          ))}
          <span>· sukses: hijau ≥ 99,5% · kuning 98–99,4% · merah &lt; 98% · 4xx tidak dihitung gagal</span>
        </div>
      </Card>

      <Card title="Error terbanyak hari ini" right={<AlertTriangle className="w-4 h-4 text-red-500" />}>
        <div className="divide-y divide-neutral-100 border border-neutral-100 rounded-lg">
          {d.topErrors.map((x) => (
            <div key={`${x.code}${x.path}`} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm">
              <span className="font-mono text-xs">
                <span className={x.code === 'timeout' ? 'text-neutral-500' : 'text-red-600'}>{x.code}</span>{' '}
                <span className="text-neutral-500">{x.method}</span> {x.path}
              </span>
              <span className="text-xs text-neutral-500">
                {fmtNum(x.count)}× · terakhir {x.last}
                {x.note ? ` · ${x.note}` : ''}
              </span>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-neutral-400 mt-2 inline-flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3" /> Hanya pola endpoint, status, dan durasi yang dicatat — tanpa isi request atau data jemaat.
        </p>
      </Card>
    </div>
  );
}

function SortTh({
  k,
  sort,
  set,
  left,
  children,
}: {
  k: SortKey;
  sort: SortKey;
  set: (k: SortKey) => void;
  left?: boolean;
  children: React.ReactNode;
}) {
  return (
    <th
      onClick={() => set(k)}
      className={`px-4 py-2 font-medium cursor-pointer select-none whitespace-nowrap ${left ? 'text-left' : 'text-right'} ${sort === k ? 'text-neutral-900' : ''}`}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {sort === k ? <ArrowDown className="w-3 h-3" /> : null}
      </span>
    </th>
  );
}

function EndpointTr({ e }: { e: EndpointRow }) {
  return (
    <tr className="border-t border-neutral-100">
      <td className="px-4 py-2 font-mono text-xs">
        <span className="text-neutral-400 mr-1.5">{e.method}</span>
        {e.path}
      </td>
      <td className="px-4 py-2 text-right tabular-nums">{fmtNum(e.count)}</td>
      <td className="px-4 py-2 text-right tabular-nums text-neutral-500">{fmtMs(e.p50)}</td>
      <td className="px-4 py-2 text-right tabular-nums">{fmtMs(e.p95)}</td>
      <td className={`px-4 py-2 text-right tabular-nums font-semibold ${successClass(e.success)}`}>{fmtPct(e.success, 2)}</td>
      <td className="px-4 py-2">
        <div className="flex h-2.5 rounded overflow-hidden gap-px bg-neutral-100" title={MIX.map((m) => `${m.label} ${e.mix[m.k]}%`).join(' · ')}>
          {MIX.map((m) =>
            e.mix[m.k] > 0 ? <div key={m.k} style={{ width: `${e.mix[m.k]}%`, minWidth: 2, background: m.c }} /> : null,
          )}
        </div>
      </td>
    </tr>
  );
}

/** Garis p95 app & server + batang pengguna aktif (skala terpisah, batang tanpa sumbu). */
function LatencyChart({ data }: { data: ApiHourly[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 800;
  const H = 220;
  const pl = 52;
  const pr = 12;
  const pt = 12;
  const pb = 26;
  const iw = W - pl - pr;
  const ih = H - pt - pb;
  const maxMs = Math.max(500, ...data.map((d) => Math.max(d.p95App, d.p95Server)));
  const maxAct = Math.max(1, ...data.map((d) => d.active));
  const x = (i: number) => pl + (i + 0.5) * (iw / data.length);
  const y = (v: number) => pt + ih - (v / maxMs) * ih;
  const path = (key: 'p95App' | 'p95Server') => data.map((d, i) => `${i ? 'L' : 'M'}${x(i)} ${y(d[key])}`).join(' ');
  const ticks = [0, maxMs / 2, maxMs];
  const h = hover != null ? data[hover] : null;
  return (
    <div>
      <div className="flex flex-wrap gap-4 text-xs text-neutral-600 mb-2">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-4 border-t-2 border-blue-600" /> Di app
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-4 border-t-2 border-dashed border-orange-500" /> Server
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-neutral-200" /> Pengguna aktif
        </span>
        {h ? (
          <span className="ml-auto text-neutral-900 tabular-nums">
            {h.hour} · app {fmtMs(h.p95App)} · server {fmtMs(h.p95Server)} · {fmtNum(h.active)} aktif
          </span>
        ) : null}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pl} x2={W - pr} y1={y(t)} y2={y(t)} stroke="#e5e5e5" />
            <text x={pl - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#a3a3a3">
              {fmtMs(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const bw = (iw / data.length) * 0.6;
          const bh = (d.active / maxAct) * ih * 0.9;
          return (
            <g key={d.hour} onMouseEnter={() => setHover(i)}>
              <rect x={x(i) - (iw / data.length) / 2} y={pt} width={iw / data.length} height={ih} fill="transparent" />
              <rect x={x(i) - bw / 2} y={pt + ih - bh} width={bw} height={bh} rx={3} fill={hover === i ? '#d4d4d4' : '#ececec'} />
              {i % 3 === 0 ? (
                <text x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="#a3a3a3">
                  {d.hour.slice(0, 2)}
                </text>
              ) : null}
            </g>
          );
        })}
        <path d={path('p95App')} fill="none" stroke="#2563eb" strokeWidth={2} strokeLinejoin="round" pointerEvents="none" />
        <path d={path('p95Server')} fill="none" stroke="#f97316" strokeWidth={2} strokeDasharray="6 4" pointerEvents="none" />
        {h && hover != null ? <line x1={x(hover)} x2={x(hover)} y1={pt} y2={pt + ih} stroke="#a3a3a3" strokeDasharray="2 3" pointerEvents="none" /> : null}
      </svg>
    </div>
  );
}
