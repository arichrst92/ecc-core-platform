'use client';

/**
 * Daftar saran jemaat di bawah input "kode jemaat" — supaya pelayan bisa
 * mencari dengan NAMA atau NO HP (bukan hanya kode QR). Pilih → `onPick(kode)`.
 * Pencarian memakai /admin/jemaat?search= (cocok nama, no HP, kode) di cabang aktif.
 */
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, User } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

interface JemaatOption {
  id: string;
  kode: string | null;
  namaLengkap: string;
  noHp: string | null;
  tanggalLahir?: string | null;
}

function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

export function JemaatSuggestions({
  query,
  cabangId,
  onPick,
}: {
  /** Teks yang sedang diketik di input kode/nama/no HP. */
  query: string;
  cabangId: string | null;
  onPick: (kode: string) => void;
}) {
  const q = useDebounced(query.trim(), 300);
  // Kode QR lengkap (8 karakter) → tidak perlu saran, langsung "Cari".
  const isFullKode = /^[A-Z0-9]{8}$/i.test(q) && !/\s/.test(q);
  const enabled = q.length >= 2 && !isFullKode;

  const res = useQuery({
    queryKey: ['jemaat-suggest', cabangId, q],
    enabled,
    queryFn: async () =>
      (
        await apiClient.get<{ data: JemaatOption[] }>('/admin/jemaat', {
          params: { search: q, cabangId: cabangId ?? undefined, limit: 8 },
        })
      ).data.data,
    staleTime: 30_000,
  });

  if (!enabled) return null;
  if (res.isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-neutral-500 px-1 py-2">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Mencari…
      </div>
    );
  }
  const rows = (res.data ?? []).filter((j) => j.kode);
  if (rows.length === 0) {
    return <p className="text-xs text-neutral-500 px-1 py-2">Tidak ada jemaat yang cocok (nama / no HP / kode).</p>;
  }
  return (
    <ul className="border border-neutral-200 rounded-lg divide-y divide-neutral-100 max-h-64 overflow-y-auto">
      {rows.map((j) => (
        <li key={j.id}>
          <button
            type="button"
            onClick={() => onPick(j.kode!)}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-kids-50"
          >
            <span className="w-8 h-8 rounded-full bg-kids-100 text-kids-700 flex items-center justify-center shrink-0">
              <User className="w-4 h-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-neutral-900 truncate">{j.namaLengkap}</span>
              <span className="block text-xs text-neutral-500 truncate">
                {[j.kode, j.noHp].filter(Boolean).join(' · ')}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
