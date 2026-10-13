'use client';

/**
 * [PIC / admin] Permintaan bergabung group — terima (otomatis jadi anggota)
 * atau tolak dengan alasan. Jemaat mendapat notifikasi.
 * API: /admin/group/:id/join-requests
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Inbox, Loader2, UserPlus, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';

interface JoinRequest {
  id: string;
  createdAt: string;
  via: string;
  pesan: string | null;
  jemaat: {
    id: string;
    namaLengkap: string;
    kode: string | null;
    noHp: string | null;
    cabang: { nama: string } | null;
  };
}

export function GroupJoinRequestsSection({ groupId }: { groupId: string }) {
  const qc = useQueryClient();
  const [rejecting, setRejecting] = useState<JoinRequest | null>(null);
  const [reason, setReason] = useState('');

  const q = useQuery({
    queryKey: ['group', 'join-requests', groupId],
    queryFn: async () =>
      (await apiClient.get<{ data: JoinRequest[] }>(`/admin/group/${groupId}/join-requests`)).data.data,
    retry: false,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['group', 'join-requests', groupId] });
    qc.invalidateQueries({ queryKey: ['group', 'detail', groupId] });
  };
  const approveMut = useMutation({
    mutationFn: async (id: string) => apiClient.post(`/admin/group/${groupId}/join-requests/${id}/approve`),
    onSuccess: () => {
      toast.success('Permintaan diterima — jemaat jadi anggota');
      refresh();
    },
    onError: (e: any) => toast.error(e.response?.data?.error?.message ?? 'Gagal'),
  });
  const rejectMut = useMutation({
    mutationFn: async (v: { id: string; reason?: string }) =>
      apiClient.post(`/admin/group/${groupId}/join-requests/${v.id}/reject`, { reason: v.reason }),
    onSuccess: () => {
      toast.success('Permintaan ditolak');
      setRejecting(null);
      setReason('');
      refresh();
    },
    onError: (e: any) => toast.error(e.response?.data?.error?.message ?? 'Gagal'),
  });

  // Bukan PIC/admin → endpoint 403 → section tidak ditampilkan.
  if (q.isError) return null;
  const rows = q.data ?? [];

  return (
    <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-neutral-100">
        <h2 className="font-semibold text-neutral-900 flex items-center gap-2">
          <UserPlus className="w-4 h-4 text-amber-500" /> Permintaan Bergabung ({rows.length})
        </h2>
        <p className="text-xs text-neutral-500 mt-0.5">
          Jemaat yang join lewat app (publik / kode undangan) perlu disetujui PIC dulu.
        </p>
      </div>
      {q.isLoading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
        </div>
      ) : rows.length === 0 ? (
        <div className="flex items-center justify-center gap-2 text-sm text-neutral-400 py-6">
          <Inbox className="w-4 h-4" /> Tidak ada permintaan yang menunggu.
        </div>
      ) : (
        <ul className="divide-y divide-neutral-100">
          {rows.map((r) => (
            <li key={r.id} className="flex items-start gap-3 px-5 py-3 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-neutral-900">{r.jemaat.namaLengkap}</div>
                <div className="text-xs text-neutral-500">
                  {[r.jemaat.kode, r.jemaat.noHp, r.jemaat.cabang?.nama, r.via === 'CODE' ? 'via kode undangan' : 'join publik']
                    .filter(Boolean)
                    .join(' · ')}
                </div>
                {r.pesan ? <p className="text-xs text-neutral-700 italic mt-1">“{r.pesan}”</p> : null}
                <p className="text-[11px] text-neutral-400 mt-0.5">
                  {new Date(r.createdAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setRejecting(r)}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 rounded-lg"
                >
                  <X className="w-3.5 h-3.5" /> Tolak
                </button>
                <button
                  onClick={() => approveMut.mutate(r.id)}
                  disabled={approveMut.isPending}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-green-600 hover:bg-green-700 rounded-lg disabled:opacity-50"
                >
                  {approveMut.isPending && approveMut.variables === r.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  Terima
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {rejecting && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setRejecting(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md pointer-events-auto p-6 space-y-3">
              <h3 className="font-semibold text-neutral-900">Tolak permintaan {rejecting.jemaat.namaLengkap}?</h3>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                maxLength={300}
                placeholder="Alasan (opsional) — dikirim ke jemaat"
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-red-400 text-sm"
              />
              <div className="flex justify-end gap-2">
                <button onClick={() => setRejecting(null)} className="px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-100 rounded-lg">
                  Batal
                </button>
                <button
                  onClick={() => rejectMut.mutate({ id: rejecting.id, reason: reason.trim() || undefined })}
                  disabled={rejectMut.isPending}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50"
                >
                  {rejectMut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  Tolak
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
