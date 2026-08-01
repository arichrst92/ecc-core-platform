'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Loader2,
  Search,
  ScanLine,
  LogIn,
  LogOut,
  Baby,
  Info,
  CheckCircle2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';
import { Header, AuthGuard } from '@/components/header';
import { QrScannerModal } from '@/components/qr-scanner';

type Mode = 'checkin' | 'checkout' | 'pickup';

const MODE_META: Record<Mode, {
  label: string;
  desc: string;
  color: string; // tailwind color base (e.g. 'brand', 'amber')
  buttonBg: string;
  Icon: typeof LogIn;
  placeholder: string;
  inputLabel: string;
  cta: string;
}> = {
  checkin: {
    label: 'Check-in Ibadah',
    desc: 'Scan kode reservasi jemaat saat masuk ibadah.',
    color: 'green',
    buttonBg: 'bg-green-600 hover:bg-green-700',
    Icon: LogIn,
    placeholder: 'R7K2X9P',
    inputLabel: 'Kode reservasi',
    cta: 'Check-in',
  },
  checkout: {
    label: 'Checkout Ibadah',
    desc: 'Scan kode reservasi jemaat saat keluar (kalau ibadah requiresCheckout=true).',
    color: 'amber',
    buttonBg: 'bg-amber-600 hover:bg-amber-700',
    Icon: LogOut,
    placeholder: 'R7K2X9P',
    inputLabel: 'Kode reservasi',
    cta: 'Checkout',
  },
  pickup: {
    label: 'Pickup Anak',
    desc: 'Input 6-digit kode jemput dari parent (untuk ibadah anak).',
    color: 'kids',
    buttonBg: 'bg-kids-500 hover:bg-kids-600',
    Icon: Baby,
    placeholder: '123456',
    inputLabel: 'Kode jemput (6 digit)',
    cta: 'Verify Pickup',
  },
};

export default function IbadahScannerPage() {
  return (
    <AuthGuard>
      <Header />
      <IbadahScannerContent />
    </AuthGuard>
  );
}

function IbadahScannerContent() {
  const qc = useQueryClient();
  const [mode, setMode] = useState<Mode>('checkin');
  const [kode, setKode] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [lastResult, setLastResult] = useState<{ok: boolean; msg: string; data?: any} | null>(null);

  const meta = MODE_META[mode];

  const submitMut = useMutation({
    mutationFn: async () => {
      const cleaned = kode.trim().toUpperCase();
      if (mode === 'checkin') {
        const res = await apiClient.post('/admin/reservasi/checkin', { kode: cleaned });
        return res.data;
      }
      if (mode === 'checkout') {
        const res = await apiClient.post('/admin/reservasi/checkout', { kode: cleaned });
        return res.data;
      }
      // pickup
      const res = await apiClient.post('/admin/reservasi/pickup', {
        pickupCode: kode.trim(),
      });
      return res.data;
    },
    onSuccess: (data) => {
      const msg = data.message ?? `${meta.cta} berhasil`;
      toast.success(msg);
      setLastResult({ ok: true, msg, data: data.data });
      setKode('');
      qc.invalidateQueries({ queryKey: ['kehadiran'] });
    },
    onError: (err: any) => {
      const msg = err.response?.data?.error?.message ?? `Gagal ${meta.cta.toLowerCase()}`;
      toast.error(msg);
      setLastResult({ ok: false, msg });
    },
  });

  function handleModeChange(m: Mode) {
    setMode(m);
    setKode('');
    setLastResult(null);
  }

  const inputMaxLen = mode === 'pickup' ? 6 : 20;
  const inputType = mode === 'pickup' ? 'text' : 'text';
  const validInput = mode === 'pickup' ? /^\d{6}$/.test(kode.trim()) : kode.trim().length >= 4;

  return (
    <main className="max-w-lg mx-auto p-3 sm:p-4">
      <div className="mb-4">
        <h1 className="text-xl font-bold text-neutral-900 flex items-center gap-2">
          <ScanLine className="w-5 h-5 text-neutral-700" /> Scanner Ibadah
        </h1>
        <p className="text-sm text-neutral-500 mt-1">
          Check-in, checkout, atau pickup anak — pilih mode di bawah, scan/input kode, submit.
        </p>
      </div>

      {/* Mode selector — 3 button */}
      <div className="grid grid-cols-3 gap-1.5 mb-4">
        {(Object.keys(MODE_META) as Mode[]).map((m) => {
          const mm = MODE_META[m];
          const active = mode === m;
          const Icon = mm.Icon;
          return (
            <button
              key={m}
              onClick={() => handleModeChange(m)}
              className={`flex flex-col items-center gap-1 py-3 rounded-lg font-semibold text-xs sm:text-sm border-2 transition ${
                active
                  ? `${mm.buttonBg} text-white border-transparent`
                  : 'bg-white text-neutral-600 border-neutral-200 hover:border-neutral-400'
              }`}
            >
              <Icon className="w-5 h-5" />
              {mm.label.split(' ')[0]}
            </button>
          );
        })}
      </div>

      {/* Info card */}
      <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-3 mb-4 flex items-start gap-2 text-xs text-neutral-600">
        <Info className="w-4 h-4 mt-0.5 shrink-0 text-neutral-500" />
        <span>{meta.desc}</span>
      </div>

      {/* Input + scanner */}
      <div className="bg-white border border-neutral-200 rounded-xl p-4 sm:p-5 space-y-4">
        <div>
          <label className="block text-xs font-medium text-neutral-600 mb-1">
            {meta.inputLabel}
          </label>
          <div className="flex gap-2">
            <div className="flex items-center gap-2 flex-1 border border-neutral-300 rounded-lg px-3">
              <Search className="w-4 h-4 text-neutral-400 shrink-0" />
              <input
                type={inputType}
                inputMode={mode === 'pickup' ? 'numeric' : 'text'}
                value={kode}
                onChange={(e) => {
                  const v = mode === 'pickup'
                    ? e.target.value.replace(/\D/g, '').slice(0, 6)
                    : e.target.value.toUpperCase();
                  setKode(v);
                }}
                onKeyDown={(e) => e.key === 'Enter' && validInput && submitMut.mutate()}
                placeholder={meta.placeholder}
                autoFocus
                className="flex-1 py-3 outline-none text-lg font-mono tracking-widest bg-transparent min-w-0"
                style={{ fontSize: '18px' }}
                maxLength={inputMaxLen}
              />
            </div>
            {/* Scanner cuma untuk checkin/checkout (QR reservasi). Pickup pakai
                6-digit numeric — biasanya parent ketik / dictate, no QR. */}
            {mode !== 'pickup' && (
              <button
                onClick={() => setScannerOpen(true)}
                className="px-3 py-2 bg-neutral-800 text-white text-sm rounded-lg flex items-center gap-1"
                title="Buka camera QR scanner"
              >
                <ScanLine className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        <button
          onClick={() => submitMut.mutate()}
          disabled={!validInput || submitMut.isPending}
          className={`w-full py-3 text-white font-semibold rounded-lg disabled:opacity-50 flex items-center justify-center gap-2 ${meta.buttonBg}`}
        >
          {submitMut.isPending ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <meta.Icon className="w-5 h-5" />
          )}
          {meta.cta}
        </button>
      </div>

      {/* Last result */}
      {lastResult && (
        <div
          className={`mt-4 rounded-lg p-4 border ${
            lastResult.ok
              ? 'bg-green-50 border-green-200 text-green-900'
              : 'bg-red-50 border-red-200 text-red-900'
          }`}
        >
          <div className="flex items-start gap-2">
            <CheckCircle2 className={`w-5 h-5 mt-0.5 ${lastResult.ok ? '' : 'hidden'}`} />
            <div className="flex-1 text-sm">
              <div className="font-semibold">
                {lastResult.ok ? 'Sukses' : 'Gagal'}
              </div>
              <div className="mt-0.5">{lastResult.msg}</div>
              {lastResult.data?.anak?.namaLengkap && (
                <div className="mt-2 pt-2 border-t border-current/20 text-xs">
                  Anak: <strong>{lastResult.data.anak.namaLengkap}</strong>
                  {lastResult.data.ibadahNama && ` · ${lastResult.data.ibadahNama}`}
                </div>
              )}
              {lastResult.data?.jemaat?.namaLengkap && !lastResult.data?.anak && (
                <div className="mt-2 pt-2 border-t border-current/20 text-xs">
                  Jemaat: <strong>{lastResult.data.jemaat.namaLengkap}</strong>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {scannerOpen && (
        <QrScannerModal
          title={meta.label}
          hint="Arahkan kamera ke QR reservasi jemaat"
          onClose={() => setScannerOpen(false)}
          onScan={(scanned) => {
            setKode(scanned);
            setScannerOpen(false);
            setTimeout(() => submitMut.mutate(), 100);
          }}
        />
      )}
    </main>
  );
}
