'use client';

/**
 * Persetujuan pembuatan group (2026-11). Group yang diajukan jemaat dari
 * Els App berstatus PENDING — belum tampil di daftar app & belum bisa menerima
 * anggota sampai disetujui admin Role Access menu Group (tulis).
 * API: POST /admin/group/:id/approve · POST /admin/group/:id/reject { alasan }
 */
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Hourglass, Loader2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';
import { useMenuAccess } from '@/lib/use-menu-access';

export function GroupApprovalPanel({
  groupId,
  nama,
  picNama,
  createdAt,
  onRejected,
}: {
  groupId: string;
  nama: string;
  picNama: string | null;
  createdAt: string;
  onRejected?: () => void;
}) {
  const qc = useQueryClient();
  const canWrite = useMenuAccess('group', 'write');
  const [rejectOpen, setRejectOpen] = useState(false);
  const [alasan, setAlasan] = useState('');

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['group'] });
  };
  const approveMut = useMutation({
    mutationFn: async () => apiClient.post(`/admin/group/${groupId}/approve`),
    onSuccess: () => {
      toast.success('Group disetujui — PIC mendapat notifikasi');
      refresh();
    },
    onError: (e: any) => toast.error(e.response?.data?.error?.message ?? 'Gagal menyetujui'),
  });
  const rejectMut = useMutation({
    mutationFn: async () => apiClient.post(`/admin/group/${groupId}/reject`, { alasan: alasan.trim() }),
    onSuccess: () => {
      toast.success('Pengajuan ditolak — PIC mendapat notifikasi beserta alasannya');
      setRejectOpen(false);
      refresh();
      onRejected?.();
    },
    onError: (e: any) => toast.error(e.response?.data?.error?.message ?? 'Gagal menolak'),
  });

  return (
    <div className="bg-amber-50 border border-amber-300 ring-2 ring-amber-100 rounded-xl px-5 py-4 flex items-start gap-3 flex-wrap">
      <Hourglass className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-[240px]">
        <div className="font-semibold text-amber-900">Pengajuan group menunggu persetujuan</div>
        <p className="text-sm text-amber-800 mt-0.5">
          Diajukan {picNama ? <strong>{picNama}</strong> : 'jemaat'} lewat Els App pada{' '}
          {new Date(createdAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}. Sebelum disetujui,
          group tidak tampil di daftar app dan belum bisa menerima anggota.
        </p>
        {!canWrite ? (
          <p className="text-xs text-amber-700 mt-1">Hanya admin dengan akses Group (tulis) yang dapat memproses.</p>
        ) : null}
      </div>
      {canWrite ? (
        <div className="flex gap-2">
          <button
            onClick={() => setRejectOpen(true)}
            className="flex items-center gap-1 px-3 py-1.5 text-sm font-semibold text-red-700 bg-white border border-red-200 hover:bg-red-50 rounded-lg"
          >
            <X className="w-4 h-4" /> Tolak
          </button>
          <button
            onClick={() => approveMut.mutate()}
            disabled={approveMut.isPending}
            className="flex items-center gap-1 px-3 py-1.5 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 rounded-lg disabled:opacity-50"
          >
            {approveMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Setujui
          </button>
        </div>
      ) : null}

      {rejectOpen && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setRejectOpen(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md pointer-events-auto p-6 space-y-3">
              <h3 className="font-semibold text-neutral-900">Tolak pengajuan group &ldquo;{nama}&rdquo;?</h3>
              <p className="text-xs text-neutral-500">Group dinonaktifkan. Alasan dikirim ke pengaju lewat notifikasi app.</p>
              <textarea
                value={alasan}
                onChange={(e) => setAlasan(e.target.value)}
                rows={3}
                maxLength={300}
                placeholder="Alasan penolakan (wajib), mis. sudah ada group serupa di cabang ini"
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-red-400 text-sm"
              />
              <div className="flex justify-end gap-2">
                <button onClick={() => setRejectOpen(false)} className="px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-100 rounded-lg">
                  Batal
                </button>
                <button
                  onClick={() => rejectMut.mutate()}
                  disabled={rejectMut.isPending || alasan.trim().length < 3}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50"
                >
                  {rejectMut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  Tolak pengajuan
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
