'use client';

/** Tab "Halaman": halaman paling sering dibuka, durasi, dan retensi per halaman. */
import { useMemo, useState } from 'react';
import { ArrowDown, Clock, Eye, RotateCcw, Users } from 'lucide-react';
import { LineChart } from '@/components/charts/simple-charts';
import { usePageDetail, usePageSummary, usePages } from '@/lib/analytics/use-analytics';
import type { AnalyticsFilter, PageRow } from '@/lib/analytics/types';
import { pageLabel } from '@/lib/analytics/labels';
import { Card, Kpi, Loading, PlatformBar, fmtDur, fmtNum, pctOrDash, retentionClass } from './ui';

type SortKey = 'route' | 'views' | 'visitors' | 'avgDurationSec' | 'return7' | 'return30' | 'activeNow';

const COLS: { k: SortKey; label: string; title?: string }[] = [
  { k: 'views', label: 'Dibuka' },
  { k: 'visitors', label: 'Pengunjung', title: 'Perangkat unik (ID anonim)' },
  { k: 'avgDurationSec', label: 'Durasi', title: 'Rata-rata lama di halaman' },
  { k: 'return7', label: 'Kembali 7h', title: '% pengunjung yang membuka halaman ini lagi dalam 7 hari' },
  { k: 'return30', label: 'Kembali 30h', title: '% pengunjung yang membuka halaman ini lagi dalam 30 hari' },
  { k: 'activeNow', label: 'Aktif', title: 'Sedang membuka halaman ini sekarang' },
];

export function PagesTab({ filter }: { filter: AnalyticsFilter }) {
  const summary = usePageSummary(filter);
  const pages = usePages(filter);
  const [sort, setSort] = useState<SortKey>('views');
  const [selected, setSelected] = useState<string | null>(null);

  const rows = useMemo(() => {
    const r = [...(pages.data ?? [])];
    r.sort((a, b) =>
      sort === 'route' ? pageLabel(a.route).localeCompare(pageLabel(b.route)) : ((b[sort] as number | null) ?? -1) - ((a[sort] as number | null) ?? -1),
    );
    return r;
  }, [pages.data, sort]);
  const route = selected ?? rows[0]?.route ?? null;
  const sel = rows.find((r) => r.route === route) ?? null;

  const s = summary.data;
  return (
    <div className="space-y-4">
      {!s ? (
        <Loading />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi
              icon={Users}
              color="#2563eb"
              label="Pengunjung aktif"
              value={fmtNum(s.activeUsers)}
              sub={
                s.activeUsersDeltaPct == null ? (
                  'perangkat unik di periode'
                ) : (
                  <span className={s.activeUsersDeltaPct >= 0 ? 'text-green-700' : 'text-red-600'}>
                    {s.activeUsersDeltaPct >= 0 ? '+' : ''}
                    {s.activeUsersDeltaPct}% vs periode lalu
                  </span>
                )
              }
            />
            <Kpi icon={Eye} color="#f97316" label="Halaman dibuka" value={fmtNum(s.views)} sub={`rata-rata ${Math.round(s.views / Math.max(1, s.activeUsers))} per orang`} />
            <Kpi icon={RotateCcw} color="#16a34a" label="Kembali dalam 7 hari" value={pctOrDash(s.return7, 0)} valueClass={retentionClass(s.return7)} sub={s.return7 == null ? 'butuh data ≥ 7 hari' : 'seluruh app'} />
            <Kpi icon={Clock} color="#8b5cf6" label="Rata-rata waktu per hari" value={fmtDur(s.avgSessionSec)} sub={`login ${fmtDur(s.avgSessionLoginSec)} · tamu ${fmtDur(s.avgSessionTamuSec)}`} />
          </div>
          <div className="bg-white border border-neutral-200 rounded-xl p-4">
            <div className="text-xs text-neutral-500 mb-2">Platform</div>
            <PlatformBar {...s.platform} />
          </div>
        </>
      )}

      <Card title="Halaman" sub="Klik judul kolom untuk mengurutkan · klik baris untuk melihat detail">
        {pages.isPending ? (
          <Loading />
        ) : rows.length === 0 ? (
          <p className="text-sm text-neutral-500 py-8 text-center">
            Belum ada data kunjungan. Data mulai masuk setelah jemaat memakai Els App versi 2.4.4 atau Els App web terbaru.
          </p>
        ) : (
          <div className="overflow-x-auto -mx-4">
            <table className="w-full text-sm min-w-[720px]">
              <thead className="text-xs text-neutral-500 bg-neutral-50">
                <tr>
                  <Th active={sort === 'route'} onClick={() => setSort('route')} left>
                    Halaman
                  </Th>
                  {COLS.map((c) => (
                    <Th key={c.k} active={sort === c.k} onClick={() => setSort(c.k)} title={c.title}>
                      {c.label}
                    </Th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <PageTr key={r.route} r={r} active={r.route === route} onClick={() => setSelected(r.route)} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[11px] text-neutral-400 mt-2">
          Retensi: <span className="text-green-700">hijau ≥ 50%</span> · <span className="text-amber-700">kuning 30–49%</span> ·{' '}
          <span className="text-red-600">merah &lt; 30%</span> · “—” = belum cukup data (butuh ≥ 7 / 30 hari). Halaman dengan ID (mis. detail
          event) digabung jadi satu baris.
        </p>
      </Card>

      {sel ? <PageDetailCard row={sel} filter={filter} /> : null}
    </div>
  );
}

function Th({
  children,
  active,
  onClick,
  left,
  title,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  left?: boolean;
  title?: string;
}) {
  return (
    <th
      onClick={onClick}
      title={title}
      className={`px-4 py-2 font-medium cursor-pointer select-none whitespace-nowrap ${left ? 'text-left' : 'text-right'} ${active ? 'text-neutral-900' : ''}`}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {active ? <ArrowDown className="w-3 h-3" /> : null}
      </span>
    </th>
  );
}

function PageTr({ r, active, onClick }: { r: PageRow; active: boolean; onClick: () => void }) {
  return (
    <tr onClick={onClick} className={`border-t border-neutral-100 cursor-pointer ${active ? 'bg-brand-50' : 'hover:bg-neutral-50'}`}>
      <td className="px-4 py-2">
        <div className="font-medium text-neutral-900">{pageLabel(r.route)}</div>
        <div className="text-[11px] text-neutral-400 font-mono">{r.route}</div>
      </td>
      <td className="px-4 py-2 text-right tabular-nums">{fmtNum(r.views)}</td>
      <td className="px-4 py-2 text-right tabular-nums">{fmtNum(r.visitors)}</td>
      <td className="px-4 py-2 text-right tabular-nums">{fmtDur(r.avgDurationSec)}</td>
      <td className={`px-4 py-2 text-right tabular-nums font-semibold ${retentionClass(r.return7)}`}>{pctOrDash(r.return7, 0)}</td>
      <td className={`px-4 py-2 text-right tabular-nums font-semibold ${retentionClass(r.return30)}`}>{pctOrDash(r.return30, 0)}</td>
      <td className="px-4 py-2 text-right tabular-nums">
        <span className="inline-flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
          {r.activeNow}
        </span>
      </td>
    </tr>
  );
}

const shortDate = (ymd: string) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', timeZone: 'UTC' });
};

function PageDetailCard({ row, filter }: { row: PageRow; filter: AnalyticsFilter }) {
  const q = usePageDetail(row.route, filter);
  const d = q.data;
  return (
    <Card
      title={pageLabel(row.route)}
      sub={`${row.route} · ${fmtNum(row.visitors)} pengunjung · durasi ${fmtDur(row.avgDurationSec)} · kembali 7 hari ${pctOrDash(row.return7, 0)}`}
    >
      {!d ? (
        <Loading />
      ) : (
        <div className="space-y-5">
          <div>
            <div className="text-xs text-neutral-500 mb-1">Pengunjung per hari</div>
            <LineChart
              xLabels={d.daily.map((x) => shortDate(x.date))}
              series={[{ label: 'Pengunjung', color: '#2563eb', data: d.daily.map((x) => x.visitors) }]}
              height={180}
            />
          </div>
          <div>
            <div className="text-xs text-neutral-500 mb-2">Retensi kohort mingguan — % yang membuka halaman ini lagi</div>
            <div className="overflow-x-auto">
              <table className="text-xs border-separate" style={{ borderSpacing: 3 }}>
                <thead>
                  <tr className="text-neutral-500">
                    <th className="text-left font-medium pr-3">Minggu pertama</th>
                    <th className="text-right font-medium pr-3">Orang</th>
                    {d.cohorts[0]?.pct.map((_, k) => (
                      <th key={k} className="font-medium w-14 text-center">
                        {k === 0 ? 'M0' : `M+${k}`}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {d.cohorts.map((c) => (
                    <tr key={c.week}>
                      <td className="pr-3 text-neutral-700 whitespace-nowrap">{shortDate(c.week)}</td>
                      <td className="pr-3 text-right tabular-nums text-neutral-700">{fmtNum(c.size)}</td>
                      {c.pct.map((v, k) => (
                        <td
                          key={k}
                          className="h-7 w-14 text-center rounded tabular-nums"
                          style={
                            v == null
                              ? undefined
                              : { background: `rgba(37,99,235,${0.08 + (v / 100) * 0.82})`, color: v > 50 ? '#fff' : '#1e3a8a' }
                          }
                        >
                          {v == null ? '' : `${v}%`}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-neutral-400 mt-1.5">
              Baris = minggu pertama membuka halaman ini · kolom = minggu ke-n setelahnya · M0 selalu 100%.
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}
