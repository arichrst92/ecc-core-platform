'use client';

/**
 * ElsaCanvas — audio-reactive particle node visualization.
 *
 * Adopted dari ide.asia /agent public/js/agent.js particle system.
 *
 * Behavior:
 *   - **Idle mode**: soft-disk cluster dgn sinusoidal drift + orbital rotation.
 *     Warna & brightness subtle (garis tipis, node dot kecil).
 *   - **Speaking mode** (audioLevel > 0.1): particles ANIMATE ke posisi
 *     sinusoidal wave horizontal — menyerupai waveform sound, amplitude
 *     sync ke audioLevel. Wave phase scroll left→right per frame.
 *   - Kembali ke idle: spring interpolate balik ke home position.
 *
 * Exposes global setElsaAudioLevel(n) untuk external audio hook
 * (mic + TTS simulation).
 */
import { useEffect, useRef } from 'react';

// Global registration untuk chat/mic feed audio level
declare global {
  interface Window {
    __elsaAudioLevel?: number;
    __elsaSetAudioLevel?: (n: number) => void;
  }
}

const SPEAKING_THRESHOLD = 0.08;

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
      /** Index urut untuk wave positioning (0..count-1) — dipakai saat speaking mode */
      waveIdx: number;
    }
    let nodes: Node[] = [];
    // Blend factor 0 (idle) ↔ 1 (full wave mode) — smooth transition antar mode.
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
          waveIdx: i,
        });
      }
    }

    function drawFrame() {
      if (!ctx) return;
      ctx.clearRect(0, 0, W, H);

      const audioLevel = window.__elsaAudioLevel ?? 0;

      // Smooth transition idle ↔ wave mode (blend faktor lerp)
      const targetWaveBlend = audioLevel > SPEAKING_THRESHOLD ? 1 : 0;
      waveBlend += (targetWaveBlend - waveBlend) * 0.08;

      // Line style — ORIGINAL subtle (garis tebal tapi alpha tipis)
      const maxDist = 140 * DPR;
      const lineWidth = 1.4 * DPR;

      const cx = W / 2;
      const cy = H / 2;

      const t = performance.now() * 0.0008;
      const isIdleAnim = audioLevel < SPEAKING_THRESHOLD;
      const orbitSpeed = isIdleAnim ? 0.0006 : 0;
      const cos = Math.cos(orbitSpeed);
      const sin = Math.sin(orbitSpeed);

      // Wave parameters (speaking mode)
      const waveCount = nodes.length;
      const waveTime = performance.now() * 0.003;
      const waveAmp = Math.min(H * 0.28, 200 * DPR) * audioLevel;
      // Multi-frequency wave — bikin waveform lebih rich (bukan simple sine)
      const waveFn = (idx: number) => {
        const x = idx / waveCount; // 0..1
        return (
          Math.sin(x * 6 + waveTime) * 0.5 +
          Math.sin(x * 14 + waveTime * 1.7) * 0.3 +
          Math.sin(x * 22 - waveTime * 2.1) * 0.2
        );
      };

      // Update positions
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i]!;
        n.pulse += 0.02 + audioLevel * 0.1;

        // Compute wave target position
        const waveX = (n.waveIdx / (waveCount - 1)) * W * 0.85 + W * 0.075;
        const waveY = cy + waveFn(n.waveIdx) * waveAmp;

        // Compute idle target position (soft disk drift)
        let idleX = n.homeX;
        let idleY = n.homeY;
        if (isIdleAnim) {
          const wavePhase = t + i * 0.18;
          idleX += Math.sin(wavePhase) * 0.18 * DPR * 20; // amplify subtle drift
          idleY += Math.cos(wavePhase * 0.85) * 0.14 * DPR * 20;

          // Slow orbital rotation of home anchors
          const hdx = n.homeX - cx;
          const hdy = n.homeY - cy;
          n.homeX = cx + hdx * cos - hdy * sin;
          n.homeY = cy + hdx * sin + hdy * cos;
        }

        // Blend target: idle ↔ wave based on waveBlend
        const targetX = idleX * (1 - waveBlend) + waveX * waveBlend;
        const targetY = idleY * (1 - waveBlend) + waveY * waveBlend;

        // Spring toward target — stiffer when in wave mode (snappy waveform),
        // looser when idle (organic drift)
        const springK = waveBlend > 0.5 ? 0.15 : 0.03;
        n.x += (targetX - n.x) * springK;
        n.y += (targetY - n.y) * springK;

        // Small random jitter selama idle utk life
        if (isIdleAnim) {
          n.x += n.vx * 0.5;
          n.y += n.vy * 0.5;
        }
      }

      // Connections — ORIGINAL subtle brightness
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
            // Original subtle alpha
            const alpha = tt * (0.3 + audioLevel * 0.15);
            ctx.beginPath();
            ctx.strokeStyle = `rgba(242, 101, 34, ${alpha})`;
            ctx.lineWidth = lineWidth;
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      // In wave mode, extra connect adjacent particles by waveIdx untuk
      // form waveform outline yg jelas
      if (waveBlend > 0.3) {
        const waveConnAlpha = waveBlend * 0.6;
        const sorted = [...nodes].sort((a, b) => a.waveIdx - b.waveIdx);
        ctx.beginPath();
        ctx.strokeStyle = `rgba(242, 101, 34, ${waveConnAlpha})`;
        ctx.lineWidth = lineWidth * 1.2;
        ctx.moveTo(sorted[0]!.x, sorted[0]!.y);
        for (let i = 1; i < sorted.length; i++) {
          ctx.lineTo(sorted[i]!.x, sorted[i]!.y);
        }
        ctx.stroke();
      }

      // Nodes — ORIGINAL subtle style (no orange blend, no big glow rings)
      for (const n of nodes) {
        const p = Math.sin(n.pulse) * 0.5 + 0.5;
        // Radius: idle 1 → peak 1.55 (original)
        const r = n.r * (1 + audioLevel * 0.55 + p * 0.4);
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        if (n.accent) {
          ctx.fillStyle = `rgba(242, 101, 34, ${0.7 + p * 0.3})`;
        } else {
          ctx.fillStyle = `rgba(30, 41, 59, ${0.55 + p * 0.3})`;
        }
        ctx.fill();

        // Original glow — hanya large nodes + audio > 0.08
        if (n.r > 1.4 * DPR && audioLevel > 0.08) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, r * 3 + audioLevel * 6 * DPR, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(242, 101, 34, ${audioLevel * 0.18})`;
          ctx.lineWidth = 1 * DPR;
          ctx.stroke();
        }
      }

      // Decay
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
