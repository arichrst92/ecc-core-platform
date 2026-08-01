'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Gift, Loader2, Package, Plus, ScanLine, AlertTriangle, X, Search, Pencil, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';
import { useCabangStore } from '@/lib/cabang-store';
import { Header, AuthGuard } from '@/components/header';
import { QrScannerModal } from '@/components/qr-scanner';
import { PhotoUpload } from '@/components/photo-upload';

interface Hadiah {
  id: string;
  cabangId: string;
  nama: string;
  deskripsi: string | null;
  fotoUrl: string | null;
  pointCost: number;
  stock: number;
  isActive: boolean;
}

export default function GiftStallHome() {
  return (
    <AuthGuard>
      <Header />
      <GiftStallContent />
    </AuthGuard>
  );
}

function GiftStallContent() {
  const { cabangId, cabangNama } = useCabangStore();
  const [selectedHadiah, setSelectedHadiah] = useState<Hadiah | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const hadiahQ = useQuery({
    queryKey: ['hadiah', cabangId],
    enabled: !!cabangId,
    queryFn: async () => {
      const res = await apiClient.get<{ data: Hadiah[] }>(
        `/admin/hadiah?cabangId=${cabangId}&isActive=true&limit=100`,
      );
      return res.data.data;
    },
  });

  if (!cabangId) {
    return (
      <main className="max-w-7xl mx-auto p-8 text-center">
        <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto" />
        <h2 className="text-lg font-bold mt-3">Pilih cabang dulu</h2>
        <p className="text-sm text-neutral-500">
          Klik dropdown cabang di header untuk mulai.
        </p>
      </main>
    );
  }

  return (
    <>
      <main className="max-w-7xl mx-auto p-3 sm:p-4">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-neutral-900">
              🎁 Katalog Hadiah — {cabangNama}
            </h1>
            <p className="text-xs sm:text-sm text-neutral-500">
              Klik hadiah untuk redeem / add stock / edit. Klik + untuk tambah hadiah baru.
            </p>
          </div>
          <button
            onClick={() => setAddOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-kids-500 text-white text-sm font-semibold rounded-lg hover:bg-kids-600 shrink-0"
          >
            <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Tambah Hadiah</span>
          </button>
        </div>

        {hadiahQ.isLoading ? (
          <div className="text-center p-10">
            <Loader2 className="w-6 h-6 animate-spin mx-auto text-neutral-400" />
          </div>
        ) : (hadiahQ.data ?? []).length === 0 ? (
          <div className="text-center p-10 text-neutral-500 bg-white rounded-xl border">
            Belum ada hadiah aktif di cabang ini. Klik <strong>Tambah Hadiah</strong> di
            kanan atas untuk mulai.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
            {(hadiahQ.data ?? []).map((h) => (
              <button
                key={h.id}
                onClick={() => setSelectedHadiah(h)}
                className="text-left bg-white border border-neutral-200 rounded-xl overflow-hidden hover:shadow-lg hover:border-kids-300 transition"
              >
                <div className="aspect-square bg-neutral-100 relative">
                  {h.fotoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={h.fotoUrl} alt={h.nama} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Gift className="w-16 h-16 text-neutral-300" />
                    </div>
                  )}
                  <span
                    className={`absolute top-2 right-2 px-2 py-0.5 rounded-full text-xs font-bold ${
                      h.stock === 0
                        ? 'bg-red-100 text-red-700'
                        : h.stock < 5
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-green-100 text-green-700'
                    }`}
                  >
                    Stock: {h.stock}
                  </span>
                </div>
                <div className="p-3">
                  <div className="font-semibold text-neutral-900 truncate">{h.nama}</div>
                  <div className="text-kids-600 font-bold text-lg mt-1">
                    {h.pointCost.toLocaleString('id-ID')} pts
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </main>

      {selectedHadiah && (
        <HadiahModal
          hadiah={selectedHadiah}
          onClose={() => setSelectedHadiah(null)}
        />
      )}

      {addOpen && cabangId && (
        <AddHadiahModal
          cabangId={cabangId}
          onClose={() => setAddOpen(false)}
        />
      )}
    </>
  );
}

// ============================================================
//  Hadiah Modal — 2 tab: Redeem / Add Stock
// ============================================================
function HadiahModal({ hadiah, onClose }: { hadiah: Hadiah; onClose: () => void }) {
  const [tab, setTab] = useState<'redeem' | 'stock' | 'edit'>('redeem');

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-lg shadow-xl max-h-[92vh] overflow-y-auto">
        <div className="p-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-3">
            {hadiah.fotoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={hadiah.fotoUrl} alt="" className="w-12 h-12 rounded-lg object-cover" />
            ) : (
              <div className="w-12 h-12 rounded-lg bg-neutral-100 flex items-center justify-center">
                <Gift className="w-6 h-6 text-neutral-400" />
              </div>
            )}
            <div>
              <div className="font-bold text-neutral-900">{hadiah.nama}</div>
              <div className="text-sm text-neutral-500">
                {hadiah.pointCost.toLocaleString('id-ID')} pts · Stock {hadiah.stock}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-neutral-100 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex border-b">
          <button
            onClick={() => setTab('redeem')}
            className={`flex-1 py-2.5 text-sm font-semibold ${
              tab === 'redeem'
                ? 'text-kids-600 border-b-2 border-kids-500'
                : 'text-neutral-500'
            }`}
          >
            <ScanLine className="w-4 h-4 inline mr-1" /> Redeem
          </button>
          <button
            onClick={() => setTab('stock')}
            className={`flex-1 py-2.5 text-sm font-semibold ${
              tab === 'stock'
                ? 'text-brand-600 border-b-2 border-brand-500'
                : 'text-neutral-500'
            }`}
          >
            <Package className="w-4 h-4 inline mr-1" /> Add Stock
          </button>
          <button
            onClick={() => setTab('edit')}
            className={`flex-1 py-2.5 text-sm font-semibold ${
              tab === 'edit'
                ? 'text-neutral-900 border-b-2 border-neutral-900'
                : 'text-neutral-500'
            }`}
          >
            <Pencil className="w-4 h-4 inline mr-1" /> Edit
          </button>
        </div>

        {tab === 'redeem' && <RedeemTab hadiah={hadiah} onClose={onClose} />}
        {tab === 'stock' && <AddStockTab hadiah={hadiah} onClose={onClose} />}
        {tab === 'edit' && <EditHadiahTab hadiah={hadiah} onClose={onClose} />}
      </div>
    </div>
  );
}

// ============================================================
//  Redeem Tab
// ============================================================
function RedeemTab({ hadiah, onClose }: { hadiah: Hadiah; onClose: () => void }) {
  const qc = useQueryClient();
  const { cabangId } = useCabangStore();
  const [kode, setKode] = useState('');
  const [jemaatFound, setJemaatFound] = useState<any>(null);
  const [note, setNote] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);

  const lookupMut = useMutation({
    mutationFn: async () => {
      const res = await apiClient.get('/admin/gift-stall/lookup-jemaat', {
        params: { kode: kode.trim().toUpperCase(), cabangId },
      });
      return res.data.data;
    },
    onSuccess: (data) => {
      setJemaatFound(data);
    },
    onError: (e: any) => {
      setJemaatFound(null);
      toast.error(e.response?.data?.error?.message ?? 'Jemaat tidak ditemukan');
    },
  });

  const redeemMut = useMutation({
    mutationFn: async () => {
      const res = await apiClient.post('/admin/gift-stall/redeem', {
        jemaatId: jemaatFound.jemaat.id,
        hadiahId: hadiah.id,
        note: note.trim() || undefined,
      });
      return res.data;
    },
    onSuccess: (data) => {
      toast.success(data.message ?? 'Redeem berhasil');
      qc.invalidateQueries({ queryKey: ['hadiah'] });
      qc.invalidateQueries({ queryKey: ['gift-stall'] });
      onClose();
    },
    onError: (e: any) =>
      toast.error(e.response?.data?.error?.message ?? 'Gagal redeem'),
  });

  const canRedeem =
    jemaatFound && jemaatFound.balance >= hadiah.pointCost && hadiah.stock > 0;

  return (
    <div className="p-4 space-y-4">
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
              className="flex-1 py-2 outline-none text-sm font-mono tracking-widest"
              maxLength={20}
            />
          </div>
          <button
            onClick={() => setScannerOpen(true)}
            className="px-3 py-2 bg-kids-500 text-white text-sm rounded-lg flex items-center gap-1"
            title="Buka camera QR scanner"
          >
            <ScanLine className="w-4 h-4" /> Scan
          </button>
          <button
            onClick={() => lookupMut.mutate()}
            disabled={!kode.trim() || lookupMut.isPending}
            className="px-4 py-2 bg-neutral-800 text-white text-sm rounded-lg disabled:opacity-50"
          >
            {lookupMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Cari'}
          </button>
        </div>
      </div>

      {scannerOpen && (
        <QrScannerModal
          title="Scan QR Anak"
          hint="Arahkan kamera ke QR code jemaat"
          onClose={() => setScannerOpen(false)}
          onScan={(scanned) => {
            setKode(scanned);
            setScannerOpen(false);
            setTimeout(() => lookupMut.mutate(), 100);
          }}
        />
      )}

      {jemaatFound && (
        <div className="bg-neutral-50 border rounded-lg p-3">
          <div className="flex items-center gap-3">
            {jemaatFound.jemaat.fotoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={jemaatFound.jemaat.fotoUrl}
                alt=""
                className="w-12 h-12 rounded-full object-cover"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-neutral-200 flex items-center justify-center text-neutral-500 font-bold">
                {jemaatFound.jemaat.namaLengkap.charAt(0)}
              </div>
            )}
            <div className="flex-1">
              <div className="font-semibold">{jemaatFound.jemaat.namaLengkap}</div>
              <div className="text-xs text-neutral-500">
                {jemaatFound.jemaat.cabang?.nama} · {jemaatFound.jemaat.noHp ?? '-'}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-neutral-500">Balance</div>
              <div
                className={`font-bold text-lg ${
                  jemaatFound.balance >= hadiah.pointCost ? 'text-green-600' : 'text-red-600'
                }`}
              >
                {jemaatFound.balance.toLocaleString('id-ID')}
              </div>
            </div>
          </div>

          {jemaatFound.balance < hadiah.pointCost && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2 mt-2 flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              Point kurang. Butuh {hadiah.pointCost - jemaatFound.balance} lagi.
            </div>
          )}
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-neutral-600 mb-1">
          Note (opsional)
        </label>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Kalimat singkat untuk audit"
          className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm outline-none"
          maxLength={500}
        />
      </div>

      <button
        onClick={() => redeemMut.mutate()}
        disabled={!canRedeem || redeemMut.isPending}
        className="w-full py-3 bg-kids-500 text-white font-semibold rounded-lg hover:bg-kids-600 disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {redeemMut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
        Confirm Redeem — kurangi {hadiah.pointCost.toLocaleString('id-ID')} pts
      </button>
    </div>
  );
}

// ============================================================
//  Add Stock Tab
// ============================================================
function AddStockTab({ hadiah, onClose }: { hadiah: Hadiah; onClose: () => void }) {
  const qc = useQueryClient();
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');

  const addMut = useMutation({
    mutationFn: async () =>
      apiClient.post(`/admin/gift-stall/hadiah/${hadiah.id}/add-stock`, {
        quantity: Number(qty),
        note: note.trim() || undefined,
      }),
    onSuccess: (res) => {
      toast.success(res.data.message ?? 'Stock ditambah');
      qc.invalidateQueries({ queryKey: ['hadiah'] });
      onClose();
    },
    onError: (e: any) =>
      toast.error(e.response?.data?.error?.message ?? 'Gagal add stock'),
  });

  const qtyNum = Number(qty);
  const valid = qtyNum > 0 && qtyNum <= 10000;

  return (
    <div className="p-4 space-y-4">
      <div>
        <label className="block text-xs font-medium text-neutral-600 mb-1">
          Quantity Add (1-10000)
        </label>
        <input
          type="number"
          min="1"
          max="10000"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && valid && addMut.mutate()}
          autoFocus
          placeholder="10"
          className="w-full px-3 py-3 border border-neutral-300 rounded-lg text-lg text-center font-mono"
        />
        {valid && (
          <p className="text-xs text-neutral-500 mt-1">
            Stock: {hadiah.stock} → <strong>{hadiah.stock + qtyNum}</strong>
          </p>
        )}
      </div>

      <div>
        <label className="block text-xs font-medium text-neutral-600 mb-1">
          Note (opsional)
        </label>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Sumber restock, PO number, dll"
          className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm outline-none"
          maxLength={500}
        />
      </div>

      <button
        onClick={() => addMut.mutate()}
        disabled={!valid || addMut.isPending}
        className="w-full py-3 bg-brand-500 text-white font-semibold rounded-lg hover:bg-brand-600 disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {addMut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
        <Plus className="w-4 h-4" /> Add {qty || '?'} to Stock
      </button>
    </div>
  );
}

// ============================================================
//  Add Hadiah Modal — bikin katalog baru
// ============================================================
function AddHadiahModal({ cabangId, onClose }: { cabangId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [nama, setNama] = useState('');
  const [deskripsi, setDeskripsi] = useState('');
  const [fotoUrl, setFotoUrl] = useState('');
  const [pointCost, setPointCost] = useState('');
  const [stock, setStock] = useState('');

  const createMut = useMutation({
    mutationFn: async () => {
      const res = await apiClient.post('/admin/hadiah', {
        cabangId,
        nama: nama.trim(),
        deskripsi: deskripsi.trim() || undefined,
        fotoUrl: fotoUrl.trim() || undefined,
        pointCost: Number(pointCost),
        stock: Number(stock) || 0,
        isActive: true,
      });
      return res.data.data;
    },
    onSuccess: (data) => {
      toast.success(`Hadiah "${data.nama}" berhasil ditambahkan`);
      qc.invalidateQueries({ queryKey: ['hadiah'] });
      onClose();
    },
    onError: (e: any) => toast.error(e.response?.data?.error?.message ?? 'Gagal tambah hadiah'),
  });

  const valid = nama.trim().length >= 2 && Number(pointCost) > 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-lg shadow-xl max-h-[92vh] overflow-y-auto">
        <div className="p-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Plus className="w-5 h-5 text-kids-500" />
            <div className="font-bold">Tambah Hadiah Baru</div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-neutral-100 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">
              Nama Hadiah *
            </label>
            <input
              type="text"
              value={nama}
              onChange={(e) => setNama(e.target.value)}
              placeholder="mis. Robot LEGO, Buku Alkitab Anak"
              autoFocus
              maxLength={200}
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">
              Deskripsi (opsional)
            </label>
            <textarea
              value={deskripsi}
              onChange={(e) => setDeskripsi(e.target.value)}
              placeholder="Deskripsi singkat hadiah"
              rows={2}
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg outline-none resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">
              Foto Hadiah (opsional)
            </label>
            <p className="text-xs text-neutral-500 mb-2">
              💡 Simpan dulu tanpa foto → buka Edit tab → upload foto via tombol.
              (2-phase upload sementara.)
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">
                Point Cost *
              </label>
              <input
                type="number"
                inputMode="numeric"
                min="1"
                value={pointCost}
                onChange={(e) => setPointCost(e.target.value)}
                placeholder="100"
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg outline-none font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">
                Stock Awal
              </label>
              <input
                type="number"
                inputMode="numeric"
                min="0"
                value={stock}
                onChange={(e) => setStock(e.target.value)}
                placeholder="0"
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg outline-none font-mono"
              />
            </div>
          </div>
        </div>

        <div className="p-4 border-t bg-neutral-50 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-neutral-700 border border-neutral-300 rounded-lg hover:bg-white"
          >
            Batal
          </button>
          <button
            onClick={() => createMut.mutate()}
            disabled={!valid || createMut.isPending}
            className="flex items-center gap-1.5 px-4 py-2 bg-kids-500 text-white text-sm font-semibold rounded-lg hover:bg-kids-600 disabled:opacity-50"
          >
            {createMut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            <Plus className="w-4 h-4" /> Simpan Hadiah
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
//  Edit Hadiah Tab (di dalam HadiahModal existing)
// ============================================================
function EditHadiahTab({ hadiah, onClose }: { hadiah: Hadiah; onClose: () => void }) {
  const qc = useQueryClient();
  const [nama, setNama] = useState(hadiah.nama);
  const [deskripsi, setDeskripsi] = useState(hadiah.deskripsi ?? '');
  const [fotoUrl, setFotoUrl] = useState(hadiah.fotoUrl ?? '');
  const [pointCost, setPointCost] = useState(String(hadiah.pointCost));
  const [isActive, setIsActive] = useState(hadiah.isActive);

  const updateMut = useMutation({
    mutationFn: async () => {
      const res = await apiClient.patch(`/admin/hadiah/${hadiah.id}`, {
        nama: nama.trim(),
        deskripsi: deskripsi.trim() || undefined,
        fotoUrl: fotoUrl.trim() || undefined,
        pointCost: Number(pointCost),
        isActive,
      });
      return res.data.data;
    },
    onSuccess: () => {
      toast.success('Hadiah berhasil diupdate');
      qc.invalidateQueries({ queryKey: ['hadiah'] });
      onClose();
    },
    onError: (e: any) => toast.error(e.response?.data?.error?.message ?? 'Gagal update'),
  });

  const deactivateMut = useMutation({
    mutationFn: async () => {
      await apiClient.delete(`/admin/hadiah/${hadiah.id}`);
    },
    onSuccess: () => {
      toast.success(`Hadiah "${hadiah.nama}" di-deaktifkan (hidden dari stall)`);
      qc.invalidateQueries({ queryKey: ['hadiah'] });
      onClose();
    },
    onError: (e: any) =>
      toast.error(e.response?.data?.error?.message ?? 'Gagal deaktifkan'),
  });

  const valid = nama.trim().length >= 2 && Number(pointCost) > 0;

  return (
    <div className="p-4 space-y-3">
      <div>
        <label className="block text-xs font-medium text-neutral-600 mb-1">Nama *</label>
        <input
          type="text"
          value={nama}
          onChange={(e) => setNama(e.target.value)}
          maxLength={200}
          className="w-full px-3 py-2 border border-neutral-300 rounded-lg outline-none"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-neutral-600 mb-1">Deskripsi</label>
        <textarea
          value={deskripsi}
          onChange={(e) => setDeskripsi(e.target.value)}
          rows={2}
          className="w-full px-3 py-2 border border-neutral-300 rounded-lg outline-none resize-none"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-neutral-600 mb-1">Foto</label>
        <PhotoUpload
          existingId={hadiah.id}
          currentUrl={fotoUrl || null}
          onUploaded={(url) => setFotoUrl(url)}
          onCleared={() => setFotoUrl('')}
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-neutral-600 mb-1">
          Point Cost *
        </label>
        <input
          type="number"
          inputMode="numeric"
          min="1"
          value={pointCost}
          onChange={(e) => setPointCost(e.target.value)}
          className="w-full px-3 py-2 border border-neutral-300 rounded-lg outline-none font-mono"
        />
      </div>
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
        />
        Aktif — tampil di Gift Stall
      </label>

      <div className="flex gap-2 pt-3 border-t">
        <button
          onClick={() => {
            if (
              confirm(
                `Deaktifkan hadiah "${hadiah.nama}"? Bakal hilang dari Gift Stall (data lama redeem tetap ada).`,
              )
            ) {
              deactivateMut.mutate();
            }
          }}
          disabled={deactivateMut.isPending}
          className="px-3 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50"
        >
          Deaktifkan
        </button>
        <div className="flex-1" />
        <button
          onClick={() => updateMut.mutate()}
          disabled={!valid || updateMut.isPending}
          className="flex items-center gap-1.5 px-4 py-2 bg-neutral-900 text-white text-sm font-semibold rounded-lg hover:bg-neutral-700 disabled:opacity-50"
        >
          {updateMut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          <Save className="w-4 h-4" /> Simpan
        </button>
      </div>
    </div>
  );
}
