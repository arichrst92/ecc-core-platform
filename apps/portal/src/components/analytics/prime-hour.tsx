'use client';

/**
 * Jam ramai (prime hour) 24 jam — Portal Analitik → tab Halaman.
 * Batang = halaman dibuka per jam (WIB), garis = rata-rata pengguna aktif per jam,
 * jam puncak disorot; ringkasan jam tersibuk / jendela 3 jam / tersepi / bagian hari;
 * peta panas hari × jam.
 */
import { useState } from 'react';
import { Clock, Flame, Moon, Sun, Sunrise, Sunset, CloudSun, TrendingUp } from 'lucide-react';
import { usePageHours } from '@/lib/analytics/use-analytics';
import type { AnalyticsFilter } from '@/lib/analytics/types';
import { pageLabel } from '@/lib/analytics/labels';
import { Card, Loading, fmtNum } from './ui';

const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const HARI_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Senin … Minggu
const jamLabel = (h: number) => `${String(h).padStart(2, '0')}.00`;
const rentang = (a: number, b: number) => `${jamLabel(a)}–${jamLabel(b % 24)}`;
const BAGIAN_ICON = { dini: Moon, pagi: Sunrise, siang: Sun, sore: CloudSun, malam: Sunset } as const;

export function PrimeHourCard({ filter, route }: { filter: AnalyticsFilter; route?: string | null }) {
  const q = usePageHours(filter, route);
  const [hover, setHover] = useState<number | null>(null);
  const d = q.data;
  const title = route ? `Jam ramai — ${pageLabel(route)}` : 'Jam ramai (prime hour)';
  const sub = 'Halaman dibuka per jam (WIB) di periode ini · garis = rata-rata pengguna aktif per jam';
  if (q.isPending) {
    return (
      <Card title={title} sub={sub}>
        <Loading />
      </Card>
    );
  }
  if (!d || d.total === 0) {
    return (
      <Card title={title} sub={sub}>
        <p className="text-sm text-neutral-500 py-6 text-center">
          Belum ada data per jam di periode ini.
          {d?.sejak
            ? ` Data jam mulai dikumpulkan ${new Date(d.sejak).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}.`
            : ' Data jam mulai dikumpulkan setelah pembaruan ini — berlaku untuk semua versi Els App.'}
        </p>
      </Card>
    );
  }

  const maxO = Math.max(1, ...d.jam.map((x) => x.opens));
  const maxU = Math.max(1, ...d.jam.map((x) => x.avgUsers));
  const W = 760;
  const H = 210;
  const padL = 34;
  const padR = 34;
  const padT = 14;
  const padB = 24;
  const iw = W - padL - padR;
  const ih = H - padT - padB;
  const bw = iw / 24;
  const x = (h: number) => padL + h * bw;
  const yU = (v: number) => padT + ih - (v / maxU) * ih;
  const peak = d.puncak?.jam ?? -1;
  const top = new Set(d.top3.map((t) => t.jam));
  const cur = hover != null ? d.jam[hover] : null;

  const heatMax = Math.max(1, ...d.heat.flat());
  const sejak = d.sejak ? new Date(d.sejak).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : null;

  return (
    <Card title={title} sub={sub}>
      {/* Sorotan */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-3">
        <Insight Icon={Flame} color="#EA580C" label="Jam tersibuk" value={d.puncak ? rentang(d.puncak.jam, d.puncak.jam + 1) : '—'} sub={d.puncak ? `${d.puncak.persen}% dari semua kunjungan` : ''} />
        <Insight
          Icon={TrendingUp}
          color="#7C3AED"
          label="Jendela 3 jam teramai"
          value={d.jendela3 ? rentang(d.jendela3.dari, d.jendela3.sampai) : '—'}
          sub={d.jendela3 ? `${d.jendela3.persen}% kunjungan terjadi di sini` : ''}
        />
        <Insight
          Icon={Clock}
          color="#0EA5E9"
          label="Hari teramai"
          value={d.hariTeramai != null ? HARI[d.hariTeramai]! : '—'}
          sub={d.top3.length > 1 ? `Top jam: ${d.top3.map((t) => jamLabel(t.jam)).join(', ')}` : ''}
        />
        <Insight
          Icon={Moon}
          color="#64748B"
          label="Paling sepi (05–24)"
          value={d.tersepi ? rentang(d.tersepi.jam, d.tersepi.jam + 1) : '—'}
          sub={d.tersepi ? `${fmtNum(d.tersepi.opens)} kunjungan` : ''}
        />
      </div>

      {/* Grafik 24 jam */}
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto select-none" onMouseLeave={() => setHover(null)}>
          {/* Latar bagian hari */}
          {d.bagian.map((b, i) => (
            <rect key={b.key} x={x(b.dari)} y={padT} width={(b.sampai - b.dari) * bw} height={ih} fill={i % 2 ? '#FAFAFA' : '#FFFFFF'} />
          ))}
          {[0, 0.5, 1].map((f) => (
            <g key={f}>
              <line x1={padL} x2={W - padR} y1={padT + ih - ih * f} y2={padT + ih - ih * f} stroke="#F1F1F1" />
              <text x={padL - 4} y={padT + ih - ih * f + 3} textAnchor="end" fontSize={9} fill="#9CA3AF">
                {fmtNum(maxO * f)}
              </text>
              <text x={W - padR + 4} y={padT + ih - ih * f + 3} fontSize={9} fill="#2563EB">
                {Math.round(maxU * f * 10) / 10}
              </text>
            </g>
          ))}
          {d.jam.map((j) => {
            const h = (j.opens / maxO) * ih;
            const isPeak = j.jam === peak;
            return (
              <g key={j.jam} onMouseEnter={() => setHover(j.jam)}>
                <rect x={x(j.jam)} y={padT} width={bw} height={ih} fill={hover === j.jam ? '#0000000A' : 'transparent'} />
                <rect
                  x={x(j.jam) + 2}
                  y={padT + ih - h}
                  width={Math.max(1, bw - 4)}
                  height={h}
                  rx={3}
                  fill={isPeak ? 'url(#ph-peak)' : top.has(j.jam) ? 'url(#ph-top)' : 'url(#ph-bar)'}
                />
                {isPeak && j.opens > 0 ? (
                  <text x={x(j.jam) + bw / 2} y={padT + ih - h - 4} textAnchor="middle" fontSize={9} fontWeight={700} fill="#C2410C">
                    puncak
                  </text>
                ) : null}
              </g>
            );
          })}
          <defs>
            <linearGradient id="ph-peak" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#F97316" />
              <stop offset="1" stopColor="#C2410C" />
            </linearGradient>
            <linearGradient id="ph-top" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#FDBA74" />
              <stop offset="1" stopColor="#F97316" />
            </linearGradient>
            <linearGradient id="ph-bar" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#FED7AA" />
              <stop offset="1" stopColor="#FDBA74" />
            </linearGradient>
          </defs>
          <path
            d={d.jam.map((j, i) => `${i ? 'L' : 'M'} ${x(j.jam) + bw / 2} ${yU(j.avgUsers)}`).join(' ')}
            fill="none"
            stroke="#2563EB"
            strokeWidth={2}
            strokeLinejoin="round"
            pointerEvents="none"
          />
          {d.jam.map((j) =>
            j.jam % 3 === 0 ? (
              <text key={`t${j.jam}`} x={x(j.jam) + bw / 2} y={H - 8} textAnchor="middle" fontSize={9} fill="#9CA3AF">
                {jamLabel(j.jam)}
              </text>
            ) : null,
          )}
        </svg>
        {cur ? (
          <div
            className="absolute top-1 z-10 pointer-events-none bg-neutral-900/95 text-white text-[11px] rounded-lg px-2.5 py-2 shadow-lg min-w-[160px]"
            style={cur.jam > 14 ? { right: `${100 - ((cur.jam + 0.5) / 24) * 100 + 2}%` } : { left: `${((cur.jam + 0.5) / 24) * 100 + 2}%` }}
          >
            <div className="font-semibold mb-1">{rentang(cur.jam, cur.jam + 1)} WIB</div>
            <div className="flex justify-between gap-3">
              <span>Halaman dibuka</span>
              <b className="tabular-nums">{fmtNum(cur.opens)}</b>
            </div>
            <div className="flex justify-between gap-3">
              <span>Rata-rata pengguna aktif</span>
              <b className="tabular-nums">{cur.avgUsers}</b>
            </div>
            <div className="flex justify-between gap-3 text-white/70">
              <span>Porsi</span>
              <span className="tabular-nums">{d.total ? Math.round((cur.opens / d.total) * 100) : 0}%</span>
            </div>
          </div>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-[11px] text-neutral-600">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-gradient-to-b from-brand-500 to-brand-700" /> Jam puncak
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-gradient-to-b from-brand-300 to-brand-500" /> 3 jam teratas
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-brand-200" /> Halaman dibuka
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-4 h-0.5 rounded bg-blue-600" /> Rata-rata pengguna aktif (skala kanan)
        </span>
      </div>

      {/* Bagian hari */}
      <div className="grid grid-cols-5 gap-2 mt-4">
        {d.bagian.map((b) => {
          const Icon = BAGIAN_ICON[b.key as keyof typeof BAGIAN_ICON] ?? Clock;
          return (
            <div key={b.key} className="rounded-lg border border-neutral-200 px-2.5 py-2 min-w-0">
              <div className="flex items-center gap-1.5 text-[11px] text-neutral-500">
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">
                  {b.label} <span className="text-neutral-400">{rentang(b.dari, b.sampai)}</span>
                </span>
              </div>
              <div className="text-base font-bold text-neutral-900 tabular-nums">{b.persen}%</div>
              <div className="h-1.5 bg-neutral-100 rounded-full overflow-hidden mt-1">
                <div className="h-full bg-brand-500 rounded-full" style={{ width: `${b.persen}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Peta panas hari × jam */}
      <div className="mt-4">
        <div className="text-xs font-semibold text-neutral-700 mb-1.5">Hari × jam</div>
        <div className="overflow-x-auto">
          <table className="border-separate" style={{ borderSpacing: 2 }}>
            <thead>
              <tr>
                <th />
                {Array.from({ length: 24 }, (_, h) => (
                  <th key={h} className="text-[9px] font-normal text-neutral-400 w-5">
                    {h % 3 === 0 ? String(h).padStart(2, '0') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {HARI_ORDER.map((dw) => (
                <tr key={dw}>
                  <td className="text-[10px] text-neutral-500 pr-1.5 whitespace-nowrap">{HARI[dw]!.slice(0, 3)}</td>
                  {d.heat[dw]!.map((v, h) => {
                    const a = v / heatMax;
                    return (
                      <td
                        key={h}
                        title={`${HARI[dw]} ${rentang(h, h + 1)} — ${fmtNum(v)} kunjungan`}
                        className="w-5 h-4 rounded-[3px]"
                        style={{ background: v ? `rgba(234, 88, 12, ${0.12 + a * 0.88})` : '#F5F5F5' }}
                      />
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-[11px] text-neutral-400 mt-2">
        Jam dalam WIB · {fmtNum(d.total)} kunjungan dari {d.hariData} hari{sejak ? ` · data per jam tersedia sejak ${sejak}` : ''}. Gunakan jam
        ramai untuk menjadwalkan pengumuman / notifikasi, jam sepi untuk pemeliharaan.
      </p>
    </Card>
  );
}

function Insight({ Icon, color, label, value, sub }: { Icon: typeof Clock; color: string; label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 px-3 py-2.5 min-w-0">
      <div className="flex items-center gap-1.5 text-[11px] text-neutral-500">
        <span className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 text-white" style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)` }}>
          <Icon className="w-3.5 h-3.5" />
        </span>
        <span className="truncate">{label}</span>
      </div>
      <div className="text-lg font-bold text-neutral-900 mt-1 tabular-nums">{value}</div>
      {sub ? <div className="text-[10.5px] text-neutral-500 truncate" title={sub}>{sub}</div> : null}
    </div>
  );
}
