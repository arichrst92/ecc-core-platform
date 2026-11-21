'use client';

/**
 * Petugas yang tugasnya belum diisi (badge biru "Perlu diisi").
 * API: GET /admin/pelayanan/:id/tugas-kosong — hanya bila pelayanan punya kategori tugas.
 */
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, Megaphone } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { NeedsFillBadge } from '@/components/ui/needs-fill-badge';

export interface TugasKosongItem {
  jenis: 'ibadah' | 'event';
  petugasId: string;
  jemaat: { id: string; namaLengkap: string };
  targetId: string;
  targetNama: string;
  cabang: string | null;
  /** YYYY-MM-DD; null = susunan tetap ibadah. */
  tanggal: string | null;
}

export function useTugasKosong(pelayananId: string | null | undefined) {
  return useQuery({
    queryKey: ['pelayanan', pelayananId, 'tugas-kosong'],
    enabled: !!pelayananId,
    staleTime: 30_000,
    queryFn: async () =>
      (
        await apiClient.get<{ data: { hasKategori: boolean; total: number; items: TugasKosongItem[] } }>(
          `/admin/pelayanan/${pelayananId}/tugas-kosong`,
        )
      ).data.data,
  });
}

const tgl = (ymd: string) =>
  new Date(`${ymd}T00:00:00`).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

/** Daftar petugas tanpa tugas, dikelompokkan per ibadah/event — tiap baris menuju halaman tempat mengisinya. */
export function TugasKosongPanel({ pelayananId }: { pelayananId: string }) {
  const q = useTugasKosong(pelayananId);
  const d = q.data;
  if (!d?.hasKategori || d.total === 0) return null;
  const groups = new Map<string, { item: TugasKosongItem; people: TugasKosongItem[] }>();
  for (const it of d.items) {
    const k = `${it.jenis}:${it.targetId}:${it.tanggal ?? 'tetap'}`;
    const g = groups.get(k) ?? { item: it, people: [] };
    g.people.push(it);
    groups.set(k, g);
  }
  return (
    <div className="bg-blue-50/60 border border-blue-200 rounded-xl p-4">
      <div className="flex items-center gap-2 flex-wrap">
        <NeedsFillBadge label={`${d.total} tugas perlu diisi`} />
        <span className="text-sm text-blue-900">
          Petugas di bawah ini belum diberi tugas. Klik ibadah/event untuk membukanya, lalu klik badge biru di nama petugas.
        </span>
      </div>
      <ul className="mt-3 space-y-2">
        {[...groups.values()].map(({ item, people }) => {
          const href =
            item.jenis === 'ibadah'
              ? `/dashboard/ibadah/${item.targetId}${item.tanggal ? `?tanggal=${item.tanggal}` : ''}`
              : `/dashboard/event/${item.targetId}`;
          const Icon = item.jenis === 'ibadah' ? CalendarDays : Megaphone;
          return (
            <li key={`${item.jenis}:${item.targetId}:${item.tanggal}`} className="bg-white border border-blue-100 rounded-lg px-3 py-2">
              <Link href={href} className="flex items-center gap-2 text-sm font-semibold text-neutral-900 hover:text-brand-600">
                <Icon className="w-4 h-4 text-neutral-400" />
                {item.targetNama}
                <span className="font-normal text-xs text-neutral-500">
                  {item.jenis === 'ibadah' ? (item.tanggal ? tgl(item.tanggal) : 'Susunan tetap') : item.tanggal ? tgl(item.tanggal) : ''}
                  {item.cabang ? ` · ${item.cabang}` : ''}
                </span>
                <span className="ml-auto text-xs font-semibold text-blue-700">{people.length} petugas →</span>
              </Link>
              <div className="mt-1 text-xs text-neutral-600">{people.map((p) => p.jemaat.namaLengkap).join(', ')}</div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
