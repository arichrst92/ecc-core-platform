'use client';

/**
 * Materi pertemuan homecell (per jadwal): upload file + nama + deskripsi.
 * Anggota melihat & membuka file ini di aplikasi (Homecell → Materi).
 * API: /admin/homecell/:homecellId/schedule/:scheduleId/files
 */
import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, FileImage, Loader2, Paperclip, Pencil, Plus, Trash2, Upload, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';
import { ConfirmDelete } from '@/components/crud/confirm-delete';

export interface ScheduleFile {
  id: string;
  nama: string;
  deskripsi: string | null;
  fileUrl: string;
  fileMime: string;
  fileName: string | null;
  fileSize: number | null;
  createdAt: string;
  uploadedBy: { id: string; namaLengkap: string } | null;
}

const apiBase = process.env.NEXT_PUBLIC_CORE_API_URL ?? '';
const href = (u: string) => (/^https?:\/\//.test(u) ? u : `${apiBase}${u}`);
const size = (b: number | null) =>
  b == null ? '' : b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;
const ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.heic,.gif,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt';

export function ScheduleFilesSection({
  homecellId,
  scheduleId,
  files,
  queryKey,
}: {
  homecellId: string;
  scheduleId: string;
  files: ScheduleFile[];
  /** Query detail jadwal yang di-invalidate setelah perubahan. */
  queryKey: readonly unknown[];
}) {
  const qc = useQueryClient();
  const base = `/admin/homecell/${homecellId}/schedule/${scheduleId}/files`;
  const [form, setForm] = useState<{ item: ScheduleFile | null } | null>(null);
  const [deleting, setDeleting] = useState<ScheduleFile | null>(null);

  const delMut = useMutation({
    mutationFn: async (id: string) => apiClient.delete(`${base}/${id}`),
    onSuccess: () => {
      toast.success('File dihapus');
      setDeleting(null);
      qc.invalidateQueries({ queryKey });
    },
    onError: (e: any) => toast.error(e.response?.data?.error?.message ?? 'Gagal menghapus'),
  });

  return (
    <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-100 gap-2 flex-wrap">
        <div>
          <h2 className="font-semibold text-neutral-900 flex items-center gap-2">
            <Paperclip className="w-4 h-4 text-brand-500" /> Materi Pertemuan ({files.length})
          </h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            File yang diupload bisa dilihat & dibuka semua anggota homecell di aplikasi.
          </p>
        </div>
        <button
          onClick={() => setForm({ item: null })}
          className="flex items-center gap-2 px-3 py-1.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-lg"
        >
          <Plus className="w-4 h-4" /> Upload File
        </button>
      </div>
      {files.length === 0 ? (
        <p className="text-sm text-neutral-400 italic text-center py-6">Belum ada materi.</p>
      ) : (
        <ul className="divide-y divide-neutral-100">
          {files.map((f) => {
            const Icon = f.fileMime.startsWith('image/') ? FileImage : FileText;
            return (
              <li key={f.id} className="flex items-start gap-3 px-5 py-3">
                <Icon className="w-5 h-5 text-brand-500 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <a
                    href={href(f.fileUrl)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-semibold text-neutral-900 hover:text-brand-600 hover:underline"
                  >
                    {f.nama}
                  </a>
                  {f.deskripsi ? <p className="text-xs text-neutral-600 mt-0.5 whitespace-pre-line">{f.deskripsi}</p> : null}
                  <p className="text-[11px] text-neutral-400 mt-0.5">
                    {[f.fileName, size(f.fileSize), f.uploadedBy?.namaLengkap].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <button
                  onClick={() => setForm({ item: f })}
                  className="p-1.5 rounded hover:bg-neutral-100 text-neutral-500"
                  title="Ubah nama / deskripsi"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setDeleting(f)}
                  className="p-1.5 rounded hover:bg-red-50 text-neutral-500 hover:text-red-600"
                  title="Hapus"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {form && (
        <FileFormModal
          base={base}
          item={form.item}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            qc.invalidateQueries({ queryKey });
          }}
        />
      )}
      <ConfirmDelete
        open={!!deleting}
        loading={delMut.isPending}
        onClose={() => setDeleting(null)}
        title="Hapus materi?"
        itemName={deleting?.nama}
        onConfirm={() => deleting && delMut.mutate(deleting.id)}
      />
    </div>
  );
}

function FileFormModal({
  base,
  item,
  onClose,
  onSaved,
}: {
  base: string;
  item: ScheduleFile | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [nama, setNama] = useState(item?.nama ?? '');
  const [deskripsi, setDeskripsi] = useState(item?.deskripsi ?? '');
  const [file, setFile] = useState<File | null>(null);

  const mut = useMutation({
    mutationFn: async () => {
      if (item) return apiClient.patch(`${base}/${item.id}`, { nama: nama.trim(), deskripsi: deskripsi.trim() });
      const fd = new FormData();
      fd.append('nama', nama.trim());
      if (deskripsi.trim()) fd.append('deskripsi', deskripsi.trim());
      fd.append('file', file!);
      return apiClient.post(base, fd, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 180_000 });
    },
    onSuccess: () => {
      toast.success(item ? 'Materi diperbarui' : 'Materi diupload');
      onSaved();
    },
    onError: (e: any) => toast.error(e.response?.data?.error?.message ?? 'Gagal menyimpan'),
  });
  const can = nama.trim().length >= 2 && (!!item || !!file);

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" onClick={mut.isPending ? undefined : onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md pointer-events-auto">
          <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100">
            <h2 className="font-semibold text-neutral-900">{item ? 'Ubah Materi' : 'Upload Materi'}</h2>
            <button onClick={onClose} className="p-1 hover:bg-neutral-100 rounded">
              <X className="w-4 h-4 text-neutral-500" />
            </button>
          </div>
          <div className="p-6 space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-neutral-700">Nama File</span>
              <input
                value={nama}
                onChange={(e) => setNama(e.target.value)}
                placeholder="Mis. Bahan Diskusi Minggu 3"
                className="mt-1 w-full px-3 py-2 border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-neutral-700">Deskripsi (opsional)</span>
              <textarea
                value={deskripsi}
                onChange={(e) => setDeskripsi(e.target.value)}
                rows={3}
                placeholder="Mis. Baca sebelum pertemuan, siapkan jawaban no. 1–3"
                className="mt-1 w-full px-3 py-2 border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500 text-sm"
              />
            </label>
            {!item && (
              <div>
                <span className="text-sm font-medium text-neutral-700">File</span>
                <input
                  ref={ref}
                  type="file"
                  accept={ACCEPT}
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    setFile(f);
                    if (f && !nama.trim()) setNama(f.name.replace(/\.[^.]+$/, ''));
                  }}
                />
                <button
                  type="button"
                  onClick={() => ref.current?.click()}
                  className="mt-1 w-full flex items-center justify-center gap-2 px-3 py-3 border-2 border-dashed border-neutral-300 rounded-lg text-sm text-neutral-600 hover:bg-neutral-50"
                >
                  <Upload className="w-4 h-4" />
                  {file ? file.name : 'PDF, gambar, Word, Excel, PowerPoint (maks 20 MB)'}
                </button>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 px-6 py-4 border-t border-neutral-100 bg-neutral-50">
            <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 rounded-lg">
              Batal
            </button>
            <button
              onClick={() => mut.mutate()}
              disabled={!can || mut.isPending}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-lg disabled:opacity-50"
            >
              {mut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Simpan
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
