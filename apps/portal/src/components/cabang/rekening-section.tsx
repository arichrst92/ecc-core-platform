'use client';

import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Wallet,
  Plus,
  Loader2,
  Trash2,
  Pencil,
  Upload,
  QrCode,
  Copy,
  Check,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { REKENING_PURPOSE_PRESETS } from '@ecc/shared-types';
import { apiClient } from '@/lib/api-client';
import { ConfirmDelete } from '@/components/crud/confirm-delete';
import { UploadHint } from '@/components/upload/upload-hint';

// ============== Types ==============

interface Rekening {
  id: string;
  purpose: string;
  bankNama: string;
  bankNomor: string;
  bankAtasNama: string;
  qrisImageUrl: string | null;
  catatan: string | null;
  isActive: boolean;
}

interface FormValues {
  purpose: string;
  bankNama: string;
  bankNomor: string;
  bankAtasNama: string;
  catatan: string;
  isActive: boolean;
}

const EMPTY: FormValues = {
  purpose: '',
  bankNama: '',
  bankNomor: '',
  bankAtasNama: '',
  catatan: '',
  isActive: true,
};

// ============== Section ==============

export function RekeningSection({ cabangId }: { cabangId: string }) {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Rekening | null>(null);
  const [deleting, setDeleting] = useState<Rekening | null>(null);

  const listQ = useQuery({
    queryKey: ['cabang', cabangId, 'rekening'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: Rekening[] }>(
        `/admin/cabang/${cabangId}/rekening`,
      );
      return res.data.data;
    },
  });

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['cabang', cabangId, 'rekening'] });
  }

  const createMut = useMutation({
    mutationFn: async (v: FormValues) => apiClient.post(`/admin/cabang/${cabangId}/rekening`, v),
    onSuccess: () => {
      invalidate();
      toast.success('Rekening ditambah');
      setModalOpen(false);
    },
    onError: (e: any) => toast.error(e.response?.data?.error?.message ?? 'Gagal'),
  });
  const updateMut = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: FormValues }) =>
      apiClient.patch(`/admin/cabang/${cabangId}/rekening/${id}`, values),
    onSuccess: () => {
      invalidate();
      toast.success('Rekening diperbarui');
      setEditing(null);
    },
    onError: (e: any) => toast.error(e.response?.data?.error?.message ?? 'Gagal'),
  });
  const deleteMut = useMutation({
    mutationFn: async (id: string) =>
      apiClient.delete(`/admin/cabang/${cabangId}/rekening/${id}`),
    onSuccess: () => {
      invalidate();
      toast.success('Rekening dihapus');
      setDeleting(null);
    },
    onError: (e: any) => toast.error(e.response?.data?.error?.message ?? 'Gagal'),
  });

  const list = listQ.data ?? [];

  return (
    <div className="bg-white border border-neutral-200 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-semibold text-neutral-900 flex items-center gap-2">
            <Wallet className="w-4 h-4 text-amber-600" />
            Rekening Bank ({list.length})
          </h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Rekening yang dipakai cabang untuk menerima persembahan / donasi sesuai purpose.
          </p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 px-3 py-1.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-lg"
        >
          <Plus className="w-4 h-4" />
          Tambah Rekening
        </button>
      </div>

      {listQ.isLoading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
        </div>
      ) : list.length === 0 ? (
        <p className="text-sm text-neutral-400 italic text-center py-6">
          Belum ada rekening. Klik <strong>Tambah Rekening</strong> untuk membuat yang pertama.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {list.map((r) => (
            <RekeningCard
              key={r.id}
              r={r}
              cabangId={cabangId}
              onEdit={() => setEditing(r)}
              onDelete={() => setDeleting(r)}
              onQrisChange={invalidate}
            />
          ))}
        </div>
      )}

      {(modalOpen || editing) && (
        <RekeningModal
          editing={editing}
          loading={createMut.isPending || updateMut.isPending}
          onClose={() => {
            setModalOpen(false);
            setEditing(null);
          }}
          onSubmit={(v) =>
            editing
              ? updateMut.mutateAsync({ id: editing.id, values: v })
              : createMut.mutateAsync(v)
          }
        />
      )}

      <ConfirmDelete
        open={!!deleting}
        loading={deleteMut.isPending}
        title="Hapus rekening?"
        itemName={
          deleting ? `${deleting.purpose} · ${deleting.bankNama} ${deleting.bankNomor}` : undefined
        }
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && deleteMut.mutateAsync(deleting.id)}
      />
    </div>
  );
}

// ============== Card ==============

function RekeningCard({
  r,
  cabangId,
  onEdit,
  onDelete,
  onQrisChange,
}: {
  r: Rekening;
  cabangId: string;
  onEdit: () => void;
  onDelete: () => void;
  onQrisChange: () => void;
}) {
  const apiBase = process.env.NEXT_PUBLIC_CORE_API_URL ?? '';
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const qrisUploadMut = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('foto', file);
      return apiClient.post(
        `/admin/cabang/${cabangId}/rekening/${r.id}/qris`,
        form,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
    },
    onSuccess: () => {
      toast.success('QRIS diperbarui');
      onQrisChange();
    },
    onError: (e: any) => toast.error(e.response?.data?.error?.message ?? 'Gagal upload'),
  });
  const qrisDeleteMut = useMutation({
    mutationFn: async () => apiClient.delete(`/admin/cabang/${cabangId}/rekening/${r.id}/qris`),
    onSuccess: () => {
      toast.success('QRIS dihapus');
      onQrisChange();
    },
    onError: (e: any) => toast.error(e.response?.data?.error?.message ?? 'Gagal'),
  });

  function copyNomor() {
    navigator.clipboard?.writeText(r.bankNomor).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className={`border rounded-lg p-4 ${r.isActive ? 'border-neutral-200' : 'border-neutral-200 opacity-60'}`}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-block px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider bg-amber-50 text-amber-800 rounded">
              {r.purpose}
            </span>
            {!r.isActive && (
              <span className="text-[10px] px-1.5 py-0.5 bg-neutral-100 text-neutral-500 rounded">
                Nonaktif
              </span>
            )}
          </div>
          <div className="mt-2 text-sm text-neutral-900 font-semibold">{r.bankNama}</div>
          <div className="mt-0.5 flex items-center gap-1.5">
            <code className="text-sm font-mono text-neutral-800">{r.bankNomor}</code>
            <button
              onClick={copyNomor}
              className="text-neutral-400 hover:text-neutral-700"
              title="Copy nomor rekening"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-green-600" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
          <div className="text-xs text-neutral-600 mt-0.5">a.n. {r.bankAtasNama}</div>
          {r.catatan && (
            <div className="text-xs text-neutral-500 italic mt-1.5">{r.catatan}</div>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={onEdit}
            className="p-1.5 hover:bg-neutral-100 rounded text-neutral-500"
            title="Edit"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 hover:bg-red-50 rounded text-neutral-500 hover:text-red-600"
            title="Hapus"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* QRIS section */}
      <div className="border-t border-neutral-100 pt-3 flex items-center gap-3">
        {r.qrisImageUrl ? (
          <a
            href={`${apiBase}${r.qrisImageUrl}`}
            target="_blank"
            rel="noreferrer"
            className="block shrink-0"
            title="Lihat QRIS full-size"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`${apiBase}${r.qrisImageUrl}`}
              alt={`QRIS ${r.purpose}`}
              className="w-20 h-20 object-contain border border-neutral-200 rounded"
            />
          </a>
        ) : (
          <div className="w-20 h-20 border border-dashed border-neutral-300 rounded flex items-center justify-center text-neutral-300 shrink-0">
            <QrCode className="w-7 h-7" />
          </div>
        )}
        <div className="flex flex-col gap-1.5 flex-1">
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            onChange={(ev) => {
              const f = ev.target.files?.[0];
              if (f) qrisUploadMut.mutate(f);
              ev.target.value = '';
            }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={qrisUploadMut.isPending}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium border border-neutral-300 hover:bg-neutral-50 rounded disabled:opacity-50 self-start"
          >
            {qrisUploadMut.isPending ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Upload className="w-3 h-3" />
            )}
            {r.qrisImageUrl ? 'Ganti QRIS' : 'Upload QRIS'}
          </button>
          {r.qrisImageUrl && (
            <button
              onClick={() => qrisDeleteMut.mutate()}
              disabled={qrisDeleteMut.isPending}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 rounded disabled:opacity-50 self-start"
            >
              <Trash2 className="w-3 h-3" />
              Hapus QRIS
            </button>
          )}
          <UploadHint kind="qris" />
        </div>
      </div>
    </div>
  );
}

// ============== Modal ==============

function RekeningModal({
  editing,
  loading,
  onClose,
  onSubmit,
}: {
  editing: Rekening | null;
  loading?: boolean;
  onClose: () => void;
  onSubmit: (v: FormValues) => Promise<unknown>;
}) {
  const [values, setValues] = useState<FormValues>(() => {
    if (editing) {
      return {
        purpose: editing.purpose,
        bankNama: editing.bankNama,
        bankNomor: editing.bankNomor,
        bankAtasNama: editing.bankAtasNama,
        catatan: editing.catatan ?? '',
        isActive: editing.isActive,
      };
    }
    return EMPTY;
  });

  function patch(p: Partial<FormValues>) {
    setValues((v) => ({ ...v, ...p }));
  }

  function handleSubmit() {
    onSubmit(values).catch(() => {});
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" onClick={loading ? undefined : onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md pointer-events-auto max-h-[90vh] flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100">
            <h2 className="text-lg font-semibold text-neutral-900">
              {editing ? 'Edit Rekening' : 'Tambah Rekening'}
            </h2>
            <button onClick={onClose} disabled={loading} className="p-1.5 hover:bg-neutral-100 rounded-lg disabled:opacity-50">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="overflow-y-auto p-6 space-y-4">
            <Field label="Purpose" required helper="Untuk apa rekening ini (mis. Persembahan Umum, Pembangunan).">
              <input
                list="rekening-purpose-presets"
                value={values.purpose}
                onChange={(e) => patch({ purpose: e.target.value })}
                placeholder="Persembahan Umum"
                className={inputCls}
              />
              <datalist id="rekening-purpose-presets">
                {REKENING_PURPOSE_PRESETS.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </Field>

            <Field label="Nama Bank" required>
              <input
                value={values.bankNama}
                onChange={(e) => patch({ bankNama: e.target.value })}
                placeholder="BCA"
                className={inputCls}
              />
            </Field>

            <Field label="Nomor Rekening" required>
              <input
                value={values.bankNomor}
                onChange={(e) => patch({ bankNomor: e.target.value })}
                placeholder="1234567890"
                inputMode="numeric"
                className={inputCls}
              />
            </Field>

            <Field label="Atas Nama" required>
              <input
                value={values.bankAtasNama}
                onChange={(e) => patch({ bankAtasNama: e.target.value })}
                placeholder="Yayasan ECC Jakarta"
                className={inputCls}
              />
            </Field>

            <Field label="Catatan" helper="Opsional. Mis. 'untuk transfer dari luar negeri pakai Wise'.">
              <textarea
                rows={2}
                value={values.catatan}
                onChange={(e) => patch({ catatan: e.target.value })}
                className={inputCls}
              />
            </Field>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={values.isActive}
                onChange={(e) => patch({ isActive: e.target.checked })}
                className="w-4 h-4 accent-brand-500"
              />
              <span className="text-sm text-neutral-700">Rekening aktif</span>
            </label>

            {!editing && (
              <p className="text-xs text-neutral-500 bg-neutral-50 rounded p-2">
                Upload gambar QRIS bisa dilakukan setelah rekening tersimpan.
              </p>
            )}
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
              onClick={handleSubmit}
              disabled={
                loading ||
                !values.purpose.trim() ||
                !values.bankNama.trim() ||
                !values.bankNomor.trim() ||
                !values.bankAtasNama.trim()
              }
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-lg disabled:opacity-50"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {editing ? 'Simpan' : 'Tambah'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

const inputCls =
  'w-full px-3 py-2 border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500 bg-white text-sm';

function Field({
  label,
  required,
  helper,
  children,
}: {
  label: string;
  required?: boolean;
  helper?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-neutral-700">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </span>
      {helper && <span className="block text-[11px] text-neutral-500 mb-0.5">{helper}</span>}
      <div className="mt-1">{children}</div>
    </label>
  );
}
