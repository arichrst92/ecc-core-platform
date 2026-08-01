'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Award,
  Loader2,
  Search,
  Plus,
  Minus,
  AlertTriangle,
  RotateCcw,
  User,
  ScanLine,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';
import { useCabangStore } from '@/lib/cabang-store';
import { Header, AuthGuard } from '@/components/header';
import { QrScannerModal } from '@/components/qr-scanner';

interface JemaatFound {
  jemaat: {
    id: string;
    namaLengkap: string;
    noHp: string | null;
    fotoUrl: string | null;
    cabang: { nama: string };
  };
  cabangId: string;
  balance: number;
  lastUpdate: string | null;
}

export default function AdjustPointPage() {
  return (
    <AuthGuard>
      <Header />
      <AdjustPointContent />
    </AuthGuard>
  );
}

function AdjustPointContent() {
  const { cabangId, cabangNama } = useCabangStore();
  const qc = useQueryClient();

  // Step state
  const [kode, setKode] = useState('');
  const [jemaatFound, setJemaatFound] = useState<JemaatFound | null>(null);
  const [amountInput, setAmountInput] = useState('');
  const [note, setNote] = useState('');
  const [direction, setDirection] = useState<'add' | 'deduct'>('add');
  const [scannerOpen, setScannerOpen] = useState(false);

  const lookupMut = useMutation({
    mutationFn: async () => {
      const res = await apiClient.get('/admin/gift-stall/lookup-jemaat', {
        params: { kode: kode.trim().toUpperCase(), cabangId },
      });
      return res.data.data as JemaatFound;
    },
    onSuccess: (data) => setJemaatFound(data),
    onError: (e: any) => {
      setJemaatFound(null);
      toast.error(e.response?.data?.error?.message ?? 'Jemaat tidak ditemukan');
    },
  });

  const adjustMut = useMutation({
    mutationFn: async () => {
      const raw = Number(amountInput);
      const signed = direction === 'add' ? Math.abs(raw) : -Math.abs(raw);
      const res = await apiClient.post('/admin/gift-stall/adjust-point', {
        jemaatId: jemaatFound!.jemaat.id,
        cabangId: cabangId!,
        amount: signed,
        note: note.trim(),
      });
      return res.data.data;
    },
    onSuccess: (data) => {
      const newBalance = data?.balance?.balance ?? 0;
      toast.success(
        `Point ${direction === 'add' ? '+' : '-'}${Math.abs(Number(amountInput)).toLocaleString('id-ID')}. Balance baru: ${newBalance.toLocaleString('id-ID')}`,
      );
      qc.invalidateQueries({ queryKey: ['gift-stall'] });
      resetAll();
    },
    onError: (e: any) => toast.error(e.response?.data?.error?.message ?? 'Gagal adjust'),
  });

  function resetAll() {
    setKode('');
    setJemaatFound(null);
    setAmountInput('');
    setNote('');
    setDirection('add');
  }

  function resetJemaat() {
    setJemaatFound(null);
    setKode('');
    setAmountInput('');
    setNote('');
  }

  if (!cabangId) {
    return (
      <main className="max-w-md mx-auto p-8 text-center">
        <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto" />
        <h2 className="text-lg font-bold mt-3">Pilih cabang dulu</h2>
        <p className="text-sm text-neutral-500">Header → cabang selector.</p>
      </main>
    );
  }

  const amountNum = Number(amountInput);
  const validAmount = amountNum > 0 && amountNum <= 100_000;
  const validNote = note.trim().length >= 1;
  const projectedBalance = jemaatFound
    ? direction === 'add'
      ? jemaatFound.balance + amountNum
      : jemaatFound.balance - amountNum
    : 0;
  const negativeWarn = jemaatFound && direction === 'deduct' && projectedBalance < 0;

  return (
    <main className="max-w-lg mx-auto p-3 sm:p-4">
      <div className="mb-4">
        <h1 className="text-lg sm:text-xl font-bold text-neutral-900 flex items-center gap-2">
          <Award className="w-5 h-5 text-brand-500" /> Adjust Point Manual
        </h1>
        <p className="text-xs sm:text-sm text-neutral-500">
          {cabangNama} · Scan QR anak → input point tambah/kurang → submit.
        </p>
      </div>

      {/* STEP 1 — Lookup jemaat */}
      {!jemaatFound ? (
        <div className="bg-white border border-neutral-200 rounded-xl p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">
              Kode jemaat anak
            </label>
            <div className="flex gap-2">
              <div className="flex items-center gap-2 flex-1 border border-neutral-300 rounded-lg px-3">
                <Search className="w-4 h-4 text-neutral-400" />
                <input
                  type="text"
                  value={kode}
                  onChange={(e) => setKode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => e.key === 'Enter' && kode.trim() && lookupMut.mutate()}
                  placeholder="ABCD1234"
                  autoFocus
                  className="flex-1 py-3 outline-none text-lg font-mono tracking-widest"
                  maxLength={20}
                />
              </div>
              <button
                onClick={() => setScannerOpen(true)}
                className="px-4 py-3 bg-kids-500 text-white text-sm font-semibold rounded-lg hover:bg-kids-600 flex items-center gap-1.5"
                title="Buka camera untuk scan QR"
              >
                <ScanLine className="w-4 h-4" /> Scan
              </button>
              <button
                onClick={() => lookupMut.mutate()}
                disabled={!kode.trim() || lookupMut.isPending}
                className="px-5 py-3 bg-brand-500 text-white text-sm font-semibold rounded-lg hover:bg-brand-600 disabled:opacity-50"
              >
                {lookupMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Cari'}
              </button>
            </div>
            <p className="text-xs text-neutral-500 mt-2">
              Tekan <strong>Scan</strong> untuk pakai kamera atau ketik manual + tekan Enter.
            </p>
          </div>

          {scannerOpen && (
            <QrScannerModal
              title="Scan QR Anak"
              hint="Arahkan kamera ke QR code jemaat"
              onClose={() => setScannerOpen(false)}
              onScan={(scanned) => {
                setKode(scanned);
                setScannerOpen(false);
                // Auto-fire lookup setelah scan sukses
                setTimeout(() => lookupMut.mutate(), 100);
              }}
            />
          )}
        </div>
      ) : (
        /* STEP 2 — Show jemaat + input amount */
        <div className="space-y-4">
          {/* Jemaat info card */}
          <div className="bg-white border border-neutral-200 rounded-xl p-4">
            <div className="flex items-center gap-3">
              {jemaatFound.jemaat.fotoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={jemaatFound.jemaat.fotoUrl}
                  alt=""
                  className="w-14 h-14 rounded-full object-cover"
                />
              ) : (
                <div className="w-14 h-14 rounded-full bg-neutral-200 flex items-center justify-center">
                  <User className="w-6 h-6 text-neutral-500" />
                </div>
              )}
              <div className="flex-1">
                <div className="font-bold text-lg text-neutral-900">
                  {jemaatFound.jemaat.namaLengkap}
                </div>
                <div className="text-xs text-neutral-500">
                  {jemaatFound.jemaat.cabang?.nama} · {jemaatFound.jemaat.noHp ?? '-'}
                </div>
              </div>
              <button
                onClick={resetJemaat}
                className="p-2 text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 rounded"
                title="Reset — cari jemaat lain"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
            <div className="mt-3 pt-3 border-t border-neutral-100 text-center">
              <div className="text-xs text-neutral-500">Balance saat ini</div>
              <div className="text-3xl font-bold text-brand-600">
                {jemaatFound.balance.toLocaleString('id-ID')} pts
              </div>
            </div>
          </div>

          {/* Direction + amount input */}
          <div className="bg-white border border-neutral-200 rounded-xl p-5 space-y-4">
            {/* Direction toggle */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setDirection('add')}
                className={`flex items-center justify-center gap-2 py-3 rounded-lg font-semibold border-2 transition ${
                  direction === 'add'
                    ? 'bg-green-500 text-white border-green-500'
                    : 'bg-white text-neutral-600 border-neutral-300 hover:border-green-300'
                }`}
              >
                <Plus className="w-5 h-5" /> Tambah
              </button>
              <button
                onClick={() => setDirection('deduct')}
                className={`flex items-center justify-center gap-2 py-3 rounded-lg font-semibold border-2 transition ${
                  direction === 'deduct'
                    ? 'bg-red-500 text-white border-red-500'
                    : 'bg-white text-neutral-600 border-neutral-300 hover:border-red-300'
                }`}
              >
                <Minus className="w-5 h-5" /> Kurangi
              </button>
            </div>

            {/* Amount input */}
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">
                Jumlah Point
              </label>
              <input
                type="number"
                min="1"
                max="100000"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                onKeyDown={(e) =>
                  e.key === 'Enter' && validAmount && validNote && adjustMut.mutate()
                }
                autoFocus
                placeholder="10"
                className={`w-full px-3 py-4 border-2 rounded-lg text-center text-3xl font-mono font-bold ${
                  direction === 'add' ? 'text-green-600 border-green-200' : 'text-red-600 border-red-200'
                }`}
              />
              {validAmount && (
                <p className="text-xs text-neutral-500 mt-1 text-center">
                  Balance: {jemaatFound.balance.toLocaleString('id-ID')} →{' '}
                  <strong className={negativeWarn ? 'text-red-600' : ''}>
                    {projectedBalance.toLocaleString('id-ID')}
                  </strong>
                </p>
              )}
              {negativeWarn && (
                <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2 mt-2 flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  Balance akan jadi negatif. Konfirmasi ini betul dimaksud (audit log akan
                  tercatat).
                </p>
              )}
            </div>

            {/* Note wajib */}
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">
                Alasan (wajib) *
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="mis. bonus juara mewarnai, koreksi input salah, dsb"
                rows={2}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-500"
                maxLength={500}
                required
              />
              <p className="text-[10px] text-neutral-400 mt-1">
                Note akan tercatat di audit log — untuk transparansi accountability.
              </p>
            </div>

            <button
              onClick={() => adjustMut.mutate()}
              disabled={!validAmount || !validNote || adjustMut.isPending}
              className={`w-full py-3 text-white font-bold text-lg rounded-lg disabled:opacity-50 flex items-center justify-center gap-2 ${
                direction === 'add'
                  ? 'bg-green-500 hover:bg-green-600'
                  : 'bg-red-500 hover:bg-red-600'
              }`}
            >
              {adjustMut.isPending && <Loader2 className="w-5 h-5 animate-spin" />}
              {direction === 'add' ? (
                <>
                  <Plus className="w-5 h-5" /> Tambah {amountInput || '0'} pts
                </>
              ) : (
                <>
                  <Minus className="w-5 h-5" /> Kurangi {amountInput || '0'} pts
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
