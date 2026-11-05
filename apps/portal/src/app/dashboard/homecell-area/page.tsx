'use client';

/**
 * Zona — daftar zona + statistik (anggota, usia rata-rata, kehadiran)
 * dengan filter cabang, pastor & periode, dan Export PDF / CSV laporan.
 */
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { FileSpreadsheet, FileText } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { CrudPage } from '@/components/crud/crud-page';
import { homecellAreaResource, AREA_TIER_LEGEND } from '@/lib/resources/homecell-area-config';
import { apiClient } from '@/lib/api-client';
import { usePersistentState } from '@/lib/use-persistent-state';
import { useCabangOptions } from '@/components/report/report-ui';
import { PERIODE_OPTIONS, type PeriodePreset } from '@/components/homecell/homecell-filter-bar';

const selectCls =
  'w-full px-2 py-1.5 border border-neutral-300 rounded text-sm bg-white outline-none focus:ring-2 focus:ring-brand-500';

function HomecellAreaInner() {
  const sp = useSearchParams();
  const cabangQ = useCabangOptions();
  // Filter disimpan per tab → tetap terisi saat kembali dari detail zona.
  const [cabangId, setCabangId] = usePersistentState('zona:cabangId', sp.get('cabangId') ?? '', { skipRestore: sp.has('cabangId') });
  const [periode, setPeriode] = usePersistentState<PeriodePreset>('zona:periode', 'last_30d');
  const [from, setFrom] = usePersistentState('zona:from', '');
  const [to, setTo] = usePersistentState('zona:to', '');
  const [pastorId, setPastorId] = usePersistentState('zona:pastorId', '');
  const pastorQ = useQuery({
    queryKey: ['homecell-area', 'pastors', cabangId],
    queryFn: async () =>
      (
        await apiClient.get<{ data: { id: string; namaLengkap: string; zonaCount: number }[] }>('/admin/homecell-area/pastors', {
          params: { cabangId: cabangId || undefined },
        })
      ).data.data,
    staleTime: 60_000,
  });
  const custom = periode === 'custom';
  const extraParams: Record<string, string | undefined> = {
    cabangId: cabangId || undefined,
    pastorId: pastorId || undefined,
    periode: custom && !from && !to ? undefined : periode || undefined,
    from: custom ? from || undefined : undefined,
    to: custom ? to || undefined : undefined,
  };

  /** Kata kunci pencarian di tabel (disimpan CrudPage) ikut ke export. */
  function searchTerm(): string | undefined {
    try {
      const raw = window.sessionStorage.getItem('ecc.listState:crud:/dashboard/homecell-area:homecell-area:search');
      const v = raw ? (JSON.parse(raw) as string) : '';
      return v.trim() || undefined;
    } catch {
      return undefined;
    }
  }

  async function exportCsv() {
    const qs = new URLSearchParams({ format: 'csv' });
    Object.entries({ ...extraParams, search: searchTerm() }).forEach(([k, v]) => v && qs.set(k, v));
    try {
      const res = await apiClient.get(`/admin/homecell-area/export?${qs.toString()}`, { responseType: 'blob', timeout: 120_000 });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `laporan-zona-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 20_000);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[homecell-area export csv] failed', e);
      alert('Gagal export CSV. Cek console untuk detail.');
    }
  }

  async function exportPdf() {
    const qs = new URLSearchParams({ format: 'pdf' });
    Object.entries({ ...extraParams, search: searchTerm() }).forEach(([k, v]) => v && qs.set(k, v));
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
          title="Laporan Zona (sesuai filter). Ctrl/Cmd+P untuk simpan PDF."
        >
          <FileText className="w-4 h-4" />
          Export PDF
        </button>
        <button
          onClick={exportCsv}
          className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50 rounded-lg border border-emerald-200"
          title="Data zona sesuai filter (CSV untuk Excel)."
        >
          <FileSpreadsheet className="w-4 h-4" />
          Export CSV
        </button>
      </div>
      <div className="bg-white border border-neutral-200 rounded-xl p-3 mb-3">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
          <label className="block">
            <span className="block text-[11px] text-neutral-500 font-medium mb-0.5">Cabang gereja</span>
            <select
              value={cabangId}
              onChange={(e) => {
                setCabangId(e.target.value);
                setPastorId('');
              }}
              className={selectCls}
            >
              <option value="">Semua cabang</option>
              {(cabangQ.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nama}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-[11px] text-neutral-500 font-medium mb-0.5">Pastor</span>
            <select value={pastorId} onChange={(e) => setPastorId(e.target.value)} className={selectCls}>
              <option value="">Semua pastor</option>
              {(pastorQ.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.namaLengkap} ({p.zonaCount})
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
