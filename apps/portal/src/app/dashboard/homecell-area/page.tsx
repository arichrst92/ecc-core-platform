'use client';

import { Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { X, Filter } from 'lucide-react';
import { CrudPage } from '@/components/crud/crud-page';
import { homecellAreaResource } from '@/lib/resources/homecell-area-config';
import { apiClient } from '@/lib/api-client';

function HomecellAreaInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const cabangId = sp.get('cabangId') ?? undefined;

  const cabangQ = useQuery({
    queryKey: ['cabang', 'detail', cabangId],
    enabled: !!cabangId,
    queryFn: async () => {
      const res = await apiClient.get<{ data: { nama: string; kode: string } }>(
        `/admin/cabang/${cabangId}`,
      );
      return res.data.data;
    },
  });

  const banner = cabangId ? (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-brand-50 border border-brand-200 rounded-lg text-sm">
      <div className="flex items-center gap-2 text-brand-800">
        <Filter className="w-4 h-4" />
        Filter: area di cabang <strong>{cabangQ.data?.nama ?? '...'}</strong>
      </div>
      <button
        onClick={() => router.push('/dashboard/homecell-area')}
        className="flex items-center gap-1 text-xs text-brand-700 hover:text-brand-900 px-2 py-1 hover:bg-brand-100 rounded"
      >
        <X className="w-3 h-3" />
        Reset
      </button>
    </div>
  ) : null;

  return <CrudPage config={homecellAreaResource} extraParams={{ cabangId }} filterBanner={banner} />;
}

export default function HomecellAreaPage() {
  return (
    <Suspense fallback={null}>
      <HomecellAreaInner />
    </Suspense>
  );
}
