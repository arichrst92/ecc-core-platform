'use client';

import { useRef, useState } from 'react';
import { Upload, Loader2, X, ImagePlus } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import toast from 'react-hot-toast';
import { CropModal } from './crop-modal';
import { resolveMediaUrl } from '@/lib/media';

/**
 * Photo upload untuk hadiah katalog dengan crop 1:1.
 *
 * Flow:
 *  1. User pilih file dari picker
 *  2. FileReader baca sebagai data URL → open CropModal
 *  3. User drag + zoom → confirm → dapat blob square
 *  4. Upload blob ke server (kalau existingId ada) OR preview only (create flow)
 *
 * Constraints: JPG/PNG/WebP, max 5 MB source.
 */
export function PhotoUpload({
  currentUrl,
  existingId,
  onUploaded,
  onCleared,
}: {
  currentUrl: string | null;
  existingId?: string;
  onUploaded: (url: string) => void;
  onCleared: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(currentUrl);
  // Data URL dari source file — di-set saat pick, di-clear saat crop confirmed/cancelled
  const [cropSrc, setCropSrc] = useState<string | null>(null);

  function handleFileSelect(file: File) {
    if (!file.type.startsWith('image/')) {
      toast.error('File harus image (JPG/PNG/WebP)');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Ukuran max 5 MB');
      return;
    }
    // Baca file → data URL → set jadi cropSrc → CropModal terbuka
    const reader = new FileReader();
    reader.onload = () => setCropSrc(reader.result as string);
    reader.readAsDataURL(file);
    // Reset input value supaya user bisa pilih file sama lagi (mis. re-crop)
    if (inputRef.current) inputRef.current.value = '';
  }

  async function handleCropConfirm(blob: Blob) {
    setCropSrc(null); // close modal

    // Preview instan dari blob
    const previewUrl = URL.createObjectURL(blob);
    setPreview(previewUrl);

    if (!existingId) {
      toast('Simpan hadiah dulu, baru upload foto via Edit tab', {
        icon: 'ℹ️',
      });
      return;
    }

    // Upload cropped blob
    setUploading(true);
    try {
      const formData = new FormData();
      const file = new File([blob], 'hadiah-crop.jpg', { type: 'image/jpeg' });
      formData.append('foto', file);
      const res = await apiClient.post(`/admin/hadiah/${existingId}/photo`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const newUrl = res.data.data.fotoUrl;
      // Free the object URL — pakai URL server (dengan cache-bust) untuk final preview
      URL.revokeObjectURL(previewUrl);
      setPreview(newUrl);
      onUploaded(newUrl);
      toast.success('Foto ter-upload + di-crop square');
    } catch (err: any) {
      toast.error(err.response?.data?.error?.message ?? 'Upload gagal');
      setPreview(currentUrl); // revert
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
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
      />

      {preview ? (
        <div className="inline-block">
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview.startsWith('blob:') || preview.startsWith('data:') ? preview : (resolveMediaUrl(preview) ?? preview)}
              alt="Preview"
              className="w-32 h-32 rounded-lg object-cover border border-neutral-200"
            />
            {uploading && (
              <div className="absolute inset-0 bg-black/60 rounded-lg flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-white" />
              </div>
            )}
          </div>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-1 px-3 py-1.5 text-xs bg-neutral-100 border border-neutral-300 rounded hover:bg-neutral-200"
            >
              <Upload className="w-3 h-3" /> Ganti + Crop
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
        JPG/PNG/WebP, max 5 MB. Auto crop square + resize + WebP di server.
      </p>

      {cropSrc && (
        <CropModal
          imageSrc={cropSrc}
          onCancel={() => setCropSrc(null)}
          onConfirm={handleCropConfirm}
        />
      )}
    </>
  );
}
