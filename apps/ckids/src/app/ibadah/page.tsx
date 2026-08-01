'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Loader2,
  Search,
  ScanLine,
  LogIn,
  LogOut,
  Baby,
  CheckCircle2,
  User,
  X,
  Award,
  SkipForward,
  ChevronRight,
  Calendar,
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
interface JemaatItem {
  id: string;
  namaLengkap: string;
  noHp: string | null;
  kode: string | null;
  fotoUrl: string | null;
  tanggalLahir: string | null;
}

function calcUmur(tanggalLahir: string | null): number | null {
  if (!tanggalLahir) return null;
  const d = new Date(tanggalLahir);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

interface ActiveReservasi {
  id: string;
  tanggalIbadah: string;
  joinedAt: string | null;
  pickupCode: string | null;
  checkedOutAt: string | null;
  pickedUpAt: string | null;
  ibadah: {
    id: string;
    nama: string;
    jamMulai: string;
    isKidsIbadah: boolean;
    requiresCheckout: boolean;
  };
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
  const [selectedJemaat, setSelectedJemaat] = useState<JemaatItem | null>(null);

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
        <p className="text-xs text-neutral-500 mt-0.5">
          Scan QR jemaat / search nama → pilih ibadah + action.
        </p>
      </div>

      {!selectedJemaat ? (
        <JemaatSearchStep cabangId={cabangId} onPicked={setSelectedJemaat} />
      ) : (
        <ActionPanel
          cabangId={cabangId}
          jemaat={selectedJemaat}
          onDone={() => setSelectedJemaat(null)}
          onBack={() => setSelectedJemaat(null)}
        />
      )}
    </main>
  );
}

// ============================================================
//  STEP 1: Search / scan / manual — pick jemaat
// ============================================================
function JemaatSearchStep({
  cabangId,
  onPicked,
}: {
  cabangId: string;
  onPicked: (j: JemaatItem) => void;
}) {
  const [searchQ, setSearchQ] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQ.trim()), 300);
    return () => clearTimeout(t);
  }, [searchQ]);

  const searchResults = useQuery({
    queryKey: ['jemaat', 'search', cabangId, debouncedSearch],
    enabled: debouncedSearch.length >= 2,
    queryFn: async () => {
      const res = await apiClient.get<{ data: JemaatItem[] }>('/admin/jemaat', {
        params: { cabangId, search: debouncedSearch, limit: 20 },
      });
      return res.data.data;
    },
  });

  const lookupByKodeMut = useMutation({
    mutationFn: async (kode: string) => {
      const res = await apiClient.get<{ data: JemaatItem[] }>('/admin/jemaat', {
        params: { cabangId, search: kode, limit: 5 },
      });
      const match = res.data.data.find(
        (j) => j.kode?.toUpperCase() === kode.toUpperCase(),
      );
      if (!match) throw new Error(`Kode "${kode}" tidak ditemukan`);
      return match;
    },
    onSuccess: (jemaat) => onPicked(jemaat),
    onError: (err: any) =>
      toast.error(err.response?.data?.error?.message ?? err.message ?? 'Kode tidak valid'),
  });

  return (
    <>
      <div className="bg-white border border-neutral-200 rounded-xl p-3 sm:p-4 space-y-4">
        <div>
          <label className="block text-xs font-medium text-neutral-600 mb-1">
            Cari nama / scan QR profile jemaat
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
                <button
                  type="button"
                  onClick={() => setSearchQ('')}
                  className="text-neutral-400"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => setScannerOpen(true)}
              className="px-3 py-2 bg-neutral-800 text-white text-sm rounded-lg flex items-center gap-1"
              title="Scan QR profile jemaat"
            >
              <ScanLine className="w-4 h-4" />
            </button>
          </div>
        </div>

        {debouncedSearch.length >= 2 && (
          <div>
            {searchResults.isLoading ? (
              <div className="text-center py-4 text-sm text-neutral-500">
                <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Mencari...
              </div>
            ) : (searchResults.data ?? []).length === 0 ? (
              <div className="text-center py-4 text-sm text-neutral-500">
                Tidak ada jemaat cocok &quot;{debouncedSearch}&quot;
              </div>
            ) : (
              <div className="space-y-1 max-h-80 overflow-y-auto -mx-1 px-1">
                {(searchResults.data ?? []).map((j) => (
                  <button
                    key={j.id}
                    onClick={() => onPicked(j)}
                    className="w-full flex items-center gap-3 p-2.5 border border-neutral-200 rounded-lg hover:border-brand-400 hover:bg-brand-50 text-left"
                  >
                    {j.fotoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={j.fotoUrl}
                        alt=""
                        className="w-10 h-10 rounded-full object-cover shrink-0"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-500 font-semibold text-sm shrink-0">
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
                    <ChevronRight className="w-4 h-4 text-neutral-400 shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {searchQ.length === 0 && (
          <div className="text-xs text-neutral-500 bg-neutral-50 rounded p-3 text-center">
            Ketik minimal 2 huruf nama untuk cari, atau tap tombol scan untuk buka kamera QR.
          </div>
        )}
      </div>

      {lookupByKodeMut.isPending && (
        <div className="text-center mt-3 text-sm text-neutral-500">
          <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Cari jemaat...
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

// ============================================================
//  STEP 2: Jemaat picked — pilih ibadah + action
// ============================================================
function ActionPanel({
  cabangId,
  jemaat,
  onDone,
  onBack,
}: {
  cabangId: string;
  jemaat: JemaatItem;
  onDone: () => void;
  onBack: () => void;
}) {
  const qc = useQueryClient();
  const ctx = useIbadahContextStore();
  const [ibadahId, setIbadahId] = useState<string | null>(ctx.ibadahId);
  const [tanggal, setTanggal] = useState<string>(
    ctx.tanggalIbadah ?? new Date().toISOString().slice(0, 10),
  );
  const [lastResult, setLastResult] = useState<any>(null);
  const [pointDialog, setPointDialog] = useState<null | {
    reservasiId: string;
    jemaatNama: string;
  }>(null);

  const umur = calcUmur(jemaat.tanggalLahir);

  const ibadahQ = useQuery({
    queryKey: ['ibadah', 'active', cabangId],
    queryFn: async () => {
      const res = await apiClient.get<{ data: IbadahItem[] }>('/admin/ibadah', {
        params: { cabangId, limit: 50, sortBy: 'nama', sortOrder: 'asc' },
      });
      return res.data.data;
    },
  });

  // Fetch active reservasi hari ini untuk auto-detect ibadah checkout/pickup
  const activeQ = useQuery({
    queryKey: ['reservasi', 'active-today', jemaat.id],
    queryFn: async () => {
      const res = await apiClient.get<{ data: ActiveReservasi[] }>(
        '/admin/reservasi/active-today',
        { params: { jemaatId: jemaat.id } },
      );
      return res.data.data;
    },
  });

  const activeReservasi = activeQ.data ?? [];
  const checkoutable = activeReservasi.filter(
    (r) => r.ibadah.requiresCheckout && !r.checkedOutAt,
  );
  const pickupable = activeReservasi.filter(
    (r) => r.ibadah.isKidsIbadah && !r.pickedUpAt,
  );

  const selectedIbadah = (ibadahQ.data ?? []).find((i) => i.id === ibadahId) ?? null;

  const submitMut = useMutation({
    mutationFn: async ({ action, targetIbadahId, targetTanggal }: {
      action: Mode;
      targetIbadahId?: string;
      targetTanggal?: string;
    }) => {
      const finalIbadahId = targetIbadahId ?? ibadahId;
      const finalTanggal = targetTanggal ?? tanggal;
      if (!finalIbadahId) throw new Error('Pilih ibadah dulu');
      const res = await apiClient.post('/admin/reservasi/walk-in', {
        jemaatId: jemaat.id,
        ibadahId: finalIbadahId,
        tanggalIbadah: finalTanggal,
        action,
      });
      return { data: res.data.data, action, ibadahNama: (ibadahQ.data ?? []).find((i) => i.id === finalIbadahId)?.nama ?? '' };
    },
    onSuccess: ({ data, action, ibadahNama }) => {
      const ib = (ibadahQ.data ?? []).find((i) => i.id === (data?.reservasi?.ibadahId ?? ibadahId));
      if (ib && action === 'checkin') {
        // Persist context hanya untuk check-in (sebagai default berikutnya)
        ctx.setContext({
          ibadahId: ib.id,
          ibadahNama: ib.nama,
          isKidsIbadah: ib.isKidsIbadah,
          requiresCheckout: ib.requiresCheckout,
          tanggalIbadah: tanggal,
        });
      }
      toast.success(`${MODE_META[action].label} berhasil`);
      setLastResult({ ok: true, action, data, ibadahNama });
      qc.invalidateQueries({ queryKey: ['kehadiran'] });
      qc.invalidateQueries({ queryKey: ['reservasi', 'active-today'] });

      if (action === 'checkin' && data?.pickupCode && data?.reservasi?.id) {
        setPointDialog({
          reservasiId: data.reservasi.id,
          jemaatNama: jemaat.namaLengkap,
        });
      } else {
        setTimeout(onDone, 2000);
      }
    },
    onError: (err: any) => {
      const msg = err.response?.data?.error?.message ?? err.message ?? 'Gagal';
      toast.error(msg);
      setLastResult({ ok: false, msg });
    },
  });

  // Handler untuk action button — kalau checkout/pickup, auto-pick reservasi
  // hari ini kalau ada. Kalau ambigu (multiple), fallback pakai ibadah selector.
  function handleAction(action: Mode) {
    if (action === 'checkout') {
      const single = checkoutable[0];
      if (checkoutable.length === 1 && single) {
        submitMut.mutate({
          action: 'checkout',
          targetIbadahId: single.ibadah.id,
          targetTanggal: single.tanggalIbadah.slice(0, 10),
        });
        return;
      }
      if (checkoutable.length === 0) {
        toast.error('Jemaat belum check-in di ibadah manapun hari ini (yang wajib checkout)');
        return;
      }
      submitMut.mutate({ action: 'checkout' });
      return;
    }
    if (action === 'pickup') {
      const single = pickupable[0];
      if (pickupable.length === 1 && single) {
        submitMut.mutate({
          action: 'pickup',
          targetIbadahId: single.ibadah.id,
          targetTanggal: single.tanggalIbadah.slice(0, 10),
        });
        return;
      }
      if (pickupable.length === 0) {
        toast.error('Anak belum check-in di kids ibadah hari ini');
        return;
      }
      submitMut.mutate({ action: 'pickup' });
      return;
    }
    // checkin: pakai ibadah selector
    submitMut.mutate({ action: 'checkin' });
  }

  return (
    <>
      <div className="space-y-3">
        {/* Jemaat card dengan umur badge */}
        <div className="bg-white border border-neutral-200 rounded-xl p-3 flex items-center gap-3">
          {jemaat.fotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={jemaat.fotoUrl}
              alt=""
              className="w-12 h-12 rounded-full object-cover shrink-0"
            />
          ) : (
            <div className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-500 font-semibold shrink-0">
              {jemaat.namaLengkap.charAt(0)}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-neutral-900 truncate flex items-center gap-2">
              {jemaat.namaLengkap}
              {umur !== null && (
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                    umur < 18
                      ? 'bg-kids-100 text-kids-700'
                      : 'bg-neutral-100 text-neutral-700'
                  }`}
                  title={`Tanggal lahir: ${jemaat.tanggalLahir}`}
                >
                  {umur}th{umur < 18 && ' 🧒'}
                </span>
              )}
            </div>
            <div className="text-xs text-neutral-500">
              {jemaat.kode ?? '(no kode)'} · {jemaat.noHp ?? '-'}
            </div>
          </div>
          <button
            onClick={onBack}
            className="p-1.5 text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100 rounded shrink-0"
            title="Cari jemaat lain"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Auto-detect info: reservasi aktif hari ini */}
        {activeQ.isLoading ? (
          <div className="text-xs text-neutral-400 text-center py-1">
            <Loader2 className="w-3 h-3 animate-spin inline mr-1" />
            Cek kehadiran hari ini...
          </div>
        ) : activeReservasi.length > 0 ? (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5 text-xs text-blue-900">
            <div className="font-semibold mb-1">
              Sudah check-in hari ini ({activeReservasi.length}):
            </div>
            <div className="space-y-0.5">
              {activeReservasi.map((r) => (
                <div key={r.id} className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3 h-3 shrink-0" />
                  <span className="flex-1">
                    {r.ibadah.nama} ({r.ibadah.jamMulai})
                  </span>
                  {r.ibadah.isKidsIbadah && !r.pickedUpAt && (
                    <span className="bg-kids-200 text-kids-800 px-1.5 rounded text-[10px]">
                      Belum dijemput
                    </span>
                  )}
                  {r.ibadah.requiresCheckout && !r.checkedOutAt && (
                    <span className="bg-amber-200 text-amber-800 px-1.5 rounded text-[10px]">
                      Belum checkout
                    </span>
                  )}
                  {r.checkedOutAt && (
                    <span className="text-neutral-500 text-[10px]">✓ checkout</span>
                  )}
                  {r.pickedUpAt && (
                    <span className="text-neutral-500 text-[10px]">✓ dijemput</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* Ibadah selector — untuk check-in (tanggal + ibadah).
            Untuk checkout/pickup, kalau ada active reservasi hari ini,
            otomatis pakai — no need pilih manual. */}
        <div className="bg-white border border-neutral-200 rounded-xl p-3 sm:p-4 space-y-3">
          <div className="text-xs text-neutral-500 mb-1">
            Untuk <strong>Check-in</strong> — pilih ibadah + tanggal:
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="sm:col-span-1">
              <label className="block text-xs font-medium text-neutral-600 mb-1">
                Tanggal
              </label>
              <div className="flex items-center gap-1.5 border border-neutral-300 rounded-lg px-2">
                <Calendar className="w-4 h-4 text-neutral-400 shrink-0" />
                <input
                  type="date"
                  value={tanggal}
                  onChange={(e) => setTanggal(e.target.value)}
                  className="flex-1 py-2 outline-none bg-transparent"
                />
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-neutral-600 mb-1">
                Ibadah
              </label>
              {ibadahQ.isLoading ? (
                <div className="text-sm text-neutral-500 py-2">
                  <Loader2 className="w-4 h-4 animate-spin inline mr-1" /> Memuat...
                </div>
              ) : (
                <select
                  value={ibadahId ?? ''}
                  onChange={(e) => setIbadahId(e.target.value || null)}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm"
                >
                  <option value="">— Pilih Ibadah —</option>
                  {(ibadahQ.data ?? []).map((ib) => (
                    <option key={ib.id} value={ib.id}>
                      {ib.nama} ({ib.jamMulai})
                      {ib.isKidsIbadah && ' 🧒'}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
        </div>

        {/* Action buttons dengan auto-detect logic */}
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(MODE_META) as Mode[]).map((m) => {
            const mm = MODE_META[m];
            const Icon = mm.Icon;
            const disabled =
              submitMut.isPending ||
              (m === 'checkin' && !selectedIbadah) ||
              (m === 'checkout' && checkoutable.length === 0) ||
              (m === 'pickup' && pickupable.length === 0);
            // Info hint under label
            let hint = '';
            if (m === 'checkout') {
              const first = checkoutable[0];
              hint =
                checkoutable.length === 1 && first
                  ? first.ibadah.nama.slice(0, 12)
                  : checkoutable.length > 1
                    ? `${checkoutable.length} pilihan`
                    : 'no active';
            } else if (m === 'pickup') {
              const first = pickupable[0];
              hint =
                pickupable.length === 1 && first
                  ? first.ibadah.nama.slice(0, 12)
                  : pickupable.length > 1
                    ? `${pickupable.length} pilihan`
                    : 'no active';
            } else {
              hint = selectedIbadah?.nama.slice(0, 12) ?? '';
            }
            return (
              <button
                key={m}
                onClick={() => handleAction(m)}
                disabled={disabled}
                className={`flex flex-col items-center gap-0.5 py-3 rounded-lg font-bold text-white transition ${
                  disabled ? 'bg-neutral-300 cursor-not-allowed' : mm.color
                }`}
              >
                {submitMut.isPending && submitMut.variables?.action === m ? (
                  <Loader2 className="w-6 h-6 animate-spin" />
                ) : (
                  <Icon className="w-6 h-6" />
                )}
                <span className="text-sm">{mm.label}</span>
                {hint && (
                  <span className="text-[9px] opacity-80 font-normal truncate max-w-full px-1">
                    {hint}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Last result banner */}
        {lastResult && lastResult.ok && (
          <div className="rounded-lg p-4 border bg-green-50 border-green-200 text-green-900">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-5 h-5 mt-0.5 shrink-0" />
              <div className="flex-1 text-sm">
                <div className="font-semibold">
                  {MODE_META[lastResult.action as Mode].label} berhasil
                </div>
                <div className="text-xs mt-1 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5" />
                  <strong>{jemaat.namaLengkap}</strong> ·{' '}
                  {selectedIbadah?.nama}
                </div>
                {lastResult.data?.pickupCode && (
                  <div className="mt-2 bg-white/70 border border-current/20 rounded px-2 py-2 text-center">
                    <div className="text-xs">Kode Jemput:</div>
                    <div className="font-mono tracking-widest text-2xl font-bold">
                      {lastResult.data.pickupCode}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        {lastResult && !lastResult.ok && (
          <div className="rounded-lg p-4 border bg-red-50 border-red-200 text-red-900">
            <div className="font-semibold text-sm">Gagal</div>
            <div className="text-sm mt-0.5">{lastResult.msg}</div>
          </div>
        )}
      </div>

      {pointDialog && (
        <PointAwardDialog
          reservasiId={pointDialog.reservasiId}
          jemaatNama={pointDialog.jemaatNama}
          onClose={() => {
            setPointDialog(null);
            // Auto-back setelah point flow selesai
            setTimeout(onDone, 500);
          }}
        />
      )}
    </>
  );
}

// ============================================================
//  Point Award Dialog — muncul post kids check-in sukses
// ============================================================
function PointAwardDialog({
  reservasiId,
  jemaatNama,
  onClose,
}: {
  reservasiId: string;
  jemaatNama: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  const awardMut = useMutation({
    mutationFn: async () => {
      const res = await apiClient.post('/admin/reservasi/award-point', {
        reservasiId,
        amount: Number(amount),
        note: note.trim() || undefined,
      });
      return res.data;
    },
    onSuccess: (data) => {
      const newBalance = data?.data?.newBalance ?? 0;
      toast.success(
        `+${amount} pts. Balance: ${newBalance.toLocaleString('id-ID')}`,
      );
      qc.invalidateQueries({ queryKey: ['gift-stall'] });
      onClose();
    },
    onError: (e: any) =>
      toast.error(e.response?.data?.error?.message ?? 'Gagal award point'),
  });

  const amountNum = Number(amount);
  const valid = amountNum > 0 && amountNum <= 10_000;

  return (
    <div className="fixed inset-0 z-[55] bg-black/60 flex items-end sm:items-center justify-center sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md shadow-xl overflow-hidden">
        <div className="bg-kids-500 text-white p-4">
          <div className="flex items-center gap-2 font-bold">
            <Award className="w-5 h-5" /> Award Point Anak
          </div>
          <div className="text-sm mt-0.5 opacity-90">{jemaatNama}</div>
        </div>

        <div className="p-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">
              Jumlah Point Kehadiran
            </label>
            <input
              type="number"
              inputMode="numeric"
              min="1"
              max="10000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && valid && awardMut.mutate()}
              autoFocus
              placeholder="10"
              className="w-full px-3 py-4 border-2 border-kids-200 rounded-lg text-center font-mono text-3xl font-bold text-kids-700"
            />
            <div className="mt-2 flex gap-1.5 justify-center">
              {[5, 10, 20, 50, 100].map((v) => (
                <button
                  key={v}
                  onClick={() => setAmount(String(v))}
                  className={`px-3 py-1 text-xs font-semibold rounded-full border transition ${
                    Number(amount) === v
                      ? 'bg-kids-500 text-white border-kids-500'
                      : 'bg-white text-neutral-600 border-neutral-300 hover:border-kids-400'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">
              Note (opsional)
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="mis. hadir tepat waktu, aktif berdoa"
              maxLength={500}
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg outline-none text-sm"
            />
          </div>
        </div>

        <div className="p-4 border-t bg-neutral-50 flex gap-2">
          <button
            onClick={onClose}
            className="flex items-center justify-center gap-1 flex-1 px-4 py-2.5 text-sm text-neutral-700 border border-neutral-300 rounded-lg hover:bg-white"
          >
            <SkipForward className="w-4 h-4" /> Skip
          </button>
          <button
            onClick={() => awardMut.mutate()}
            disabled={!valid || awardMut.isPending}
            className="flex items-center justify-center gap-1.5 flex-1 px-4 py-2.5 bg-kids-500 text-white text-sm font-semibold rounded-lg hover:bg-kids-600 disabled:opacity-50"
          >
            {awardMut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            <Award className="w-4 h-4" /> Award {amount || '?'}
          </button>
        </div>
      </div>
    </div>
  );
}
