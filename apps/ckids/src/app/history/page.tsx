'use client';

/**
 * Riwayat penukaran hadiah (per cabang) + batal / ganti hadiah.
 *  - Filter: tanggal, status (semua / aktif / dibatalkan), cari nama anak / kode / hadiah
 *  - Batal: point dikembalikan ke anak & stok hadiah +1
 *  - Ganti hadiah: batal + tukar ke hadiah lain sekaligus (satu transaksi)
 * API: GET /admin/gift-stall/redeems, POST /admin/gift-stall/redeems/:id/cancel
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, History, RefreshCw, RotateCcw, Search, X, Undo2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';
import { useCabangStore } from '@/lib/cabang-store';
import { resolveMediaUrl } from '@/lib/media';
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
  cancelledAt: string | null;
  cancelReason: string | null;
  replacedByRedeemId: string | null;
  jemaat: { id: string; namaLengkap: string; fotoUrl: string | null };
  hadiah: { id: string; nama: string };
  processedBy: { id: string; namaLengkap: string };
  cancelledBy: { id: string; namaLengkap: string } | null;
}

interface Hadiah {
  id: string;
  nama: string;
  fotoUrl: string | null;
  pointCost: number;
  stock: number;
}

type Status = 'all' | 'active' | 'cancelled';

export default function HistoryPage() {
  return (
    <AuthGuard>
      <Header />
      <HistoryContent />
    </AuthGuard>
  );
}

const fmtWaktu = (iso: string) => new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });

function HistoryContent() {
  const { cabangId, cabangNama } = useCabangStore();
  const [date, setDate] = useState<string>('');
  const [status, setStatus] = useState<Status>('all');
  const [q, setQ] = useState('');
  const [cancelling, setCancelling] = useState<Redeem | null>(null);

  const list = useQuery({
    queryKey: ['gift-stall', 'redeems', cabangId, date, status, q.trim()],
    enabled: !!cabangId,
    queryFn: async () => {
      const params: Record<string, string> = { cabangId: cabangId!, status };
      if (date) params.date = date;
      if (q.trim()) params.q = q.trim();
      const res = await apiClient.get<{ data: Redeem[] }>('/admin/gift-stall/redeems', { params });
      return res.data.data;
    },
  });

  if (!cabangId) {
    return <main className="p-8 text-center text-neutral-500">Pilih cabang dulu di header.</main>;
  }

  const rows = list.data ?? [];
  const active = rows.filter((r) => !r.cancelledAt);
  const totalPoint = active.reduce((n, r) => n + r.pointDeducted, 0);

  return (
    <main className="max-w-6xl mx-auto p-4 pb-24">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <History className="w-5 h-5" /> Riwayat Penukaran — {cabangNama}
          </h1>
          <p className="text-sm text-neutral-500">
            {rows.length} transaksi{rows.length >= 200 ? ' (200 terakhir)' : ''} · {active.length} aktif ·{' '}
            {totalPoint.toLocaleString('id-ID')} pts terpakai
          </p>
        </div>
        <button onClick={() => list.refetch()} className="p-2 hover:bg-neutral-100 rounded-lg" title="Refresh">
          <RefreshCw className={`w-4 h-4 ${list.isFetching ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl p-3 mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 border border-neutral-300 rounded-lg px-3 flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-neutral-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari nama anak / kode / hadiah"
            className="flex-1 py-1.5 outline-none text-sm"
          />
        </div>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="px-3 py-1.5 border border-neutral-300 rounded-lg text-sm"
        />
        {date && (
          <button onClick={() => setDate('')} className="text-xs text-neutral-500 hover:underline">
            Semua tanggal
          </button>
        )}
        <div className="flex gap-1">
          {(
            [
              ['all', 'Semua'],
              ['active', 'Aktif'],
              ['cancelled', 'Dibatalkan'],
            ] as const
          ).map(([k, l]) => (
            <button
              key={k}
              onClick={() => setStatus(k)}
              className={`px-3 py-1 text-xs rounded-full border ${
                status === k ? 'bg-brand-500 text-white border-brand-500' : 'border-neutral-300 text-neutral-600'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {list.isLoading ? (
        <div className="text-center p-10">
          <Loader2 className="w-6 h-6 animate-spin mx-auto" />
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-xl border p-10 text-center text-neutral-500">
          Belum ada transaksi{date ? ` pada ${date}` : ''}.
        </div>
      ) : (
        <div className="bg-white border border-neutral-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-xs text-neutral-500 uppercase">
              <tr>
                <th className="text-left px-4 py-2">Waktu</th>
                <th className="text-left px-4 py-2">Anak</th>
                <th className="text-left px-4 py-2">Hadiah</th>
                <th className="text-right px-4 py-2">Point</th>
                <th className="text-left px-4 py-2">Admin</th>
                <th className="text-left px-4 py-2">Status</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rows.map((r) => {
                const cancelled = !!r.cancelledAt;
                return (
                  <tr key={r.id} className={cancelled ? 'bg-neutral-50 text-neutral-400' : 'hover:bg-neutral-50'}>
                    <td className="px-4 py-3 text-xs whitespace-nowrap">{fmtWaktu(r.processedAt)}</td>
                    <td className="px-4 py-3 font-medium">{r.jemaat.namaLengkap}</td>
                    <td className="px-4 py-3">
                      <span className={cancelled ? 'line-through' : ''}>{r.hadiahNama}</span>
                      {r.note ? <div className="text-[11px] text-neutral-400">{r.note}</div> : null}
                    </td>
                    <td className={`px-4 py-3 text-right font-bold ${cancelled ? 'line-through' : 'text-red-600'}`}>
                      -{r.pointDeducted.toLocaleString('id-ID')}
                    </td>
                    <td className="px-4 py-3 text-xs">{r.processedBy.namaLengkap}</td>
                    <td className="px-4 py-3 text-xs">
                      {cancelled ? (
                        <div>
                          <span className="inline-block px-2 py-0.5 rounded-full bg-neutral-200 text-neutral-600 font-semibold">
                            {r.replacedByRedeemId ? 'Diganti' : 'Dibatalkan'}
                          </span>
                          <div className="mt-0.5">
                            {r.cancelledBy?.namaLengkap ?? '—'} · {fmtWaktu(r.cancelledAt!)}
                          </div>
                          {r.cancelReason ? <div className="italic">“{r.cancelReason}”</div> : null}
                        </div>
                      ) : (
                        <span className="inline-block px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold">
                          Ditukar
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!cancelled ? (
                        <button
                          onClick={() => setCancelling(r)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg border border-red-200 text-red-600 hover:bg-red-50 whitespace-nowrap"
                        >
                          <Undo2 className="w-3.5 h-3.5" /> Batal / Ganti
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {cancelling && <CancelModal redeem={cancelling} cabangId={cabangId} onClose={() => setCancelling(null)} />}
    </main>
  );
}

function CancelModal({ redeem, cabangId, onClose }: { redeem: Redeem; cabangId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<'cancel' | 'replace'>('replace');
  const [reason, setReason] = useState('');
  const [replaceId, setReplaceId] = useState<string>('');

  const hadiahQ = useQuery({
    queryKey: ['hadiah', cabangId],
    queryFn: async () =>
      (await apiClient.get<{ data: Hadiah[] }>(`/admin/hadiah?cabangId=${cabangId}&isActive=true&limit=100`)).data.data,
  });
  const balanceQ = useQuery({
    queryKey: ['gift-stall', 'balance', redeem.jemaatId, cabangId],
    queryFn: async () => {
      const res = await apiClient.get<{ data: { balance: number } }>('/admin/gift-stall/balance', {
        params: { jemaatId: redeem.jemaatId, cabangId },
      });
      return res.data.data.balance;
    },
    retry: false,
  });
  const afterRefund = balanceQ.data != null ? balanceQ.data + redeem.pointDeducted : null;
  const options = (hadiahQ.data ?? []).filter((h) => h.id !== redeem.hadiahId);
  const picked = options.find((h) => h.id === replaceId);

  const mut = useMutation({
    mutationFn: async () =>
      (
        await apiClient.post<{ message: string }>(`/admin/gift-stall/redeems/${redeem.id}/cancel`, {
          reason: reason.trim() || undefined,
          replaceHadiahId: mode === 'replace' ? replaceId : undefined,
        })
      ).data,
    onSuccess: (d) => {
      toast.success(d.message ?? 'Berhasil');
      void qc.invalidateQueries({ queryKey: ['gift-stall'] });
      void qc.invalidateQueries({ queryKey: ['hadiah'] });
      onClose();
    },
    onError: (e: any) => toast.error(e.response?.data?.error?.message ?? 'Gagal'),
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={mut.isPending ? undefined : onClose}>
      <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl p-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-3">
          <div>
            <h2 className="text-lg font-bold">Batal / ganti hadiah</h2>
            <p className="text-sm text-neutral-500">
              {redeem.jemaat.namaLengkap} · {redeem.hadiahNama} ({redeem.pointDeducted.toLocaleString('id-ID')} pts) ·{' '}
              {fmtWaktu(redeem.processedAt)}
            </p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-neutral-100 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-4">
          {(
            [
              ['replace', 'Ganti ke hadiah lain'],
              ['cancel', 'Batalkan saja'],
            ] as const
          ).map(([k, l]) => (
            <button
              key={k}
              onClick={() => setMode(k)}
              className={`py-2 text-sm font-semibold rounded-lg border ${
                mode === k ? 'bg-brand-500 text-white border-brand-500' : 'border-neutral-300 text-neutral-700'
              }`}
            >
              {l}
            </button>
          ))}
        </div>

        <div className="text-sm bg-neutral-50 rounded-lg p-3 mb-4">
          <b>{redeem.pointDeducted.toLocaleString('id-ID')} pts</b> dikembalikan ke anak & stok “{redeem.hadiahNama}” +1.
          {afterRefund != null ? (
            <div className="text-xs text-neutral-500 mt-0.5">Point setelah dikembalikan: {afterRefund.toLocaleString('id-ID')} pts</div>
          ) : null}
        </div>

        {mode === 'replace' && (
          <div className="mb-4">
            <div className="text-xs font-semibold text-neutral-500 uppercase mb-2">Pilih hadiah pengganti</div>
            {hadiahQ.isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : options.length === 0 ? (
              <p className="text-sm text-neutral-500">Tidak ada hadiah lain yang aktif.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-72 overflow-y-auto">
                {options.map((h) => {
                  const noStock = h.stock <= 0;
                  const noPoint = afterRefund != null && afterRefund < h.pointCost;
                  const disabled = noStock || noPoint;
                  return (
                    <button
                      key={h.id}
                      disabled={disabled}
                      onClick={() => setReplaceId(h.id)}
                      className={`flex items-center gap-2 p-2 rounded-lg border text-left ${
                        replaceId === h.id
                          ? 'border-brand-500 bg-brand-50'
                          : disabled
                            ? 'border-neutral-200 opacity-50'
                            : 'border-neutral-200 hover:border-brand-300'
                      }`}
                    >
                      {h.fotoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={resolveMediaUrl(h.fotoUrl) ?? ''} alt="" className="w-10 h-10 rounded object-cover" />
                      ) : (
                        <div className="w-10 h-10 rounded bg-neutral-100 flex items-center justify-center">🎁</div>
                      )}
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate">{h.nama}</div>
                        <div className="text-[11px] text-neutral-500">
                          {h.pointCost.toLocaleString('id-ID')} pts · stok {h.stock}
                          {noStock ? ' · habis' : noPoint ? ' · point kurang' : ''}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <label className="block mb-4">
          <span className="text-xs font-semibold text-neutral-500 uppercase">Alasan (opsional)</span>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="mis. anak ingin ganti hadiah"
            className="mt-1 w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm"
          />
        </label>

        <button
          onClick={() => mut.mutate()}
          disabled={mut.isPending || (mode === 'replace' && !picked)}
          className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-semibold"
        >
          {mut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
          {mode === 'replace'
            ? picked
              ? `Batalkan & ganti ke ${picked.nama}`
              : 'Pilih hadiah pengganti'
            : 'Batalkan penukaran'}
        </button>
        <p className="text-[11px] text-neutral-500 mt-2 text-center">
          Pastikan hadiah sebelumnya sudah dikembalikan ke meja. Orang tua mendapat notifikasi.
        </p>
      </div>
    </div>
  );
}
