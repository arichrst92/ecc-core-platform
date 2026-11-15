'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Trash2,
  Loader2,
  HandHeart,
  Users as UsersIcon,
  Pencil,
  X,
  UserPlus,
  CalendarCheck,
} from 'lucide-react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';
import { ConfirmDelete } from '@/components/crud/confirm-delete';
import { PELAYANAN_ICON_MAP, PelayananIcon } from '@/components/pelayanan/pelayanan-icon';
import { PenugasanModal } from '@/components/pelayanan/penugasan-modal';
import { PELAYANAN_IKON, PELAYANAN_WARNA } from '@ecc/shared-types';

interface PelayananRole {
  id: string;
  nama: string;
  deskripsi: string | null;
  level: number;
}

interface Pelayanan {
  id: string;
  nama: string;
  deskripsi: string | null;
  ikon?: string | null;
  warna?: string | null;
  isActive: boolean;
  roles: PelayananRole[];
  _count?: { jemaatPelayanan: number; ibadahPelayanan: number };
}

type DeletingTarget =
  | { kind: 'pelayanan' | 'role'; id: string; label: string }
  | null;

/** Tombol ke halaman Permintaan Volunteer + badge jumlah pending. */
function JoinRequestsLink() {
  const { data } = useQuery({
    queryKey: ['ministry-join-requests', 'all'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: { requests: unknown[] } }>(
        '/admin/ministry/join-requests',
      );
      return res.data.data;
    },
    staleTime: 30_000,
  });
  const count = data?.requests.length ?? 0;
  return (
    <Link
      href="/dashboard/pelayanan/join-requests"
      className="mr-2 inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-neutral-300 bg-white text-sm font-medium text-neutral-700 hover:bg-neutral-50"
    >
      <UserPlus className="w-4 h-4" />
      Permintaan Volunteer
      {count > 0 && (
        <span className="min-w-5 h-5 px-1.5 rounded-full bg-brand-500 text-white text-[11px] font-bold inline-flex items-center justify-center">
          {count}
        </span>
      )}
    </Link>
  );
}

export default function PelayananPage() {
  const qc = useQueryClient();
  const [deleting, setDeleting] = useState<DeletingTarget>(null);
  // Pelayanan masih beranggota → tawarkan hapus permanen (ketik nama).
  const [forceDel, setForceDel] = useState<{ id: string; label: string; members: number; active: number; message: string } | null>(null);
  const [editingRole, setEditingRole] = useState<PelayananRole | null>(null);
  const [editingPel, setEditingPel] = useState<Pelayanan | null>(null);
  const [penugasanFor, setPenugasanFor] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['pelayanan', 'tree'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: Pelayanan[] }>('/admin/pelayanan', {
        params: { limit: 100 },
      });
      return res.data.data;
    },
  });

  const createPelayanan = useMutation({
    mutationFn: async (nama: string) => apiClient.post('/admin/pelayanan', { nama }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pelayanan'] });
      toast.success('Pelayanan ditambah');
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message ?? 'Gagal menambah'),
  });

  const createRole = useMutation({
    mutationFn: async ({ pelayananId, nama, level }: { pelayananId: string; nama: string; level: number }) =>
      apiClient.post('/admin/pelayanan/role', { pelayananId, nama, level }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pelayanan'] });
      toast.success('Role ditambah');
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message ?? 'Gagal menambah'),
  });

  const deleteMut = useMutation({
    mutationFn: async (target: NonNullable<DeletingTarget>) => {
      const path = target.kind === 'pelayanan'
        ? `/admin/pelayanan/${target.id}`
        : `/admin/pelayanan/role/${target.id}`;
      await apiClient.delete(path);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pelayanan'] });
      toast.success('Berhasil dihapus');
      setDeleting(null);
    },
    onError: (err: any, target) => {
      const e = err.response?.data?.error;
      if (target.kind === 'pelayanan' && err.response?.status === 409 && e?.details?.reason === 'HAS_MEMBERS') {
        setDeleting(null);
        setForceDel({ id: target.id, label: target.label, members: e.details.members, active: e.details.active, message: e.message });
        return;
      }
      toast.error(e?.message ?? 'Gagal menghapus');
    },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
            <HandHeart className="w-6 h-6" />
            Master Pelayanan (Ministry)
          </h1>
          <p className="text-neutral-500 mt-1">
            Tim ministry operasional dengan role per-pelayanan. Klik role untuk edit.
          </p>
        </div>
        <JoinRequestsLink />
        <AddInline
          placeholder="Pelayanan baru, mis. Drama"
          onAdd={(nama) => createPelayanan.mutate(nama)}
          loading={createPelayanan.isPending}
        />
      </div>

      {isLoading ? (
        <div className="bg-white border border-neutral-200 rounded-xl p-12 text-center">
          <Loader2 className="w-5 h-5 mx-auto animate-spin text-neutral-400" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {data?.map((p) => (
            <div key={p.id} className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 bg-brand-50/50 border-b border-neutral-100">
                <div className="flex items-center gap-2.5 min-w-0">
                  <PelayananIcon ikon={p.ikon} warna={p.warna} size={34} />
                  <div className="min-w-0">
                    <Link href={`/dashboard/pelayanan/${p.id}`} className="font-semibold text-neutral-900 hover:text-brand-600 hover:underline truncate flex items-center gap-1.5">
                      {p.nama}
                      {!p.isActive ? (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-neutral-200 text-neutral-600">Nonaktif</span>
                      ) : null}
                    </Link>
                    {p.deskripsi && (
                      <div className="text-xs text-neutral-500 truncate">{p.deskripsi}</div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {p._count && (
                    <Link
                      href={`/dashboard/pelayanan/${p.id}`}
                      className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline px-2 py-1 rounded-lg hover:bg-brand-50"
                      title="Lihat & kelola anggota pelayanan ini"
                    >
                      <UsersIcon className="w-3 h-3" />
                      {p._count.jemaatPelayanan} anggota
                    </Link>
                  )}
                  <button
                    onClick={() => setPenugasanFor(p.id)}
                    className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline px-2 py-1 rounded-lg hover:bg-brand-50"
                    title="Lihat & atur di ibadah / event mana pelayanan ini bertugas"
                  >
                    <CalendarCheck className="w-3 h-3" />
                    Lihat penugasan{p._count ? ` (${p._count.ibadahPelayanan})` : ''}
                  </button>
                  <button
                    onClick={() => setEditingPel(p)}
                    className="p-1.5 hover:bg-brand-50 rounded text-neutral-500 hover:text-brand-700"
                    title="Ubah nama, deskripsi, ikon & warna"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setDeleting({ kind: 'pelayanan', id: p.id, label: p.nama })}
                    className="p-1.5 hover:bg-red-50 rounded text-neutral-500 hover:text-red-600"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="p-4">
                <div className="text-xs uppercase text-neutral-500 mb-2 font-medium">Roles</div>
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  {p.roles.map((r) => (
                    <RoleChip
                      key={r.id}
                      role={r}
                      onEdit={() => setEditingRole(r)}
                      onDelete={() => setDeleting({ kind: 'role', id: r.id, label: r.nama })}
                    />
                  ))}
                </div>
                <AddRoleInline
                  onAdd={(nama, level) => createRole.mutate({ pelayananId: p.id, nama, level })}
                  loading={createRole.isPending}
                />
              </div>
            </div>
          ))}
          {data?.length === 0 && (
            <div className="col-span-full bg-white border border-neutral-200 rounded-xl p-12 text-center text-neutral-400">
              Belum ada pelayanan. Tambah di kanan atas.
            </div>
          )}
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

      {penugasanFor && <PenugasanModal pelayananId={penugasanFor} onClose={() => setPenugasanFor(null)} />}

      {editingRole && (
        <EditRoleModal
          role={editingRole}
          onClose={() => setEditingRole(null)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['pelayanan'] });
            setEditingRole(null);
          }}
        />
      )}

      <ConfirmDelete
        open={!!deleting}
        loading={deleteMut.isPending}
        onClose={() => setDeleting(null)}
        title={
          deleting?.kind === 'pelayanan'
            ? 'Hapus pelayanan & semua role-nya?'
            : 'Hapus role ini?'
        }
        itemName={deleting?.label}
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

// ============== Sub-components ==============

function RoleChip({
  role,
  onEdit,
  onDelete,
}: {
  role: PelayananRole;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const color =
    role.level >= 10
      ? 'bg-brand-100 text-brand-800 hover:bg-brand-200'
      : role.level >= 5
        ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
        : role.level < 0
          ? 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
          : 'bg-blue-50 text-blue-700 hover:bg-blue-100';
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-full transition group ${color}`}
      title={role.deskripsi ?? ''}
    >
      <button onClick={onEdit} className="font-medium hover:underline flex items-center gap-1">
        <Pencil className="w-2.5 h-2.5 opacity-50 group-hover:opacity-100" />
        {role.nama}
      </button>
      <span className="opacity-60 text-[10px]">L{role.level}</span>
      <button onClick={onDelete} className="hover:text-red-600">
        <Trash2 className="w-3 h-3" />
      </button>
    </span>
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
            <h2 className="font-semibold text-neutral-900">Edit Role Pelayanan</h2>
            <button onClick={onClose} className="p-1.5 hover:bg-neutral-100 rounded">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-6 space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-neutral-700">Nama Role</span>
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

function AddInline({
  placeholder,
  onAdd,
  loading,
}: {
  placeholder: string;
  onAdd: (nama: string) => void;
  loading?: boolean;
}) {
  const [val, setVal] = useState('');
  function submit() {
    if (!val.trim()) return;
    onAdd(val.trim());
    setVal('');
  }
  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder={placeholder}
        className="px-3 py-1.5 text-sm border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none min-w-[240px]"
      />
      <button
        onClick={submit}
        disabled={loading || !val.trim()}
        className="flex items-center gap-1 px-3 py-1.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-lg disabled:opacity-50"
      >
        <Plus className="w-3.5 h-3.5" />
        Tambah
      </button>
    </div>
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
        placeholder="+ role baru, mis. Leader"
        className="flex-1 px-2.5 py-1 text-xs border border-neutral-300 rounded focus:ring-1 focus:ring-brand-500 outline-none"
      />
      <input
        type="number"
        value={level}
        onChange={(e) => setLevel(Number(e.target.value))}
        title="Level (Leader=10, Member=0, Trainee=-5)"
        className="w-14 px-2 py-1 text-xs border border-neutral-300 rounded focus:ring-1 focus:ring-brand-500 outline-none text-center"
      />
      <button
        onClick={submit}
        disabled={loading || !nama.trim()}
        className="p-1 bg-brand-500 hover:bg-brand-600 text-white rounded disabled:opacity-50"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

/** Ubah pelayanan: nama, deskripsi (baris pertama = tagline di app), ikon & warna aksen. */
function EditPelayananModal({
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
function ForceDeleteModal({
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
