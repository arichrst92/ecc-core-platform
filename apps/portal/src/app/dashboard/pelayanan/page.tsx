'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Trash2,
  ChevronRight,
  Loader2,
  HandHeart,
  Users as UsersIcon,
  Pencil,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';
import { ConfirmDelete } from '@/components/crud/confirm-delete';

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
  isActive: boolean;
  roles: PelayananRole[];
  _count?: { jemaatPelayanan: number; ibadahPelayanan: number };
}

type DeletingTarget =
  | { kind: 'pelayanan' | 'role'; id: string; label: string }
  | null;

export default function PelayananPage() {
  const qc = useQueryClient();
  const [deleting, setDeleting] = useState<DeletingTarget>(null);
  const [editingRole, setEditingRole] = useState<PelayananRole | null>(null);

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
    onError: (err: any) => {
      toast.error(err.response?.data?.error?.message ?? 'Gagal menghapus');
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
                <div className="flex items-center gap-2 min-w-0">
                  <ChevronRight className="w-4 h-4 text-brand-600 shrink-0" />
                  <div className="min-w-0">
                    <h3 className="font-semibold text-neutral-900 truncate">{p.nama}</h3>
                    {p.deskripsi && (
                      <div className="text-xs text-neutral-500 truncate">{p.deskripsi}</div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {p._count && (
                    <span className="flex items-center gap-1 text-xs text-neutral-500" title="Jemaat di pelayanan ini">
                      <UsersIcon className="w-3 h-3" />
                      {p._count.jemaatPelayanan}
                    </span>
                  )}
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
