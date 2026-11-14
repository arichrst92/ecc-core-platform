'use client';

/**
 * "Duplicate from" — salin event jadi DRAFT (belum publish) lalu buka
 * detailnya untuk diubah admin. Backend: POST /admin/event/:id/duplicate.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CopyPlus, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';

export function DuplicateEventButton({
  eventId,
  judul,
  variant = 'link',
}: {
  eventId: string;
  judul: string;
  variant?: 'link' | 'button';
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const mut = useMutation({
    mutationFn: async () => (await apiClient.post<{ data: { id: string; judul: string } }>(`/admin/event/${eventId}/duplicate`)).data.data,
    onSuccess: (ev) => {
      qc.invalidateQueries({ queryKey: ['event', 'list'] });
      toast.success(`"${ev.judul}" dibuat sebagai draft — silakan ubah lalu publish.`, { duration: 5000 });
      setConfirming(false);
      router.push(`/dashboard/event/${ev.id}`);
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message ?? 'Gagal menduplikat event'),
  });

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className={
          variant === 'button'
            ? 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-300 text-sm font-medium text-neutral-700 hover:bg-neutral-50'
            : 'flex items-center gap-1 px-2 py-1 rounded text-neutral-600 hover:bg-neutral-100'
        }
        title="Duplikat event ini sebagai draft"
      >
        <CopyPlus className={variant === 'button' ? 'w-4 h-4' : 'w-3.5 h-3.5'} />
        Duplikat
      </button>

      {confirming && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" onClick={() => !mut.isPending && setConfirming(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md pointer-events-auto">
              <div className="px-6 py-4 border-b border-neutral-100">
                <h2 className="font-semibold text-neutral-900 flex items-center gap-2">
                  <CopyPlus className="w-5 h-5 text-brand-500" /> Duplikat event
                </h2>
              </div>
              <div className="p-6 text-sm text-neutral-700 space-y-3">
                <p>
                  Buat salinan dari <b>{judul}</b>?
                </p>
                <ul className="list-disc pl-5 space-y-1 text-neutral-600">
                  <li>Semua isi & pengaturan disalin persis (tanggal, lokasi, biaya, kuota, gambar, syarat role, pelayanan & petugas).</li>
                  <li>Salinan berstatus <b>Draft (belum publish)</b> dengan judul berakhiran “(Salinan)”.</li>
                  <li>Peserta, donasi, dan statistik tidak ikut disalin.</li>
                </ul>
              </div>
              <div className="flex justify-end gap-2 px-6 py-4 border-t border-neutral-100 bg-neutral-50 rounded-b-2xl">
                <button
                  onClick={() => setConfirming(false)}
                  disabled={mut.isPending}
                  className="px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 rounded-lg"
                >
                  Batal
                </button>
                <button
                  onClick={() => mut.mutate()}
                  disabled={mut.isPending}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-lg disabled:opacity-50"
                >
                  {mut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  Buat salinan
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
