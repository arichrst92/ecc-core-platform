'use client';

/**
 * Daftar Pelayanan (Ministry) — ringkasan, cari & saring, kartu per pelayanan.
 * Pengelolaan detail (anggota, peran, tugas petugas, pendaftaran & koordinator,
 * penugasan) ada di halaman detail: /dashboard/pelayanan/<id>?tab=…
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarCheck,
  ChevronRight,
  Crown,
  HandHeart,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserPlus,
  Users as UsersIcon,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';
import { ConfirmDelete } from '@/components/crud/confirm-delete';
import { PelayananIcon } from '@/components/pelayanan/pelayanan-icon';
import {
  EditPelayananModal,
  ForceDeleteModal,
  roleTone,
  usePendingJoinCounts,
  type Pelayanan,
} from '@/components/pelayanan/pelayanan-manage';
import { usePersistentState } from '@/lib/use-persistent-state';

type StatusFilter = 'aktif' | 'nonaktif' | 'semua';
type SortKey = 'nama' | 'anggota' | 'permintaan';

export default function PelayananPage() {
  const qc = useQueryClient();
  const [deleting, setDeleting] = useState<Pelayanan | null>(null);
  // Pelayanan masih beranggota → tawarkan hapus permanen (ketik nama).
  const [forceDel, setForceDel] = useState<{ id: string; label: string; members: number; active: number; message: string } | null>(null);
  const [editingPel, setEditingPel] = useState<Pelayanan | null>(null);
  const [adding, setAdding] = useState(false);
  const [newNama, setNewNama] = useState('');
  const [search, setSearch] = usePersistentState('pelayanan:list:search', '');
  const [status, setStatus] = usePersistentState<StatusFilter>('pelayanan:list:status', 'aktif');
  const [sort, setSort] = usePersistentState<SortKey>('pelayanan:list:sort', 'nama');
  const pending = usePendingJoinCounts();

  const { data, isLoading } = useQuery({
    queryKey: ['pelayanan', 'tree'],
    queryFn: async () => (await apiClient.get<{ data: Pelayanan[] }>('/admin/pelayanan', { params: { limit: 100 } })).data.data,
  });
  const list = data ?? [];

  const createPelayanan = useMutation({
    mutationFn: async (nama: string) => apiClient.post<{ data: { id: string } }>('/admin/pelayanan', { nama }),
    onSuccess: (res, nama) => {
      qc.invalidateQueries({ queryKey: ['pelayanan'] });
      toast.success(`Pelayanan "${nama}" ditambah — lengkapi peran & anggotanya`);
      setNewNama('');
      setAdding(false);
      const id = res.data?.data?.id;
      if (id) window.location.assign(`/dashboard/pelayanan/${id}?tab=peran`);
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message ?? 'Gagal menambah'),
  });

  const deleteMut = useMutation({
    mutationFn: async (p: Pelayanan) => apiClient.delete(`/admin/pelayanan/${p.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pelayanan'] });
      toast.success('Pelayanan dihapus');
      setDeleting(null);
    },
    onError: (err: any, p) => {
      const e = err.response?.data?.error;
      if (err.response?.status === 409 && e?.details?.reason === 'HAS_MEMBERS') {
        setDeleting(null);
        setForceDel({ id: p.id, label: p.nama, members: e.details.members, active: e.details.active, message: e.message });
        return;
      }
      toast.error(e?.message ?? 'Gagal menghapus');
    },
  });

  const stats = useMemo(() => {
    const aktif = list.filter((p) => p.isActive);
    return {
      aktif: aktif.length,
      nonaktif: list.length - aktif.length,
      anggota: aktif.reduce((n, p) => n + (p._count?.jemaatPelayanan ?? 0), 0),
      tanpaPeran: aktif.filter((p) => p.roles.length === 0).length,
    };
  }, [list]);

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const rows = list.filter(
      (p) =>
        (status === 'semua' || (status === 'aktif' ? p.isActive : !p.isActive)) &&
        (!needle || p.nama.toLowerCase().includes(needle) || (p.deskripsi ?? '').toLowerCase().includes(needle)),
    );
    const pend = (p: Pelayanan) => pending.byId.get(p.id) ?? 0;
    return rows.sort((a, b) =>
      sort === 'anggota'
        ? (b._count?.jemaatPelayanan ?? 0) - (a._count?.jemaatPelayanan ?? 0)
        : sort === 'permintaan'
          ? pend(b) - pend(a) || a.nama.localeCompare(b.nama, 'id')
          : a.nama.localeCompare(b.nama, 'id'),
    );
  }, [list, search, status, sort, pending.byId]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
            <HandHeart className="w-6 h-6" />
            Pelayanan (Ministry)
          </h1>
          <p className="text-neutral-500 mt-1 text-sm">
            Klik <b>Kelola</b> untuk mengatur anggota, peran, tugas petugas, pendaftaran & koordinator, dan penugasan ibadah/event.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/pelayanan/join-requests"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-neutral-300 bg-white text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            <UserPlus className="w-4 h-4" />
            Permintaan Volunteer
            {pending.total > 0 && (
              <span className="min-w-5 h-5 px-1.5 rounded-full bg-brand-500 text-white text-[11px] font-bold inline-flex items-center justify-center">
                {pending.total}
              </span>
            )}
          </Link>
          <button
            onClick={() => setAdding((x) => !x)}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-lg"
          >
            <Plus className="w-4 h-4" /> Pelayanan baru
          </button>
        </div>
      </div>

      {adding ? (
        <div className="bg-white border border-brand-200 rounded-xl p-3 flex flex-wrap items-center gap-2">
          <input
            autoFocus
            value={newNama}
            onChange={(e) => setNewNama(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && newNama.trim() && createPelayanan.mutate(newNama.trim())}
            placeholder="Nama pelayanan, mis. Drama"
            className="flex-1 min-w-[220px] px-3 py-2 border border-neutral-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-500"
          />
          <button
            onClick={() => createPelayanan.mutate(newNama.trim())}
            disabled={!newNama.trim() || createPelayanan.isPending}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50"
          >
            {createPelayanan.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Buat
          </button>
          <button onClick={() => setAdding(false)} className="p-2 rounded-lg hover:bg-neutral-100" aria-label="Batal">
            <X className="w-4 h-4" />
          </button>
          <p className="w-full text-xs text-neutral-500">Setelah dibuat, Anda diarahkan ke tab Peran untuk menambah peran pertama.</p>
        </div>
      ) : null}

      {/* Ringkasan */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Summary label="Pelayanan aktif" value={stats.aktif} onClick={() => setStatus('aktif')} />
        <Summary label="Anggota aktif (total)" value={stats.anggota} />
        <Summary
          label="Permintaan menunggu"
          value={pending.total}
          tone={pending.total ? 'warn' : undefined}
          href={pending.total ? '/dashboard/pelayanan/join-requests' : undefined}
        />
        <Summary label="Nonaktif" value={stats.nonaktif} onClick={() => setStatus('nonaktif')} />
      </div>

      {/* Toolbar */}
      <div className="bg-white border border-neutral-200 rounded-xl p-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama pelayanan…"
            className="w-full pl-9 pr-3 py-1.5 border border-neutral-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <div className="flex gap-1 bg-neutral-100 rounded-lg p-1">
          {(['aktif', 'nonaktif', 'semua'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`px-3 py-1 rounded-md text-xs font-semibold capitalize ${status === s ? 'bg-white text-brand-700 shadow-sm' : 'text-neutral-600'}`}
            >
              {s}
            </button>
          ))}
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="px-3 py-1.5 border border-neutral-300 rounded-lg text-sm bg-white"
          title="Urutkan"
        >
          <option value="nama">Urut: Nama</option>
          <option value="anggota">Urut: Anggota terbanyak</option>
          <option value="permintaan">Urut: Permintaan menunggu</option>
        </select>
      </div>

      {stats.tanpaPeran > 0 && status !== 'nonaktif' ? (
        <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          {stats.tanpaPeran} pelayanan aktif belum punya peran — anggota baru tidak bisa ditambahkan sebelum ada peran.
        </div>
      ) : null}

      {isLoading ? (
        <div className="bg-white border border-neutral-200 rounded-xl p-12 text-center">
          <Loader2 className="w-5 h-5 mx-auto animate-spin text-neutral-400" />
        </div>
      ) : shown.length === 0 ? (
        <div className="bg-white border border-dashed border-neutral-300 rounded-xl p-12 text-center text-sm text-neutral-500">
          {list.length ? 'Tidak ada pelayanan yang cocok dengan saringan.' : 'Belum ada pelayanan. Klik "Pelayanan baru".'}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {shown.map((p) => (
            <PelayananCard
              key={p.id}
              p={p}
              pending={pending.byId.get(p.id) ?? 0}
              onEdit={() => setEditingPel(p)}
              onDelete={() => setDeleting(p)}
            />
          ))}
        </div>
      )}

      {editingPel && (
        <EditPelayananModal
          pelayanan={editingPel}
          onClose={() => setEditingPel(null)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['pelayanan'] });
            setEditingPel(null);
          }}
        />
      )}

      <ConfirmDelete
        open={!!deleting}
        loading={deleteMut.isPending}
        onClose={() => setDeleting(null)}
        title="Hapus pelayanan & semua perannya?"
        itemName={deleting?.nama}
        onConfirm={() => deleting && deleteMut.mutate(deleting)}
      />

      {forceDel ? (
        <ForceDeleteModal
          target={forceDel}
          onClose={() => setForceDel(null)}
          onDone={() => {
            qc.invalidateQueries({ queryKey: ['pelayanan'] });
            setForceDel(null);
          }}
        />
      ) : null}
    </div>
  );
}

function Summary({
  label,
  value,
  tone,
  onClick,
  href,
}: {
  label: string;
  value: number;
  tone?: 'warn';
  onClick?: () => void;
  href?: string;
}) {
  const cls = `block text-left rounded-xl border px-4 py-3 ${
    tone === 'warn' ? 'border-amber-200 bg-amber-50' : 'border-neutral-200 bg-white'
  } ${onClick || href ? 'hover:shadow-sm' : ''}`;
  const inner = (
    <>
      <div className={`text-2xl font-bold ${tone === 'warn' ? 'text-amber-800' : 'text-neutral-900'}`}>{value.toLocaleString('id-ID')}</div>
      <div className="text-xs text-neutral-500">{label}</div>
    </>
  );
  if (href)
    return (
      <Link href={href} className={cls}>
        {inner}
      </Link>
    );
  return onClick ? (
    <button onClick={onClick} className={cls}>
      {inner}
    </button>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

function PelayananCard({
  p,
  pending,
  onEdit,
  onDelete,
}: {
  p: Pelayanan;
  pending: number;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const href = `/dashboard/pelayanan/${p.id}`;
  const roles = [...p.roles].sort((a, b) => b.level - a.level);
  const shownRoles = roles.slice(0, 4);
  const tagline = p.deskripsi?.split('\n')[0]?.trim();
  return (
    <div className={`bg-white border rounded-xl flex flex-col ${p.isActive ? 'border-neutral-200' : 'border-dashed border-neutral-300 opacity-75'}`}>
      <div className="flex items-start gap-3 p-4">
        <PelayananIcon ikon={p.ikon} warna={p.warna} size={44} />
        <div className="flex-1 min-w-0">
          <Link href={href} className="font-semibold text-neutral-900 hover:text-brand-600 hover:underline flex items-center gap-1.5">
            <span className="truncate">{p.nama}</span>
            {!p.isActive ? (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-neutral-200 text-neutral-600 shrink-0">Nonaktif</span>
            ) : null}
          </Link>
          <div className="text-xs text-neutral-500 truncate">{tagline || 'Belum ada deskripsi'}</div>
        </div>
        <div className="flex items-center shrink-0">
          <button onClick={onEdit} className="p-1.5 hover:bg-neutral-100 rounded text-neutral-400 hover:text-neutral-700" title="Ubah nama, deskripsi, ikon, warna & status">
            <Pencil className="w-4 h-4" />
          </button>
          <button onClick={onDelete} className="p-1.5 hover:bg-red-50 rounded text-neutral-400 hover:text-red-600" title="Hapus pelayanan">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="px-4 grid grid-cols-3 gap-2 text-center">
        <Link href={`${href}?tab=anggota`} className="rounded-lg bg-neutral-50 py-1.5 hover:bg-neutral-100">
          <div className="text-sm font-bold text-neutral-900">{p._count?.jemaatPelayanan ?? 0}</div>
          <div className="text-[11px] text-neutral-500 inline-flex items-center gap-1">
            <UsersIcon className="w-3 h-3" /> anggota
          </div>
        </Link>
        <Link href={`${href}?tab=peran`} className="rounded-lg bg-neutral-50 py-1.5 hover:bg-neutral-100">
          <div className="text-sm font-bold text-neutral-900">{p.roles.length}</div>
          <div className="text-[11px] text-neutral-500 inline-flex items-center gap-1">
            <Crown className="w-3 h-3" /> peran
          </div>
        </Link>
        <Link href={`${href}?tab=penugasan`} className="rounded-lg bg-neutral-50 py-1.5 hover:bg-neutral-100">
          <div className="text-sm font-bold text-neutral-900">{p._count?.ibadahPelayanan ?? 0}</div>
          <div className="text-[11px] text-neutral-500 inline-flex items-center gap-1">
            <CalendarCheck className="w-3 h-3" /> ibadah
          </div>
        </Link>
      </div>

      <div className="px-4 pt-3 flex flex-wrap gap-1.5 min-h-[28px]">
        {shownRoles.length ? (
          shownRoles.map((r) => (
            <span key={r.id} className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${roleTone(r.level)}`}>
              {r.nama}
            </span>
          ))
        ) : (
          <span className="text-[11px] text-amber-700">Belum ada peran</span>
        )}
        {roles.length > shownRoles.length ? (
          <span className="px-2 py-0.5 rounded-full text-[11px] text-neutral-500 bg-neutral-100">+{roles.length - shownRoles.length}</span>
        ) : null}
      </div>

      <div className="mt-auto px-4 py-3 flex items-center gap-2">
        {pending > 0 ? (
          <Link
            href={`/dashboard/pelayanan/join-requests?pelayananId=${p.id}`}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-50 text-amber-800 text-xs font-semibold hover:bg-amber-100"
          >
            <UserPlus className="w-3.5 h-3.5" /> {pending} permintaan
          </Link>
        ) : null}
        <Link
          href={href}
          className="ml-auto inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-brand-50 text-brand-700 text-sm font-semibold hover:bg-brand-100"
        >
          Kelola <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
