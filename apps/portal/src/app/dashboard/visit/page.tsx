'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Handshake,
  Loader2,
  Search,
  MapPin,
  Calendar,
  Trash2,
  X,
  User as UserIcon,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';
import { ConfirmDelete } from '@/components/crud/confirm-delete';
import { useDebounce } from '@/lib/use-debounce';

interface JemaatLite {
  id: string;
  namaLengkap: string;
  fotoUrl: string | null;
  noHp: string | null;
  cabang: { id: string; nama: string };
}

interface VisitItem {
  id: string;
  judul: string;
  lokasi: string | null;
  noteDariInitiator: string | null;
  noteDariTarget: string | null;
  tanggalVisit: string;
  createdAt: string;
  updatedAt: string;
  initiator: JemaatLite;
  target: JemaatLite;
}

interface CabangLite {
  id: string;
  nama: string;
}

function formatTanggalLong(iso: string) {
  return new Date(iso).toLocaleString('id-ID', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function VisitPage() {
  const qc = useQueryClient();
  const apiBase = process.env.NEXT_PUBLIC_CORE_API_URL ?? '';
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filterCabangId, setFilterCabangId] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [detailItem, setDetailItem] = useState<VisitItem | null>(null);
  const [deleting, setDeleting] = useState<VisitItem | null>(null);

  const debouncedSearch = useDebounce(search, 300);

  const listQ = useQuery({
    queryKey: [
      'visit',
      { page, debouncedSearch, filterCabangId, filterFrom, filterTo },
    ],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, limit: 25, sortBy: 'tanggalVisit', sortOrder: 'desc' };
      if (debouncedSearch) params.search = debouncedSearch;
      if (filterCabangId) params.cabangId = filterCabangId;
      if (filterFrom) params.from = filterFrom;
      if (filterTo) params.to = filterTo;
      const res = await apiClient.get<{
        data: VisitItem[];
        meta: { page: number; limit: number; total: number; totalPages: number };
      }>('/admin/visit', { params });
      return res.data;
    },
  });

  const cabangQ = useQuery({
    queryKey: ['cabang', 'options'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: CabangLite[] }>('/admin/cabang', {
        params: { limit: 200 },
      });
      return res.data.data;
    },
    staleTime: 5 * 60_000,
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => apiClient.delete(`/admin/visit/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['visit'] });
      toast.success('Visit dihapus');
      setDeleting(null);
      setDetailItem(null);
    },
    onError: (err: any) =>
      toast.error(err.response?.data?.error?.message ?? 'Gagal hapus visit'),
  });

  const items = listQ.data?.data ?? [];
  const meta = listQ.data?.meta;

  function resetFilter() {
    setSearch('');
    setFilterCabangId('');
    setFilterFrom('');
    setFilterTo('');
    setPage(1);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
            <Handshake className="w-6 h-6" />
            Visit
          </h1>
          <p className="text-neutral-500 mt-1">
            Pertemuan antar jemaat lewat scan QR di mobile. Portal admin
            hanya menampilkan daftar — aktivitas create & notes dilakukan
            oleh jemaat di aplikasi mobile.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-neutral-200 rounded-xl p-4 mb-4 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[220px]">
          <label className="block text-xs font-medium text-neutral-600 mb-1">
            Cari judul / lokasi / nama peserta
          </label>
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
        <div className="w-44">
          <label className="block text-xs font-medium text-neutral-600 mb-1">Cabang</label>
          <select
            value={filterCabangId}
            onChange={(e) => {
              setFilterCabangId(e.target.value);
              setPage(1);
            }}
            className="w-full px-3 py-1.5 border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500 bg-white text-sm"
          >
            <option value="">Semua cabang</option>
            {(cabangQ.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.nama}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-neutral-600 mb-1">Dari</label>
          <input
            type="date"
            value={filterFrom}
            onChange={(e) => {
              setFilterFrom(e.target.value);
              setPage(1);
            }}
            className="px-3 py-1.5 border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-neutral-600 mb-1">Sampai</label>
          <input
            type="date"
            value={filterTo}
            onChange={(e) => {
              setFilterTo(e.target.value);
              setPage(1);
            }}
            className="px-3 py-1.5 border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500 text-sm"
          />
        </div>
        {(search || filterCabangId || filterFrom || filterTo) && (
          <button
            onClick={resetFilter}
            className="text-xs text-neutral-500 hover:text-neutral-900 underline"
          >
            Reset filter
          </button>
        )}
      </div>

      {/* List */}
      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        {listQ.isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-16 text-sm text-neutral-400 italic">
            Belum ada visit yang tercatat.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-xs uppercase text-neutral-500">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Judul / Lokasi</th>
                <th className="px-4 py-3 text-left font-semibold">Peserta</th>
                <th className="px-4 py-3 text-left font-semibold w-44">Tanggal</th>
                <th className="px-4 py-3 text-right font-semibold w-20"> </th>
              </tr>
            </thead>
            <tbody>
              {items.map((v) => (
                <tr
                  key={v.id}
                  className="border-t border-neutral-100 hover:bg-neutral-50 cursor-pointer"
                  onClick={() => setDetailItem(v)}
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-neutral-900">{v.judul}</div>
                    {v.lokasi && (
                      <div className="text-xs text-neutral-500 mt-0.5 flex items-center gap-1">
                        <MapPin className="w-3 h-3 shrink-0" />
                        <span className="truncate">{v.lokasi}</span>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <ParticipantBadge jemaat={v.initiator} role="initiator" apiBase={apiBase} />
                      <span className="text-neutral-300">↔</span>
                      <ParticipantBadge jemaat={v.target} role="target" apiBase={apiBase} />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-neutral-700">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-neutral-400" />
                      {formatTanggalLong(v.tanggalVisit)}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleting(v);
                      }}
                      className="p-1.5 hover:bg-red-50 rounded text-neutral-400 hover:text-red-600"
                      title="Hapus (moderasi)"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {meta && meta.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-100 text-xs text-neutral-500">
            <div>
              Halaman {meta.page} dari {meta.totalPages} · {meta.total} total
            </div>
            <div className="flex gap-1">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1 border border-neutral-300 rounded disabled:opacity-50 hover:bg-neutral-50"
              >
                ←
              </button>
              <button
                disabled={page >= meta.totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1 border border-neutral-300 rounded disabled:opacity-50 hover:bg-neutral-50"
              >
                →
              </button>
            </div>
          </div>
        )}
      </div>

      {detailItem && (
        <DetailModal
          visit={detailItem}
          apiBase={apiBase}
          onClose={() => setDetailItem(null)}
          onDelete={() => {
            setDeleting(detailItem);
          }}
        />
      )}

      <ConfirmDelete
        open={!!deleting}
        loading={deleteMut.isPending}
        onClose={() => setDeleting(null)}
        title="Hapus visit (moderasi)?"
        itemName={
          deleting
            ? `${deleting.initiator.namaLengkap} ↔ ${deleting.target.namaLengkap}: ${deleting.judul}`
            : undefined
        }
        onConfirm={() => deleting && deleteMut.mutate(deleting.id)}
      />
    </div>
  );
}

function ParticipantBadge({
  jemaat,
  role,
  apiBase,
}: {
  jemaat: JemaatLite;
  role: 'initiator' | 'target';
  apiBase: string;
}) {
  return (
    <Link
      href={`/dashboard/jemaat/${jemaat.id}`}
      onClick={(e) => e.stopPropagation()}
      className="flex items-center gap-2 min-w-0 hover:bg-white rounded px-1 py-0.5"
      title={role === 'initiator' ? 'Yang scan QR' : 'Yang di-scan'}
    >
      {jemaat.fotoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`${apiBase}${jemaat.fotoUrl}`}
          alt={jemaat.namaLengkap}
          className="w-7 h-7 rounded-full object-cover shrink-0"
        />
      ) : (
        <div className="w-7 h-7 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center shrink-0">
          <UserIcon className="w-3.5 h-3.5" />
        </div>
      )}
      <div className="min-w-0">
        <div className="font-medium text-neutral-900 truncate text-xs leading-tight">
          {jemaat.namaLengkap}
        </div>
        <div className="text-[10px] text-neutral-500 truncate">{jemaat.cabang.nama}</div>
      </div>
    </Link>
  );
}

function DetailModal({
  visit,
  apiBase,
  onClose,
  onDelete,
}: {
  visit: VisitItem;
  apiBase: string;
  onClose: () => void;
  onDelete: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl pointer-events-auto max-h-[90vh] flex flex-col">
          <div className="flex items-start justify-between px-6 py-4 border-b border-neutral-100">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-neutral-900 truncate">
                {visit.judul}
              </h2>
              <div className="flex items-center gap-3 text-xs text-neutral-500 mt-1 flex-wrap">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {formatTanggalLong(visit.tanggalVisit)}
                </span>
                {visit.lokasi && (
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {visit.lokasi}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-neutral-100 rounded-lg shrink-0 ml-3"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="overflow-y-auto p-6 space-y-4">
            <SideCard
              title="Initiator (yang scan QR)"
              jemaat={visit.initiator}
              note={visit.noteDariInitiator}
              noteLabel={`Catatan ${visit.initiator.namaLengkap} untuk ${visit.target.namaLengkap}`}
              apiBase={apiBase}
            />
            <SideCard
              title="Target (yang di-scan)"
              jemaat={visit.target}
              note={visit.noteDariTarget}
              noteLabel={`Catatan ${visit.target.namaLengkap} untuk ${visit.initiator.namaLengkap}`}
              apiBase={apiBase}
            />
          </div>

          <div className="flex justify-between gap-2 px-6 py-4 border-t border-neutral-100 bg-neutral-50">
            <button
              onClick={onDelete}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg"
            >
              <Trash2 className="w-4 h-4" />
              Hapus (moderasi)
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 rounded-lg"
            >
              Tutup
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function SideCard({
  title,
  jemaat,
  note,
  noteLabel,
  apiBase,
}: {
  title: string;
  jemaat: JemaatLite;
  note: string | null;
  noteLabel: string;
  apiBase: string;
}) {
  return (
    <div className="border border-neutral-200 rounded-xl p-4">
      <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold mb-2">
        {title}
      </div>
      <Link
        href={`/dashboard/jemaat/${jemaat.id}`}
        className="flex items-center gap-3 hover:bg-neutral-50 rounded-lg p-1 -m-1 mb-3"
      >
        {jemaat.fotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`${apiBase}${jemaat.fotoUrl}`}
            alt={jemaat.namaLengkap}
            className="w-10 h-10 rounded-full object-cover shrink-0"
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center shrink-0">
            <UserIcon className="w-5 h-5" />
          </div>
        )}
        <div className="min-w-0">
          <div className="font-semibold text-neutral-900 truncate">{jemaat.namaLengkap}</div>
          <div className="text-xs text-neutral-500">{jemaat.cabang.nama}</div>
        </div>
      </Link>
      <div className="text-xs font-medium text-neutral-600 mb-1">{noteLabel}:</div>
      {note ? (
        <div className="text-sm text-neutral-700 whitespace-pre-wrap bg-neutral-50 p-3 rounded-lg border border-neutral-100">
          {note}
        </div>
      ) : (
        <div className="text-xs text-neutral-400 italic">Belum ada catatan.</div>
      )}
    </div>
  );
}
