'use client';

import { useEffect, useRef, useState } from 'react';
import { X, ScanLine, AlertTriangle, CameraOff } from 'lucide-react';
import type { Html5Qrcode } from 'html5-qrcode';

/**
 * QR Scanner modal — buka camera via html5-qrcode, on decode langsung
 * fire callback + close.
 *
 * html5-qrcode di-import dynamic supaya:
 *   1. Tidak masuk SSR bundle (browser-only API)
 *   2. Chunk terpisah — cuma load waktu modal buka
 *
 * Camera permission: browser prompt otomatis first time. Safari perlu
 * user gesture (button click) — dijamin karena modal buka via button.
 */
export function QrScannerModal({
  onClose,
  onScan,
  title = 'Scan QR Jemaat',
  hint = 'Arahkan kamera ke QR code kode jemaat',
}: {
  onClose: () => void;
  onScan: (kode: string) => void;
  title?: string;
  hint?: string;
}) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerId = 'ckids-qr-scanner-region';
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function start() {
      try {
        // Dynamic import supaya gak crash SSR.
        const { Html5Qrcode } = await import('html5-qrcode');
        if (!mounted) return;

        const instance = new Html5Qrcode(containerId, { verbose: false });
        scannerRef.current = instance;

        await instance.start(
          { facingMode: 'environment' }, // rear camera on mobile
          {
            fps: 10,
            qrbox: { width: 240, height: 240 },
            aspectRatio: 1,
          },
          (decodedText) => {
            // Success — call handler + close.
            const kode = decodedText.trim().toUpperCase();
            onScan(kode);
            void stop();
          },
          () => {
            // Silent — decode failure per frame is normal, ignore.
          },
        );

        if (mounted) setStarting(false);
      } catch (e: any) {
        const msg =
          e?.message?.includes('Permission')
            ? 'Camera permission ditolak. Buka browser settings, izinkan akses camera untuk situs ini, lalu refresh.'
            : e?.message?.includes('NotFound') || e?.message?.includes('device')
              ? 'Camera tidak ditemukan. Pastikan perangkat punya webcam / rear camera.'
              : e?.message ?? 'Gagal buka camera';
        if (mounted) {
          setError(msg);
          setStarting(false);
        }
      }
    }

    async function stop() {
      try {
        if (scannerRef.current) {
          await scannerRef.current.stop();
          await scannerRef.current.clear();
          scannerRef.current = null;
        }
      } catch {
        // Ignore — sometimes already stopped
      }
      if (mounted) onClose();
    }

    start();

    return () => {
      mounted = false;
      // Cleanup camera on unmount
      if (scannerRef.current) {
        scannerRef.current
          .stop()
          .then(() => scannerRef.current?.clear())
          .catch(() => undefined);
        scannerRef.current = null;
      }
    };
  }, [onClose, onScan]);

  async function handleClose() {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        await scannerRef.current.clear();
      } catch {
        // ignore
      }
      scannerRef.current = null;
    }
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ScanLine className="w-5 h-5 text-kids-500" />
            <div>
              <div className="font-semibold text-neutral-900">{title}</div>
              <div className="text-xs text-neutral-500">{hint}</div>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded hover:bg-neutral-100"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div
          className="relative bg-black w-full"
          style={{ aspectRatio: '1 / 1' }}
        >
          {/* Inject CSS supaya <video> yg dibuat html5-qrcode fit ke container square (cover fit).
              html5-qrcode default `object-fit: contain` bikin video letterbox → tampil rectangular. */}
          <style>{`
            #${containerId} video {
              width: 100% !important;
              height: 100% !important;
              object-fit: cover !important;
            }
            #${containerId} > div {
              width: 100% !important;
              height: 100% !important;
            }
          `}</style>
          <div id={containerId} className="w-full h-full absolute inset-0" />
          {starting && !error && (
            <div className="absolute inset-0 flex items-center justify-center text-white text-sm">
              Membuka kamera...
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-neutral-900 text-white p-6 text-center">
              {error.includes('Permission') ? (
                <CameraOff className="w-12 h-12 text-red-400 mb-3" />
              ) : (
                <AlertTriangle className="w-12 h-12 text-amber-400 mb-3" />
              )}
              <div className="text-sm">{error}</div>
            </div>
          )}
        </div>

        <div className="p-3 bg-neutral-50 text-xs text-neutral-500 text-center border-t">
          Tip: pegang QR di jarak 10-30cm dari kamera. Auto-detect saat fokus.
        </div>
      </div>
    </div>
  );
}
