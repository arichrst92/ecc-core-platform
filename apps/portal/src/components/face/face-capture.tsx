'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Camera,
  CheckCircle2,
  Loader2,
  RefreshCw,
  X,
  Eye,
  ArrowLeftCircle,
  ArrowRightCircle,
  ShieldCheck,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { loadFaceModels } from '@/lib/face-api-loader';
import { useLivenessChallenge } from '@/lib/use-liveness-challenge';
import type { ChallengeKind } from '@/lib/liveness';

interface Props {
  onCapture: (descriptor: number[]) => void | Promise<void>;
  submitting?: boolean;
  submitLabel?: string;
  detectIntervalMs?: number;
  /** Apakah wajib lewati liveness challenge dulu sebelum descriptor di-capture. Default true. */
  requireLiveness?: boolean;
}

type CamStatus = 'loading-models' | 'starting-camera' | 'ready' | 'error';

export function FaceCapture({
  onCapture,
  submitting,
  submitLabel = 'Simpan',
  detectIntervalMs = 300,
  requireLiveness = true,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [camStatus, setCamStatus] = useState<CamStatus>('loading-models');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [descriptor, setDescriptor] = useState<number[] | null>(null);
  const [confidence, setConfidence] = useState<number>(0);

  const liveness = useLivenessChallenge();
  const livenessRequired = requireLiveness;
  const livenessOK = !livenessRequired || liveness.state.status === 'verified';

  // ----- Init: load models, start camera, kick off challenge -----
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await loadFaceModels();
        if (!mounted) return;
        setCamStatus('starting-camera');
        await startCamera();
        if (!mounted) return;
        setCamStatus('ready');
        if (livenessRequired) liveness.start();
      } catch (err: any) {
        setCamStatus('error');
        setErrorMsg(err?.message ?? 'Gagal inisialisasi');
      }
    })();
    return () => {
      mounted = false;
      stopAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ----- Loop deteksi -----
  useEffect(() => {
    if (camStatus !== 'ready') return;
    if (descriptor) return; // sudah ada hasil — pause

    intervalRef.current = setInterval(async () => {
      if (!videoRef.current) return;
      try {
        const faceapi = await loadFaceModels();
        const opts = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 });

        if (livenessRequired && liveness.state.status !== 'verified') {
          // Saat challenge berjalan, kita butuh landmarks (cukup ringan)
          const det = await faceapi
            .detectSingleFace(videoRef.current, opts)
            .withFaceLandmarks();
          if (det) {
            setConfidence(det.detection.score);
            liveness.observe(det.landmarks);
          } else {
            liveness.observe(null);
          }
          return;
        }

        // Setelah liveness OK (atau tidak required), capture descriptor
        const det = await faceapi
          .detectSingleFace(videoRef.current, opts)
          .withFaceLandmarks()
          .withFaceDescriptor();
        if (det) {
          setConfidence(det.detection.score);
          if (det.detection.score >= 0.7) {
            setDescriptor(Array.from(det.descriptor));
          }
        }
      } catch {
        // ignore, retry next frame
      }
    }, detectIntervalMs);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [camStatus, descriptor, detectIntervalMs, livenessRequired, liveness]);

  async function startCamera() {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 480, height: 360, facingMode: 'user' },
      audio: false,
    });
    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
    }
  }

  function stopAll() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  const recapture = useCallback(() => {
    setDescriptor(null);
    setConfidence(0);
    if (livenessRequired) liveness.start();
  }, [livenessRequired, liveness]);

  const retryLiveness = useCallback(() => {
    liveness.start();
  }, [liveness]);

  async function handleSubmit() {
    if (!descriptor) return toast.error('Belum ada wajah ter-deteksi');
    await onCapture(descriptor);
  }

  // ----- Render frame border color -----
  const frameClass =
    descriptor
      ? 'border-green-400'
      : liveness.state.status === 'verified'
        ? 'border-blue-400'
        : liveness.state.status === 'failed'
          ? 'border-red-400'
          : liveness.state.status === 'running'
            ? 'border-brand-400 animate-pulse'
            : 'border-white/40';

  return (
    <div className="space-y-4">
      <div className="relative bg-neutral-900 rounded-xl overflow-hidden aspect-[4/3] max-w-md mx-auto">
        <video
          ref={videoRef}
          className="w-full h-full object-cover [transform:scaleX(-1)]"
          playsInline
          muted
        />

        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          <div className={`w-48 h-60 border-4 rounded-full transition-colors ${frameClass}`} />
        </div>

        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-center">
          <CamBadge
            camStatus={camStatus}
            errorMsg={errorMsg}
            confidence={confidence}
            descriptor={descriptor}
            livenessOK={livenessOK}
          />
        </div>

        {/* Challenge overlay */}
        {livenessRequired && !descriptor && (
          <div className="absolute top-3 left-3 right-3">
            <ChallengePanel
              state={liveness.state}
              challenges={liveness.challenges}
              current={liveness.current}
              onRetry={retryLiveness}
            />
          </div>
        )}
      </div>

      <p className="text-sm text-neutral-600 text-center">
        {!livenessOK
          ? 'Ikuti instruksi di atas untuk membuktikan ini adalah Anda secara langsung.'
          : 'Posisikan wajah lurus ke kamera dengan pencahayaan baik.'}
      </p>

      <div className="flex items-center justify-center gap-2">
        {descriptor && (
          <button
            type="button"
            onClick={recapture}
            disabled={submitting}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 rounded-lg disabled:opacity-50"
          >
            <RefreshCw className="w-4 h-4" />
            Capture Ulang
          </button>
        )}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!descriptor || submitting}
          className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-lg disabled:opacity-50"
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
          {submitLabel}
        </button>
      </div>
    </div>
  );
}

// =====================================================
//  Challenge instruction overlay
// =====================================================

function ChallengePanel({
  state,
  challenges,
  current,
  onRetry,
}: {
  state: ReturnType<typeof useLivenessChallenge>['state'];
  challenges: ChallengeKind[];
  current: ChallengeKind | null;
  onRetry: () => void;
}) {
  if (state.status === 'idle' || challenges.length === 0) return null;

  if (state.status === 'verified') {
    return (
      <div className="bg-green-500/95 text-white rounded-lg px-3 py-2 text-xs font-medium flex items-center gap-2 shadow-lg">
        <ShieldCheck className="w-4 h-4" />
        Liveness verified — capturing wajah...
      </div>
    );
  }

  if (state.status === 'failed') {
    return (
      <div className="bg-red-500/95 text-white rounded-lg px-3 py-2 text-xs font-medium flex items-center justify-between gap-2 shadow-lg">
        <span>{state.reason}</span>
        <button
          onClick={onRetry}
          className="bg-white/20 hover:bg-white/30 px-2 py-0.5 rounded text-xs font-semibold"
        >
          Coba lagi
        </button>
      </div>
    );
  }

  if (state.status !== 'running' || !current) return null;

  const idx = state.currentIndex;
  const total = challenges.length;
  const remaining = Math.max(0, Math.ceil((state.deadline - Date.now()) / 1000));

  return (
    <div className="bg-black/70 backdrop-blur-md text-white rounded-lg px-3 py-2.5 shadow-lg">
      <div className="flex items-center gap-2">
        <ChallengeIcon kind={current.kind} />
        <div className="flex-1 min-w-0">
          <div className="text-xs uppercase tracking-wider opacity-70">
            Challenge {idx + 1} / {total}
          </div>
          <div className="text-sm font-semibold truncate">{current.label}</div>
        </div>
        <div className="text-xs opacity-80 tabular-nums">{remaining}s</div>
      </div>
      <div className="mt-2 h-1 bg-white/15 rounded-full overflow-hidden">
        <div
          className="h-full bg-brand-400 transition-all"
          style={{ width: `${((total - idx - 1) / total) * 100 + 100 / total / 2}%` }}
        />
      </div>
    </div>
  );
}

function ChallengeIcon({ kind }: { kind: ChallengeKind['kind'] }) {
  if (kind === 'blink') return <Eye className="w-5 h-5 text-brand-300" />;
  if (kind === 'turn-left') return <ArrowLeftCircle className="w-5 h-5 text-brand-300" />;
  return <ArrowRightCircle className="w-5 h-5 text-brand-300" />;
}

// =====================================================
//  Camera status badge
// =====================================================

function CamBadge({
  camStatus,
  errorMsg,
  confidence,
  descriptor,
  livenessOK,
}: {
  camStatus: CamStatus;
  errorMsg: string;
  confidence: number;
  descriptor: number[] | null;
  livenessOK: boolean;
}) {
  const base = 'px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-2 backdrop-blur-md';

  if (camStatus === 'loading-models') {
    return (
      <span className={`${base} bg-white/80 text-neutral-700`}>
        <Loader2 className="w-3 h-3 animate-spin" />
        Memuat model wajah...
      </span>
    );
  }
  if (camStatus === 'starting-camera') {
    return (
      <span className={`${base} bg-white/80 text-neutral-700`}>
        <Camera className="w-3 h-3" />
        Membuka kamera...
      </span>
    );
  }
  if (camStatus === 'error') {
    return (
      <span className={`${base} bg-red-50/90 text-red-700`}>
        <X className="w-3 h-3" />
        {errorMsg || 'Error'}
      </span>
    );
  }
  if (descriptor) {
    return (
      <span className={`${base} bg-green-50/90 text-green-700`}>
        <CheckCircle2 className="w-3 h-3" />
        Wajah terdeteksi (confidence {(confidence * 100).toFixed(0)}%)
      </span>
    );
  }
  if (livenessOK) {
    return (
      <span className={`${base} bg-blue-50/90 text-blue-700`}>
        <Loader2 className="w-3 h-3 animate-spin" />
        Capturing descriptor...
      </span>
    );
  }
  return null;
}
