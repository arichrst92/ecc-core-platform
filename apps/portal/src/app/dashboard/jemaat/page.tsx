'use client';

import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Upload, Filter, X, FileSpreadsheet, FileText, Copy } from 'lucide-react';
import { CrudPage } from '@/components/crud/crud-page';
import { buildJemaatResource } from '@/lib/resources/jemaat-config';
import { RelasiModal } from '@/components/jemaat/relasi-modal';
import {
  JemaatFilterBar,
  defaultJemaatFilter,
  toJemaatQueryParams,
  type JemaatFilterState,
} from '@/components/jemaat/filter-bar';
import { apiClient } from '@/lib/api-client';

function JemaatPageInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const cabangId = sp.get('cabangId') ?? undefined;
  const sinodeId = sp.get('sinodeId') ?? undefined;

  const [relasiTarget, setRelasiTarget] = useState<{ id: string; namaLengkap: string } | null>(null);
  const [filter, setFilter] = useState<JemaatFilterState>(defaultJemaatFilter);
  const config = useMemo(() => buildJemaatResource(setRelasiTarget), []);

  const cabangQ = useQuery({
    queryKey: ['cabang', 'detail', cabangId],
    enabled: !!cabangId,
    queryFn: async () => {
      const res = await apiClient.get<{ data: { nama: string } }>(`/admin/cabang/${cabangId}`);
      return res.data.data;
    },
  });
  const sinodeQ = useQuery({
    queryKey: ['sinode', 'detail', sinodeId],
    enabled: !!sinodeId,
    queryFn: async () => {
      const res = await apiClient.get<{ data: { nama: string } }>(`/admin/sinode/${sinodeId}`);
      return res.data.data;
    },
  });

  const banner =
    cabangId || sinodeId ? (
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-brand-50 border border-brand-200 rounded-lg text-sm">
        <div className="flex items-center gap-2 text-brand-800">
          <Filter className="w-4 h-4" />
          Filter:{' '}
          {cabangId && (
            <>
              cabang <strong>{cabangQ.data?.nama ?? '...'}</strong>
            </>
          )}
          {sinodeId && (
            <>
              sinode <strong>{sinodeQ.data?.nama ?? '...'}</strong>
            </>
          )}
        </div>
        <button
          onClick={() => router.push('/dashboard/jemaat')}
          className="flex items-center gap-1 text-xs text-brand-700 hover:text-brand-900 px-2 py-1 hover:bg-brand-100 rounded"
        >
          <X className="w-3 h-3" />
          Reset
        </button>
      </div>
    ) : null;

  // Gabungkan param URL (cabang/sinode) + state filter user → param ke API.
  // CrudPage menerima extraParams; nilai di sini akan override `sortBy/sortOrder`
  // default dari config (lihat CrudPage: `...cleanExtra` di-spread terakhir).
  const extraParams = {
    cabangId,
    sinodeId,
    ...toJemaatQueryParams(filter),
  };

  // Export — forward semua filter aktif ke endpoint export.
  const exportQS = new URLSearchParams();
  Object.entries(extraParams).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') exportQS.set(k, String(v));
  });

  async function handleExport(format: 'csv' | 'pdf') {
    const qs = new URLSearchParams(exportQS);
    qs.set('format', format);

    // iOS Safari / mobile browser blokir popup kalau window.open dipanggil
    // setelah await (user-gesture lost). Buka tab dulu di sync context,
    // lalu set URL-nya setelah fetch selesai.
    let printWin: Window | null = null;
    if (format === 'pdf') {
      printWin = window.open('', '_blank');
    }

    try {
      const res = await apiClient.get(`/admin/jemaat/export?${qs.toString()}`, {
        responseType: 'blob',
      });
      const blob = res.data as Blob;
      const url = URL.createObjectURL(blob);

      if (format === 'pdf') {
        if (printWin) {
          // Tab sudah dibuka — navigate ke blob URL
          printWin.location.href = url;
        } else {
          // Popup blocked → fallback: same-tab navigation (user press back untuk kembali)
          window.location.href = url;
        }
      } else {
        const a = document.createElement('a');
        a.href = url;
        a.download = `jemaat-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
      setTimeout(() => URL.revokeObjectURL(url), 20_000);
    } catch (e) {
      if (printWin) printWin.close();
      // eslint-disable-next-line no-console
      console.error('[jemaat export] failed', e);
      alert('Gagal export. Cek console untuk detail.');
    }
  }

  return (
    <div>
      <div className="flex flex-wrap justify-stretch sm:justify-end mb-3 -mt-2 gap-2">
        <button
          onClick={() => handleExport('csv')}
          className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50 rounded-lg border border-emerald-200"
          title="Download CSV (compatible dengan Excel)"
        >
          <FileSpreadsheet className="w-4 h-4" />
          Export Excel
        </button>
        <button
          onClick={() => handleExport('pdf')}
          className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-50 rounded-lg border border-rose-200"
          title="Buka print view, Ctrl+P untuk save sebagai PDF"
        >
          <FileText className="w-4 h-4" />
          Export PDF
        </button>
        <Link
          href="/dashboard/jemaat/duplicates"
          className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-50 rounded-lg border border-amber-200"
          title="Scan duplikat berdasarkan No HP, Email, Nama+Tanggal Lahir"
        >
          <Copy className="w-4 h-4" />
          Cek Duplikat
        </Link>
        <Link
          href="/dashboard/jemaat/import"
          className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 py-1.5 text-sm font-medium text-brand-600 hover:bg-brand-50 rounded-lg border border-brand-200"
        >
          <Upload className="w-4 h-4" />
          Import CSV
        </Link>
      </div>

      <JemaatFilterBar value={filter} onChange={setFilter} />

      <CrudPage config={config} extraParams={extraParams} filterBanner={banner} />

      {relasiTarget && (
        <RelasiModal
          jemaatId={relasiTarget.id}
          jemaatNama={relasiTarget.namaLengkap}
          onClose={() => setRelasiTarget(null)}
        />
      )}
    </div>
  );
}

export default function JemaatPage() {
  return (
    <Suspense fallback={null}>
      <JemaatPageInner />
    </Suspense>
  );
}
