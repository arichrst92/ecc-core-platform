'use client';

import { Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { X, Filter } from 'lucide-react';
import { CrudPage } from '@/components/crud/crud-page';
import { cabangResource } from '@/lib/resources/cabang-config';
import { apiClient } from '@/lib/api-client';

function CabangPageInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const sinodeId = sp.get('sinodeId') ?? undefined;

  const sinodeQ = useQuery({
    queryKey: ['sinode', 'detail', sinodeId],
    enabled: !!sinodeId,
    queryFn: async () => {
      const res = await apiClient.get<{ data: { nama: string; kode: string } }>(
        `/admin/sinode/${sinodeId}`,
      );
      return res.data.data;
    },
  });

  const banner = sinodeId ? (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-brand-50 border border-brand-200 rounded-lg text-sm">
      <div className="flex items-center gap-2 text-brand-800">
        <Filter className="w-4 h-4" />
        Filter: cabang di sinode <strong>{sinodeQ.data?.nama ?? '...'}</strong>
      </div>
      <button
        onClick={() => router.push('/dashboard/cabang')}
        className="flex items-center gap-1 text-xs text-brand-700 hover:text-brand-900 px-2 py-1 hover:bg-brand-100 rounded"
      >
        <X className="w-3 h-3" />
        Reset
      </button>
    </div>
  ) : null;

  return <CrudPage config={cabangResource} extraParams={{ sinodeId }} filterBanner={banner} />;
}

export default function CabangPage() {
  return (
    <Suspense fallback={null}>
      <CabangPageInner />
    </Suspense>
  );
}
