'use client';

import { Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { X, Filter, Gift, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { CrudPage } from '@/components/crud/crud-page';
import { hadiahResource } from '@/lib/resources/hadiah-config';
import { apiClient } from '@/lib/api-client';

function HadiahInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const cabangId = sp.get('cabangId') ?? undefined;

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
  if (cabangId) {
    banner = (
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-brand-50 border border-brand-200 rounded-lg text-sm">
        <div className="flex items-center gap-2 text-brand-800">
          <Filter className="w-4 h-4" />
          Filter cabang: <strong>{cabangQ.data?.nama ?? '...'}</strong>
        </div>
        <button
          onClick={() => router.push('/dashboard/hadiah')}
          className="flex items-center gap-1 text-xs text-brand-700 hover:text-brand-900 px-2 py-1 hover:bg-brand-100 rounded"
        >
          <X className="w-3 h-3" /> Reset
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
            <Gift className="w-6 h-6 text-kids-500" /> Katalog Hadiah
          </h1>
          <p className="text-sm text-neutral-500 mt-1">
            Master data hadiah per cabang. Redeem transaksi + adjust stock live-nya di{' '}
            <Link
              href="https://ckids.eccchurch.global"
              target="_blank"
              className="text-brand-600 hover:underline inline-flex items-center gap-0.5"
            >
              CKids Gift Stall <ExternalLink className="w-3 h-3" />
            </Link>{' '}
            (admin subdomain).
          </p>
        </div>
      </div>

      <CrudPage config={hadiahResource} extraParams={{ cabangId }} filterBanner={banner} />
    </>
  );
}

export default function HadiahPage() {
  return (
    <Suspense fallback={null}>
      <HadiahInner />
    </Suspense>
  );
}
