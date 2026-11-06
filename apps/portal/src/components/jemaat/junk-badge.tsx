'use client';

/**
 * Penanda di kolom nama daftar Jemaat:
 *  - "Shiftsoft" / "Keluarga" = sumber data (konteks).
 *  - "Perlu dicek" = potensial junk data; arahkan kursor untuk alasan,
 *    tombol "Bukan junk" supaya tidak ditandai lagi (juga dilewati sync Shiftsoft).
 */
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';

export interface JunkReason {
  kode: string;
  label: string;
}

export function JunkBadge({ id, junk, sumber }: { id: string; junk?: JunkReason[]; sumber?: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const dismiss = useMutation({
    mutationFn: async () => apiClient.post(`/admin/jemaat/${id}/bukan-junk`),
    onSuccess: () => {
      toast.success('Ditandai "Bukan junk"');
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ['jemaat'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.error?.message ?? 'Gagal menyimpan'),
  });
  const hasJunk = !!junk?.length;
  if (!hasJunk && sumber !== 'SHIFTSOFT' && sumber !== 'KELUARGA') return null;
  return (
    <div className="flex flex-wrap items-center gap-1 mt-0.5 pl-9">
      {sumber === 'SHIFTSOFT' ? (
        <span className="px-1.5 py-px rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700" title="Data hasil impor/sync Shiftsoft">
          Shiftsoft
        </span>
      ) : sumber === 'KELUARGA' ? (
        <span className="px-1.5 py-px rounded text-[10px] font-semibold bg-sky-50 text-sky-700" title="Didaftarkan oleh anggota keluarga">
          Keluarga
        </span>
      ) : null}
      {hasJunk ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setOpen((x) => !x);
          }}
          title={junk!.map((j) => `• ${j.label}`).join('\n')}
          className="inline-flex items-center gap-1 px-1.5 py-px rounded text-[10px] font-semibold bg-amber-100 text-amber-800 hover:bg-amber-200"
        >
          <AlertTriangle className="w-3 h-3" /> Perlu dicek ({junk!.length})
        </button>
      ) : null}
      {open && hasJunk && typeof document !== 'undefined' ? createPortal(
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/30" onClick={(e) => { e.stopPropagation(); setOpen(false); }}>
        <div
          className="w-full max-w-xs bg-white border border-neutral-200 rounded-xl shadow-xl p-4 text-xs"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="font-semibold text-neutral-800 mb-1">Potensial junk data</div>
          <ul className="list-disc pl-4 space-y-0.5 text-neutral-700">
            {junk!.map((j) => (
              <li key={j.kode}>{j.label}</li>
            ))}
          </ul>
          <div className="text-neutral-500 mt-2">Tinjau datanya. Bila datanya benar, tandai “Bukan junk”. Bila sampah, nonaktifkan dari halaman detail.</div>
          <div className="flex justify-end gap-2 mt-2">
            <button onClick={() => setOpen(false)} className="px-2 py-1 rounded hover:bg-neutral-100">
              Tutup
            </button>
            <button
              onClick={() => dismiss.mutate()}
              disabled={dismiss.isPending}
              className="inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-semibold disabled:opacity-50"
            >
              {dismiss.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Bukan junk
            </button>
          </div>
        </div>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}
