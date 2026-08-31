'use client';

import { useEffect, useState } from 'react';
import { Download, X, QrCode } from 'lucide-react';

interface QrisPreviewProps {
  src: string;
  alt: string;
  /** Nama file saat download (tanpa extension). Extension diambil dari URL. */
  downloadName?: string;
  /** Ukuran thumbnail (default 96px). */
  size?: number;
}

/**
 * QRIS image dengan click-to-preview (lightbox modal) + tombol download.
 * Thumbnail clickable → open modal fullscreen dgn QR besar + download button.
 * ESC / click backdrop untuk close.
 */
export function QrisPreview({ src, alt, downloadName = 'qris', size = 96 }: QrisPreviewProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function handleDownload(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      // Fetch → blob → object URL supaya cross-origin image bisa di-download
      // (browser normally block <a download> untuk cross-origin).
      const res = await fetch(src);
      const blob = await res.blob();
      const ext = (src.match(/\.(webp|png|jpe?g|gif|svg)/i)?.[1] ?? 'webp').toLowerCase();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${downloadName}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // Fallback: open in new tab
      window.open(src, '_blank', 'noopener,noreferrer');
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group relative rounded-lg overflow-hidden border border-neutral-200 hover:border-orange-400 hover:shadow-md transition"
        style={{ width: size, height: size }}
        aria-label="Preview QRIS"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          className="w-full h-full object-contain bg-white"
        />
        <span className="absolute inset-0 bg-black/0 group-hover:bg-black/30 flex items-center justify-center transition">
          <QrCode className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition" />
        </span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Preview QRIS"
        >
          <div
            className="relative bg-white rounded-2xl max-w-md w-full overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute top-3 right-3 w-9 h-9 rounded-full bg-white/90 hover:bg-white text-neutral-700 flex items-center justify-center shadow-md z-10"
              aria-label="Tutup"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="p-6 pb-4 bg-gradient-to-br from-orange-50 to-amber-50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt={alt}
                className="w-full h-auto max-h-[70vh] object-contain bg-white rounded-lg border border-neutral-200"
              />
            </div>

            <div className="px-6 py-4 border-t border-neutral-100 flex items-center justify-between gap-3">
              <p className="text-xs text-neutral-500 truncate flex-1">{alt}</p>
              <button
                type="button"
                onClick={handleDownload}
                className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold rounded-lg transition"
              >
                <Download className="w-4 h-4" />
                Download
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
