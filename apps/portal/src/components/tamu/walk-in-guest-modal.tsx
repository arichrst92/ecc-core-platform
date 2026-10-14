'use client';

/**
 * Catat TAMU walk-in (orang yang datang tanpa daftar) — event.
 * Nama + no HP. Event berbayar: pilih cara bayar (diterima petugas) atau gratis.
 * No HP milik jemaat terdaftar → jemaat itu yang tercatat hadir.
 * API: POST /admin/event/:id/walk-in-guest
 */
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Loader2, UserPlus, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';

type Bayar = 'TUNAI' | 'TRANSFER' | 'QRIS' | 'GRATIS';

export function WalkInGuestModal({
  eventId,
  eventNama,
  tipeBayar,
  nominal,
  onClose,
  onSuccess,
}: {
  eventId: string;
  eventNama: string;
  tipeBayar: 'GRATIS' | 'NOMINAL_TETAP' | 'NOMINAL_BEBAS';
  nominal: string | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const paid = tipeBayar !== 'GRATIS';
  const [nama, setNama] = useState('');
  const [noHp, setNoHp] = useState('');
  const [bayar, setBayar] = useState<Bayar>('TUNAI');
  const [nominalBebas, setNominalBebas] = useState(nominal ? String(Number(nominal)) : '');
  const [quotaFull, setQuotaFull] = useState(false);

  const mut = useMutation({
    mutationFn: async (force: boolean) =>
      (
        await apiClient.post(`/admin/event/${eventId}/walk-in-guest`, {
          nama: nama.trim(),
          noHp: noHp.trim(),
          ...(paid ? { pembayaran: bayar } : {}),
          ...(tipeBayar === 'NOMINAL_BEBAS' && bayar !== 'GRATIS' ? { nominal: Number(nominalBebas) || 0 } : {}),
          ...(force ? { force: true } : {}),
        })
      ).data as { message?: string; meta?: { alreadyCheckedIn?: boolean } },
    onSuccess: (r) => {
      toast.success(r.meta?.alreadyCheckedIn ? 'Sudah tercatat hadir sebelumnya' : (r.message ?? 'Tamu tercatat hadir'));
      onSuccess();
      onClose();
    },
    onError: (e: any) => {
      const code = e.response?.data?.error?.code;
      if (code === 'QUOTA_FULL') {
        setQuotaFull(true);
        return;
      }
      toast.error(e.response?.data?.error?.message ?? 'Gagal mencatat tamu');
    },
  });
  const can = nama.trim().length >= 2 && noHp.trim().length >= 8;
  const inputCls = 'mt-1 w-full px-3 py-2 border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500 text-sm';

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md pointer-events-auto">
          <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100">
            <h2 className="font-semibold text-neutral-900 flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-violet-600" /> Tamu Walk-in
            </h2>
            <button onClick={onClose} className="p-1 hover:bg-neutral-100 rounded">
              <X className="w-4 h-4 text-neutral-500" />
            </button>
          </div>
          <div className="p-6 space-y-4">
            <p className="text-xs text-neutral-500">
              Untuk orang yang datang ke <strong>{eventNama}</strong> tanpa mendaftar. Tamu langsung tercatat hadir. Kalau no HP-nya
              ternyata milik jemaat terdaftar, jemaat itu yang dicatat.
            </p>
            <label className="block">
              <span className="text-sm font-medium text-neutral-700">Nama</span>
              <input value={nama} onChange={(e) => setNama(e.target.value)} className={inputCls} placeholder="Nama lengkap tamu" />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-neutral-700">No HP</span>
              <input
                value={noHp}
                onChange={(e) => setNoHp(e.target.value)}
                className={inputCls}
                placeholder="08xx atau +65…"
                inputMode="tel"
              />
            </label>
            {paid ? (
              <div>
                <span className="text-sm font-medium text-neutral-700">Pembayaran</span>
                <div className="mt-1 grid grid-cols-4 gap-2">
                  {(['TUNAI', 'TRANSFER', 'QRIS', 'GRATIS'] as Bayar[]).map((b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => setBayar(b)}
                      className={`px-2 py-1.5 rounded-lg text-xs font-semibold border ${
                        bayar === b ? 'bg-brand-500 text-white border-brand-500' : 'bg-white text-neutral-700 border-neutral-300'
                      }`}
                    >
                      {b === 'GRATIS' ? 'Gratis' : b === 'TUNAI' ? 'Tunai' : b === 'TRANSFER' ? 'Transfer' : 'QRIS'}
                    </button>
                  ))}
                </div>
                {tipeBayar === 'NOMINAL_BEBAS' && bayar !== 'GRATIS' ? (
                  <input
                    value={nominalBebas}
                    onChange={(e) => setNominalBebas(e.target.value.replace(/\D/g, ''))}
                    className={inputCls}
                    placeholder="Nominal diterima"
                    inputMode="numeric"
                  />
                ) : tipeBayar === 'NOMINAL_TETAP' && bayar !== 'GRATIS' ? (
                  <p className="text-xs text-neutral-500 mt-1">
                    Diterima petugas: Rp {Number(nominal ?? 0).toLocaleString('id-ID')}
                  </p>
                ) : null}
              </div>
            ) : null}
            {quotaFull ? (
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900">
                Kuota peserta sudah penuh. Tetap masukkan tamu ini?
              </div>
            ) : null}
          </div>
          <div className="flex justify-end gap-2 px-6 py-4 border-t border-neutral-100 bg-neutral-50">
            <button onClick={onClose} className="px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-100 rounded-lg">
              Batal
            </button>
            <button
              onClick={() => mut.mutate(quotaFull)}
              disabled={!can || mut.isPending}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-violet-600 hover:bg-violet-700 rounded-lg disabled:opacity-50"
            >
              {mut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {quotaFull ? 'Tetap masukkan' : 'Catat hadir'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
