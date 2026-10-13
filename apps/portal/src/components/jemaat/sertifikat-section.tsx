'use client';

/**
 * Sertifikat jemaat di halaman detail jemaat (portal).
 * Bisa lebih dari satu: Nama, Tanggal, File (gambar atau PDF).
 * Juga tampil read-only di profil jemaat mobile (GET /admin/me/sertifikat).
 */
import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Award, FileText, Loader2, Pencil, Plus, Trash2, Upload, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';
import { ConfirmDelete } from '@/components/crud/confirm-delete';

interface Sertifikat {
  id: string;
  nama: string;
  tanggal: string;
  fileUrl: string | null;
  fileMime: string | null;
  fileName: string | null;
}

const apiBase = process.env.NEXT_PUBLIC_CORE_API_URL ?? '';
const fileHref = (url: string) => (/^https?:\/\//.test(url) ? url : `${apiBase}${url}`);
const fmtTanggal = (d: string) =>
  new Date(d.slice(0, 10) + 'T00:00:00').toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

export function SertifikatSection({ jemaatId }: { jemaatId: string }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<{ mode: 'add' } | { mode: 'edit'; item: Sertifikat } | null>(null);
  const [deleting, setDeleting] = useState<Sertifikat | null>(null);
  const key = ['jemaat', jemaatId, 'sertifikat'];

  const q = useQuery({
    queryKey: key,
    queryFn: async () =>
      (await apiClient.get<{ data: Sertifikat[] }>(`/admin/jemaat/${jemaatId}/sertifikat`)).data.data,
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => apiClient.delete(`/admin/jemaat/${jemaatId}/sertifikat/${id}`),
    onSuccess: () => {
      toast.success('Sertifikat dihapus');
      setDeleting(null);
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message ?? 'Gagal menghapus'),
  });

  const items = q.data ?? [];

  return (
    <section className="mt-6 bg-white border border-neutral-200 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-neutral-100 flex-wrap gap-2">
        <div>
          <h2 className="font-semibold text-neutral-900 flex items-center gap-2">
            <Award className="w-4 h-4 text-amber-500" />
            Sertifikat
            <span className="text-xs font-normal text-neutral-500">({items.length})</span>
          </h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Sertifikat baptis, kelas, pelatihan, dll. Tampil juga di profil jemaat di aplikasi.
          </p>
        </div>
        <button
          onClick={() => setForm({ mode: 'add' })}
          className="flex items-center gap-2 px-3 py-1.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-lg"
        >
          <Plus className="w-4 h-4" />
          Tambah Sertifikat
        </button>
      </div>

      <div className="p-4 sm:p-6">
        {q.isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-neutral-400 italic text-center py-3">Belum ada sertifikat.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {items.map((s) => {
              const isPdf = s.fileMime === 'application/pdf';
              return (
                <div key={s.id} className="border border-neutral-200 rounded-xl overflow-hidden flex flex-col">
                  <a
                    href={s.fileUrl ? fileHref(s.fileUrl) : undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block h-36 bg-neutral-50 border-b border-neutral-100"
                  >
                    {s.fileUrl && !isPdf ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={fileHref(s.fileUrl)} alt={s.nama} className="w-full h-full object-contain" />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-red-600">
                        <FileText className="w-10 h-10" />
                        <span className="text-xs mt-1 font-medium">{s.fileUrl ? 'Buka PDF' : 'Tanpa file'}</span>
                      </div>
                    )}
                  </a>
                  <div className="p-3 flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-neutral-900 truncate" title={s.nama}>
                        {s.nama}
                      </div>
                      <div className="text-xs text-neutral-500">{fmtTanggal(s.tanggal)}</div>
                    </div>
                    <button
                      onClick={() => setForm({ mode: 'edit', item: s })}
                      className="p-1.5 rounded hover:bg-neutral-100 text-neutral-500"
                      title="Ubah"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setDeleting(s)}
                      className="p-1.5 rounded hover:bg-red-50 text-neutral-500 hover:text-red-600"
                      title="Hapus"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {form && (
        <SertifikatFormModal
          jemaatId={jemaatId}
          item={form.mode === 'edit' ? form.item : null}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            qc.invalidateQueries({ queryKey: key });
          }}
        />
      )}

      <ConfirmDelete
        open={!!deleting}
        loading={deleteMut.isPending}
        onClose={() => setDeleting(null)}
        title="Hapus sertifikat?"
        itemName={deleting?.nama}
        onConfirm={() => deleting && deleteMut.mutate(deleting.id)}
      />
    </section>
  );
}

function SertifikatFormModal({
  jemaatId,
  item,
  onClose,
  onSaved,
}: {
  jemaatId: string;
  item: Sertifikat | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [nama, setNama] = useState(item?.nama ?? '');
  const [tanggal, setTanggal] = useState(item?.tanggal.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
  const [file, setFile] = useState<File | null>(null);

  const saveMut = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      fd.append('nama', nama.trim());
      fd.append('tanggal', tanggal);
      if (file) fd.append('file', file);
      const cfg = { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120_000 };
      return item
        ? apiClient.patch(`/admin/jemaat/${jemaatId}/sertifikat/${item.id}`, fd, cfg)
        : apiClient.post(`/admin/jemaat/${jemaatId}/sertifikat`, fd, cfg);
    },
    onSuccess: () => {
      toast.success(item ? 'Sertifikat diperbarui' : 'Sertifikat ditambahkan');
      onSaved();
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message ?? 'Gagal menyimpan sertifikat'),
  });

  const canSave = nama.trim().length >= 2 && !!tanggal && (!!item || !!file);

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" onClick={saveMut.isPending ? undefined : onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md pointer-events-auto">
          <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100">
            <h2 className="font-semibold text-neutral-900">{item ? 'Ubah Sertifikat' : 'Tambah Sertifikat'}</h2>
            <button onClick={onClose} className="p-1 hover:bg-neutral-100 rounded">
              <X className="w-4 h-4 text-neutral-500" />
            </button>
          </div>
          <div className="p-6 space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-neutral-700">Nama Sertifikat</span>
              <input
                value={nama}
                onChange={(e) => setNama(e.target.value)}
                placeholder="Mis. Sertifikat Baptis, Kelas Membership"
                className="mt-1 w-full px-3 py-2 border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-neutral-700">Tanggal Sertifikat</span>
              <input
                type="date"
                value={tanggal}
                onChange={(e) => setTanggal(e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500 text-sm"
              />
            </label>
            <div>
              <span className="text-sm font-medium text-neutral-700">
                File Sertifikat {item && <span className="text-neutral-400 font-normal">(kosongkan kalau tidak diganti)</span>}
              </span>
              <input
                ref={fileRef}
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="mt-1 w-full flex items-center justify-center gap-2 px-3 py-3 border-2 border-dashed border-neutral-300 rounded-lg text-sm text-neutral-600 hover:bg-neutral-50"
              >
                <Upload className="w-4 h-4" />
                {file ? file.name : 'Pilih gambar atau PDF (maks 10 MB)'}
              </button>
            </div>
          </div>
          <div className="flex justify-end gap-2 px-6 py-4 border-t border-neutral-100 bg-neutral-50">
            <button
              onClick={onClose}
              disabled={saveMut.isPending}
              className="px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 rounded-lg"
            >
              Batal
            </button>
            <button
              onClick={() => saveMut.mutate()}
              disabled={!canSave || saveMut.isPending}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-lg disabled:opacity-50"
            >
              {saveMut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Simpan
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
