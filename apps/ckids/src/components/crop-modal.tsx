'use client';

import { useCallback, useState } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import { X, Check, RotateCcw, ZoomIn, Loader2 } from 'lucide-react';

/**
 * Crop image ke square (1:1) sebelum upload. Pakai react-easy-crop —
 * drag untuk reposisi, pinch/slider untuk zoom.
 *
 * Output: JPEG blob (WebP conversion + resize dilakukan server-side).
 */
export function CropModal({
  imageSrc,
  onCancel,
  onConfirm,
  aspect = 1,
}: {
  imageSrc: string;
  onCancel: () => void;
  onConfirm: (blob: Blob) => void;
  aspect?: number;
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [processing, setProcessing] = useState(false);

  const onCropComplete = useCallback((_area: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  async function handleConfirm() {
    if (!croppedAreaPixels) return;
    setProcessing(true);
    try {
      const blob = await getCroppedBlob(imageSrc, croppedAreaPixels);
      onConfirm(blob);
    } catch (e: any) {
      alert('Gagal crop: ' + (e?.message ?? String(e)));
    } finally {
      setProcessing(false);
    }
  }

  function reset() {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
  }

  return (
    <div className="fixed inset-0 z-[70] bg-black/90 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-3 sm:p-4 text-white">
        <button
          onClick={onCancel}
          className="p-2 rounded-lg hover:bg-white/10"
          aria-label="Cancel"
        >
          <X className="w-5 h-5" />
        </button>
        <div className="font-semibold text-sm sm:text-base">Crop Foto (1:1)</div>
        <button
          onClick={handleConfirm}
          disabled={!croppedAreaPixels || processing}
          className="p-2 rounded-lg bg-kids-500 hover:bg-kids-600 disabled:opacity-50 flex items-center gap-1"
          aria-label="Confirm"
        >
          {processing ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Check className="w-5 h-5" />
          )}
        </button>
      </div>

      {/* Cropper area — take remaining space */}
      <div className="relative flex-1 bg-black">
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          aspect={aspect}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropComplete}
          showGrid={true}
        />
      </div>

      {/* Zoom slider + reset */}
      <div className="p-3 sm:p-4 bg-neutral-900 text-white space-y-2">
        <div className="flex items-center gap-2">
          <ZoomIn className="w-4 h-4 text-neutral-400 shrink-0" />
          <input
            type="range"
            min="1"
            max="3"
            step="0.05"
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1"
          />
          <button
            onClick={reset}
            className="p-1.5 rounded hover:bg-white/10 text-neutral-300"
            title="Reset zoom + posisi"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
        <div className="text-center text-xs text-neutral-400">
          Drag foto untuk reposisi · pinch/slider untuk zoom · tap ✓ untuk konfirmasi
        </div>
      </div>
    </div>
  );
}

// ============================================================
//  Helper: crop image → blob
// ============================================================

async function getCroppedBlob(imageSrc: string, area: Area): Promise<Blob> {
  const image = await loadImage(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context tidak available');

  // Output size = crop area actual pixels (max 1200 supaya file gak terlalu besar
  // untuk network upload — server tetap resize final ke 800px).
  const maxOut = 1200;
  const outSize = Math.min(area.width, maxOut);
  canvas.width = outSize;
  canvas.height = outSize;

  ctx.drawImage(
    image,
    area.x,
    area.y,
    area.width,
    area.height,
    0,
    0,
    outSize,
    outSize,
  );

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('canvas.toBlob returned null'));
      },
      'image/jpeg',
      0.92,
    );
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.crossOrigin = 'anonymous';
    img.src = src;
  });
}
