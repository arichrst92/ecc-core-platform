'use client';

/**
 * Badge BIRU "Perlu diisi" di menu & grup menu (GET /admin/needs-fill-counts):
 * jumlah data penting yang masih kosong per menu. Badge merah (pending-counts)
 * tetap untuk antrian yang menunggu tindakan.
 * Lebih berat dari pending-counts → diperbarui tiap 5 menit, saat pindah halaman
 * (maks. sekali per 30 detik), saat tab aktif lagi, dan setelah ada perubahan data.
 */
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';

export type FillKey = 'pelayanan' | 'ibadah' | 'event' | 'homecell' | 'zona' | 'group' | 'cabang';
export type FillCounts = Partial<Record<FillKey, number>>;

export const FILL_META: Record<FillKey, { label: string; target: string }> = {
  pelayanan: { label: 'pelayanan datanya belum lengkap', target: '/dashboard/pelayanan?status=perlu-diisi' },
  ibadah: { label: 'ibadah dengan petugas yang tugasnya belum diisi', target: '/dashboard/ibadah' },
  event: { label: 'event mendatang belum lengkap (gambar, rekening/QRIS, tugas volunteer)', target: '/dashboard/event' },
  homecell: { label: 'homecell belum ada PIC / lokasi', target: '/dashboard/homecell' },
  zona: { label: 'zona belum ada PIC', target: '/dashboard/homecell-area' },
  group: { label: 'group belum ada PIC', target: '/dashboard/group' },
  cabang: { label: 'cabang belum ada lokasi', target: '/dashboard/cabang' },
};

export const FILL_QUERY_KEY = ['needs-fill-counts'] as const;

type FillResp = { counts: FillCounts; tugasKosong: { ibadah: string[]; event: string[] } };
const fetchFill = async (): Promise<FillResp> => {
  const r = (
    await apiClient.get<{ data: FillCounts; meta?: { tugasKosong?: { ibadah: string[]; event: string[] } } }>('/admin/needs-fill-counts')
  ).data;
  return { counts: r.data ?? {}, tugasKosong: r.meta?.tugasKosong ?? { ibadah: [], event: [] } };
};

/** Id ibadah / event yang punya petugas tanpa tugas (badge biru di baris daftar). */
export function useTugasKosongTargets(): { ibadah: Set<string>; event: Set<string> } {
  const q = useQuery({ queryKey: FILL_QUERY_KEY, queryFn: fetchFill, staleTime: 30_000 });
  const t = q.data?.tugasKosong;
  return { ibadah: new Set(t?.ibadah ?? []), event: new Set(t?.event ?? []) };
}

export function useNeedsFillCounts(): FillCounts {
  const pathname = usePathname();
  const qc = useQueryClient();
  const hasUser = useAuthStore((s) => !!s.user);
  const q = useQuery({
    queryKey: FILL_QUERY_KEY,
    queryFn: fetchFill,
    enabled: hasUser,
    staleTime: 30_000,
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: true,
    retry: false,
  });

  useEffect(() => {
    if (hasUser) void qc.invalidateQueries({ queryKey: FILL_QUERY_KEY, refetchType: 'active' });
  }, [pathname, hasUser, qc]);

  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    const unsub = qc.getMutationCache().subscribe((e) => {
      if (e.type !== 'updated' || e.mutation.state.status !== 'success') return;
      if (t) clearTimeout(t);
      t = setTimeout(() => void qc.invalidateQueries({ queryKey: FILL_QUERY_KEY }), 1500);
    });
    return () => {
      unsub();
      if (t) clearTimeout(t);
    };
  }, [qc]);

  return q.data?.counts ?? {};
}
