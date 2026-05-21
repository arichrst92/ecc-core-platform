'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Key,
  Plus,
  Loader2,
  Trash2,
  Copy,
  Check,
  AlertTriangle,
  X,
  Power,
  Pencil,
  ShieldOff,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';
import { ConfirmDelete } from '@/components/crud/confirm-delete';

// ============== Types ==============

interface ApiKey {
  id: string;
  sinodeId: string | null;
  nama: string;
  keyPrefix: string;
  scopes: string[];
  isActive: boolean;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  sinode: { id: string; nama: string; kode: string } | null;
}

interface CreatedKey extends ApiKey {
  key: string; // plaintext, sekali saja
}

interface FormValues {
  nama: string;
  expiresAt: string;
}

const EMPTY_FORM: FormValues = {
  nama: '',
  expiresAt: '',
};

function formatDateID(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function relativeFrom(iso: string | null): string {
  if (!iso) return 'belum pernah';
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return 'baru saja';
  if (minutes < 60) return `${minutes} menit lalu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} hari lalu`;
  return formatDateID(iso);
}

// ============== Page ==============

export default function ApiKeyPage() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<ApiKey | null>(null);
  const [deleting, setDeleting] = useState<ApiKey | null>(null);
  const [revealed, setRevealed] = useState<CreatedKey | null>(null);

  const listQ = useQuery({
    queryKey: ['api-key', 'list'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: ApiKey[] }>('/admin/sinode-api-key', {
        params: { limit: 100 },
      });
      return res.data.data;
    },
  });

  const createMut = useMutation({
    mutationFn: async (v: FormValues) =>
      apiClient.post<{ data: CreatedKey }>('/admin/sinode-api-key', {
        // Sinode + scopes tidak di-set lewat UI; default global + full access.
        nama: v.nama,
        expiresAt: v.expiresAt || undefined,
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['api-key', 'list'] });
      toast.success('API key dibuat');
      setCreateOpen(false);
      setRevealed(res.data.data);
    },
    onError: (e: any) => toast.error(e.response?.data?.error?.message ?? 'Gagal'),
  });

  const updateMut = useMutation({
    mutationFn: async ({
      id,
      values,
    }: {
      id: string;
      values: Partial<FormValues> & { isActive?: boolean };
    }) => apiClient.patch(`/admin/sinode-api-key/${id}`, values),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['api-key', 'list'] });
      toast.success('API key diperbarui');
      setEditing(null);
    },
    onError: (e: any) => toast.error(e.response?.data?.error?.message ?? 'Gagal'),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => apiClient.delete(`/admin/sinode-api-key/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['api-key', 'list'] });
      toast.success('API key di-revoke');
      setDeleting(null);
    },
    onError: (e: any) => toast.error(e.response?.data?.error?.message ?? 'Gagal'),
  });

  const list = listQ.data ?? [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
            <Key className="w-6 h-6 text-brand-500" /> API Keys
          </h1>
          <p className="text-neutral-500 mt-1">
            Kunci API untuk aplikasi konsumen (mobile app, integrasi eksternal).
            Setiap key punya akses penuh ke semua data via API.
          </p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded-lg font-medium text-sm"
        >
          <Plus className="w-4 h-4" />
          Buat API Key
        </button>
      </div>

      {/* Info card */}
      <div className="mb-4 text-xs text-neutral-600 bg-blue-50 border border-blue-200 rounded-lg p-3 flex gap-2">
        <Key className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <div>
          Saat membuat API key, full token akan ditampilkan <strong>sekali</strong> setelah save.
          Pastikan langsung di-copy. Setelah modal tertutup, hanya prefix (mis. <code className="px-1 py-0.5 bg-white border rounded">ecc_AB23xy7K_…</code>) yang bisa dilihat.
        </div>
      </div>

      {/* List */}
      {listQ.isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
        </div>
      ) : list.length === 0 ? (
        <div className="bg-white border border-neutral-200 rounded-xl p-12 text-center">
          <Key className="w-10 h-10 mx-auto mb-3 text-neutral-300" />
          <p className="font-medium text-neutral-700">Belum ada API key.</p>
          <p className="text-sm text-neutral-500 mt-1">
            Klik <strong>Buat API Key</strong> untuk membuat key pertama.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-neutral-500">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Nama</th>
                <th className="text-left px-4 py-2 font-medium w-56">Prefix</th>
                <th className="text-left px-4 py-2 font-medium w-32">Last used</th>
                <th className="text-left px-4 py-2 font-medium w-28">Expires</th>
                <th className="text-left px-4 py-2 font-medium w-24">Status</th>
                <th className="text-right px-4 py-2 font-medium w-24">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {list.map((k) => (
                <tr key={k.id} className={k.isActive ? '' : 'opacity-60'}>
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-neutral-900">{k.nama}</div>
                    <div className="text-xs text-neutral-500">
                      Created {formatDateID(k.createdAt)}
                      {k.sinode && (
                        <span className="ml-2 px-1 py-0.5 text-[10px] bg-neutral-100 rounded">
                          Sinode: {k.sinode.kode}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <code className="px-1.5 py-0.5 text-xs bg-neutral-100 text-neutral-700 rounded font-mono">
                      ecc_{k.keyPrefix}_…
                    </code>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-neutral-600">
                    {relativeFrom(k.lastUsedAt)}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-neutral-600">
                    {k.expiresAt ? (
                      <span
                        className={
                          new Date(k.expiresAt) < new Date()
                            ? 'text-red-600 font-medium'
                            : ''
                        }
                      >
                        {formatDateID(k.expiresAt)}
                      </span>
                    ) : (
                      <span className="text-neutral-400">tanpa expire</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {k.isActive ? (
                      <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-green-100 text-green-700 rounded">
                        Aktif
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-neutral-200 text-neutral-600 rounded">
                        Nonaktif
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button
                        onClick={() =>
                          updateMut.mutate({
                            id: k.id,
                            values: { isActive: !k.isActive },
                          })
                        }
                        className="p-1.5 hover:bg-neutral-100 rounded text-neutral-500"
                        title={k.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                      >
                        <Power className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setEditing(k)}
                        className="p-1.5 hover:bg-neutral-100 rounded text-neutral-500"
                        title="Edit"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleting(k)}
                        className="p-1.5 hover:bg-red-50 rounded text-neutral-500 hover:text-red-600"
                        title="Revoke"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create modal */}
      {(createOpen || editing) && (
        <ApiKeyFormModal
          editing={editing}
          loading={createMut.isPending || updateMut.isPending}
          onClose={() => {
            setCreateOpen(false);
            setEditing(null);
          }}
          onSubmit={(v) =>
            editing
              ? updateMut.mutateAsync({
                  id: editing.id,
                  values: { nama: v.nama, expiresAt: v.expiresAt },
                })
              : createMut.mutateAsync(v)
          }
        />
      )}

      {/* Revealed key modal — only after create */}
      {revealed && <RevealedKeyModal data={revealed} onClose={() => setRevealed(null)} />}

      <ConfirmDelete
        open={!!deleting}
        loading={deleteMut.isPending}
        title="Revoke API key?"
        itemName={
          deleting
            ? `${deleting.nama} (ecc_${deleting.keyPrefix}_…) — konsumer pakai key ini akan auto-fail setelah revoke`
            : undefined
        }
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && deleteMut.mutateAsync(deleting.id)}
      />
    </div>
  );
}

// ============== Modals ==============

function ApiKeyFormModal({
  editing,
  loading,
  onClose,
  onSubmit,
}: {
  editing: ApiKey | null;
  loading?: boolean;
  onClose: () => void;
  onSubmit: (v: FormValues) => Promise<unknown>;
}) {
  const [values, setValues] = useState<FormValues>(() => {
    if (editing) {
      return {
        nama: editing.nama,
        expiresAt: editing.expiresAt ? editing.expiresAt.slice(0, 10) : '',
      };
    }
    return EMPTY_FORM;
  });

  function patch(p: Partial<FormValues>) {
    setValues((v) => ({ ...v, ...p }));
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" onClick={loading ? undefined : onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md pointer-events-auto max-h-[90vh] flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100">
            <h2 className="text-lg font-semibold text-neutral-900">
              {editing ? 'Edit API Key' : 'Buat API Key Baru'}
            </h2>
            <button onClick={onClose} disabled={loading} className="p-1.5 hover:bg-neutral-100 rounded-lg disabled:opacity-50">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="overflow-y-auto p-6 space-y-4">
            <div className="text-xs text-neutral-600 bg-blue-50 border border-blue-200 rounded p-3">
              Key bersifat <strong>global</strong> (akses semua data) dan punya{' '}
              <strong>full access</strong> ke semua endpoint API. Untuk scope yang lebih ketat,
              edit langsung lewat DB.
            </div>

            <label className="block">
              <span className="text-sm font-medium text-neutral-700">Nama / Deskripsi</span>
              <input
                value={values.nama}
                onChange={(e) => patch({ nama: e.target.value })}
                placeholder="Mis. Mobile App Production"
                className="mt-1 w-full px-3 py-2 border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500 text-sm"
                autoFocus
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-neutral-700">Expire (opsional)</span>
              <span className="block text-[11px] text-neutral-500 mb-1">
                Kosongkan untuk key yang tidak ber-expire.
              </span>
              <input
                type="date"
                value={values.expiresAt}
                onChange={(e) => patch({ expiresAt: e.target.value })}
                className="mt-1 w-full px-3 py-2 border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500 text-sm"
              />
            </label>
          </div>

          <div className="flex justify-end gap-2 px-6 py-4 border-t border-neutral-100 bg-neutral-50">
            <button
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 rounded-lg"
            >
              Batal
            </button>
            <button
              onClick={() => onSubmit(values).catch(() => {})}
              disabled={loading || !values.nama.trim()}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-lg disabled:opacity-50"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {editing ? 'Simpan' : 'Buat Key'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function RevealedKeyModal({ data, onClose }: { data: CreatedKey; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard?.writeText(data.key).then(() => {
      setCopied(true);
      toast.success('Key di-copy ke clipboard');
      setTimeout(() => setCopied(false), 3000);
    });
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm" />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg pointer-events-auto">
          <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100">
            <h2 className="text-lg font-semibold text-neutral-900 flex items-center gap-2">
              <Key className="w-5 h-5 text-brand-500" />
              API Key Baru
            </h2>
          </div>

          <div className="p-6 space-y-4">
            <div className="text-sm">
              <div className="font-medium text-neutral-900">{data.nama}</div>
              <div className="text-xs text-neutral-500 mt-0.5">
                {data.sinode ? `${data.sinode.nama} (${data.sinode.kode})` : 'Global · semua sinode'}
              </div>
            </div>

            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 flex gap-2 text-xs text-amber-900">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
              <div>
                <p>
                  <strong>Copy key sekarang.</strong> Setelah modal ini ditutup, key
                  tidak bisa direveal lagi. Kalau key hilang, Anda harus generate yang baru.
                </p>
              </div>
            </div>

            <div>
              <span className="block text-xs uppercase tracking-wider text-neutral-500 font-semibold mb-1">
                Key
              </span>
              <div className="flex items-stretch gap-2">
                <code className="flex-1 px-3 py-2.5 bg-neutral-900 text-neutral-100 rounded-lg text-xs font-mono break-all">
                  {data.key}
                </code>
                <button
                  onClick={copy}
                  className={`px-3 rounded-lg text-sm font-medium inline-flex items-center gap-1.5 shrink-0 ${
                    copied
                      ? 'bg-green-600 text-white'
                      : 'bg-brand-500 hover:bg-brand-600 text-white'
                  }`}
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4" />
                      Tersalin
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      Copy
                    </>
                  )}
                </button>
              </div>
              <p className="mt-2 text-[11px] text-neutral-500">
                Konsumer pakai header:{' '}
                <code className="px-1 py-0.5 bg-neutral-100 rounded">X-API-Key: {data.key.slice(0, 20)}…</code>
              </p>
            </div>

            <div className="text-xs text-neutral-500">
              Key ini memiliki <strong>akses penuh</strong> ke semua data via API.
            </div>
          </div>

          <div className="flex justify-end gap-2 px-6 py-4 border-t border-neutral-100 bg-neutral-50">
            <button
              onClick={onClose}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg"
            >
              <ShieldOff className="w-4 h-4" />
              Saya sudah copy, tutup
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
