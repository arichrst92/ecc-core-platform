'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Plus, Trash2, ChevronRight, Loader2, Pencil, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';
import { ConfirmDelete } from '@/components/crud/confirm-delete';

interface SubRoleStatus {
  id: string;
  nama: string;
  deskripsi: string | null;
}
interface SubRole {
  id: string;
  nama: string;
  deskripsi: string | null;
  statuses: SubRoleStatus[];
}
interface Role {
  id: string;
  nama: string;
  deskripsi: string | null;
  subRoles: SubRole[];
}

type Kind = 'role' | 'sub-role' | 'sub-role-status';
type DeletingTarget = { kind: Kind; id: string; label: string } | null;
type EditingTarget =
  | { kind: Kind; id: string; nama: string; deskripsi: string | null }
  | null;

export default function RolePage() {
  const qc = useQueryClient();
  const [deleting, setDeleting] = useState<DeletingTarget>(null);
  const [editing, setEditing] = useState<EditingTarget>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['role', 'tree'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: Role[] }>('/admin/role');
      return res.data.data;
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (target: NonNullable<DeletingTarget>) => {
      const path =
        target.kind === 'role'
          ? `/admin/role/${target.id}`
          : target.kind === 'sub-role'
            ? `/admin/role/sub-role/${target.id}`
            : `/admin/role/sub-role-status/${target.id}`;
      await apiClient.delete(path);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['role'] });
      toast.success('Berhasil dihapus');
      setDeleting(null);
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message ?? 'Gagal menghapus'),
  });

  const createRole = useMutation({
    mutationFn: async (nama: string) => apiClient.post('/admin/role', { nama }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['role'] });
      toast.success('Role ditambah');
    },
  });
  const createSubRole = useMutation({
    mutationFn: async ({ roleId, nama }: { roleId: string; nama: string }) =>
      apiClient.post('/admin/role/sub-role', { roleId, nama }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['role'] });
      toast.success('Sub-role ditambah');
    },
  });
  const createStatus = useMutation({
    mutationFn: async ({ subRoleId, nama }: { subRoleId: string; nama: string }) =>
      apiClient.post('/admin/role/sub-role-status', { subRoleId, nama }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['role'] });
      toast.success('Status ditambah');
    },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Master Role, Sub-Role & Status</h1>
          <p className="text-neutral-500 mt-1">
            Klasifikasi peran jemaat — 3 level: Role → Sub-Role → Status (opsional). Klik nama untuk edit.
          </p>
        </div>
        <AddInline
          placeholder="Nama role baru, mis. Volunteer"
          onAdd={(nama) => createRole.mutate(nama)}
          loading={createRole.isPending}
        />
      </div>

      {isLoading ? (
        <div className="bg-white border border-neutral-200 rounded-xl p-12 text-center">
          <Loader2 className="w-5 h-5 mx-auto animate-spin text-neutral-400" />
        </div>
      ) : (
        <div className="space-y-3">
          {data?.map((role) => (
            <div key={role.id} className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 bg-brand-50/50 border-b border-neutral-100">
                <button
                  onClick={() =>
                    setEditing({ kind: 'role', id: role.id, nama: role.nama, deskripsi: role.deskripsi })
                  }
                  className="flex items-center gap-2 text-left hover:bg-brand-100/50 px-1.5 py-0.5 rounded transition group"
                >
                  <ChevronRight className="w-4 h-4 text-brand-600" />
                  <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-50 transition" />
                  <h3 className="font-semibold text-neutral-900">{role.nama}</h3>
                  {role.deskripsi && (
                    <span className="text-xs text-neutral-500">— {role.deskripsi}</span>
                  )}
                </button>
                <button
                  onClick={() => setDeleting({ kind: 'role', id: role.id, label: role.nama })}
                  className="p-1.5 hover:bg-red-50 rounded text-neutral-500 hover:text-red-600"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="p-4 space-y-3">
                {role.subRoles.map((sr) => (
                  <div key={sr.id} className="border border-neutral-100 rounded-lg">
                    <div className="flex items-center justify-between px-4 py-2.5 bg-neutral-50">
                      <button
                        onClick={() =>
                          setEditing({
                            kind: 'sub-role',
                            id: sr.id,
                            nama: sr.nama,
                            deskripsi: sr.deskripsi,
                          })
                        }
                        className="flex items-center gap-1.5 text-left hover:bg-neutral-100 px-1.5 py-0.5 rounded transition group"
                      >
                        <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-50" />
                        <span className="font-medium text-neutral-800">{sr.nama}</span>
                        {sr.deskripsi && (
                          <span className="ml-1 text-xs text-neutral-500">{sr.deskripsi}</span>
                        )}
                      </button>
                      <button
                        onClick={() => setDeleting({ kind: 'sub-role', id: sr.id, label: sr.nama })}
                        className="p-1 hover:bg-red-50 rounded text-neutral-500 hover:text-red-600"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        {sr.statuses.map((st) => (
                          <span
                            key={st.id}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-accent-400/15 text-accent-600 text-xs rounded-full group"
                          >
                            <button
                              onClick={() =>
                                setEditing({
                                  kind: 'sub-role-status',
                                  id: st.id,
                                  nama: st.nama,
                                  deskripsi: st.deskripsi,
                                })
                              }
                              className="font-medium hover:underline flex items-center gap-1"
                              title="Edit status"
                            >
                              <Pencil className="w-2.5 h-2.5 opacity-50 group-hover:opacity-100" />
                              {st.nama}
                            </button>
                            <button
                              onClick={() =>
                                setDeleting({
                                  kind: 'sub-role-status',
                                  id: st.id,
                                  label: st.nama,
                                })
                              }
                              className="hover:text-red-600"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                        <AddInline
                          compact
                          placeholder="+ status (mis. Leader)"
                          onAdd={(nama) => createStatus.mutate({ subRoleId: sr.id, nama })}
                          loading={createStatus.isPending}
                        />
                      </div>
                    </div>
                  </div>
                ))}
                <AddInline
                  placeholder="+ sub-role baru di Role ini"
                  onAdd={(nama) => createSubRole.mutate({ roleId: role.id, nama })}
                  loading={createSubRole.isPending}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <EditModal
          target={editing}
          onClose={() => setEditing(null)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['role'] });
            setEditing(null);
          }}
        />
      )}

      <ConfirmDelete
        open={!!deleting}
        loading={deleteMut.isPending}
        onClose={() => setDeleting(null)}
        title="Hapus item ini?"
        itemName={deleting?.label}
        onConfirm={() => deleting && deleteMut.mutate(deleting)}
      />
    </div>
  );
}

// ============== Edit modal ==============

function EditModal({
  target,
  onClose,
  onSuccess,
}: {
  target: NonNullable<EditingTarget>;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [nama, setNama] = useState(target.nama);
  const [deskripsi, setDeskripsi] = useState(target.deskripsi ?? '');

  const labelMap: Record<Kind, string> = {
    role: 'Role',
    'sub-role': 'Sub-Role',
    'sub-role-status': 'Status',
  };

  const updateMut = useMutation({
    mutationFn: async () => {
      const path =
        target.kind === 'role'
          ? `/admin/role/${target.id}`
          : target.kind === 'sub-role'
            ? `/admin/role/sub-role/${target.id}`
            : `/admin/role/sub-role-status/${target.id}`;
      return apiClient.patch(path, { nama, deskripsi: deskripsi || undefined });
    },
    onSuccess: () => {
      toast.success('Tersimpan');
      onSuccess();
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message ?? 'Gagal'),
  });

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md pointer-events-auto">
          <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100">
            <h2 className="font-semibold text-neutral-900">Edit {labelMap[target.kind]}</h2>
            <button onClick={onClose} className="p-1.5 hover:bg-neutral-100 rounded">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-6 space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-neutral-700">Nama</span>
              <input
                type="text"
                value={nama}
                onChange={(e) => setNama(e.target.value)}
                autoFocus
                className="mt-1 w-full px-3 py-2 border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-neutral-700">Deskripsi (opsional)</span>
              <input
                type="text"
                value={deskripsi}
                onChange={(e) => setDeskripsi(e.target.value)}
                placeholder="Deskripsi singkat..."
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
  compact,
}: {
  placeholder: string;
  onAdd: (nama: string) => void;
  loading?: boolean;
  compact?: boolean;
}) {
  const [val, setVal] = useState('');
  function submit() {
    if (!val.trim()) return;
    onAdd(val.trim());
    setVal('');
  }
  return (
    <div className={compact ? 'inline-flex items-center gap-1' : 'flex items-center gap-2'}>
      <input
        type="text"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder={placeholder}
        className={
          compact
            ? 'px-2 py-1 text-xs border border-neutral-300 rounded focus:ring-1 focus:ring-brand-500 outline-none'
            : 'flex-1 px-3 py-1.5 text-sm border border-neutral-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none'
        }
      />
      <button
        onClick={submit}
        disabled={loading || !val.trim()}
        className={
          compact
            ? 'p-1 bg-brand-500 hover:bg-brand-600 text-white rounded disabled:opacity-50'
            : 'flex items-center gap-1 px-3 py-1.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-lg disabled:opacity-50'
        }
      >
        <Plus className="w-3.5 h-3.5" />
        {!compact && 'Tambah'}
      </button>
    </div>
  );
}
