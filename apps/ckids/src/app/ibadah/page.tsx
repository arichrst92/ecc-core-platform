'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Loader2,
  Search,
  ScanLine,
  LogIn,
  LogOut,
  Baby,
  Info,
  CheckCircle2,
  Calendar,
  User,
  X,
  Settings2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';
import { useCabangStore } from '@/lib/cabang-store';
import { useIbadahContextStore } from '@/lib/ibadah-context-store';
import { Header, AuthGuard } from '@/components/header';
import { QrScannerModal } from '@/components/qr-scanner';

type Mode = 'checkin' | 'checkout' | 'pickup';

interface IbadahItem {
  id: string;
  nama: string;
  jamMulai: string;
  jamSelesai: string;
  isKidsIbadah: boolean;
  requiresCheckout: boolean;
  cabangId: string;
}
interface JemaatSearchItem {
  id: string;
  namaLengkap: string;
  noHp: string | null;
  kode: string | null;
  fotoUrl: string | null;
}

const MODE_META: Record<Mode, { label: string; color: string; Icon: typeof LogIn }> = {
  checkin: { label: 'Check-in', color: 'bg-green-600 hover:bg-green-700', Icon: LogIn },
  checkout: { label: 'Checkout', color: 'bg-amber-600 hover:bg-amber-700', Icon: LogOut },
  pickup: { label: 'Pickup', color: 'bg-kids-500 hover:bg-kids-600', Icon: Baby },
};

export default function IbadahScannerPage() {
  return (
    <AuthGuard>
      <Header />
      <ScannerContent />
    </AuthGuard>
  );
}

function ScannerContent() {
  const { cabangId } = useCabangStore();
  const ctx = useIbadahContextStore();
  const [mode, setMode] = useState<Mode>('checkin');
  const [contextOpen, setContextOpen] = useState(!ctx.ibadahId);

  // Auto-detect: kalau context tersimpan tapi cabang berubah, reset
  useEffect(() => {
    if (ctx.ibadahId && cabangId) {
      // Just show current context — nothing to do
    }
  }, [ctx.ibadahId, cabangId]);

  if (!cabangId) {
    return (
      <main className="max-w-lg mx-auto p-6 text-center text-neutral-500">
        Pilih cabang dulu di header.
      </main>
    );
  }

  return (
    <main className="max-w-lg mx-auto p-3 sm:p-4">
      <div className="mb-3">
        <h1 className="text-lg sm:text-xl font-bold text-neutral-900 flex items-center gap-2">
          <ScanLine className="w-5 h-5" /> Scanner Ibadah
        </h1>
      </div>

      {/* IBADAH CONTEXT */}
      {contextOpen || !ctx.ibadahId ? (
        <IbadahPicker
          cabangId={cabangId}
          onSelected={() => setContextOpen(false)}
        />
      ) : (
        <div className="bg-white border border-neutral-200 rounded-xl p-3 sm:p-4 mb-4 flex items-center gap-3">
          <Calendar className="w-5 h-5 text-brand-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-neutral-900 truncate">{ctx.ibadahNama}</div>
            <div className="text-xs text-neutral-500">
              {ctx.tanggalIbadah}
              {ctx.isKidsIbadah && ' · 🧒 Kids'}
              {ctx.requiresCheckout && ' · Wajib checkout'}
            </div>
          </div>
          <button
            onClick={() => setContextOpen(true)}
            className="p-1.5 text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 rounded"
            title="Ganti ibadah"
          >
            <Settings2 className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Mode toggle — hide kalau belum pilih context */}
      {ctx.ibadahId && !contextOpen && (
        <>
          <div className="grid grid-cols-3 gap-1.5 mb-3">
            {(Object.keys(MODE_META) as Mode[]).map((m) => {
              const mm = MODE_META[m];
              const active = mode === m;
              const Icon = mm.Icon;
              const disabled =
                (m === 'checkout' && !ctx.requiresCheckout) ||
                (m === 'pickup' && !ctx.isKidsIbadah);
              return (
                <button
                  key={m}
                  onClick={() => !disabled && setMode(m)}
                  disabled={disabled}
                  className={`flex flex-col items-center gap-1 py-3 rounded-lg font-semibold text-xs sm:text-sm border-2 transition ${
                    disabled
                      ? 'bg-neutral-50 text-neutral-300 border-neutral-100 cursor-not-allowed'
                      : active
                        ? `${mm.color} text-white border-transparent`
                        : 'bg-white text-neutral-600 border-neutral-200 hover:border-neutral-400'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  {mm.label}
                </button>
              );
            })}
          </div>

          <JemaatSelector
            cabangId={cabangId}
            mode={mode}
            ibadahContext={ctx}
          />
        </>
      )}
    </main>
  );
}

// ============================================================
//  Ibadah Picker — pilih ibadah + tanggal
// ============================================================
function IbadahPicker({
  cabangId,
  onSelected,
}: {
  cabangId: string;
  onSelected: () => void;
}) {
  const setContext = useIbadahContextStore((s) => s.setContext);
  const [tanggal, setTanggal] = useState(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });

  const ibadahQ = useQuery({
    queryKey: ['ibadah', 'active', cabangId],
    queryFn: async () => {
      const res = await apiClient.get<{ data: IbadahItem[] }>('/admin/ibadah', {
        params: { cabangId, limit: 50, sortBy: 'nama', sortOrder: 'asc' },
      });
      return res.data.data;
    },
  });

  return (
    <div className="bg-white border border-neutral-200 rounded-xl p-4 mb-4 space-y-3">
      <div>
        <label className="block text-xs font-medium text-neutral-600 mb-1">
          Tanggal Ibadah
        </label>
        <input
          type="date"
          value={tanggal}
          onChange={(e) => setTanggal(e.target.value)}
          className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-neutral-600 mb-1">
          Pilih Ibadah
        </label>
        {ibadahQ.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-neutral-500 py-3">
            <Loader2 className="w-4 h-4 animate-spin" /> Memuat...
          </div>
        ) : (
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {(ibadahQ.data ?? []).map((ib) => (
              <button
                key={ib.id}
                onClick={() => {
                  setContext({
                    ibadahId: ib.id,
                    ibadahNama: ib.nama,
                    isKidsIbadah: ib.isKidsIbadah,
                    requiresCheckout: ib.requiresCheckout,
                    tanggalIbadah: tanggal,
                  });
                  onSelected();
                }}
                className="w-full text-left p-3 border border-neutral-200 rounded-lg hover:border-brand-400 hover:bg-brand-50"
              >
                <div className="font-medium text-sm text-neutral-900">{ib.nama}</div>
                <div className="text-xs text-neutral-500 flex items-center gap-2 mt-0.5">
                  <span>
                    {ib.jamMulai} - {ib.jamSelesai}
                  </span>
                  {ib.isKidsIbadah && (
                    <span className="bg-kids-100 text-kids-700 px-1.5 rounded">🧒 Kids</span>
                  )}
                  {ib.requiresCheckout && (
                    <span className="bg-amber-100 text-amber-700 px-1.5 rounded">
                      Checkout wajib
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
//  Jemaat selector — 3 input mode: Search / Scan / Manual kode
// ============================================================
function JemaatSelector({
  cabangId,
  mode,
  ibadahContext,
}: {
  cabangId: string;
  mode: Mode;
  ibadahContext: ReturnType<typeof useIbadahContextStore.getState>;
}) {
  const qc = useQueryClient();
  const [searchQ, setSearchQ] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);

  const meta = MODE_META[mode];

  // Debounce search
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQ.trim()), 300);
    return () => clearTimeout(t);
  }, [searchQ]);

  const searchResults = useQuery({
    queryKey: ['jemaat', 'search', cabangId, debouncedSearch],
    enabled: debouncedSearch.length >= 2,
    queryFn: async () => {
      const res = await apiClient.get<{ data: JemaatSearchItem[] }>('/admin/jemaat', {
        params: { cabangId, search: debouncedSearch, limit: 15 },
      });
      return res.data.data;
    },
  });

  const submitMut = useMutation({
    mutationFn: async (jemaatId: string) => {
      const res = await apiClient.post('/admin/reservasi/walk-in', {
        jemaatId,
        ibadahId: ibadahContext.ibadahId,
        tanggalIbadah: ibadahContext.tanggalIbadah,
        action: mode,
      });
      return res.data;
    },
    onSuccess: (data) => {
      const msg = data.message ?? `${meta.label} berhasil`;
      toast.success(msg);
      setLastResult({ ok: true, msg, data: data.data });
      setSearchQ('');
      qc.invalidateQueries({ queryKey: ['kehadiran'] });
    },
    onError: (err: any) => {
      const msg = err.response?.data?.error?.message ?? `Gagal ${meta.label.toLowerCase()}`;
      toast.error(msg);
      setLastResult({ ok: false, msg });
    },
  });

  // Lookup jemaat by kode (dari scan QR profile atau ketik manual kode jemaat).
  const lookupByKodeMut = useMutation({
    mutationFn: async (kode: string) => {
      const res = await apiClient.get<{ data: JemaatSearchItem[] }>('/admin/jemaat', {
        params: { cabangId, search: kode, limit: 5 },
      });
      // Cari exact match by kode
      const match = res.data.data.find(
        (j) => j.kode?.toUpperCase() === kode.toUpperCase(),
      );
      if (!match) throw new Error(`Kode "${kode}" tidak ditemukan di cabang ini`);
      return match;
    },
    onSuccess: (jemaat) => {
      submitMut.mutate(jemaat.id);
    },
    onError: (err: any) => {
      const msg = err.response?.data?.error?.message ?? err.message ?? 'Kode tidak valid';
      toast.error(msg);
      setLastResult({ ok: false, msg });
    },
  });

  return (
    <>
      <div className="bg-white border border-neutral-200 rounded-xl p-3 sm:p-4 space-y-4">
        {/* SEARCH BAR + SCAN */}
        <div>
          <label className="block text-xs font-medium text-neutral-600 mb-1">
            Cari jemaat (ketik min. 2 huruf) atau scan QR profile
          </label>
          <div className="flex gap-2">
            <div className="flex items-center gap-2 flex-1 border border-neutral-300 rounded-lg px-3 min-w-0">
              <Search className="w-4 h-4 text-neutral-400 shrink-0" />
              <input
                type="text"
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                placeholder="Nama atau kode jemaat..."
                autoFocus
                className="flex-1 py-2.5 outline-none bg-transparent min-w-0"
              />
              {searchQ && (
                <button onClick={() => setSearchQ('')} className="text-neutral-400">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <button
              onClick={() => setScannerOpen(true)}
              className="px-3 py-2 bg-neutral-800 text-white text-sm rounded-lg flex items-center gap-1"
              title="Scan QR profile jemaat"
            >
              <ScanLine className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* SEARCH RESULTS */}
        {debouncedSearch.length >= 2 && (
          <div>
            {searchResults.isLoading ? (
              <div className="text-center py-3 text-sm text-neutral-500">
                <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Mencari...
              </div>
            ) : (searchResults.data ?? []).length === 0 ? (
              <div className="text-center py-3 text-sm text-neutral-500">
                Tidak ada jemaat cocok "{debouncedSearch}"
              </div>
            ) : (
              <div className="space-y-1 max-h-72 overflow-y-auto -mx-1 px-1">
                {(searchResults.data ?? []).map((j) => (
                  <button
                    key={j.id}
                    onClick={() => submitMut.mutate(j.id)}
                    disabled={submitMut.isPending}
                    className="w-full flex items-center gap-3 p-2.5 border border-neutral-200 rounded-lg hover:border-brand-400 hover:bg-brand-50 disabled:opacity-50 text-left"
                  >
                    {j.fotoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={j.fotoUrl}
                        alt=""
                        className="w-9 h-9 rounded-full object-cover shrink-0"
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-500 font-semibold text-sm shrink-0">
                        {j.namaLengkap.charAt(0)}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-neutral-900 truncate">
                        {j.namaLengkap}
                      </div>
                      <div className="text-xs text-neutral-500">
                        {j.kode ?? '(no kode)'} · {j.noHp ?? '-'}
                      </div>
                    </div>
                    <meta.Icon className="w-4 h-4 text-neutral-400 shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {searchQ.length === 0 && (
          <div className="text-xs text-neutral-500 flex items-start gap-2 bg-neutral-50 rounded p-2">
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            Ketik minimal 2 huruf nama, atau scan QR profile jemaat (bukan kode reservasi).
          </div>
        )}

        {(submitMut.isPending || lookupByKodeMut.isPending) && (
          <div className="text-center text-sm text-neutral-500">
            <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
            Processing {meta.label.toLowerCase()}...
          </div>
        )}
      </div>

      {/* Last result banner */}
      {lastResult && (
        <div
          className={`mt-4 rounded-lg p-4 border ${
            lastResult.ok
              ? 'bg-green-50 border-green-200 text-green-900'
              : 'bg-red-50 border-red-200 text-red-900'
          }`}
        >
          <div className="flex items-start gap-2">
            {lastResult.ok && <CheckCircle2 className="w-5 h-5 mt-0.5 shrink-0" />}
            <div className="flex-1 text-sm">
              <div className="font-semibold">{lastResult.ok ? 'Sukses' : 'Gagal'}</div>
              <div className="mt-0.5">{lastResult.msg}</div>
              {lastResult.data?.jemaat?.namaLengkap && (
                <div className="mt-2 pt-2 border-t border-current/20 text-xs flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5" />
                  <strong>{lastResult.data.jemaat.namaLengkap}</strong>
                  {lastResult.data.ibadahNama && ` — ${lastResult.data.ibadahNama}`}
                </div>
              )}
              {lastResult.data?.pickupCode && (
                <div className="mt-2 bg-white/70 border border-current/20 rounded px-2 py-1.5 text-center">
                  Kode Jemput:{' '}
                  <strong className="font-mono tracking-widest text-lg">
                    {lastResult.data.pickupCode}
                  </strong>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {scannerOpen && (
        <QrScannerModal
          title="Scan QR Profile Jemaat"
          hint="Arahkan kamera ke QR kode jemaat"
          onClose={() => setScannerOpen(false)}
          onScan={(scanned) => {
            setScannerOpen(false);
            lookupByKodeMut.mutate(scanned);
          }}
        />
      )}
    </>
  );
}
