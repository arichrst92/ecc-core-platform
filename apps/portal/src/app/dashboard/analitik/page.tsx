'use client';

/**
 * Analitik — penggunaan Els App (iOS, Android, web) & performa API.
 *   Tab Halaman        : halaman paling sering dibuka, durasi, retensi per halaman.
 *   Tab Aktif sekarang : pengguna yang sedang membuka app & halamannya (langsung).
 *   Tab Performa API   : latency (server & app) dan success rate.
 *   Export PDF         : laporan ringkas untuk pimpinan / non-IT (sesuai filter).
 *
 * Data: core-api /admin/analytics. Kunjungan halaman
 * & latency sisi app berasal dari Els App ≥ 2.4.4 dan Els App web.
 */
import { useState } from 'react';
import { Activity, BarChart3, FileText, Gauge, Loader2, Radio } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { PagesTab } from '@/components/analytics/pages-tab';
import { LiveTab } from '@/components/analytics/live-tab';
import { ApiTab } from '@/components/analytics/api-tab';
import type { AnalyticsFilter, ModeFilter, Periode, PlatformFilter } from '@/lib/analytics/types';

type Tab = 'halaman' | 'live' | 'api';

const TABS: { k: Tab; label: string; icon: typeof Activity }[] = [
  { k: 'halaman', label: 'Halaman', icon: BarChart3 },
  { k: 'live', label: 'Aktif sekarang', icon: Radio },
  { k: 'api', label: 'Performa API', icon: Gauge },
];

const PERIODE: { v: Periode; l: string }[] = [
  { v: '7d', l: '7 hari' },
  { v: '30d', l: '30 hari' },
  { v: '90d', l: '90 hari' },
];
const PLATFORM: { v: PlatformFilter; l: string }[] = [
  { v: 'all', l: 'Semua platform' },
  { v: 'ios', l: 'iOS' },
  { v: 'android', l: 'Android' },
  { v: 'web', l: 'Web' },
];
const MODE: { v: ModeFilter; l: string }[] = [
  { v: 'all', l: 'Login & tamu' },
  { v: 'login', l: 'Login' },
  { v: 'tamu', l: 'Mode tamu' },
];

export default function AnalitikPage() {
  const [tab, setTab] = useState<Tab>('halaman');
  const [filter, setFilter] = useState<AnalyticsFilter>({ periode: '30d', platform: 'all', mode: 'all' });
  const set = <K extends keyof AnalyticsFilter>(k: K, v: AnalyticsFilter[K]) => setFilter((f) => ({ ...f, [k]: v }));
  const [exporting, setExporting] = useState(false);

  async function exportPdf() {
    // Buka tab dulu (sinkron) supaya tidak diblok popup blocker, lalu isi laporan.
    const win = window.open('', '_blank');
    setExporting(true);
    try {
      const res = await apiClient.get('/admin/analytics/export', {
        params: { periode: filter.periode, platform: filter.platform, mode: filter.mode },
        responseType: 'blob',
        timeout: 120_000,
      });
      const url = URL.createObjectURL(res.data as Blob);
      if (win) win.location.href = url;
      else window.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (e) {
      if (win) win.close();
      // eslint-disable-next-line no-console
      console.error('[analitik export] gagal', e);
      alert('Gagal membuat laporan. Coba lagi.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center">
            <Activity className="w-5 h-5 text-brand-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-neutral-900">Analitik</h1>
            <p className="text-sm text-neutral-500">Penggunaan Els App (iOS, Android, web) dan performa API. Anonim — tanpa data jemaat.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {tab !== 'live' ? (
            <>
              <Seg options={PERIODE} value={filter.periode} onChange={(v) => set('periode', v)} />
              <Select options={PLATFORM} value={filter.platform} onChange={(v) => set('platform', v)} />
              {tab === 'halaman' ? <Select options={MODE} value={filter.mode} onChange={(v) => set('mode', v)} /> : null}
            </>
          ) : null}
          <button
            onClick={exportPdf}
            disabled={exporting}
            title="Laporan ringkas sesuai filter periode & platform. Ctrl/Cmd+P untuk simpan PDF."
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-rose-200 bg-white text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-60"
          >
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            Export PDF
          </button>
        </div>
      </div>


      <div className="flex gap-1 border-b border-neutral-200 overflow-x-auto">
        {TABS.map(({ k, label, icon: Icon }) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px ${
              tab === k ? 'border-brand-500 text-brand-700 font-semibold' : 'border-transparent text-neutral-500 hover:text-neutral-800'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'halaman' ? (
        <PagesTab filter={filter} />
      ) : tab === 'live' ? (
        <LiveTab />
      ) : (
        <ApiTab filter={filter} />
      )}
    </div>
  );
}

function Seg<T extends string>({ options, value, onChange }: { options: { v: T; l: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-neutral-200 bg-white p-0.5">
      {options.map((o) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          className={`px-3 h-8 text-sm rounded-md ${value === o.v ? 'bg-brand-500 text-white font-medium' : 'text-neutral-600 hover:bg-neutral-50'}`}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}

function Select<T extends string>({ options, value, onChange }: { options: { v: T; l: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as T)} className="h-9 rounded-lg border border-neutral-200 bg-white px-3 text-sm">
      {options.map((o) => (
        <option key={o.v} value={o.v}>
          {o.l}
        </option>
      ))}
    </select>
  );
}
