'use client';

import { Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { X, Filter, UserPlus, Hourglass } from 'lucide-react';
import { usePendingCounts } from '@/lib/pending-counts';
import { CrudPage } from '@/components/crud/crud-page';
import { groupResource } from '@/lib/resources/group-config';
import { apiClient } from '@/lib/api-client';

function GroupInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const cabangId = sp.get('cabangId') ?? undefined;
  const jenis = sp.get('jenis') ?? undefined;
  // Dari badge menu (?permintaan=1) → hanya group yang punya permintaan bergabung menunggu.
  const permintaan = sp.get('permintaan') === '1' ? '1' : undefined;
  // ?pengajuan=1 → antrian pengajuan group baru dari Els App (menunggu persetujuan).
  const pengajuan = sp.get('pengajuan') === '1';
  const counts = usePendingCounts();
  const pendingGroups = counts.groupJoin ?? 0;
  const pendingApproval = counts.groupApproval ?? 0;

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
  if (pengajuan) {
    banner = (
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-sm">
        <div className="flex items-center gap-2 text-amber-900">
          <Hourglass className="w-4 h-4" />
          Menampilkan <strong>pengajuan group baru</strong> dari Els App. Buka group → Setujui / Tolak (dengan alasan).
        </div>
        <button
          onClick={() => router.push('/dashboard/group')}
          className="flex items-center gap-1 text-xs text-amber-800 hover:text-amber-950 px-2 py-1 hover:bg-amber-100 rounded"
        >
          <X className="w-3 h-3" />
          Tampilkan semua
        </button>
      </div>
    );
  } else if (pendingApproval > 0 && !permintaan && !cabangId && !jenis) {
    banner = (
      <button
        onClick={() => router.push('/dashboard/group?pengajuan=1')}
        className="w-full text-left flex items-center gap-2 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900 hover:bg-amber-100"
      >
        <Hourglass className="w-4 h-4" />
        <span>
          <strong>{pendingApproval} pengajuan group baru</strong> menunggu persetujuan — klik untuk memproses.
        </span>
      </button>
    );
  } else if (permintaan) {
    banner = (
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-red-50 border border-red-200 rounded-lg text-sm">
        <div className="flex items-center gap-2 text-red-800">
          <UserPlus className="w-4 h-4" />
          Menampilkan group yang punya <strong>permintaan bergabung menunggu</strong>. Buka group → bagian Permintaan Bergabung.
        </div>
        <button
          onClick={() => router.push('/dashboard/group')}
          className="flex items-center gap-1 text-xs text-red-700 hover:text-red-900 px-2 py-1 hover:bg-red-100 rounded"
        >
          <X className="w-3 h-3" />
          Tampilkan semua
        </button>
      </div>
    );
  } else if (pendingGroups > 0 && !cabangId && !jenis) {
    banner = (
      <button
        onClick={() => router.push('/dashboard/group?permintaan=1')}
        className="w-full text-left flex items-center gap-2 px-4 py-2.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800 hover:bg-red-100"
      >
        <UserPlus className="w-4 h-4" />
        <span>
          <strong>{pendingGroups} permintaan bergabung</strong> menunggu — klik untuk menampilkan group-nya.
        </span>
      </button>
    );
  } else if (cabangId || jenis) {
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
    <CrudPage config={groupResource} extraParams={{ cabangId, jenis, permintaan, approval: pengajuan ? 'PENDING' : undefined }} filterBanner={banner} />
  );
}

export default function GroupPage() {
  return (
    <Suspense fallback={null}>
      <GroupInner />
    </Suspense>
  );
}
