'use client';

/**
 * Homecell Area — daftar area + statistik (anggota, usia rata-rata, kehadiran)
 * dengan filter cabang & periode, dan Export PDF laporan.
 */
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { FileText } from 'lucide-react';
import { CrudPage } from '@/components/crud/crud-page';
import { homecellAreaResource, AREA_TIER_LEGEND } from '@/lib/resources/homecell-area-config';
import { apiClient } from '@/lib/api-client';
import { useCabangOptions } from '@/components/report/report-ui';
import { PERIODE_OPTIONS, type PeriodePreset } from '@/components/homecell/homecell-filter-bar';

const selectCls =
  'w-full px-2 py-1.5 border border-neutral-300 rounded text-sm bg-white outline-none focus:ring-2 focus:ring-brand-500';

function HomecellAreaInner() {
  const sp = useSearchParams();
  const cabangQ = useCabangOptions();
  const [cabangId, setCabangId] = useState(sp.get('cabangId') ?? '');
  const [periode, setPeriode] = useState<PeriodePreset>('last_30d');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const custom = periode === 'custom';
  const extraParams: Record<string, string | undefined> = {
    cabangId: cabangId || undefined,
    periode: custom && !from && !to ? undefined : periode || undefined,
    from: custom ? from || undefined : undefined,
    to: custom ? to || undefined : undefined,
  };

  async function exportPdf() {
    const qs = new URLSearchParams({ format: 'pdf' });
    Object.entries(extraParams).forEach(([k, v]) => v && qs.set(k, v));
    // Buka tab dulu (sync) supaya tidak diblok popup blocker, lalu isi URL.
    const win = window.open('', '_blank');
    try {
      const res = await apiClient.get(`/admin/homecell-area/export?${qs.toString()}`, { responseType: 'blob', timeout: 120_000 });
      const url = URL.createObjectURL(res.data as Blob);
      if (win) win.location.href = url;
      else window.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 20_000);
    } catch (e) {
      if (win) win.close();
      // eslint-disable-next-line no-console
      console.error('[homecell-area export] failed', e);
      alert('Gagal export. Cek console untuk detail.');
    }
  }

  return (
    <div>
      <div className="flex flex-wrap justify-stretch sm:justify-end mb-3 -mt-2 gap-2">
        <button
          onClick={exportPdf}
          className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-50 rounded-lg border border-rose-200"
          title="Laporan Homecell Area (sesuai filter). Ctrl/Cmd+P untuk simpan PDF."
        >
          <FileText className="w-4 h-4" />
          Export PDF
        </button>
      </div>
      <div className="bg-white border border-neutral-200 rounded-xl p-3 mb-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
          <label className="block">
            <span className="block text-[11px] text-neutral-500 font-medium mb-0.5">Cabang gereja</span>
            <select value={cabangId} onChange={(e) => setCabangId(e.target.value)} className={selectCls}>
              <option value="">Semua cabang</option>
              {(cabangQ.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nama}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-[11px] text-neutral-500 font-medium mb-0.5">Periode kehadiran</span>
            <select value={periode} onChange={(e) => setPeriode(e.target.value as PeriodePreset)} className={selectCls}>
              {PERIODE_OPTIONS.map((o) => (
                <option key={o.value || 'all'} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          {custom ? (
            <>
              <label className="block">
                <span className="block text-[11px] text-neutral-500 font-medium mb-0.5">Dari</span>
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={selectCls} />
              </label>
              <label className="block">
                <span className="block text-[11px] text-neutral-500 font-medium mb-0.5">Sampai</span>
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={selectCls} />
              </label>
            </>
          ) : null}
        </div>
        {AREA_TIER_LEGEND}
      </div>
      <CrudPage config={homecellAreaResource} extraParams={extraParams} />
    </div>
  );
}

export default function HomecellAreaPage() {
  return (
    <Suspense fallback={null}>
      <HomecellAreaInner />
    </Suspense>
  );
}
