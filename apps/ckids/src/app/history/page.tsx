'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, History, RefreshCw } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useCabangStore } from '@/lib/cabang-store';
import { Header, AuthGuard } from '@/components/header';

interface Redeem {
  id: string;
  jemaatId: string;
  hadiahId: string;
  pointDeducted: number;
  hadiahNama: string;
  hadiahFotoUrl: string | null;
  note: string | null;
  processedAt: string;
  jemaat: { id: string; namaLengkap: string; fotoUrl: string | null };
  hadiah: { id: string; nama: string };
  processedBy: { id: string; namaLengkap: string };
}

export default function HistoryPage() {
  return (
    <AuthGuard>
      <Header />
      <HistoryContent />
    </AuthGuard>
  );
}

function HistoryContent() {
  const { cabangId, cabangNama } = useCabangStore();
  const [date, setDate] = useState<string>('');

  const q = useQuery({
    queryKey: ['gift-stall', 'redeems', cabangId, date],
    enabled: !!cabangId,
    queryFn: async () => {
      const params: any = { cabangId };
      if (date) params.date = date;
      const res = await apiClient.get<{ data: Redeem[] }>('/admin/gift-stall/redeems', {
        params,
      });
      return res.data.data;
    },
  });

  if (!cabangId) {
    return (
      <main className="p-8 text-center text-neutral-500">Pilih cabang dulu di header.</main>
    );
  }

  return (
    <main className="max-w-6xl mx-auto p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <History className="w-5 h-5" /> Redeem History — {cabangNama}
          </h1>
          <p className="text-sm text-neutral-500">200 transaksi terakhir.</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="px-3 py-1.5 border border-neutral-300 rounded-lg text-sm"
          />
          {date && (
            <button
              onClick={() => setDate('')}
              className="text-xs text-neutral-500 hover:underline"
            >
              Clear
            </button>
          )}
          <button
            onClick={() => q.refetch()}
            className="p-1.5 hover:bg-neutral-100 rounded"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {q.isLoading ? (
        <div className="text-center p-10">
          <Loader2 className="w-6 h-6 animate-spin mx-auto" />
        </div>
      ) : (q.data ?? []).length === 0 ? (
        <div className="bg-white rounded-xl border p-10 text-center text-neutral-500">
          Belum ada transaksi{date ? ` pada ${date}` : ''}.
        </div>
      ) : (
        <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-xs text-neutral-500 uppercase">
              <tr>
                <th className="text-left px-4 py-2">Waktu</th>
                <th className="text-left px-4 py-2">Anak</th>
                <th className="text-left px-4 py-2">Hadiah</th>
                <th className="text-right px-4 py-2">Point</th>
                <th className="text-left px-4 py-2">Admin</th>
                <th className="text-left px-4 py-2">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {(q.data ?? []).map((r) => (
                <tr key={r.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-3 text-xs text-neutral-500 whitespace-nowrap">
                    {new Date(r.processedAt).toLocaleString('id-ID', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </td>
                  <td className="px-4 py-3 font-medium">{r.jemaat.namaLengkap}</td>
                  <td className="px-4 py-3">{r.hadiahNama}</td>
                  <td className="px-4 py-3 text-right font-bold text-red-600">
                    -{r.pointDeducted.toLocaleString('id-ID')}
                  </td>
                  <td className="px-4 py-3 text-xs text-neutral-600">
                    {r.processedBy.namaLengkap}
                  </td>
                  <td className="px-4 py-3 text-xs text-neutral-500">{r.note ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
