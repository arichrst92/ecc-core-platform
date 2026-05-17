'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Plus, Trash2, ChevronRight, Loader2 } from 'lucide-react';
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

type DeletingTarget = { kind: 'role' | 'sub-role' | 'sub-role-status'; id: string; label: string } | null;

export default function RolePage() {
  const qc = useQueryClient();
  const [deleting, setDeleting] = useState<DeletingTarget>(null);

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
    onError: (err: any) => {
      toast.error(err.response?.data?.error?.message ?? 'Gagal menghapus');
    },
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
            Klasifikasi peran jemaat — 3 level: Role → Sub-Role → Status (opsional).
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
                <div className="flex items-center gap-2">
                  <ChevronRight className="w-4 h-4 text-brand-600" />
                  <h3 className="font-semibold text-neutral-900">{role.nama}</h3>
                  {role.deskripsi && (
                    <span className="text-xs text-neutral-500">— {role.deskripsi}</span>
                  )}
                </div>
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
                      <div>
                        <span className="font-medium text-neutral-800">{sr.nama}</span>
                        {sr.deskripsi && (
                          <span className="ml-2 text-xs text-neutral-500">{sr.deskripsi}</span>
                        )}
                      </div>
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
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-accent-400/15 text-accent-600 text-xs rounded-full"
                          >
                            {st.nama}
                            <button
                              onClick={() =>
                                setDeleting({ kind: 'sub-role-status', id: st.id, label: st.nama })
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
