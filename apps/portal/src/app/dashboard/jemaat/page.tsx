'use client';

import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Upload, Filter, X } from 'lucide-react';
import { CrudPage } from '@/components/crud/crud-page';
import { buildJemaatResource } from '@/lib/resources/jemaat-config';
import { RelasiModal } from '@/components/jemaat/relasi-modal';
import { apiClient } from '@/lib/api-client';

function JemaatPageInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const cabangId = sp.get('cabangId') ?? undefined;
  const sinodeId = sp.get('sinodeId') ?? undefined;

  const [relasiTarget, setRelasiTarget] = useState<{ id: string; namaLengkap: string } | null>(null);
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

  return (
    <div>
      <div className="flex justify-end mb-3 -mt-2">
        <Link
          href="/dashboard/jemaat/import"
          className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-brand-600 hover:bg-brand-50 rounded-lg border border-brand-200"
        >
          <Upload className="w-4 h-4" />
          Import CSV
        </Link>
      </div>
      <CrudPage config={config} extraParams={{ cabangId, sinodeId }} filterBanner={banner} />

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
