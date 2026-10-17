'use client';

import { useRef, useState } from 'react';
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
  UserPlus,
  User as UserIcon,
  Users,
  Check,
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
  guestSource?: string | null;
  jemaat: { id: string; namaLengkap: string; fotoUrl: string | null; noHp: string | null; isTamu?: boolean };
  ibadah: { id: string; nama: string };
}

interface Ibadah {
  id: string;
  nama: string;
  isKidsIbadah?: boolean;
  cabang?: { nama: string };
}

interface KehadiranSummary {
  total: number;
  reservasi: number;
  hadir: number;
  hadirJemaat: number;
  tamu: number;
  batal: number;
}

/** Hari ini (WIB) YYYY-MM-DD. */
const todayWib = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);

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
  const [pickupOpen, setPickupOpen] = useState(false);
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

  const summaryQ = useQuery({
    queryKey: ['reservasi', 'summary', { filterIbadahId, filterTanggal, debouncedSearch }],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (filterIbadahId) params.ibadahId = filterIbadahId;
      if (filterTanggal) params.tanggal = filterTanggal;
      if (debouncedSearch) params.search = debouncedSearch;
      return (await apiClient.get<{ data: KehadiranSummary }>('/admin/reservasi/summary', { params })).data.data;
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
            Reservasi jemaat per ibadah & tanggal. Status: <strong>Reserve</strong> → <strong>Join</strong> (scan QR / cari nama, no HP, email) atau <strong>Cancel</strong>. Tamu bisa dicatat langsung.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setScanOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 border border-brand-300 text-brand-700 hover:bg-brand-50 text-sm font-medium rounded-lg"
          >
            <ScanLine className="w-4 h-4" />
            Check-in
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
            onClick={() => setPickupOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 border border-pink-300 text-pink-700 hover:bg-pink-50 text-sm font-medium rounded-lg"
            title="Ibadah anak — verify 6-digit kode jemput dari parent"
          >
            🧒 Pickup Anak
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

      {/* Ringkasan sesuai filter (ibadah, tanggal, pencarian) */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <SummaryCard label="Total terdaftar" value={summaryQ.data?.total} hint="reservasi + hadir + batal" tone="neutral" icon={Users} />
        <SummaryCard label="Reservasi" value={summaryQ.data?.reservasi} hint="sudah reservasi, belum hadir" tone="amber" icon={Clock} />
        <SummaryCard
          label="Hadir"
          value={summaryQ.data?.hadir}
          hint={summaryQ.data ? `${summaryQ.data.hadirJemaat} jemaat + ${summaryQ.data.tamu} tamu` : undefined}
          tone="green"
          icon={CheckCircle2}
        />
        <SummaryCard label="Batal" value={summaryQ.data?.batal} tone="red" icon={XCircle} />
        <SummaryCard label="Tamu" value={summaryQ.data?.tamu} hint="tamu yang hadir" tone="violet" icon={UserPlus} />
      </div>
      {!filterIbadahId && !filterTanggal ? (
        <p className="text-xs text-neutral-500 -mt-2 mb-4">Pilih ibadah & tanggal di filter untuk melihat jumlah per pertemuan.</p>
      ) : null}

      {/* Filters */}
      <div className="bg-white border border-neutral-200 rounded-xl p-4 mb-4 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-medium text-neutral-600 mb-1">Cari nama / no HP / email / kode</label>
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
                      {r.jemaat.isTamu || r.guestSource ? (
                        <span className="ml-1.5 text-[10px] font-semibold uppercase bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded">
                          Tamu
                        </span>
                      ) : null}
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
      {pickupOpen && (
        <PickupAnakModal
          onClose={() => setPickupOpen(false)}
          onSuccess={() => qc.invalidateQueries({ queryKey: ['kehadiran'] })}
        />
      )}
      {scanOpen && (
        <CheckinIbadahModal
          ibadahList={ibadahQ.data ?? []}
          defaultIbadahId={filterIbadahId}
          defaultTanggal={filterTanggal || todayWib()}
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

function SummaryCard({
  label,
  value,
  hint,
  tone,
  icon: Icon,
}: {
  label: string;
  value: number | undefined;
  hint?: string;
  tone: 'neutral' | 'amber' | 'green' | 'red' | 'violet';
  icon: typeof Clock;
}) {
  const cls = {
    neutral: 'text-neutral-700 bg-neutral-100',
    amber: 'text-amber-700 bg-amber-50',
    green: 'text-green-700 bg-green-50',
    red: 'text-red-700 bg-red-50',
    violet: 'text-violet-700 bg-violet-50',
  }[tone];
  return (
    <div className="bg-white border border-neutral-200 rounded-xl p-3 flex items-start gap-3">
      <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${cls}`}>
        <Icon className="w-4 h-4" />
      </span>
      <div className="min-w-0">
        <div className="text-xl font-bold text-neutral-900 tabular-nums">
          {value == null ? '—' : value.toLocaleString('id-ID')}
        </div>
        <div className="text-xs font-medium text-neutral-600">{label}</div>
        {hint ? <div className="text-[11px] text-neutral-400 truncate">{hint}</div> : null}
      </div>
    </div>
  );
}

// ============== Check-in Modal ==============
//
// Satu input untuk semua cara:
//   - Scan / ketik KODE (8 karakter): kode reservasi → check-in reservasi;
//     kalau bukan, dianggap kode QR jemaat → check-in ke ibadah & tanggal terpilih.
//   - Ketik NAMA / NO HP / EMAIL → pilih dari daftar (termasuk tamu lama).
//   - Tamu baru → isi nama + no HP (POST /admin/reservasi/walk-in-guest).
interface JemaatHit {
  id: string;
  namaLengkap: string;
  kode: string | null;
  noHp: string | null;
  email: string | null;
  isTamu?: boolean;
  cabang?: { nama: string } | null;
}
interface CheckinLog {
  ok: boolean;
  nama: string;
  msg: string;
  tamu?: boolean;
}

function CheckinIbadahModal({
  ibadahList,
  defaultIbadahId,
  defaultTanggal,
  onClose,
  onSuccess,
}: {
  ibadahList: Ibadah[];
  defaultIbadahId: string;
  defaultTanggal: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [ibadahId, setIbadahId] = useState(defaultIbadahId);
  const [tanggal, setTanggal] = useState(defaultTanggal);
  const [q, setQ] = useState('');
  const [guestOpen, setGuestOpen] = useState(false);
  const [guestNama, setGuestNama] = useState('');
  const [guestHp, setGuestHp] = useState('');
  const [log, setLog] = useState<CheckinLog[]>([]);
  const dq = useDebounce(q.trim(), 300);
  const ibadah = ibadahList.find((i) => i.id === ibadahId);
  const ready = !!ibadahId && /^\d{4}-\d{2}-\d{2}$/.test(tanggal);
  // Kode reservasi / QR jemaat = 7–8 karakter alfanumerik (no HP lebih panjang).
  const looksLikeKode = /^[A-Z0-9]{7,8}$/i.test(q.trim());

  const focus = () => setTimeout(() => inputRef.current?.focus(), 50);
  const push = (l: CheckinLog) => setLog((h) => [l, ...h].slice(0, 30));
  const errMsg = (e: any, fb: string) => e?.response?.data?.error?.message ?? fb;

  const hitsQ = useQuery({
    queryKey: ['kehadiran', 'jemaat-search', dq],
    enabled: dq.length >= 2,
    queryFn: async () =>
      (
        await apiClient.get<{ data: JemaatHit[] }>('/admin/jemaat', {
          params: { search: dq, jenis: 'semua', isActive: 'true', limit: 8 },
        })
      ).data.data,
    staleTime: 15_000,
  });

  const done = (nama: string, msg: string, tamu?: boolean) => {
    toast.success(`${nama}: ${msg}`);
    push({ ok: true, nama, msg, tamu });
    setQ('');
    onSuccess();
    focus();
  };
  const fail = (nama: string, msg: string) => {
    toast.error(msg);
    push({ ok: false, nama, msg });
    focus();
  };

  // Check-in jemaat (dari hasil cari atau kode QR jemaat) ke ibadah & tanggal terpilih.
  const walkIn = useMutation({
    mutationFn: async (v: { jemaatId?: string; kode?: string; via: 'scan' | 'search'; label: string }) =>
      (
        await apiClient.post('/admin/reservasi/walk-in', {
          ibadahId,
          tanggalIbadah: tanggal,
          action: 'checkin',
          via: v.via,
          ...(v.jemaatId ? { jemaatId: v.jemaatId } : { kode: v.kode }),
        })
      ).data as { message?: string; data?: { jemaat?: { namaLengkap?: string } } },
    onSuccess: (r, v) => done(r.data?.jemaat?.namaLengkap ?? v.label, r.message ?? 'Check-in berhasil'),
    onError: (e, v) => fail(v.label, errMsg(e, 'Gagal check-in')),
  });

  // Kode: coba sebagai kode reservasi dulu, lalu sebagai kode QR jemaat.
  const byKode = useMutation({
    mutationFn: async (kode: string) => {
      try {
        const r = await apiClient.post('/admin/reservasi/checkin', { kode });
        return { kind: 'reservasi' as const, r: r.data as { message?: string; data?: { jemaat?: { namaLengkap?: string } } } };
      } catch (e: any) {
        if (e?.response?.status !== 404) throw e;
        return { kind: 'jemaat' as const, r: null };
      }
    },
    onSuccess: (res, kode) => {
      if (res.kind === 'reservasi') {
        done(res.r?.data?.jemaat?.namaLengkap ?? kode, res.r?.message ?? 'Check-in berhasil');
        return;
      }
      if (!ready) {
        fail(kode, 'Bukan kode reservasi. Pilih ibadah & tanggal dulu untuk check-in dengan kode QR jemaat.');
        return;
      }
      walkIn.mutate({ kode, via: 'scan', label: kode });
    },
    onError: (e, kode) => fail(kode, errMsg(e, 'Gagal check-in')),
  });

  const guest = useMutation({
    mutationFn: async () =>
      (
        await apiClient.post('/admin/reservasi/walk-in-guest', {
          ibadahId,
          tanggalIbadah: tanggal,
          nama: guestNama.trim(),
          noHp: guestHp.trim(),
        })
      ).data as { message?: string; meta?: { alreadyCheckedIn?: boolean }; data?: { isMember?: boolean; jemaat?: { namaLengkap?: string } } },
    onSuccess: (r) => {
      done(
        r.data?.jemaat?.namaLengkap ?? guestNama.trim(),
        r.meta?.alreadyCheckedIn ? 'Sudah tercatat hadir sebelumnya' : (r.message ?? 'Tamu tercatat hadir'),
        !r.data?.isMember,
      );
      setGuestNama('');
      setGuestHp('');
      setGuestOpen(false);
    },
    onError: (e) => fail(guestNama.trim() || 'Tamu', errMsg(e, 'Gagal mencatat tamu')),
  });

  const busy = walkIn.isPending || byKode.isPending || guest.isPending;
  const submitEnter = () => {
    const v = q.trim().toUpperCase();
    if (!v || busy) return;
    if (looksLikeKode) byKode.mutate(v);
    else if ((hitsQ.data ?? []).length === 1 && ready) {
      const j = hitsQ.data![0]!;
      walkIn.mutate({ jemaatId: j.id, via: 'search', label: j.namaLengkap });
    }
  };
  const inputCls = 'w-full px-3 py-2 border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500 text-sm bg-white';

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl pointer-events-auto max-h-[92vh] flex flex-col">
          <div className="px-6 py-4 border-b border-neutral-100 flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold text-neutral-900 flex items-center gap-2">
                <ScanLine className="w-4 h-4 text-green-600" />
                Check-in Kehadiran Ibadah
              </h2>
              <p className="text-xs text-neutral-500 mt-0.5">
                Scan QR / ketik kode, atau cari nama, no HP, email. Tamu baru bisa langsung dicatat.
              </p>
            </div>
            <button onClick={onClose} className="p-1 hover:bg-neutral-100 rounded">
              <X className="w-4 h-4 text-neutral-500" />
            </button>
          </div>

          <div className="p-6 space-y-3 border-b border-neutral-100">
            <div className="grid grid-cols-[1fr_150px] gap-2">
              <label className="block">
                <span className="text-xs font-medium text-neutral-600">Ibadah</span>
                <select value={ibadahId} onChange={(e) => setIbadahId(e.target.value)} className={`mt-1 ${inputCls}`}>
                  <option value="">Pilih ibadah</option>
                  {ibadahList.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.nama}
                      {i.cabang?.nama ? ` — ${i.cabang.nama}` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-neutral-600">Tanggal</span>
                <input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} className={`mt-1 ${inputCls}`} />
              </label>
            </div>

            <div>
              <div className="flex items-center gap-2 border-2 border-neutral-300 rounded-lg px-3 focus-within:border-green-500">
                <Search className="w-4 h-4 text-neutral-400" />
                <input
                  ref={inputRef}
                  autoFocus
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submitEnter()}
                  placeholder="Scan QR / kode / nama / no HP / email"
                  disabled={busy}
                  className="flex-1 py-3 outline-none text-base"
                />
                {busy ? <Loader2 className="w-4 h-4 animate-spin text-neutral-400" /> : null}
              </div>
              <p className="text-[11px] text-neutral-500 mt-1">
                Scanner QR otomatis menekan Enter. Kode reservasi & kode QR jemaat sama-sama diterima.
              </p>
            </div>

            {!ready && dq.length >= 2 ? (
              <p className="text-xs text-amber-700">Pilih ibadah & tanggal dulu untuk check-in dari hasil pencarian.</p>
            ) : null}

            {dq.length >= 2 ? (
              <div className="border border-neutral-200 rounded-lg max-h-60 overflow-y-auto divide-y divide-neutral-100">
                {hitsQ.isLoading ? (
                  <div className="flex items-center gap-2 text-xs text-neutral-500 px-3 py-3">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Mencari…
                  </div>
                ) : (hitsQ.data ?? []).length === 0 ? (
                  <div className="px-3 py-3 text-xs text-neutral-500 flex items-center justify-between gap-2">
                    <span>Tidak ditemukan.</span>
                    <button
                      onClick={() => {
                        setGuestOpen(true);
                        if (/^[+\d\s().-]+$/.test(dq)) setGuestHp(dq);
                        else setGuestNama(dq);
                      }}
                      className="text-violet-700 font-semibold hover:underline"
                    >
                      + Catat sebagai tamu baru
                    </button>
                  </div>
                ) : (
                  hitsQ.data!.map((j) => (
                    <button
                      key={j.id}
                      disabled={!ready || busy}
                      onClick={() => walkIn.mutate({ jemaatId: j.id, via: 'search', label: j.namaLengkap })}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-green-50 disabled:opacity-50 disabled:hover:bg-white"
                    >
                      <span className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${j.isTamu ? 'bg-violet-100 text-violet-700' : 'bg-green-100 text-green-700'}`}>
                        <UserIcon className="w-4 h-4" />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium text-neutral-900 truncate">
                          {j.namaLengkap}
                          {j.isTamu ? (
                            <span className="ml-1.5 text-[10px] font-semibold uppercase bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded">Tamu</span>
                          ) : null}
                        </span>
                        <span className="block text-[11px] text-neutral-500 truncate">
                          {[j.kode, j.noHp, j.email, j.cabang?.nama].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                      <span className="text-xs font-semibold text-green-700">Check-in</span>
                    </button>
                  ))
                )}
              </div>
            ) : null}

            {/* Tamu baru */}
            {guestOpen ? (
              <div className="rounded-lg border border-violet-200 bg-violet-50/50 p-3 space-y-2">
                <div className="text-xs font-semibold text-violet-800 flex items-center gap-1.5">
                  <UserPlus className="w-3.5 h-3.5" /> Tamu baru (walk-in)
                </div>
                {ibadah?.isKidsIbadah ? (
                  <p className="text-xs text-amber-700">Ibadah anak tidak menerima tamu walk-in — gunakan meja CKids.</p>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <input value={guestNama} onChange={(e) => setGuestNama(e.target.value)} placeholder="Nama lengkap" className={inputCls} />
                      <input value={guestHp} onChange={(e) => setGuestHp(e.target.value)} placeholder="No HP (08… / +65…)" inputMode="tel" className={inputCls} />
                    </div>
                    <p className="text-[11px] text-neutral-500">
                      Kalau no HP ternyata milik jemaat terdaftar, jemaat itu yang dicatat hadir. Tamu lama dengan no HP sama dipakai ulang.
                    </p>
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setGuestOpen(false)} className="px-3 py-1.5 text-xs text-neutral-600 hover:bg-white rounded-lg">
                        Batal
                      </button>
                      <button
                        onClick={() => guest.mutate()}
                        disabled={!ready || busy || guestNama.trim().length < 2 || guestHp.trim().length < 8}
                        className="px-3 py-1.5 text-xs font-semibold text-white bg-violet-600 hover:bg-violet-700 rounded-lg disabled:opacity-50 inline-flex items-center gap-1.5"
                      >
                        {guest.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        Catat hadir
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <button
                onClick={() => setGuestOpen(true)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-violet-700 hover:underline"
              >
                <UserPlus className="w-3.5 h-3.5" /> Catat tamu baru
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            <div className="px-6 py-2 text-[11px] uppercase tracking-wider text-neutral-500 font-semibold sticky top-0 bg-white border-b border-neutral-100">
              Riwayat sesi ini ({log.length})
            </div>
            {log.length === 0 ? (
              <p className="text-xs text-neutral-400 italic text-center py-5">Belum ada check-in.</p>
            ) : (
              <ul className="divide-y divide-neutral-100">
                {log.map((h, i) => (
                  <li key={i} className={`flex items-center gap-3 px-6 py-2 text-sm ${h.ok ? 'bg-green-50/40' : 'bg-red-50/40'}`}>
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${h.ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {h.ok ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="font-medium text-neutral-900">{h.nama}</span>
                      {h.tamu ? (
                        <span className="ml-1.5 text-[10px] font-semibold uppercase bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded">Tamu</span>
                      ) : null}
                      <span className={`block text-xs ${h.ok ? 'text-neutral-500' : 'text-red-600'}`}>{h.msg}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex justify-end gap-2 px-6 py-3 border-t border-neutral-100 bg-neutral-50">
            <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 rounded-lg">
              Selesai
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

// ============== Pickup Anak Modal (Modul 27) ==============
//
// Admin input 6-digit kode jemput dari parent + optional kode reservasi anak
// untuk disambiguation. Backend akan match reservasi + set pickedUpAt.

function PickupAnakModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [pickupCode, setPickupCode] = useState('');
  const [kodeReservasi, setKodeReservasi] = useState('');

  const scanMut = useMutation({
    mutationFn: async () =>
      apiClient.post('/admin/reservasi/pickup', {
        pickupCode: pickupCode.trim(),
        kodeReservasi: kodeReservasi.trim() ? kodeReservasi.trim().toUpperCase() : undefined,
      }),
    onSuccess: (res) => {
      toast.success(res.data.message ?? 'Pickup berhasil');
      setPickupCode('');
      setKodeReservasi('');
      onSuccess();
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message ?? 'Gagal pickup'),
  });

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md pointer-events-auto">
          <div className="px-6 py-4 border-b border-neutral-100">
            <h2 className="font-semibold text-neutral-900 flex items-center gap-2">
              🧒 Pickup Anak
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Input 6-digit kode jemput dari parent. Optional: scan QR anak juga
              untuk disambiguation.
            </p>
          </div>
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">
                Kode Jemput (6 digit) *
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                value={pickupCode}
                onChange={(e) => setPickupCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                autoFocus
                placeholder="123456"
                className="w-full px-3 py-3 text-center font-mono tracking-widest text-2xl border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-pink-500"
                maxLength={6}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-600 mb-1">
                Kode Reservasi Anak (opsional)
              </label>
              <input
                type="text"
                value={kodeReservasi}
                onChange={(e) => setKodeReservasi(e.target.value.toUpperCase())}
                placeholder="R7K2X9P (kalau ambiguous)"
                className="w-full px-3 py-2 font-mono tracking-widest text-sm border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-pink-500"
                maxLength={20}
              />
              <p className="text-xs text-neutral-400 mt-1">
                Backend request kode ini kalau ada 2+ anak dengan kode jemput sama.
              </p>
            </div>
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
              disabled={pickupCode.length !== 6 || scanMut.isPending}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-pink-600 hover:bg-pink-700 rounded-lg disabled:opacity-50"
            >
              {scanMut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Verify + Pickup
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
