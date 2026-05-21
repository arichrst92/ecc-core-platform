'use client';

import { useState } from 'react';
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

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'published' | 'draft'>('all');
  const [filterTipe, setFilterTipe] = useState<'all' | EventListItem['tipeBayar']>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<EventListItem | null>(null);
  const [deleting, setDeleting] = useState<EventListItem | null>(null);

  const listQ = useQuery({
    queryKey: ['event', 'list', { search, filterStatus, filterTipe }],
    queryFn: async () => {
      const res = await apiClient.get<{ data: EventListItem[] }>('/admin/event', {
        params: {
          limit: 50,
          search: search || undefined,
          isPublished:
            filterStatus === 'all' ? undefined : filterStatus === 'published' ? 'true' : 'false',
          tipeBayar: filterTipe === 'all' ? undefined : filterTipe,
        },
      });
      return res.data.data;
    },
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

  const events = listQ.data ?? [];

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

      {/* Filter bar */}
      <div className="bg-white border border-neutral-200 rounded-lg p-3 mb-4 flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[200px]">
          <span className="block text-[11px] text-neutral-500 font-medium mb-0.5">Cari</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Judul atau ringkasan..."
            className="w-full px-3 py-1.5 border border-neutral-300 rounded text-sm outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <div>
          <span className="block text-[11px] text-neutral-500 font-medium mb-0.5">Status</span>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}
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
            onChange={(e) => setFilterTipe(e.target.value as typeof filterTipe)}
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
          <p className="font-medium">Belum ada event.</p>
          <p className="text-sm mt-1">Klik <strong>Tambah Event</strong> untuk membuat yang pertama.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {events.map((e) => (
            <div
              key={e.id}
              className="bg-white border border-neutral-200 rounded-xl overflow-hidden flex flex-col"
            >
              {/* Hero */}
              <Link
                href={`/dashboard/event/${e.id}`}
                className="block aspect-video bg-neutral-100 relative overflow-hidden"
              >
                {e.heroImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`${apiBase}${e.heroImageUrl}`}
                    alt={e.judul}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-neutral-300">
                    <ImageIcon className="w-10 h-10" />
                    <span className="text-xs mt-1">Belum ada hero</span>
                  </div>
                )}
                <div className="absolute top-2 left-2 flex gap-1 flex-wrap">
                  <span
                    className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded ${
                      e.isPublished
                        ? 'bg-green-600 text-white'
                        : 'bg-neutral-700 text-white'
                    }`}
                  >
                    {e.isPublished ? 'Published' : 'Draft'}
                  </span>
                  <span
                    className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded ${TIPE_BAYAR_COLOR[e.tipeBayar]}`}
                  >
                    {TIPE_BAYAR_LABEL[e.tipeBayar]}
                  </span>
                </div>
              </Link>

              {/* Body */}
              <div className="p-4 flex-1 flex flex-col">
                <Link
                  href={`/dashboard/event/${e.id}`}
                  className="font-semibold text-neutral-900 hover:text-brand-600 hover:underline line-clamp-2"
                >
                  {e.judul}
                </Link>
                {e.ringkasan && (
                  <p className="text-sm text-neutral-600 mt-1 line-clamp-2">{e.ringkasan}</p>
                )}
                <div className="mt-2 space-y-1 text-xs text-neutral-500">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3 h-3" />
                    {formatRangeTanggal(e.tanggalMulai, e.tanggalSelesai)}
                  </div>
                  {e.lokasi && (
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-3 h-3" />
                      <span className="truncate">{e.lokasi}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5">
                    <Users className="w-3 h-3" />
                    {e.pesertaCount}
                    {e.quotaPeserta != null ? `/${e.quotaPeserta}` : ''} peserta
                  </div>
                  {e.tipeBayar !== 'GRATIS' && (
                    <div className="flex items-center gap-1.5">
                      <CircleDollarSign className="w-3 h-3" />
                      {e.tipeBayar === 'NOMINAL_BEBAS'
                        ? e.nominal
                          ? `min ${formatNominal(e.nominal)}`
                          : 'sukarela'
                        : formatNominal(e.nominal)}
                    </div>
                  )}
                  <div className="text-[10px] mt-1 text-neutral-400 uppercase tracking-wider">
                    {targetLabel(e)}
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-neutral-100 flex items-center gap-1 text-xs">
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
                    {e.isPublished ? (
                      <EyeOff className="w-3.5 h-3.5" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" />
                    )}
                    Edit
                  </button>
                  <button
                    onClick={() => setDeleting(e)}
                    className="ml-auto flex items-center gap-1 px-2 py-1 rounded text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Hapus
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
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
