'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Ticket,
  Plus,
  Loader2,
  Filter,
  X,
  CheckCircle2,
  XCircle,
  Clock,
  QrCode,
  ScanLine,
  Trash2,
  Search,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';
import { ConfirmDelete } from '@/components/crud/confirm-delete';
import { useDebounce } from '@/lib/use-debounce';

type ReservasiStatus = 'RESERVE' | 'JOIN' | 'CANCEL';

interface ReservasiItem {
  id: string;
  status: ReservasiStatus;
  kode: string;
  tanggalIbadah: string;
  reservedAt: string;
  joinedAt: string | null;
  cancelledAt: string | null;
  catatan: string | null;
  jemaat: { id: string; namaLengkap: string; fotoUrl: string | null; noHp: string | null };
  ibadah: { id: string; nama: string };
}

interface Ibadah {
  id: string;
  nama: string;
  cabang?: { nama: string };
}

const STATUS_COLOR: Record<ReservasiStatus, string> = {
  RESERVE: 'bg-amber-100 text-amber-800',
  JOIN: 'bg-green-100 text-green-800',
  CANCEL: 'bg-red-100 text-red-700',
};
const STATUS_LABEL: Record<ReservasiStatus, string> = {
  RESERVE: 'Reserve',
  JOIN: 'Join',
  CANCEL: 'Cancel',
};
const STATUS_ICON: Record<ReservasiStatus, typeof Clock> = {
  RESERVE: Clock,
  JOIN: CheckCircle2,
  CANCEL: XCircle,
};

export default function KehadiranPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [filterStatus, setFilterStatus] = useState<ReservasiStatus | ''>('');
  const [filterIbadahId, setFilterIbadahId] = useState('');
  const [filterTanggal, setFilterTanggal] = useState('');
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [checkoutScanOpen, setCheckoutScanOpen] = useState(false);
  const [showKode, setShowKode] = useState<ReservasiItem | null>(null);
  const [deleting, setDeleting] = useState<ReservasiItem | null>(null);

  const debouncedSearch = useDebounce(search, 300);

  const listQ = useQuery({
    queryKey: ['reservasi', { page, filterStatus, filterIbadahId, filterTanggal, debouncedSearch }],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, limit: 25 };
      if (filterStatus) params.status = filterStatus;
      if (filterIbadahId) params.ibadahId = filterIbadahId;
      if (filterTanggal) params.tanggal = filterTanggal;
      if (debouncedSearch) params.search = debouncedSearch;
      const res = await apiClient.get<{
        data: ReservasiItem[];
        meta: { page: number; totalPages: number; total: number };
      }>('/admin/reservasi', { params });
      return res.data;
    },
    placeholderData: (p) => p,
  });

  const ibadahQ = useQuery({
    queryKey: ['ibadah', 'options'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: Ibadah[] }>('/admin/ibadah', {
        params: { limit: 200 },
      });
      return res.data.data;
    },
    staleTime: 60_000,
  });

  const statusMut = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ReservasiStatus }) =>
      apiClient.patch(`/admin/reservasi/${id}/status`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reservasi'] });
      toast.success('Status diperbarui');
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message ?? 'Gagal'),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => apiClient.delete(`/admin/reservasi/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reservasi'] });
      toast.success('Reservasi dihapus');
      setDeleting(null);
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message ?? 'Gagal'),
  });

  const items = listQ.data?.data ?? [];

  function resetFilter() {
    setFilterStatus('');
    setFilterIbadahId('');
    setFilterTanggal('');
    setSearch('');
    setPage(1);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
            <Ticket className="w-6 h-6" />
            Kehadiran / Reservasi
          </h1>
          <p className="text-neutral-500 mt-1">
            Reservasi jemaat per ibadah & tanggal. Status: <strong>Reserve</strong> → <strong>Join</strong> (scan barcode) atau <strong>Cancel</strong>.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setScanOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 border border-brand-300 text-brand-700 hover:bg-brand-50 text-sm font-medium rounded-lg"
          >
            <ScanLine className="w-4 h-4" />
            Check-in via Kode
          </button>
          <button
            onClick={() => setCheckoutScanOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 border border-amber-300 text-amber-700 hover:bg-amber-50 text-sm font-medium rounded-lg"
            title="Untuk ibadah dengan requiresCheckout=true (biasanya ibadah anak)"
          >
            <ScanLine className="w-4 h-4" />
            Checkout via Kode
          </button>
          <button
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded-lg font-medium text-sm"
          >
            <Plus className="w-4 h-4" />
            Buat Reservasi
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-neutral-200 rounded-xl p-4 mb-4 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-medium text-neutral-600 mb-1">Cari nama/kode</label>
          <div className="flex items-center gap-2 border border-neutral-300 rounded-lg px-3 focus-within:ring-2 focus-within:ring-brand-500">
            <Search className="w-3.5 h-3.5 text-neutral-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="flex-1 py-1.5 outline-none text-sm"
              placeholder="..."
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-neutral-600 mb-1">Ibadah</label>
          <select
            value={filterIbadahId}
            onChange={(e) => {
              setFilterIbadahId(e.target.value);
              setPage(1);
            }}
            className="px-3 py-1.5 border border-neutral-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-500 bg-white min-w-[200px]"
          >
            <option value="">Semua ibadah</option>
            {ibadahQ.data?.map((i) => (
              <option key={i.id} value={i.id}>
                {i.nama}
                {i.cabang?.nama ? ` — ${i.cabang.nama}` : ''}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-neutral-600 mb-1">Tanggal</label>
          <input
            type="date"
            value={filterTanggal}
            onChange={(e) => {
              setFilterTanggal(e.target.value);
              setPage(1);
            }}
            className="px-3 py-1.5 border border-neutral-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-neutral-600 mb-1">Status</label>
          <select
            value={filterStatus}
            onChange={(e) => {
              setFilterStatus(e.target.value as ReservasiStatus | '');
              setPage(1);
            }}
            className="px-3 py-1.5 border border-neutral-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-500 bg-white"
          >
            <option value="">Semua</option>
            <option value="RESERVE">Reserve</option>
            <option value="JOIN">Join</option>
            <option value="CANCEL">Cancel</option>
          </select>
        </div>
        {(filterStatus || filterIbadahId || filterTanggal || search) && (
          <button
            onClick={resetFilter}
            className="flex items-center gap-1 text-xs text-neutral-600 hover:text-neutral-900 px-2 py-1.5"
          >
            <X className="w-3 h-3" />
            Reset
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 border-b border-neutral-200 text-neutral-600 uppercase text-xs">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium" style={{ width: '100px' }}>Kode</th>
              <th className="px-4 py-2.5 text-left font-medium">Jemaat</th>
              <th className="px-4 py-2.5 text-left font-medium">Ibadah</th>
              <th className="px-4 py-2.5 text-left font-medium" style={{ width: '110px' }}>Tanggal</th>
              <th className="px-4 py-2.5 text-center font-medium" style={{ width: '110px' }}>Status</th>
              <th className="px-4 py-2.5 text-right font-medium" style={{ width: '180px' }}>Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {listQ.isLoading ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center">
                  <Loader2 className="w-5 h-5 mx-auto animate-spin text-neutral-400" />
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-neutral-400">
                  <Filter className="w-6 h-6 mx-auto mb-2 opacity-40" />
                  Belum ada reservasi yang cocok.
                </td>
              </tr>
            ) : (
              items.map((r) => {
                const Icon = STATUS_ICON[r.status];
                return (
                  <tr key={r.id} className="hover:bg-neutral-50">
                    <td className="px-4 py-2.5">
                      <button
                        onClick={() => setShowKode(r)}
                        className="font-mono text-xs px-2 py-1 bg-neutral-100 hover:bg-brand-100 hover:text-brand-700 rounded inline-flex items-center gap-1"
                        title="Lihat QR"
                      >
                        <QrCode className="w-3 h-3" />
                        {r.kode}
                      </button>
                    </td>
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/dashboard/jemaat/${r.jemaat.id}`}
                        className="font-medium text-neutral-900 hover:text-brand-600 hover:underline"
                      >
                        {r.jemaat.namaLengkap}
                      </Link>
                      {r.jemaat.noHp && (
                        <div className="text-xs text-neutral-500">{r.jemaat.noHp}</div>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/dashboard/ibadah/${r.ibadah.id}`}
                        className="text-neutral-900 hover:text-brand-600 hover:underline"
                      >
                        {r.ibadah.nama}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-neutral-700 text-xs tabular-nums">
                      {new Date(r.tanggalIbadah).toLocaleDateString('id-ID', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${STATUS_COLOR[r.status]}`}
                      >
                        <Icon className="w-3 h-3" />
                        {STATUS_LABEL[r.status]}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {r.status !== 'JOIN' && (
                          <button
                            onClick={() => statusMut.mutate({ id: r.id, status: 'JOIN' })}
                            className="px-2 py-1 text-xs text-green-700 hover:bg-green-50 rounded border border-green-200"
                            title="Set Join (check-in)"
                          >
                            Join
                          </button>
                        )}
                        {r.status !== 'CANCEL' && (
                          <button
                            onClick={() => statusMut.mutate({ id: r.id, status: 'CANCEL' })}
                            className="px-2 py-1 text-xs text-red-700 hover:bg-red-50 rounded border border-red-200"
                            title="Cancel"
                          >
                            Cancel
                          </button>
                        )}
                        {r.status !== 'RESERVE' && (
                          <button
                            onClick={() => statusMut.mutate({ id: r.id, status: 'RESERVE' })}
                            className="px-2 py-1 text-xs text-amber-700 hover:bg-amber-50 rounded border border-amber-200"
                            title="Set Reserve (reset)"
                          >
                            Reserve
                          </button>
                        )}
                        <button
                          onClick={() => setDeleting(r)}
                          className="p-1 hover:bg-red-50 rounded text-neutral-500 hover:text-red-600"
                          title="Hapus"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {listQ.data && listQ.data.meta.totalPages > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-100 text-sm">
            <div className="text-neutral-500">
              <strong>{listQ.data.meta.total}</strong> reservasi · hal {listQ.data.meta.page}/{listQ.data.meta.totalPages}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-2 py-1 text-xs hover:bg-neutral-100 disabled:opacity-40 rounded"
              >
                ← Prev
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= listQ.data.meta.totalPages}
                className="px-2 py-1 text-xs hover:bg-neutral-100 disabled:opacity-40 rounded"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>

      {createOpen && (
        <CreateReservasiModal
          ibadahList={ibadahQ.data ?? []}
          onClose={() => setCreateOpen(false)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['reservasi'] });
            setCreateOpen(false);
          }}
        />
      )}
      {checkoutScanOpen && (
        <ScanKodeCheckoutModal
          onClose={() => setCheckoutScanOpen(false)}
          onSuccess={() => qc.invalidateQueries({ queryKey: ['kehadiran'] })}
        />
      )}
      {scanOpen && (
        <ScanKodeModal
          onClose={() => setScanOpen(false)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['reservasi'] });
          }}
        />
      )}
      {showKode && <QrPreviewModal item={showKode} onClose={() => setShowKode(null)} />}

      <ConfirmDelete
        open={!!deleting}
        loading={deleteMut.isPending}
        onClose={() => setDeleting(null)}
        title="Hapus reservasi?"
        itemName={deleting ? `${deleting.kode} — ${deleting.jemaat.namaLengkap}` : undefined}
        onConfirm={() => deleting && deleteMut.mutate(deleting.id)}
      />
    </div>
  );
}

// ============== Create Reservasi Modal ==============

function CreateReservasiModal({
  ibadahList,
  onClose,
  onSuccess,
}: {
  ibadahList: Ibadah[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [ibadahId, setIbadahId] = useState('');
  const [tanggalIbadah, setTanggalIbadah] = useState(new Date().toISOString().slice(0, 10));
  const [search, setSearch] = useState('');
  const [jemaatId, setJemaatId] = useState('');

  const searchQ = useQuery({
    queryKey: ['jemaat-search', search],
    enabled: search.length >= 2,
    queryFn: async () => {
      const res = await apiClient.get<{ data: { id: string; namaLengkap: string; noHp: string | null }[] }>(
        '/admin/jemaat',
        { params: { search, limit: 15 } },
      );
      return res.data.data;
    },
  });

  const createMut = useMutation({
    mutationFn: async () =>
      apiClient.post('/admin/reservasi', { ibadahId, tanggalIbadah, jemaatId }),
    onSuccess: () => {
      toast.success('Reservasi dibuat');
      onSuccess();
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message ?? 'Gagal'),
  });

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md pointer-events-auto">
          <div className="px-6 py-4 border-b border-neutral-100">
            <h2 className="font-semibold text-neutral-900">Buat Reservasi</h2>
          </div>
          <div className="p-6 space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-neutral-700">Ibadah</span>
              <select
                value={ibadahId}
                onChange={(e) => setIbadahId(e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500 bg-white"
              >
                <option value="">— pilih ibadah —</option>
                {ibadahList.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.nama}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-neutral-700">Tanggal Ibadah</span>
              <input
                type="date"
                value={tanggalIbadah}
                onChange={(e) => setTanggalIbadah(e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-neutral-700">Cari jemaat</span>
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setJemaatId('');
                }}
                placeholder="Ketik nama (min 2 char)"
                className="mt-1 w-full px-3 py-2 border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500"
              />
            </label>

            {search.length >= 2 && (
              <div className="border border-neutral-200 rounded-lg max-h-40 overflow-y-auto">
                {searchQ.isLoading ? (
                  <div className="p-3 text-center text-sm text-neutral-400">
                    <Loader2 className="w-4 h-4 mx-auto animate-spin" />
                  </div>
                ) : (searchQ.data ?? []).length === 0 ? (
                  <div className="p-3 text-center text-sm text-neutral-400">Tidak ada hasil</div>
                ) : (
                  (searchQ.data ?? []).map((j) => (
                    <button
                      key={j.id}
                      type="button"
                      onClick={() => setJemaatId(j.id)}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-brand-50 border-b border-neutral-100 last:border-0 ${
                        jemaatId === j.id ? 'bg-brand-50 text-brand-700 font-medium' : ''
                      }`}
                    >
                      <div>{j.namaLengkap}</div>
                      {j.noHp && <div className="text-xs text-neutral-500">{j.noHp}</div>}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 px-6 py-4 border-t border-neutral-100 bg-neutral-50">
            <button
              onClick={onClose}
              disabled={createMut.isPending}
              className="px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 rounded-lg"
            >
              Batal
            </button>
            <button
              onClick={() => createMut.mutate()}
              disabled={!ibadahId || !jemaatId || !tanggalIbadah || createMut.isPending}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-lg disabled:opacity-50"
            >
              {createMut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Buat
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ============== Scan Kode Modal (manual checkin) ==============

function ScanKodeModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [kode, setKode] = useState('');

  const scanMut = useMutation({
    mutationFn: async () =>
      apiClient.post('/admin/reservasi/checkin', { kode: kode.trim().toUpperCase() }),
    onSuccess: (res) => {
      toast.success(res.data.message ?? 'Check-in berhasil');
      setKode('');
      onSuccess();
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message ?? 'Gagal'),
  });

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md pointer-events-auto">
          <div className="px-6 py-4 border-b border-neutral-100">
            <h2 className="font-semibold text-neutral-900 flex items-center gap-2">
              <ScanLine className="w-4 h-4" />
              Check-in via Kode
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Input/scan kode reservasi (8 karakter), tekan Enter.
            </p>
          </div>
          <div className="p-6">
            <input
              type="text"
              value={kode}
              onChange={(e) => setKode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && kode.trim() && scanMut.mutate()}
              autoFocus
              placeholder="R7K2X9P"
              className="w-full px-3 py-3 text-center font-mono tracking-widest text-lg border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500"
              maxLength={20}
            />
          </div>
          <div className="flex justify-end gap-2 px-6 py-4 border-t border-neutral-100 bg-neutral-50">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 rounded-lg"
            >
              Tutup
            </button>
            <button
              onClick={() => scanMut.mutate()}
              disabled={!kode.trim() || scanMut.isPending}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-lg disabled:opacity-50"
            >
              {scanMut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Check-in
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ============== Scan Kode CHECKOUT Modal (Modul 26) ==============
//
// Mirror ScanKodeModal — beda endpoint saja. Untuk ibadah dgn
// requiresCheckout=true (biasanya ibadah anak). Backend akan reject
// kalau ibadah-nya requiresCheckout=false atau jemaat belum check-in.

function ScanKodeCheckoutModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [kode, setKode] = useState('');

  const scanMut = useMutation({
    mutationFn: async () =>
      apiClient.post('/admin/reservasi/checkout', { kode: kode.trim().toUpperCase() }),
    onSuccess: (res) => {
      toast.success(res.data.message ?? 'Checkout berhasil');
      setKode('');
      onSuccess();
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message ?? 'Gagal'),
  });

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md pointer-events-auto">
          <div className="px-6 py-4 border-b border-neutral-100">
            <h2 className="font-semibold text-neutral-900 flex items-center gap-2">
              <ScanLine className="w-4 h-4 text-amber-600" />
              Checkout via Kode
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Scan/input kode reservasi jemaat yg mau keluar. Hanya berlaku untuk
              ibadah dgn <code>requiresCheckout=true</code>.
            </p>
          </div>
          <div className="p-6">
            <input
              type="text"
              value={kode}
              onChange={(e) => setKode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && kode.trim() && scanMut.mutate()}
              autoFocus
              placeholder="R7K2X9P"
              className="w-full px-3 py-3 text-center font-mono tracking-widest text-lg border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-amber-500"
              maxLength={20}
            />
          </div>
          <div className="flex justify-end gap-2 px-6 py-4 border-t border-neutral-100 bg-neutral-50">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 rounded-lg"
            >
              Tutup
            </button>
            <button
              onClick={() => scanMut.mutate()}
              disabled={!kode.trim() || scanMut.isPending}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg disabled:opacity-50"
            >
              {scanMut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Checkout
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ============== QR Preview Modal ==============

function QrPreviewModal({ item, onClose }: { item: ReservasiItem; onClose: () => void }) {
  // Pakai QR Server API (public, no install): generate QR image dari kode
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(item.kode)}`;

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm pointer-events-auto">
          <div className="px-6 py-4 border-b border-neutral-100 flex items-center justify-between">
            <h2 className="font-semibold text-neutral-900 flex items-center gap-2">
              <QrCode className="w-4 h-4" />
              Kode Reservasi
            </h2>
            <button onClick={onClose} className="p-1.5 hover:bg-neutral-100 rounded">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-6 text-center">
            <div className="text-sm text-neutral-700 mb-1">{item.jemaat.namaLengkap}</div>
            <div className="text-xs text-neutral-500 mb-4">
              {item.ibadah.nama} —{' '}
              {new Date(item.tanggalIbadah).toLocaleDateString('id-ID', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              })}
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrUrl}
              alt={`QR ${item.kode}`}
              width={240}
              height={240}
              className="mx-auto border border-neutral-200 rounded-lg"
            />
            <div className="mt-3 font-mono text-xl tracking-widest font-bold text-neutral-900">
              {item.kode}
            </div>
            <p className="mt-3 text-xs text-neutral-500">
              Scan QR / input kode di mobile app saat check-in.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
