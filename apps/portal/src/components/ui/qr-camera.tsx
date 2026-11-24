'use client';

/**
 * Kamera scan QR di browser (BarcodeDetector bawaan — Chrome / Edge / Android,
 * Safari terbaru). Mode berkelanjutan: tiap QR terbaca → onCode(kode); kode yang
 * sama diabaikan beberapa detik (tidak dobel). `paused` = berhenti mendeteksi
 * sementara (mis. saat menunggu respons server).
 *
 * QR kartu jemaat berisi kode 8 karakter; bila berupa URL diambil segmen terakhir.
 */
import { useEffect, useRef, useState } from 'react';
import { CameraOff } from 'lucide-react';

export function QrCamera({ onCode, paused = false }: { onCode: (kode: string) => void; paused?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;
  const lastRef = useRef<{ kode: string; at: number } | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    const BD = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => { detect: (v: HTMLVideoElement) => Promise<{ rawValue?: string }[]> } }).BarcodeDetector;
    if (!BD) {
      setError('Browser ini belum mendukung scan QR lewat kamera. Pakai Chrome / Edge, scanner USB, atau ketik kodenya.');
      return;
    }
    const detector = new BD({ formats: ['qr_code'] });
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (stopped || !videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        const tick = async () => {
          if (stopped || !videoRef.current) return;
          if (!pausedRef.current) {
            try {
              const codes = await detector.detect(videoRef.current);
              const raw = codes?.[0]?.rawValue;
              if (raw) {
                const kode = (raw.trim().split(/[/?#=]/).filter(Boolean).pop() ?? raw.trim()).toUpperCase();
                const last = lastRef.current;
                if (!last || last.kode !== kode || Date.now() - last.at > 4000) {
                  lastRef.current = { kode, at: Date.now() };
                  onCodeRef.current(kode);
                }
              }
            } catch {
              /* frame belum siap */
            }
          }
          timer = setTimeout(tick, 250);
        };
        tick();
      } catch {
        setError('Tidak bisa membuka kamera. Pastikan izin kamera diberikan untuk Portal.');
      }
    })();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  if (error) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
        <CameraOff className="w-4 h-4 shrink-0 mt-0.5" />
        {error}
      </div>
    );
  }
  return (
    <div className="relative rounded-xl overflow-hidden bg-black">
      <video ref={videoRef} muted playsInline className="w-full aspect-[4/3] object-cover" />
      <div className="pointer-events-none absolute inset-[18%] border-2 border-emerald-400/90 rounded-2xl" />
      {paused ? <div className="absolute inset-0 bg-black/30 flex items-center justify-center text-white text-xs font-semibold">Memproses…</div> : null}
    </div>
  );
}
