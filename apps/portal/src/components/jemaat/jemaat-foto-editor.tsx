'use client';

/**
 * Foto profil jemaat di Portal — klik foto / "Ganti foto" → pilih gambar →
 * crop 1:1 (geser, zoom, putar) → unggah. Bisa juga hapus foto.
 * API: POST/DELETE /admin/jemaat/:id/foto (akses menu Jemaat tulis, audit log).
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { Camera, Loader2, Trash2, User as UserIcon } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { CoverCropper } from '@/components/worship/cover-cropper';

const MAX_INPUT_MB = 20;

/** Dialog dirender di <body> — aman dipakai di dalam form (Edit Profil) tanpa ikut submit. */
function BodyPortal({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return ready ? createPortal(children, document.body) : null;
}
const errMsg = (e: any, fallback: string) => e?.response?.data?.error?.message ?? fallback;

export function JemaatFotoEditor({
  jemaatId,
  nama,
  fotoUrl,
  apiBase,
  readOnly,
  className = 'mx-auto sm:mx-0',
}: {
  jemaatId: string;
  nama: string;
  fotoUrl: string | null;
  apiBase: string;
  /** Data sudah dihapus permanen → tidak bisa diubah. */
  readOnly?: boolean;
  className?: string;
}) {
  const qc = useQueryClient();
  const ref = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const src = fotoUrl ? (/^https?:/i.test(fotoUrl) ? fotoUrl : `${apiBase}${fotoUrl}`) : null;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['jemaat', 'detail', jemaatId] });
    qc.invalidateQueries({ queryKey: ['jemaat'] });
  };

  const upload = useMutation({
    mutationFn: async (blob: Blob) => {
      const fd = new FormData();
      fd.append('foto', blob, 'foto.jpg');
      return apiClient.post(`/admin/jemaat/${jemaatId}/foto`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    },
    onSuccess: () => {
      refresh();
      setFile(null);
      toast.success('Foto profil diperbarui');
    },
    onError: (e) => toast.error(errMsg(e, 'Gagal mengunggah foto')),
  });

  const remove = useMutation({
    mutationFn: async () => apiClient.delete(`/admin/jemaat/${jemaatId}/foto`),
    onSuccess: () => {
      refresh();
      setConfirmDel(false);
      toast.success('Foto profil dihapus');
    },
    onError: (e) => toast.error(errMsg(e, 'Gagal menghapus foto')),
  });

  const pick = () => !readOnly && ref.current?.click();

  return (
    <div className={`flex flex-col items-center gap-1.5 shrink-0 ${className}`}>
      <button
        type="button"
        onClick={pick}
        disabled={readOnly || upload.isPending}
        className="group relative w-24 h-24 rounded-full overflow-hidden border-2 border-neutral-200 disabled:cursor-default"
        title={readOnly ? undefined : 'Ganti foto'}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={nama} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-brand-100 text-brand-700 flex items-center justify-center">
            <UserIcon className="w-10 h-10" />
          </div>
        )}
        {!readOnly ? (
          <span
            className={`absolute inset-0 flex items-center justify-center bg-black/45 text-white transition-opacity ${
              upload.isPending ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100'
            }`}
          >
            {upload.isPending ? <Loader2 className="w-6 h-6 animate-spin" /> : <Camera className="w-6 h-6" />}
          </span>
        ) : null}
      </button>

      {!readOnly ? (
        <div className="flex items-center gap-2 text-xs">
          <button type="button" onClick={pick} className="font-medium text-brand-600 hover:underline">
            {src ? 'Ganti foto' : 'Unggah foto'}
          </button>
          {src ? (
            <>
              <span className="text-neutral-300">·</span>
              <button type="button" onClick={() => setConfirmDel(true)} className="text-neutral-500 hover:text-red-600">
                Hapus
              </button>
            </>
          ) : null}
        </div>
      ) : null}

      <input
        ref={ref}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          if (f.size > MAX_INPUT_MB * 1024 * 1024) {
            toast.error(`Ukuran file maksimal ${MAX_INPUT_MB} MB`);
            return;
          }
          setFile(f);
        }}
      />

      {file ? (
        <BodyPortal>
        <CoverCropper
          file={file}
          variant="profile"
          title={`Foto profil — ${nama}`}
          saveLabel="Simpan foto"
          onCancel={() => !upload.isPending && setFile(null)}
          onDone={async (blob) => {
            await upload.mutateAsync(blob).catch(() => {});
          }}
        />
        </BodyPortal>
      ) : null}

      {confirmDel ? (
        <BodyPortal>
          <div className="fixed inset-0 bg-black/50 z-40" onClick={() => !remove.isPending && setConfirmDel(false)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-5 pointer-events-auto">
              <div className="flex items-center gap-2 font-semibold text-neutral-900">
                <Trash2 className="w-4 h-4 text-red-600" /> Hapus foto profil?
              </div>
              <p className="text-sm text-neutral-600 mt-2">
                Foto {nama} dihapus dari Portal dan Els App. Jemaat bisa mengunggah foto baru sendiri dari app.
              </p>
              <div className="flex justify-end gap-2 mt-5">
                <button
                  type="button"
                  onClick={() => setConfirmDel(false)}
                  disabled={remove.isPending}
                  className="h-9 px-4 text-sm rounded-lg border border-neutral-300 hover:bg-neutral-50"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() => remove.mutate()}
                  disabled={remove.isPending}
                  className="flex items-center gap-2 h-9 px-4 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50"
                >
                  {remove.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Hapus foto
                </button>
              </div>
            </div>
          </div>
        </BodyPortal>
      ) : null}
    </div>
  );
}
