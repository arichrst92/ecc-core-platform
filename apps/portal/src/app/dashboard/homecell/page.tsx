'use client';

import { Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { X, Filter } from 'lucide-react';
import { CrudPage } from '@/components/crud/crud-page';
import { homecellResource } from '@/lib/resources/homecell-config';
import { apiClient } from '@/lib/api-client';

function HomecellInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const cabangId = sp.get('cabangId') ?? undefined;
  const areaId = sp.get('areaId') ?? undefined;

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

  const areaQ = useQuery({
    queryKey: ['homecell-area', 'detail', areaId],
    enabled: !!areaId,
    queryFn: async () => {
      const res = await apiClient.get<{ data: { nama: string; cabang?: { nama: string } } }>(
        `/admin/homecell-area/${areaId}`,
      );
      return res.data.data;
    },
  });

  let banner: React.ReactNode = null;
  if (areaId) {
    banner = (
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-brand-50 border border-brand-200 rounded-lg text-sm">
        <div className="flex items-center gap-2 text-brand-800">
          <Filter className="w-4 h-4" />
          Filter: homecell di area <strong>{areaQ.data?.nama ?? '...'}</strong>
          {areaQ.data?.cabang?.nama ? (
            <span className="text-brand-600">· {areaQ.data.cabang.nama}</span>
          ) : null}
        </div>
        <button
          onClick={() => router.push('/dashboard/homecell')}
          className="flex items-center gap-1 text-xs text-brand-700 hover:text-brand-900 px-2 py-1 hover:bg-brand-100 rounded"
        >
          <X className="w-3 h-3" />
          Reset
        </button>
      </div>
    );
  } else if (cabangId) {
    banner = (
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-brand-50 border border-brand-200 rounded-lg text-sm">
        <div className="flex items-center gap-2 text-brand-800">
          <Filter className="w-4 h-4" />
          Filter: homecell di cabang <strong>{cabangQ.data?.nama ?? '...'}</strong>
        </div>
        <button
          onClick={() => router.push('/dashboard/homecell')}
          className="flex items-center gap-1 text-xs text-brand-700 hover:text-brand-900 px-2 py-1 hover:bg-brand-100 rounded"
        >
          <X className="w-3 h-3" />
          Reset
        </button>
      </div>
    );
  }

  return (
    <CrudPage config={homecellResource} extraParams={{ cabangId, areaId }} filterBanner={banner} />
  );
}

export default function HomecellPage() {
  return (
    <Suspense fallback={null}>
      <HomecellInner />
    </Suspense>
  );
}
