'use client';

/**
 * Badge request menunggu tindakan admin (GET /admin/pending-counts).
 * Diperbarui tiap 60 detik, saat pindah halaman, saat tab browser aktif lagi,
 * dan setelah ada aksi (mutation) apa pun di Portal.
 */
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';

export type PendingKey =
  | 'volunteer'
  | 'feedback'
  | 'prayer'
  | 'tamu'
  | 'jemaatDuplicate'
  | 'sjRequest'
  | 'eventPayment'
  | 'groupJoin'
  | 'homecellLokasi';
export type PendingCounts = Partial<Record<PendingKey, number>>;

/** Keterangan & halaman tujuan per badge. */
export const PENDING_META: Record<PendingKey, { label: string; target: string }> = {
  volunteer: { label: 'permintaan volunteer menunggu', target: '/dashboard/pelayanan/join-requests' },
  feedback: { label: 'kritik & saran belum dibalas', target: '/dashboard/feedback' },
  prayer: { label: 'prayer request belum ditugaskan', target: '/dashboard/prayer-request' },
  tamu: { label: 'tamu belum ada petugas follow-up', target: '/dashboard/tamu' },
  jemaatDuplicate: { label: 'kandidat akun ganda perlu ditinjau', target: '/dashboard/jemaat/duplicates' },
  sjRequest: { label: 'request spiritual journey menunggu', target: '/dashboard/spiritual-journey/request' },
  eventPayment: { label: 'bukti transfer event menunggu verifikasi', target: '/dashboard/event' },
  groupJoin: { label: 'permintaan bergabung group menunggu', target: '/dashboard/group' },
  homecellLokasi: { label: 'homecell dengan titik lokasi salah di peta', target: '/dashboard/homecell' },
};

export const PENDING_QUERY_KEY = ['pending-counts'] as const;

export function usePendingCounts(): PendingCounts {
  const pathname = usePathname();
  const qc = useQueryClient();
  const hasUser = useAuthStore((s) => !!s.user);
  const q = useQuery({
    queryKey: PENDING_QUERY_KEY,
    queryFn: async () => (await apiClient.get<{ data: PendingCounts }>('/admin/pending-counts')).data.data ?? {},
    enabled: hasUser,
    staleTime: 15_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    retry: false,
  });

  // Pindah halaman → segarkan (mis. setelah memproses request lalu kembali).
  useEffect(() => {
    if (hasUser) void qc.invalidateQueries({ queryKey: PENDING_QUERY_KEY });
  }, [pathname, hasUser, qc]);

  // Setiap aksi berhasil di Portal → segarkan badge (debounce ringan).
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    const unsub = qc.getMutationCache().subscribe((e) => {
      if (e.type !== 'updated' || e.mutation.state.status !== 'success') return;
      if (t) clearTimeout(t);
      t = setTimeout(() => void qc.invalidateQueries({ queryKey: PENDING_QUERY_KEY }), 800);
    });
    return () => {
      unsub();
      if (t) clearTimeout(t);
    };
  }, [qc]);

  return q.data ?? {};
}

/** "99+" untuk angka besar. */
export const badgeText = (n: number) => (n > 99 ? '99+' : String(n));
