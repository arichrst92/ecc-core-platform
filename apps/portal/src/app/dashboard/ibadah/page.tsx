'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Eye,
  Pencil,
  Trash2,
  Loader2,
  Calendar,
  CalendarDays,
  List,
  Users,
  HandHeart,
  ChevronDown,
  ChevronRight,
  Church,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';
import { FormModal } from '@/components/crud/form-modal';
import { ConfirmDelete } from '@/components/crud/confirm-delete';
import { ibadahResource } from '@/lib/resources/ibadah-config';
import { CalendarView } from '@/components/ibadah/calendar-view';

// Index signature wajib karena FormModal generic constraint `T extends
// Record<string, unknown>` (lihat components/crud/form-modal.tsx).
// Pattern sama seperti resource configs lain (Cabang, Homecell, Jemaat).
interface IbadahItem extends Record<string, unknown> {
  id: string;
  nama: string;
  tipeJadwal: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'ONCE';
  tanggalMulai: string;
  hari: string | null;
  jamMulai: string;
  jamSelesai: string;
  lokasi: string | null;
  isOnline: boolean;
  isActive: boolean;
  cabang?: { id: string; nama: string };
  kategoriIbadah?: { id: string; nama: string };
  petugasCount?: number;
  pelayananCount?: number;
}

const HARI_LABEL: Record<string, string> = {
  MINGGU: 'Minggu', SENIN: 'Senin', SELASA: 'Selasa', RABU: 'Rabu',
  KAMIS: 'Kamis', JUMAT: 'Jumat', SABTU: 'Sabtu',
};
const TIPE_LABEL: Record<string, string> = {
  WEEKLY: 'Mingguan', BIWEEKLY: '2 Mingguan', MONTHLY: 'Bulanan', ONCE: 'Sekali',
};

export default function IbadahPage() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<IbadahItem | null>(null);
  const [deleting, setDeleting] = useState<IbadahItem | null>(null);
  const [view, setView] = useState<'list' | 'calendar'>('list');
  // Filter cabang — kalau di-set ke specific cabangId, list dan calendar
  // cuma show cabang itu. Default 'all' = tampilkan semua cabang.
  const [cabangFilter, setCabangFilter] = useState<string>('all');

  const listQ = useQuery({
    queryKey: ['ibadah', 'all'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: IbadahItem[] }>('/admin/ibadah', {
        params: { limit: 200 },
      });
      return res.data.data;
    },
  });

  const items = listQ.data ?? [];

  // Daftar cabang unique untuk dropdown filter (dari data ibadah).
  const cabangOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const i of items) {
      if (i.cabang?.id && !seen.has(i.cabang.id)) {
        seen.set(i.cabang.id, i.cabang.nama);
      }
    }
    return [...seen.entries()]
      .map(([id, nama]) => ({ id, nama }))
      .sort((a, b) => a.nama.localeCompare(b.nama));
  }, [items]);

  // Apply filter cabang sebelum grouping.
  const filteredItems = useMemo(
    () => (cabangFilter === 'all' ? items : items.filter((i) => i.cabang?.id === cabangFilter)),
    [items, cabangFilter],
  );

  // Group by cabang.nama. "Tanpa Cabang" untuk row tanpa cabang (defensive
  // — seharusnya tidak terjadi karena cabangId required di schema).
  const grouped = useMemo(() => {
    const map = new Map<string, IbadahItem[]>();
    for (const i of filteredItems) {
      const key = i.cabang?.nama ?? 'Tanpa Cabang';
      const arr = map.get(key) ?? [];
      arr.push(i);
      map.set(key, arr);
    }
    // Sort items di dalam tiap cabang by kategori → nama
    for (const arr of map.values()) {
      arr.sort((a, b) => {
        const ka = a.kategoriIbadah?.nama ?? '';
        const kb = b.kategoriIbadah?.nama ?? '';
        if (ka !== kb) return ka.localeCompare(kb);
        return a.nama.localeCompare(b.nama);
      });
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filteredItems]);

  const createMut = useMutation({
    mutationFn: async (input: Record<string, unknown>) => apiClient.post('/admin/ibadah', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ibadah'] });
      toast.success('Ibadah ditambah');
      setCreateOpen(false);
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message ?? 'Gagal'),
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, input }: { id: string; input: Record<string, unknown> }) =>
      apiClient.patch(`/admin/ibadah/${id}`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ibadah'] });
      toast.success('Perubahan tersimpan');
      setEditing(null);
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message ?? 'Gagal'),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => apiClient.delete(`/admin/ibadah/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ibadah'] });
      toast.success('Ibadah dihapus');
      setDeleting(null);
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message ?? 'Gagal'),
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
            <Calendar className="w-6 h-6" />
            Ibadah
          </h1>
          <p className="text-neutral-500 mt-1">
            {view === 'list'
              ? 'Jadwal ibadah dikelompokkan per cabang.'
              : 'Tampilan kalender per cabang — recurring occurrences di-generate otomatis.'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Cabang filter — apply ke list view + calendar view */}
          <div className="flex items-center gap-1.5">
            <Church className="w-4 h-4 text-neutral-400" />
            <select
              value={cabangFilter}
              onChange={(e) => setCabangFilter(e.target.value)}
              className="px-2.5 py-1.5 text-sm border border-neutral-300 rounded-lg focus:outline-none focus:border-brand-500"
              title="Filter per cabang"
            >
              <option value="all">Semua Cabang</option>
              {cabangOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nama}
                </option>
              ))}
            </select>
          </div>

          {/* View toggle */}
          <div className="inline-flex border border-neutral-300 rounded-lg overflow-hidden">
            <button
              onClick={() => setView('list')}
              className={`px-3 py-1.5 text-sm font-medium flex items-center gap-1.5 ${
                view === 'list' ? 'bg-brand-500 text-white' : 'text-neutral-600 hover:bg-neutral-50'
              }`}
            >
              <List className="w-4 h-4" />
              List
            </button>
            <button
              onClick={() => setView('calendar')}
              className={`px-3 py-1.5 text-sm font-medium flex items-center gap-1.5 border-l border-neutral-300 ${
                view === 'calendar' ? 'bg-brand-500 text-white' : 'text-neutral-600 hover:bg-neutral-50'
              }`}
            >
              <CalendarDays className="w-4 h-4" />
              Kalender
            </button>
          </div>
          <button
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded-lg font-medium text-sm"
          >
            <Plus className="w-4 h-4" />
            Tambah Ibadah
          </button>
        </div>
      </div>

      {view === 'calendar' ? (
        <CalendarView cabangFilter={cabangFilter} cabangOptions={cabangOptions} />
      ) : listQ.isLoading ? (
        <div className="bg-white border border-neutral-200 rounded-xl p-12 text-center">
          <Loader2 className="w-5 h-5 mx-auto animate-spin text-neutral-400" />
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white border border-neutral-200 rounded-xl p-12 text-center text-neutral-400">
          Belum ada ibadah. Klik <strong>Tambah Ibadah</strong> di atas.
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(([cabang, list]) => (
            <CabangSection
              key={cabang}
              cabang={cabang}
              items={list}
              onEdit={setEditing}
              onDelete={setDeleting}
            />
          ))}
        </div>
      )}

      <FormModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Tambah Ibadah"
        schema={ibadahResource.createSchema}
        fields={ibadahResource.fields}
        defaultValues={Object.fromEntries(
          ibadahResource.fields
            .filter((f) => f.defaultValue !== undefined)
            .map((f) => [f.name, f.defaultValue]),
        )}
        loading={createMut.isPending}
        onSubmit={async (v) => {
          await createMut.mutateAsync(v as Record<string, unknown>);
        }}
      />
      <FormModal
        open={!!editing}
        onClose={() => setEditing(null)}
        title="Edit Ibadah"
        schema={ibadahResource.updateSchema}
        fields={ibadahResource.fields}
        defaultValues={editing ?? undefined}
        isEdit
        loading={updateMut.isPending}
        onSubmit={async (v) => {
          if (!editing) return;
          await updateMut.mutateAsync({ id: editing.id, input: v as Record<string, unknown> });
        }}
      />
      <ConfirmDelete
        open={!!deleting}
        loading={deleteMut.isPending}
        onClose={() => setDeleting(null)}
        itemName={deleting?.nama}
        onConfirm={() => deleting && deleteMut.mutate(deleting.id)}
      />
    </div>
  );
}

function CabangSection({
  cabang,
  items,
  onEdit,
  onDelete,
}: {
  cabang: string;
  items: IbadahItem[];
  onEdit: (i: IbadahItem) => void;
  onDelete: (i: IbadahItem) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  // Hitung unique kategori untuk display di header.
  const kategoriCount = new Set(items.map((i) => i.kategoriIbadah?.nama ?? '-')).size;
  return (
    <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3 bg-neutral-50 hover:bg-neutral-100 border-b border-neutral-100"
      >
        <div className="flex items-center gap-2">
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-neutral-500" />
          ) : (
            <ChevronRight className="w-4 h-4 text-neutral-500" />
          )}
          <Church className="w-4 h-4 text-brand-500" />
          <span className="font-semibold text-neutral-900">{cabang}</span>
          <span className="text-xs text-neutral-500 ml-1">
            ({items.length} ibadah · {kategoriCount} kategori)
          </span>
        </div>
      </button>

      {expanded && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50/50 border-b border-neutral-100 text-neutral-600 uppercase text-xs">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Nama Ibadah</th>
                <th className="px-4 py-2 text-left font-medium" style={{ width: '160px' }}>Kategori</th>
                <th className="px-4 py-2 text-left font-medium" style={{ width: '170px' }}>Jadwal</th>
                <th className="px-4 py-2 text-left font-medium" style={{ width: '110px' }}>Jam</th>
                <th className="px-4 py-2 text-center font-medium" style={{ width: '110px' }}>Pelayan</th>
                <th className="px-4 py-2 text-center font-medium" style={{ width: '80px' }}>Status</th>
                <th className="px-4 py-2 text-right font-medium" style={{ width: '90px' }}></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {items.map((i) => (
                <tr key={i.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/dashboard/ibadah/${i.id}`}
                      className="flex items-center gap-1.5 text-brand-600 hover:underline font-medium"
                    >
                      <Eye className="w-3.5 h-3.5 shrink-0" />
                      {i.nama}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">
                    {i.kategoriIbadah?.nama ? (
                      <span className="inline-block px-2 py-0.5 text-xs rounded bg-neutral-100 text-neutral-700">
                        {i.kategoriIbadah.nama}
                      </span>
                    ) : (
                      <span className="text-neutral-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-neutral-700">
                    {TIPE_LABEL[i.tipeJadwal] ?? i.tipeJadwal}
                    {i.tipeJadwal === 'ONCE'
                      ? ` · ${new Date(i.tanggalMulai).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}`
                      : i.hari
                        ? ` · ${HARI_LABEL[i.hari] ?? i.hari}`
                        : ''}
                  </td>
                  <td className="px-4 py-2.5 text-neutral-700 tabular-nums">
                    {i.jamMulai}–{i.jamSelesai}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <Link
                      href={`/dashboard/ibadah/${i.id}`}
                      className="inline-flex items-center gap-1.5 text-xs"
                      title={`${i.petugasCount ?? 0} petugas terdaftar di ${i.pelayananCount ?? 0} pelayanan`}
                    >
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-brand-50 text-brand-700 rounded">
                        <Users className="w-3 h-3" />
                        {i.petugasCount ?? 0}
                      </span>
                      <span className="text-neutral-400 inline-flex items-center gap-0.5">
                        / <HandHeart className="w-3 h-3" />
                        {i.pelayananCount ?? 0}
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {i.isActive ? (
                      <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-700">
                        Aktif
                      </span>
                    ) : (
                      <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-neutral-100 text-neutral-500">
                        Nonaktif
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => onEdit(i)}
                        className="p-1.5 rounded hover:bg-brand-50 text-neutral-600 hover:text-brand-600"
                        title="Edit"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => onDelete(i)}
                        className="p-1.5 rounded hover:bg-red-50 text-neutral-600 hover:text-red-600"
                        title="Hapus"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
