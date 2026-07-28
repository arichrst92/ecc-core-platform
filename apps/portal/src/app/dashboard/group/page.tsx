'use client';

import { Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { X, Filter } from 'lucide-react';
import { CrudPage } from '@/components/crud/crud-page';
import { groupResource } from '@/lib/resources/group-config';
import { apiClient } from '@/lib/api-client';

function GroupInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const cabangId = sp.get('cabangId') ?? undefined;
  const jenis = sp.get('jenis') ?? undefined;

  const cabangQ = useQuery({
    queryKey: ['cabang', 'detail', cabangId],
    enabled: !!cabangId,
    queryFn: async () => {
      const res = await apiClient.get<{ data: { nama: string } }>(
        `/admin/cabang/${cabangId}`,
      );
      return res.data.data;
    },
  });

  let banner: React.ReactNode = null;
  if (cabangId || jenis) {
    const parts: string[] = [];
    if (cabangId) parts.push(`cabang ${cabangQ.data?.nama ?? '...'}`);
    if (jenis) parts.push(`jenis ${jenis}`);
    banner = (
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-brand-50 border border-brand-200 rounded-lg text-sm">
        <div className="flex items-center gap-2 text-brand-800">
          <Filter className="w-4 h-4" />
          Filter: <strong>{parts.join(' · ')}</strong>
        </div>
        <button
          onClick={() => router.push('/dashboard/group')}
          className="flex items-center gap-1 text-xs text-brand-700 hover:text-brand-900 px-2 py-1 hover:bg-brand-100 rounded"
        >
          <X className="w-3 h-3" />
          Reset
        </button>
      </div>
    );
  }

  return (
    <CrudPage config={groupResource} extraParams={{ cabangId, jenis }} filterBanner={banner} />
  );
}

export default function GroupPage() {
  return (
    <Suspense fallback={null}>
      <GroupInner />
    </Suspense>
  );
}
