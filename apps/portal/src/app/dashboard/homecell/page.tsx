'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { FileText } from 'lucide-react';
import { CrudPage } from '@/components/crud/crud-page';
import { homecellResource } from '@/lib/resources/homecell-config';
import { apiClient } from '@/lib/api-client';
import {
  HomecellFilterBar,
  defaultHomecellFilter,
  toHomecellQueryParams,
  type HomecellFilterState,
} from '@/components/homecell/homecell-filter-bar';

function HomecellInner() {
  const sp = useSearchParams();
  // Link dari halaman cabang / area (?cabangId= / ?areaId=) jadi nilai awal filter.
  const [filter, setFilter] = useState<HomecellFilterState>({
    ...defaultHomecellFilter,
    cabangId: sp.get('cabangId') ?? '',
    areaId: sp.get('areaId') ?? '',
  });
  const extraParams = toHomecellQueryParams(filter);

  async function exportPdf() {
    const qs = new URLSearchParams({ format: 'pdf' });
    Object.entries(extraParams).forEach(([k, v]) => {
      if (v) qs.set(k, v);
    });
    // Buka tab dulu (sync) supaya tidak diblok popup blocker, lalu isi URL.
    const win = window.open('', '_blank');
    try {
      const res = await apiClient.get(`/admin/homecell/export?${qs.toString()}`, {
        responseType: 'blob',
        timeout: 120_000,
      });
      const url = URL.createObjectURL(res.data as Blob);
      if (win) win.location.href = url;
      else window.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 20_000);
    } catch (e) {
      if (win) win.close();
      // eslint-disable-next-line no-console
      console.error('[homecell export] failed', e);
      alert('Gagal export. Cek console untuk detail.');
    }
  }

  return (
    <div>
      <div className="flex flex-wrap justify-stretch sm:justify-end mb-3 -mt-2 gap-2">
        <button
          onClick={exportPdf}
          className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-50 rounded-lg border border-rose-200"
          title="Laporan homecell + anggota & kehadiran terakhir (sesuai filter). Ctrl/Cmd+P untuk simpan PDF."
        >
          <FileText className="w-4 h-4" />
          Export PDF
        </button>
      </div>
      <HomecellFilterBar value={filter} onChange={setFilter} />
      <CrudPage config={homecellResource} extraParams={extraParams} />
    </div>
  );
}

export default function HomecellPage() {
  return (
    <Suspense fallback={null}>
      <HomecellInner />
    </Suspense>
  );
}
