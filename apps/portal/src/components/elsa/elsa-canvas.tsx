'use client';

/**
 * ElsaCanvas — audio-reactive visualization.
 *
 * Two visual modes dgn smooth interpolation:
 *   - **Idle**: soft-disk particle cluster (dots + connections, subtle drift)
 *   - **Speaking** (audioLevel > 0.08): dense stacked-waveform ribbon —
 *     30 sinusoidal lines multi-frequency, low alpha, saling overlap
 *     bikin efek ribbon flowing (referensi image user)
 *
 * Blend via `waveBlend` factor (0..1) lerp per frame. Particles fade out
 * saat wave in, wave fade in saat particles out. Cross-fade transition.
 *
 * Exposes global setElsaAudioLevel(n) untuk external audio hook
 * (mic + TTS simulation).
 */
import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    __elsaAudioLevel?: number;
    __elsaSetAudioLevel?: (n: number) => void;
  }
}

const SPEAKING_THRESHOLD = 0.08;

// Waveform ribbon parameters
const WAVE_LINE_COUNT = 30;
const WAVE_SAMPLE_STEPS = 100;

export function ElsaCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let W = 0;
    let H = 0;
    let DPR = 1;

    interface Node {
      homeX: number;
      homeY: number;
      x: number;
      y: number;
      vx: number;
      vy: number;
      r: number;
      pulse: number;
      accent: boolean;
    }
    let nodes: Node[] = [];

    // Waveform ribbon lines — precomputed unique params per line
    interface WaveLine {
      freq1: number;
      freq2: number;
      freq3: number;
      ampScale: number;
      phaseSpeed: number;
      phaseOffset: number;
      alphaBase: number;
    }
    let waveLines: WaveLine[] = [];

    // Blend factor: 0 = pure idle particles, 1 = pure wave ribbon
    let waveBlend = 0;

    window.__elsaAudioLevel = 0;
    window.__elsaSetAudioLevel = (n: number) => {
      window.__elsaAudioLevel = Math.max(window.__elsaAudioLevel ?? 0, Math.min(1, n));
    };

    function resize() {
      DPR = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas!.offsetWidth * DPR;
      H = canvas!.offsetHeight * DPR;
      canvas!.width = W;
      canvas!.height = H;
      initNodes();
      initWaveLines();
    }

    function initNodes() {
      const targetCount = Math.min(Math.floor((W * H) / (12000 * DPR)), 140);
      nodes = [];
      const cx = W / 2;
      const cy = H / 2;
      const baseR = Math.min(W, H) * 0.32;

      for (let i = 0; i < targetCount; i++) {
        const u = Math.random();
        const ringR = baseR * Math.sqrt(u);
        const angle = Math.random() * Math.PI * 2;
        const x = cx + Math.cos(angle) * ringR;
        const y = cy + Math.sin(angle) * ringR * 0.85;
        nodes.push({
          homeX: x,
          homeY: y,
          x,
          y,
          vx: (Math.random() - 0.5) * 0.25 * DPR,
          vy: (Math.random() - 0.5) * 0.25 * DPR,
          r: (Math.random() * 1.6 + 0.6) * DPR,
          pulse: Math.random() * Math.PI * 2,
          accent: Math.random() < 0.18,
        });
      }
    }

    function initWaveLines() {
      waveLines = [];
      for (let i = 0; i < WAVE_LINE_COUNT; i++) {
        // Frequencies mix — bikin waveform organik, tidak repetitif
        const freq1 = 1.5 + Math.random() * 2.5;   // 1.5–4 cycle per width
        const freq2 = 3 + Math.random() * 5;       // 3–8 harmonics
        const freq3 = 7 + Math.random() * 8;       // 7–15 detail
        // Amplitude scale — variasi kecil, akan di-mult dgn audioLevel + H
        const ampScale = 0.5 + Math.random() * 0.8;
        // Phase speed & offset — bikin tiap line bergerak beda
        const phaseSpeed = 0.6 + Math.random() * 0.8;
        const phaseOffset = Math.random() * Math.PI * 2;
        // Alpha low supaya overlap bikin ribbon effect
        const alphaBase = 0.06 + Math.random() * 0.08;
        waveLines.push({ freq1, freq2, freq3, ampScale, phaseSpeed, phaseOffset, alphaBase });
      }
    }

    function drawFrame() {
      if (!ctx) return;
      ctx.clearRect(0, 0, W, H);

      const audioLevel = window.__elsaAudioLevel ?? 0;

      // Smooth transition idle ↔ wave mode
      const targetWaveBlend = audioLevel > SPEAKING_THRESHOLD ? 1 : 0;
      waveBlend += (targetWaveBlend - waveBlend) * 0.06;

      const particleAlpha = 1 - waveBlend; // fade out particles as wave fades in

      const cx = W / 2;
      const cy = H / 2;
      const t = performance.now() * 0.0008;
      const isIdleAnim = audioLevel < SPEAKING_THRESHOLD;
      const orbitSpeed = isIdleAnim ? 0.0006 : 0;
      const cosO = Math.cos(orbitSpeed);
      const sinO = Math.sin(orbitSpeed);

      // ==================== IDLE PARTICLES ====================
      // Cuma render kalau particleAlpha > 0.02 (skip overhead saat pure wave mode)
      if (particleAlpha > 0.02) {
        const maxDist = 140 * DPR;
        const lineWidth = 1.4 * DPR;

        // Update positions (drift only saat idle)
        for (let i = 0; i < nodes.length; i++) {
          const n = nodes[i]!;
          n.pulse += 0.02;
          n.x += n.vx;
          n.y += n.vy;
          n.x += (n.homeX - n.x) * 0.02;
          n.y += (n.homeY - n.y) * 0.02;

          if (isIdleAnim) {
            const wavePhase = t + i * 0.18;
            n.x += Math.sin(wavePhase) * 0.18 * DPR;
            n.y += Math.cos(wavePhase * 0.85) * 0.14 * DPR;
            const hdx = n.homeX - cx;
            const hdy = n.homeY - cy;
            n.homeX = cx + hdx * cosO - hdy * sinO;
            n.homeY = cy + hdx * sinO + hdy * cosO;
          }
        }

        // Connections
        for (let i = 0; i < nodes.length; i++) {
          for (let j = i + 1; j < nodes.length; j++) {
            const a = nodes[i]!;
            const b = nodes[j]!;
            const dx = a.x - b.x;
            const dy = a.y - b.y;
            const d2 = dx * dx + dy * dy;
            const max2 = maxDist * maxDist;
            if (d2 < max2) {
              const tt = 1 - Math.sqrt(d2) / maxDist;
              const alpha = tt * 0.3 * particleAlpha;
              ctx.beginPath();
              ctx.strokeStyle = `rgba(242, 101, 34, ${alpha})`;
              ctx.lineWidth = lineWidth;
              ctx.moveTo(a.x, a.y);
              ctx.lineTo(b.x, b.y);
              ctx.stroke();
            }
          }
        }

        // Nodes
        for (const n of nodes) {
          const p = Math.sin(n.pulse) * 0.5 + 0.5;
          const r = n.r * (1 + p * 0.4);
          ctx.beginPath();
          ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
          if (n.accent) {
            ctx.fillStyle = `rgba(242, 101, 34, ${(0.7 + p * 0.3) * particleAlpha})`;
          } else {
            ctx.fillStyle = `rgba(30, 41, 59, ${(0.55 + p * 0.3) * particleAlpha})`;
          }
          ctx.fill();
        }
      }

      // ==================== SPEAKING WAVEFORM RIBBON ====================
      if (waveBlend > 0.02) {
        const waveTime = performance.now() * 0.001;
        // Max amplitude — respect canvas height, scale with audioLevel
        const globalAmp = Math.min(H * 0.32, 260 * DPR) * audioLevel * waveBlend;

        ctx.lineWidth = 1 * DPR;

        for (let l = 0; l < waveLines.length; l++) {
          const wl = waveLines[l]!;
          const phase = waveTime * wl.phaseSpeed + wl.phaseOffset;
          const lineAmp = globalAmp * wl.ampScale;
          const alpha = wl.alphaBase * waveBlend * (0.4 + audioLevel * 0.6);

          ctx.beginPath();
          ctx.strokeStyle = `rgba(242, 101, 34, ${alpha})`;

          for (let s = 0; s <= WAVE_SAMPLE_STEPS; s++) {
            const norm = s / WAVE_SAMPLE_STEPS; // 0..1
            const x = norm * W;
            // Multi-frequency mixing — bikin waveform look organic + rich
            const y =
              cy +
              lineAmp *
                (Math.sin(norm * wl.freq1 * Math.PI * 2 + phase) * 0.5 +
                  Math.sin(norm * wl.freq2 * Math.PI * 2 + phase * 1.3) * 0.3 +
                  Math.sin(norm * wl.freq3 * Math.PI * 2 - phase * 0.7) * 0.2);
            if (s === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      }

      // Decay audio level
      window.__elsaAudioLevel = (window.__elsaAudioLevel ?? 0) * 0.92;
      if ((window.__elsaAudioLevel ?? 0) < 0.002) window.__elsaAudioLevel = 0;

      animationRef.current = requestAnimationFrame(drawFrame);
    }

    resize();
    animationRef.current = requestAnimationFrame(drawFrame);
    window.addEventListener('resize', resize);

    return () => {
      cancelAnimationFrame(animationRef.current);
      window.removeEventListener('resize', resize);
      delete window.__elsaAudioLevel;
      delete window.__elsaSetAudioLevel;
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      aria-hidden
    />
  );
}
