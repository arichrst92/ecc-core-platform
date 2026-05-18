'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Heart, Loader2, X, ExternalLink, User as UserIcon } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

interface RelasiItem {
  id: string;
  keterangan: string | null;
  jemaatTerkait: { id: string; namaLengkap: string; fotoUrl: string | null; noHp: string | null };
  tipeRelasi: { id: string; nama: string };
}

interface Props {
  jemaatId: string;
  jemaatNama: string;
  onClose: () => void;
}

/**
 * Modal read-only untuk lihat relasi keluarga 1 jemaat.
 * Untuk CRUD lengkap, link ke detail page jemaat.
 */
export function RelasiModal({ jemaatId, jemaatNama, onClose }: Props) {
  const apiBase = process.env.NEXT_PUBLIC_CORE_API_URL ?? '';

  const relasiQ = useQuery({
    queryKey: ['relasi-jemaat', jemaatId],
    queryFn: async () => {
      const res = await apiClient.get<{ data: RelasiItem[] }>(
        `/admin/keluarga/relasi/jemaat/${jemaatId}`,
      );
      return res.data.data;
    },
  });

  const relasi = relasiQ.data ?? [];

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg pointer-events-auto max-h-[80vh] flex flex-col">
          <div className="px-6 py-4 border-b border-neutral-100 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-neutral-900 flex items-center gap-2">
                <Heart className="w-4 h-4" />
                Relasi Keluarga
              </h2>
              <p className="text-xs text-neutral-500 mt-0.5">
                <strong>{jemaatNama}</strong>
              </p>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-neutral-100 rounded">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {relasiQ.isLoading ? (
              <div className="text-center py-8">
                <Loader2 className="w-5 h-5 mx-auto animate-spin text-neutral-400" />
              </div>
            ) : relasi.length === 0 ? (
              <p className="text-center py-8 text-sm text-neutral-400 italic">
                Belum ada relasi keluarga tercatat.
              </p>
            ) : (
              <div className="space-y-2">
                {relasi.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center gap-3 p-3 border border-neutral-100 rounded-lg hover:bg-neutral-50"
                  >
                    {r.jemaatTerkait.fotoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`${apiBase}${r.jemaatTerkait.fotoUrl}`}
                        alt={r.jemaatTerkait.namaLengkap}
                        className="w-9 h-9 rounded-full object-cover shrink-0"
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center shrink-0">
                        <UserIcon className="w-4 h-4" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/dashboard/jemaat/${r.jemaatTerkait.id}`}
                        className="font-medium text-neutral-900 hover:text-brand-600 hover:underline text-sm truncate block"
                        onClick={onClose}
                      >
                        {r.jemaatTerkait.namaLengkap}
                      </Link>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="inline-block px-2 py-0.5 bg-brand-50 text-brand-700 text-xs rounded">
                          {r.tipeRelasi.nama}
                        </span>
                        {r.jemaatTerkait.noHp && (
                          <span className="text-xs text-neutral-500">{r.jemaatTerkait.noHp}</span>
                        )}
                      </div>
                      {r.keterangan && (
                        <div className="text-xs text-neutral-500 italic mt-1">{r.keterangan}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="px-6 py-4 border-t border-neutral-100 bg-neutral-50 flex items-center justify-between">
            <span className="text-xs text-neutral-500">
              {relasi.length} relasi tercatat
            </span>
            <Link
              href={`/dashboard/jemaat/${jemaatId}`}
              onClick={onClose}
              className="flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700 font-medium"
            >
              Buka detail lengkap
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
