'use client';

import { useRef, useState } from 'react';
import { Upload, Loader2, X, ImagePlus } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import toast from 'react-hot-toast';

/**
 * Photo upload untuk hadiah katalog.
 *
 * 2 mode:
 *  - existingId: hadiah sudah ada di DB → upload langsung ke server endpoint
 *    (POST /admin/hadiah/:id/photo) + set fotoUrl-nya. Return URL final.
 *  - !existingId: (create flow) → preview aja + return base64 sementara.
 *    Setelah hadiah di-create, caller bisa upload actual foto.
 *
 * NOTE: create flow saat ini gak upload otomatis — user create dulu tanpa
 * foto → dapat ID → buka Edit tab → upload foto. Alternatif: 2-phase create
 * kalau butuh flow lebih smooth (nanti kalau ada waktu).
 */
export function PhotoUpload({
  currentUrl,
  existingId,
  onUploaded,
  onCleared,
}: {
  currentUrl: string | null;
  existingId?: string; // hadiah.id
  onUploaded: (url: string) => void;
  onCleared: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(currentUrl);

  async function handleFile(file: File) {
    if (!file.type.startsWith('image/')) {
      toast.error('File harus image (JPG/PNG/WebP)');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Ukuran max 5 MB');
      return;
    }

    // Preview instan pakai FileReader
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(file);

    if (!existingId) {
      toast('Simpan hadiah dulu, baru upload foto via Edit', {
        icon: 'ℹ️',
      });
      return;
    }

    // Upload ke server
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('foto', file);
      const res = await apiClient.post(`/admin/hadiah/${existingId}/photo`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const newUrl = res.data.data.fotoUrl;
      setPreview(newUrl);
      onUploaded(newUrl);
      toast.success('Foto ter-upload');
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message ?? 'Upload gagal');
      setPreview(currentUrl); // revert preview
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete() {
    if (!existingId || !currentUrl) {
      setPreview(null);
      onCleared();
      return;
    }
    if (!confirm('Hapus foto hadiah?')) return;
    try {
      await apiClient.delete(`/admin/hadiah/${existingId}/photo`);
      setPreview(null);
      onCleared();
      toast.success('Foto dihapus');
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message ?? 'Gagal hapus foto');
    }
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
      />

      {preview ? (
        <div className="relative inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt="Preview"
            className="w-32 h-32 rounded-lg object-cover border border-neutral-200"
          />
          {uploading && (
            <div className="absolute inset-0 bg-black/60 rounded-lg flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-white" />
            </div>
          )}
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-1 px-3 py-1.5 text-xs bg-neutral-100 border border-neutral-300 rounded hover:bg-neutral-200"
            >
              <Upload className="w-3 h-3" /> Ganti
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={uploading}
              className="flex items-center gap-1 px-3 py-1.5 text-xs text-red-600 border border-red-200 rounded hover:bg-red-50"
            >
              <X className="w-3 h-3" /> Hapus
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex flex-col items-center justify-center w-32 h-32 border-2 border-dashed border-neutral-300 rounded-lg text-neutral-500 hover:border-kids-400 hover:bg-kids-50 hover:text-kids-600"
        >
          {uploading ? (
            <Loader2 className="w-6 h-6 animate-spin" />
          ) : (
            <>
              <ImagePlus className="w-8 h-8 mb-1" />
              <span className="text-xs">Upload foto</span>
            </>
          )}
        </button>
      )}

      <p className="text-[10px] text-neutral-400 mt-1">
        JPG / PNG / WebP, max 5 MB. Auto resize + convert ke WebP di server.
      </p>
    </div>
  );
}
