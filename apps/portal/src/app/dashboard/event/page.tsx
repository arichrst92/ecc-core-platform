'use client';

import { useState } from 'react';
import { usePersistentState } from '@/lib/use-persistent-state';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Megaphone,
  Plus,
  Loader2,
  Eye,
  EyeOff,
  Trash2,
  Calendar,
  MapPin,
  Users,
  CircleDollarSign,
  Image as ImageIcon,
  Pencil,
  ChevronLeft,
  ChevronRight,
  CalendarClock,
  History,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';
import { ConfirmDelete } from '@/components/crud/confirm-delete';
import { EventFormModal, type EventFormValues } from '@/components/event/event-form-modal';

interface EventListItem {
  id: string;
  judul: string;
  slug: string;
  ringkasan: string | null;
  heroImageUrl: string | null;
  tanggalMulai: string;
  tanggalSelesai: string | null;
  lokasi: string | null;
  sinode: { id: string; nama: string } | null;
  cabang: { id: string; nama: string } | null;
  tipeBayar: 'GRATIS' | 'NOMINAL_TETAP' | 'NOMINAL_BEBAS';
  nominal: string | null;
  quotaPeserta: number | null;
  isPublished: boolean;
  isActive: boolean;
  pesertaCount: number;
}

const PAGE_SIZE = 30;

const TIPE_BAYAR_LABEL: Record<EventListItem['tipeBayar'], string> = {
  GRATIS: 'Gratis',
  NOMINAL_TETAP: 'Berbayar (tetap)',
  NOMINAL_BEBAS: 'Sukarela',
};

const TIPE_BAYAR_COLOR: Record<EventListItem['tipeBayar'], string> = {
  GRATIS: 'bg-green-100 text-green-700',
  NOMINAL_TETAP: 'bg-amber-100 text-amber-700',
  NOMINAL_BEBAS: 'bg-blue-100 text-blue-700',
};

function formatNominal(n: string | null): string {
  if (!n) return '-';
  const num = Number(n);
  if (!Number.isFinite(num)) return '-';
  return `Rp ${num.toLocaleString('id-ID')}`;
}

function formatRangeTanggal(mulai: string, selesai: string | null) {
  const m = new Date(mulai).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  if (!selesai) return m;
  const s = new Date(selesai).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  return m === s ? m : `${m} – ${s}`;
}

function targetLabel(item: EventListItem): string {
  if (item.cabang) return `Cabang · ${item.cabang.nama}`;
  if (item.sinode) return `Sinode · ${item.sinode.nama}`;
  return 'Global';
}

export default function EventPage() {
  const qc = useQueryClient();
  const apiBase = process.env.NEXT_PUBLIC_CORE_API_URL ?? '';

  // Filter disimpan per tab → tetap terisi saat kembali dari detail event.
  const [search, setSearch] = usePersistentState('event:search', '');
  const [filterStatus, setFilterStatus] = usePersistentState<'all' | 'published' | 'draft'>('event:status', 'all');
  const [filterTipe, setFilterTipe] = usePersistentState<'all' | EventListItem['tipeBayar']>('event:tipe', 'all');
  const [periode, setPeriode] = usePersistentState<'upcoming' | 'past'>('event:periode', 'upcoming');
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<EventListItem | null>(null);
  const [deleting, setDeleting] = useState<EventListItem | null>(null);

  const listQ = useQuery({
    queryKey: ['event', 'list', { search, filterStatus, filterTipe, periode, page }],
    queryFn: async () => {
      const res = await apiClient.get<{
        data: EventListItem[];
        meta: { totalPages: number; counts?: { upcoming: number; past: number } };
      }>('/admin/event', {
        params: {
          limit: PAGE_SIZE,
          page,
          periode,
          search: search || undefined,
          isPublished:
            filterStatus === 'all' ? undefined : filterStatus === 'published' ? 'true' : 'false',
          tipeBayar: filterTipe === 'all' ? undefined : filterTipe,
        },
      });
      return res.data;
    },
    placeholderData: (prev) => prev,
  });

  // Helper: extract pesan error termasuk field-level dari ZodError flatten.
  function formatValidationError(err: any, fallback: string): string {
    const data = err.response?.data?.error;
    if (!data) return fallback;
    const fieldErrors = data.details?.fieldErrors as
      | Record<string, string[] | undefined>
      | undefined;
    if (fieldErrors) {
      const fieldMsgs: string[] = [];
      for (const [field, msgs] of Object.entries(fieldErrors)) {
        if (msgs && msgs.length) fieldMsgs.push(`${field}: ${msgs.join(', ')}`);
      }
      if (fieldMsgs.length) return `${data.message ?? 'Input tidak valid'}\n${fieldMsgs.join('\n')}`;
    }
    const formErrors = data.details?.formErrors as string[] | undefined;
    if (formErrors && formErrors.length) {
      return `${data.message ?? 'Input tidak valid'}\n${formErrors.join('\n')}`;
    }
    return data.message ?? fallback;
  }

  const createMut = useMutation({
    mutationFn: async (values: EventFormValues) => apiClient.post('/admin/event', values),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['event', 'list'] });
      toast.success('Event berhasil dibuat');
      setCreateOpen(false);
    },
    onError: (err: any) => {
      toast.error(formatValidationError(err, 'Gagal membuat event'), { duration: 6000 });
    },
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: EventFormValues }) =>
      apiClient.patch(`/admin/event/${id}`, values),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['event', 'list'] });
      toast.success('Event diperbarui');
      setEditing(null);
    },
    onError: (err: any) => {
      toast.error(formatValidationError(err, 'Gagal update'), { duration: 6000 });
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => apiClient.delete(`/admin/event/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['event', 'list'] });
      toast.success('Event dihapus');
      setDeleting(null);
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message ?? 'Gagal hapus'),
  });

  const events = listQ.data?.data ?? [];
  const counts = listQ.data?.meta.counts;
  const totalPages = listQ.data?.meta.totalPages ?? 1;
  // Ganti filter / tab → kembali ke halaman 1.
  const resetPage = <T,>(fn: (v: T) => void) => (v: T) => {
    setPage(1);
    fn(v);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
            <Megaphone className="w-6 h-6 text-brand-500" /> Event
          </h1>
          <p className="text-neutral-500 mt-1">
            Aktivitas berbatas waktu — penggalangan dana, retreat, puasa, KKR, dll.
          </p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded-lg font-medium text-sm"
        >
          <Plus className="w-4 h-4" />
          Tambah Event
        </button>
      </div>

      {/* Tab periode */}
      <div className="flex gap-1 mb-3 bg-neutral-100 p-1 rounded-xl w-fit">
        {(
          [
            ['upcoming', 'Akan Datang', CalendarClock],
            ['past', 'Sudah Lewat', History],
          ] as const
        ).map(([key, label, Icon]) => (
          <button
            key={key}
            onClick={() => resetPage(setPeriode)(key)}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition ${
              periode === key ? 'bg-white text-brand-700 shadow-sm' : 'text-neutral-600 hover:text-neutral-900'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
            {counts ? (
              <span className={`text-xs px-1.5 rounded-full ${periode === key ? 'bg-brand-100 text-brand-700' : 'bg-neutral-200 text-neutral-600'}`}>
                {counts[key]}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {/* Filter bar */}
      <div className="bg-white border border-neutral-200 rounded-lg p-3 mb-4 flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[200px]">
          <span className="block text-[11px] text-neutral-500 font-medium mb-0.5">Cari</span>
          <input
            value={search}
            onChange={(e) => resetPage(setSearch)(e.target.value)}
            placeholder="Judul atau ringkasan..."
            className="w-full px-3 py-1.5 border border-neutral-300 rounded text-sm outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <div>
          <span className="block text-[11px] text-neutral-500 font-medium mb-0.5">Status</span>
          <select
            value={filterStatus}
            onChange={(e) => resetPage(setFilterStatus)(e.target.value as typeof filterStatus)}
            className="px-2 py-1.5 border border-neutral-300 rounded text-sm bg-white"
          >
            <option value="all">Semua</option>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
          </select>
        </div>
        <div>
          <span className="block text-[11px] text-neutral-500 font-medium mb-0.5">Tipe Bayar</span>
          <select
            value={filterTipe}
            onChange={(e) => resetPage(setFilterTipe)(e.target.value as typeof filterTipe)}
            className="px-2 py-1.5 border border-neutral-300 rounded text-sm bg-white"
          >
            <option value="all">Semua</option>
            <option value="GRATIS">Gratis</option>
            <option value="NOMINAL_TETAP">Nominal Tetap</option>
            <option value="NOMINAL_BEBAS">Nominal Bebas / Sukarela</option>
          </select>
        </div>
      </div>

      {/* Grid */}
      {listQ.isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
        </div>
      ) : events.length === 0 ? (
        <div className="bg-white border border-neutral-200 rounded-xl p-12 text-center text-neutral-500">
          <Megaphone className="w-10 h-10 mx-auto mb-3 text-neutral-300" />
          <p className="font-medium">{periode === 'upcoming' ? 'Belum ada event yang akan datang.' : 'Belum ada event yang sudah lewat.'}</p>
          {periode === 'upcoming' && (
            <p className="text-sm mt-1">
              Klik <strong>Tambah Event</strong> untuk membuat event baru.
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {events.map((e) => (
              <div
                key={e.id}
                className={`bg-white border rounded-xl overflow-hidden flex ${
                  e.isPublished ? 'border-neutral-200' : 'border-dashed border-neutral-300'
                }`}
              >
                {/* Gambar — rasio asli (contain) di atas latar blur */}
                <Link
                  href={`/dashboard/event/${e.id}`}
                  className="relative w-36 sm:w-56 shrink-0 self-stretch min-h-[9rem] bg-neutral-100 overflow-hidden"
                >
                  {e.heroImageUrl ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`${apiBase}${e.heroImageUrl}`}
                        alt=""
                        aria-hidden
                        className="absolute inset-0 w-full h-full object-cover scale-110 blur-xl opacity-60"
                      />
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`${apiBase}${e.heroImageUrl}`}
                        alt={e.judul}
                        className="absolute inset-0 w-full h-full object-contain"
                      />
                    </>
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-neutral-300">
                      <ImageIcon className="w-8 h-8" />
                      <span className="text-[11px] mt-1">Belum ada gambar</span>
                    </div>
                  )}
                </Link>

                {/* Isi */}
                <div className="flex-1 min-w-0 p-3 sm:p-4 flex flex-col">
                  <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                    <span
                      className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                        e.isPublished ? 'bg-green-100 text-green-700' : 'bg-neutral-200 text-neutral-700'
                      }`}
                    >
                      {e.isPublished ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                      {e.isPublished ? 'Published' : 'Belum publish'}
                    </span>
                    {!e.isActive && (
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">Nonaktif</span>
                    )}
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${TIPE_BAYAR_COLOR[e.tipeBayar]}`}>
                      {TIPE_BAYAR_LABEL[e.tipeBayar]}
                    </span>
                  </div>
                  <Link
                    href={`/dashboard/event/${e.id}`}
                    className="font-semibold text-neutral-900 hover:text-brand-600 hover:underline line-clamp-2"
                  >
                    {e.judul}
                  </Link>
                  {e.ringkasan && <p className="text-sm text-neutral-600 mt-0.5 line-clamp-1">{e.ringkasan}</p>}
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs text-neutral-500">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Calendar className="w-3 h-3 shrink-0" />
                      <span className="truncate">{formatRangeTanggal(e.tanggalMulai, e.tanggalSelesai)}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Users className="w-3 h-3 shrink-0" />
                      {e.pesertaCount}
                      {e.quotaPeserta != null ? `/${e.quotaPeserta}` : ''} peserta
                    </div>
                    {e.lokasi && (
                      <div className="flex items-center gap-1.5 min-w-0">
                        <MapPin className="w-3 h-3 shrink-0" />
                        <span className="truncate">{e.lokasi}</span>
                      </div>
                    )}
                    {e.tipeBayar !== 'GRATIS' && (
                      <div className="flex items-center gap-1.5">
                        <CircleDollarSign className="w-3 h-3 shrink-0" />
                        {e.tipeBayar === 'NOMINAL_BEBAS'
                          ? e.nominal
                            ? `min ${formatNominal(e.nominal)}`
                            : 'sukarela'
                          : formatNominal(e.nominal)}
                      </div>
                    )}
                  </div>

                  <div className="mt-auto pt-2.5 flex items-center gap-1 text-xs">
                    <span className="text-[10px] text-neutral-400 uppercase tracking-wider truncate mr-auto">{targetLabel(e)}</span>
                    <Link
                      href={`/dashboard/event/${e.id}`}
                      className="flex items-center gap-1 px-2 py-1 rounded text-brand-600 hover:bg-brand-50"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Detail
                    </Link>
                    <button
                      onClick={() => setEditing(e)}
                      className="flex items-center gap-1 px-2 py-1 rounded text-neutral-600 hover:bg-neutral-100"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      Edit
                    </button>
                    <button
                      onClick={() => setDeleting(e)}
                      className="flex items-center gap-1 px-2 py-1 rounded text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Hapus
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-4 text-sm">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-neutral-300 bg-white disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" /> Sebelumnya
              </button>
              <span className="text-neutral-600">
                Halaman {page} / {totalPages}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-neutral-300 bg-white disabled:opacity-40"
              >
                Berikutnya <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </>
      )}

      {/* Modals */}
      <EventFormModal
        open={createOpen}
        title="Tambah Event"
        loading={createMut.isPending}
        onClose={() => setCreateOpen(false)}
        onSubmit={(v) => createMut.mutateAsync(v)}
      />
      <EventFormModal
        open={!!editing}
        title="Edit Event"
        loading={updateMut.isPending}
        defaultValues={editing as unknown as EventFormValues}
        isEdit
        onClose={() => setEditing(null)}
        onSubmit={(v) => updateMut.mutateAsync({ id: editing!.id, values: v })}
      />
      <ConfirmDelete
        open={!!deleting}
        loading={deleteMut.isPending}
        title="Hapus event?"
        itemName={deleting?.judul}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && deleteMut.mutateAsync(deleting.id)}
      />
    </div>
  );
}
