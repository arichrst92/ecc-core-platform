'use client';

import { useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  ScanLine,
  X,
  Loader2,
  AlertTriangle,
  Check,
  User as UserIcon,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';

interface CheckinJemaat {
  id: string;
  namaLengkap: string;
  fotoUrl: string | null;
  noHp: string | null;
}

interface CheckinResultData {
  id: string;
  jemaat?: CheckinJemaat;
}

interface CheckinHistoryItem {
  ok: boolean;
  message: string;
  alreadyCheckedIn?: boolean;
  walkIn?: boolean;
  data?: CheckinResultData;
  needsForce?: boolean;
}

interface Props {
  title: string;
  subtitle?: string;
  /** Endpoint POST untuk check-in (mis. `/admin/event/:id/checkin`). */
  endpoint: string;
  /**
   * Extra body fields yang dikirim bersama `kode` + `force` ke endpoint.
   * Mis. untuk ibadah: { tanggalIbadah: 'YYYY-MM-DD' }.
   */
  extraBody?: Record<string, unknown>;
  /**
   * Pesan error yang menandakan butuh `force=true` (akan munculkan banner
   * override). Default match keyword "belum melakukan pembayaran" untuk event.
   */
  forceTrigger?: (errMessage: string) => boolean;
  forceLabel?: string; // label tombol override (default: "Tetap check-in")
  onClose: () => void;
  /** Dipanggil setiap check-in sukses (untuk refresh data). */
  onSuccess?: () => void;
}

export function CheckinModal({
  title,
  subtitle,
  endpoint,
  extraBody,
  forceTrigger,
  forceLabel = 'Tetap check-in',
  onClose,
  onSuccess,
}: Props) {
  const apiBase = process.env.NEXT_PUBLIC_CORE_API_URL ?? '';
  const inputRef = useRef<HTMLInputElement>(null);
  const [kode, setKode] = useState('');
  const [history, setHistory] = useState<CheckinHistoryItem[]>([]);
  const [pendingForce, setPendingForce] = useState<string | null>(null);
  const [pendingForceReason, setPendingForceReason] = useState<string>('');

  function focusInput() {
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  const checkinMut = useMutation({
    mutationFn: async ({ kode, force }: { kode: string; force?: boolean }) => {
      const body = { kode, force: force ?? false, ...(extraBody ?? {}) };
      const res = await apiClient.post<{
        data: CheckinResultData;
        meta?: { alreadyCheckedIn?: boolean; walkIn?: boolean };
      }>(endpoint, body);
      return { data: res.data, kode };
    },
    onSuccess: ({ data, kode }) => {
      const isAlready = data.meta?.alreadyCheckedIn ?? false;
      const walkIn = data.meta?.walkIn ?? false;
      const nama = data.data?.jemaat?.namaLengkap ?? kode;
      const msg = isAlready
        ? `${nama} sudah check-in sebelumnya`
        : walkIn
          ? `${nama} berhasil check-in (walk-in)`
          : `${nama} berhasil check-in`;
      if (isAlready) toast(msg, { icon: 'ℹ️' });
      else toast.success(msg);
      setHistory((h) =>
        [
          {
            ok: true,
            message: msg,
            alreadyCheckedIn: isAlready,
            walkIn,
            data: data.data,
          },
          ...h,
        ].slice(0, 20),
      );
      setKode('');
      setPendingForce(null);
      setPendingForceReason('');
      onSuccess?.();
      focusInput();
    },
    onError: (err: any, vars) => {
      const status = err.response?.status;
      const message = err.response?.data?.error?.message ?? 'Gagal check-in';
      const needsForce =
        status === 409 && (forceTrigger ? forceTrigger(message) : false);
      if (needsForce) {
        setPendingForce(vars.kode);
        setPendingForceReason(message);
      } else {
        setKode('');
      }
      setHistory((h) =>
        [{ ok: false, message, needsForce }, ...h].slice(0, 20),
      );
      toast.error(message);
      focusInput();
    },
  });

  function submit(force?: boolean) {
    const k = (force && pendingForce ? pendingForce : kode).trim().toUpperCase();
    if (!k) return;
    checkinMut.mutate({ kode: k, force });
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg pointer-events-auto flex flex-col max-h-[90vh]">
          <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100">
            <div>
              <h2 className="font-semibold text-neutral-900 flex items-center gap-2">
                <ScanLine className="w-5 h-5 text-green-600" />
                {title}
              </h2>
              {subtitle && <p className="text-xs text-neutral-500 mt-0.5">{subtitle}</p>}
            </div>
            <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-6 space-y-3">
            <label className="block">
              <span className="text-sm font-medium text-neutral-700">
                Scan QR atau ketik kode jemaat
              </span>
              <span className="block text-[11px] text-neutral-500 mb-1">
                Scanner hardware otomatis kirim Enter di akhir kode.
              </span>
              <input
                ref={inputRef}
                value={kode}
                onChange={(e) => setKode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submit(false);
                }}
                autoFocus
                placeholder="ABC23XYZ"
                disabled={checkinMut.isPending}
                className="mt-1 w-full px-4 py-3 border-2 border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 text-lg font-mono uppercase tracking-wider"
              />
            </label>

            {pendingForce && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p>
                      Kode <strong>{pendingForce}</strong>:{' '}
                      {pendingForceReason || 'butuh konfirmasi tambahan'}
                    </p>
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={() => submit(true)}
                        disabled={checkinMut.isPending}
                        className="px-3 py-1.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded"
                      >
                        {forceLabel}
                      </button>
                      <button
                        onClick={() => {
                          setPendingForce(null);
                          setPendingForceReason('');
                          setKode('');
                          focusInput();
                        }}
                        className="px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100 rounded"
                      >
                        Batal
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <button
                onClick={() => submit(false)}
                disabled={!kode.trim() || checkinMut.isPending || !!pendingForce}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 rounded-lg disabled:opacity-50"
              >
                {checkinMut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Check-in
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto border-t border-neutral-100">
            <div className="px-6 py-3 text-xs uppercase tracking-wider text-neutral-500 font-semibold sticky top-0 bg-white border-b border-neutral-100">
              Riwayat sesi ini ({history.length})
            </div>
            {history.length === 0 ? (
              <p className="text-sm text-neutral-400 italic text-center py-6 px-6">
                Belum ada scan.
              </p>
            ) : (
              <div className="divide-y divide-neutral-100">
                {history.map((h, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-3 px-6 py-3 text-sm ${
                      h.ok
                        ? h.alreadyCheckedIn
                          ? 'bg-blue-50/30'
                          : 'bg-green-50/30'
                        : 'bg-red-50/30'
                    }`}
                  >
                    {h.ok && h.data?.jemaat ? (
                      h.data.jemaat.fotoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`${apiBase}${h.data.jemaat.fotoUrl}`}
                          alt={h.data.jemaat.namaLengkap}
                          className="w-9 h-9 rounded-full object-cover shrink-0"
                        />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center shrink-0">
                          <UserIcon className="w-4 h-4" />
                        </div>
                      )
                    ) : (
                      <div
                        className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                          h.ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {h.ok ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-neutral-900 truncate flex items-center gap-1.5">
                        {h.data?.jemaat?.namaLengkap ?? 'Gagal'}
                        {h.walkIn && (
                          <span className="text-[10px] font-semibold uppercase bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">
                            Walk-in
                          </span>
                        )}
                      </div>
                      <div className={`text-xs ${h.ok ? 'text-neutral-500' : 'text-red-600'}`}>
                        {h.message}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 px-6 py-3 border-t border-neutral-100 bg-neutral-50">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 rounded-lg"
            >
              Selesai
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
