'use client';

/**
 * Komponen bersama halaman Pelayanan (daftar & detail):
 *  - EditPelayananModal  : nama, deskripsi (baris 1 = tagline app), ikon, warna, aktif
 *  - ForceDeleteModal    : hapus permanen (ketik nama)
 *  - RoleManager         : kelola peran pelayanan (tab Peran di detail)
 *  - usePendingJoinCounts: jumlah permintaan bergabung menunggu per pelayanan
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Crown, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';
import { ConfirmDelete } from '@/components/crud/confirm-delete';
import { PELAYANAN_ICON_MAP, PelayananIcon } from '@/components/pelayanan/pelayanan-icon';
import { PELAYANAN_IKON, PELAYANAN_WARNA } from '@ecc/shared-types';

export interface PelayananRole {
  id: string;
  nama: string;
  deskripsi?: string | null;
  level: number;
}

export interface Pelayanan {
  id: string;
  nama: string;
  deskripsi: string | null;
  ikon?: string | null;
  warna?: string | null;
  isActive: boolean;
  roles: PelayananRole[];
  _count?: { jemaatPelayanan: number; ibadahPelayanan: number };
}

/** Jumlah permintaan bergabung yang menunggu, per pelayanan (+ total). */
export function usePendingJoinCounts() {
  const q = useQuery({
    queryKey: ['ministry-join-requests', 'all'],
    queryFn: async () =>
      (
        await apiClient.get<{ data: { ministries: { id: string; pendingRequestCount: number }[]; requests: unknown[] } }>(
          '/admin/ministry/join-requests',
        )
      ).data.data,
    staleTime: 30_000,
    retry: false,
  });
  const byId = new Map((q.data?.ministries ?? []).map((m) => [m.id, m.pendingRequestCount]));
  return { byId, total: q.data?.requests.length ?? 0 };
}

/** Warna badge sesuai level peran (senior → oranye). */
export function roleTone(level: number) {
  return level >= 10
    ? 'bg-brand-100 text-brand-800'
    : level >= 5
      ? 'bg-amber-100 text-amber-800'
      : level < 0
        ? 'bg-neutral-100 text-neutral-500'
        : 'bg-blue-50 text-blue-700';
}

/** Tab Peran: daftar peran urut level + jumlah anggota, ubah, hapus, tambah. */
export function RoleManager({
  pelayananId,
  roles,
  memberCountByRole,
  onChanged,
}: {
  pelayananId: string;
  roles: PelayananRole[];
  memberCountByRole: Map<string, number>;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState<PelayananRole | null>(null);
  const [deleting, setDeleting] = useState<PelayananRole | null>(null);
  const create = useMutation({
    mutationFn: async ({ nama, level }: { nama: string; level: number }) =>
      apiClient.post('/admin/pelayanan/role', { pelayananId, nama, level }),
    onSuccess: () => {
      toast.success('Peran ditambah');
      onChanged();
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message ?? 'Gagal menambah'),
  });
  const del = useMutation({
    mutationFn: async (r: PelayananRole) => apiClient.delete(`/admin/pelayanan/role/${r.id}`),
    onSuccess: () => {
      toast.success('Peran dihapus');
      setDeleting(null);
      onChanged();
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message ?? 'Gagal menghapus'),
  });
  const sorted = [...roles].sort((a, b) => b.level - a.level || a.nama.localeCompare(b.nama, 'id'));
  return (
    <div className="bg-white border border-neutral-200 rounded-xl">
      <div className="px-4 py-3 border-b border-neutral-100">
        <div className="font-semibold text-neutral-900">Peran dalam pelayanan</div>
        <p className="text-xs text-neutral-500 mt-0.5">
          Level menentukan urutan &amp; senioritas (mis. Leader 10, Anggota 0, Trainee −5). Peran yang masih dipakai anggota tidak bisa dihapus.
        </p>
      </div>
      {sorted.length === 0 ? (
        <p className="px-4 py-6 text-sm text-neutral-500">Belum ada peran. Tambahkan minimal satu peran sebelum menambah anggota.</p>
      ) : (
        <div className="divide-y divide-neutral-100">
          {sorted.map((r, i) => {
            const n = memberCountByRole.get(r.id) ?? 0;
            return (
              <div key={r.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-50">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${roleTone(r.level)}`}>
                  {i === 0 && r.level > 0 ? <Crown className="w-3 h-3" /> : null}
                  {r.nama}
                </span>
                <span className="text-[11px] text-neutral-400">Level {r.level}</span>
                <span className="flex-1 text-xs text-neutral-500 truncate">{r.deskripsi ?? ''}</span>
                <span className="text-xs text-neutral-600 w-24 text-right">{n} anggota</span>
                <button onClick={() => setEditing(r)} className="p-1.5 rounded hover:bg-neutral-100 text-neutral-500" title="Ubah peran">
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setDeleting(r)}
                  disabled={n > 0}
                  className="p-1.5 rounded hover:bg-red-50 text-neutral-400 hover:text-red-600 disabled:opacity-30 disabled:hover:bg-transparent"
                  title={n > 0 ? 'Masih dipakai anggota — pindahkan anggotanya dulu' : 'Hapus peran'}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
      <div className="px-4 py-3 border-t border-neutral-100">
        <AddRoleInline onAdd={(nama, level) => create.mutate({ nama, level })} loading={create.isPending} />
      </div>
      {editing ? (
        <EditRoleModal
          role={editing}
          onClose={() => setEditing(null)}
          onSuccess={() => {
            setEditing(null);
            onChanged();
          }}
        />
      ) : null}
      <ConfirmDelete
        open={!!deleting}
        loading={del.isPending}
        onClose={() => setDeleting(null)}
        title="Hapus peran ini?"
        itemName={deleting?.nama}
        onConfirm={() => deleting && del.mutate(deleting)}
      />
    </div>
  );
}

function EditRoleModal({
  role,
  onClose,
  onSuccess,
}: {
  role: PelayananRole;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [nama, setNama] = useState(role.nama);
  const [level, setLevel] = useState(role.level);
  const [deskripsi, setDeskripsi] = useState(role.deskripsi ?? '');

  const updateMut = useMutation({
    mutationFn: async () =>
      apiClient.patch(`/admin/pelayanan/role/${role.id}`, {
        nama,
        level,
        deskripsi: deskripsi || undefined,
      }),
    onSuccess: () => {
      toast.success('Role diperbarui');
      onSuccess();
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message ?? 'Gagal menyimpan'),
  });

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md pointer-events-auto">
          <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100">
            <h2 className="font-semibold text-neutral-900">Ubah Peran</h2>
            <button onClick={onClose} className="p-1.5 hover:bg-neutral-100 rounded">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-6 space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-neutral-700">Nama peran</span>
              <input
                type="text"
                value={nama}
                onChange={(e) => setNama(e.target.value)}
                autoFocus
                className="mt-1 w-full px-3 py-2 border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-neutral-700">
                Level <span className="text-xs text-neutral-500 font-normal">(Leader=10, Member=0, Trainee=-5)</span>
              </span>
              <input
                type="number"
                value={level}
                onChange={(e) => setLevel(Number(e.target.value))}
                min={-100}
                max={100}
                className="mt-1 w-full px-3 py-2 border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-neutral-700">Deskripsi (opsional)</span>
              <input
                type="text"
                value={deskripsi}
                onChange={(e) => setDeskripsi(e.target.value)}
                placeholder="Mis. Operator camera utama"
                className="mt-1 w-full px-3 py-2 border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500"
              />
            </label>
          </div>
          <div className="flex justify-end gap-2 px-6 py-4 border-t border-neutral-100 bg-neutral-50">
            <button
              onClick={onClose}
              disabled={updateMut.isPending}
              className="px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 rounded-lg"
            >
              Batal
            </button>
            <button
              onClick={() => updateMut.mutate()}
              disabled={!nama.trim() || updateMut.isPending}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-lg disabled:opacity-50"
            >
              {updateMut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Simpan
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function AddRoleInline({
  onAdd,
  loading,
}: {
  onAdd: (nama: string, level: number) => void;
  loading?: boolean;
}) {
  const [nama, setNama] = useState('');
  const [level, setLevel] = useState(0);

  function submit() {
    if (!nama.trim()) return;
    onAdd(nama.trim(), level);
    setNama('');
    setLevel(0);
  }
  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={nama}
        onChange={(e) => setNama(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder="Peran baru, mis. Camera"
        className="flex-1 px-3 py-1.5 text-sm border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
      />
      <input
        type="number"
        value={level}
        onChange={(e) => setLevel(Number(e.target.value))}
        title="Level (Leader=10, Member=0, Trainee=-5)"
        className="w-20 px-2 py-1.5 text-sm border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-center"
      />
      <button
        onClick={submit}
        disabled={loading || !nama.trim()}
        className="inline-flex items-center gap-1 px-3 py-1.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50"
      >
        <Plus className="w-4 h-4" /> Peran
      </button>
    </div>
  );
}

/** Ubah pelayanan: nama, deskripsi (baris pertama = tagline di app), ikon & warna aksen. */
export function EditPelayananModal({
  pelayanan,
  onClose,
  onSuccess,
}: {
  pelayanan: Pelayanan;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [nama, setNama] = useState(pelayanan.nama);
  const [deskripsi, setDeskripsi] = useState(pelayanan.deskripsi ?? '');
  const [ikon, setIkon] = useState<string>(pelayanan.ikon ?? 'heart-handshake');
  const [warna, setWarna] = useState<string>(pelayanan.warna ?? 'orange');
  const [isActive, setIsActive] = useState<boolean>(pelayanan.isActive);
  const save = useMutation({
    mutationFn: async () =>
      apiClient.patch(`/admin/pelayanan/${pelayanan.id}`, { nama: nama.trim(), deskripsi: deskripsi.trim(), ikon, warna, isActive }),
    onSuccess: () => {
      toast.success('Pelayanan diperbarui');
      onSuccess();
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message ?? 'Gagal menyimpan'),
  });
  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col pointer-events-auto">
          <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100">
            <h2 className="font-semibold text-neutral-900 inline-flex items-center gap-2">
              <PelayananIcon ikon={ikon} warna={warna} size={28} /> Ubah Pelayanan
            </h2>
            <button onClick={onClose} className="p-1.5 hover:bg-neutral-100 rounded">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-6 space-y-4 overflow-y-auto">
            <label className="flex items-start gap-3 rounded-lg border border-neutral-200 p-3 cursor-pointer">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-brand-600"
              />
              <span>
                <span className="block text-sm font-medium text-neutral-800">Pelayanan aktif</span>
                <span className="block text-xs text-neutral-500">
                  Matikan untuk menonaktifkan pelayanan tanpa menghapus anggota & riwayatnya.
                </span>
              </span>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-neutral-700">Nama</span>
              <input
                value={nama}
                onChange={(e) => setNama(e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-neutral-700">Deskripsi</span>
              <textarea
                value={deskripsi}
                onChange={(e) => setDeskripsi(e.target.value)}
                rows={3}
                placeholder="Baris pertama tampil sebagai tagline di app, mis. Melayani lewat kamera, layar & suara"
                className="mt-1 w-full px-3 py-2 border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500"
              />
            </label>
            <div>
              <div className="text-sm font-medium text-neutral-700 mb-1.5">Ikon</div>
              <div className="grid grid-cols-8 gap-1.5">
                {PELAYANAN_IKON.map((k) => {
                  const Icon = PELAYANAN_ICON_MAP[k]!;
                  const on = ikon === k;
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setIkon(k)}
                      title={k}
                      className={`aspect-square rounded-lg border flex items-center justify-center ${on ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'}`}
                    >
                      <Icon className="w-5 h-5" />
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <div className="text-sm font-medium text-neutral-700 mb-1.5">Warna aksen</div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(PELAYANAN_WARNA).map(([k, w]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setWarna(k)}
                    title={w.label}
                    className={`w-9 h-9 rounded-full border-2 flex items-center justify-center ${warna === k ? 'border-neutral-900' : 'border-transparent'}`}
                    style={{ background: w.bg }}
                  >
                    <span className="w-5 h-5 rounded-full" style={{ background: w.solid }} />
                  </button>
                ))}
              </div>
              <div className="text-xs text-neutral-500 mt-1.5">Ikon & warna tampil di app (daftar, detail, jadwal, profil) dan di Portal.</div>
            </div>
          </div>
          <div className="flex justify-end gap-2 px-6 py-4 border-t border-neutral-100">
            <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg hover:bg-neutral-100">
              Batal
            </button>
            <button
              onClick={() => save.mutate()}
              disabled={save.isPending || nama.trim().length < 2}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-brand-500 hover:bg-brand-600 text-white disabled:opacity-50"
            >
              {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Simpan
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

/** Hapus permanen pelayanan beserta anggota & riwayatnya — konfirmasi ketik nama. */
export function ForceDeleteModal({
  target,
  onClose,
  onDone,
}: {
  target: { id: string; label: string; members: number; active: number; message: string };
  onClose: () => void;
  onDone: () => void;
}) {
  const [typed, setTyped] = useState('');
  const match = typed.trim().toLowerCase() === target.label.trim().toLowerCase();
  const del = useMutation({
    mutationFn: async () =>
      apiClient.delete(`/admin/pelayanan/${target.id}`, { params: { force: 'true', confirm: typed.trim() } }),
    onSuccess: () => {
      toast.success(`Pelayanan "${target.label}" dihapus permanen beserta ${target.members} anggota`);
      onDone();
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message ?? 'Gagal menghapus'),
  });
  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md pointer-events-auto">
          <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100">
            <h2 className="font-semibold text-red-700 inline-flex items-center gap-2">
              <Trash2 className="w-4 h-4" /> Hapus permanen pelayanan?
            </h2>
            <button onClick={onClose} className="p-1.5 hover:bg-neutral-100 rounded" aria-label="Tutup">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-6 space-y-4 text-sm">
            <p className="text-neutral-700">{target.message}</p>
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-red-800 space-y-1">
              <p className="font-semibold">Yang ikut terhapus dan tidak bisa dikembalikan:</p>
              <ul className="list-disc pl-5 text-xs space-y-0.5">
                <li>
                  {target.members} anggota ({target.active} aktif, {target.members - target.active} riwayat) beserta riwayat pelayanannya
                </li>
                <li>Semua role, penugasan ke ibadah & event (termasuk yang sudah lewat), susunan petugas & jadwal</li>
              </ul>
            </div>
            <p className="text-neutral-600">
              Kalau hanya ingin berhenti dipakai, lebih aman <b>nonaktifkan</b> lewat tombol ubah (ikon pensil).
            </p>
            <label className="block">
              <span className="text-neutral-700">
                Ketik <b className="text-neutral-900">{target.label}</b> untuk konfirmasi
              </span>
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoFocus
                className="mt-1 w-full px-3 py-2 border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-red-500"
              />
            </label>
          </div>
          <div className="flex justify-end gap-2 px-6 py-4 border-t border-neutral-100">
            <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg hover:bg-neutral-100">
              Batal
            </button>
            <button
              onClick={() => del.mutate()}
              disabled={!match || del.isPending}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-40"
            >
              {del.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Hapus permanen
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
