'use client';

/**
 * Hapus data pribadi permanen atas permintaan jemaat (Kebijakan Privasi
 * Bag. 10 · kepatuhan no. 5). Nama, kontak, foto, catatan, sertifikat dan
 * bukti transfer dihapus; angka kehadiran historis tetap.
 */
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ShieldX, Loader2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';

const CONFIRM = 'HAPUS PERMANEN';

export function PurgePersonalDataButton({ jemaatId, nama }: { jemaatId: string; nama: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [confirmText, setConfirmText] = useState('');

  const m = useMutation({
    mutationFn: () => apiClient.post(`/admin/jemaat/${jemaatId}/purge`, { confirmText, reason }),
    onSuccess: () => {
      toast.success('Data pribadi sudah dihapus permanen.');
      setOpen(false);
      qc.invalidateQueries({ queryKey: ['jemaat'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message ?? 'Gagal menghapus data'),
  });

  const ok = confirmText === CONFIRM && reason.trim().length >= 3;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 rounded-lg border border-red-200"
        title="Atas permintaan jemaat (hak hapus data)"
      >
        <ShieldX className="w-4 h-4" />
        Hapus data permanen
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-xl max-w-md w-full p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <h2 className="text-lg font-bold text-neutral-900">Hapus data pribadi permanen</h2>
              <button onClick={() => setOpen(false)} className="text-neutral-400 hover:text-neutral-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-neutral-600">
              Gunakan hanya atas <b>permintaan {nama}</b> (hak hapus data). Nama, nomor HP, email, alamat, tanggal lahir,
              foto, catatan doa, sertifikat, relasi keluarga dan bukti transfer akan <b>dihapus dan tidak bisa dikembalikan</b>.
              Angka kehadiran historis tetap ada tanpa nama. Akun langsung nonaktif.
            </p>
            <label className="block text-xs font-medium text-neutral-600">
              Alasan / rujukan permintaan
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="mis. Email ke privacy@ tgl 29/10/2026"
                className="mt-1 w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-xs font-medium text-neutral-600">
              Ketik <b>{CONFIRM}</b> untuk konfirmasi
              <input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                className="mt-1 w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm font-mono"
              />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setOpen(false)} className="px-3 py-2 text-sm rounded-lg hover:bg-neutral-100">
                Batal
              </button>
              <button
                disabled={!ok || m.isPending}
                onClick={() => m.mutate()}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg bg-red-600 text-white disabled:opacity-40"
              >
                {m.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Hapus permanen
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
