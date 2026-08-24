'use client';

/**
 * ElsaCanvas — audio-reactive particle node visualization.
 *
 * Adopted dari ide.asia /agent public/js/agent.js particle system.
 * - Nodes distributed di soft disk sekitar center
 * - Idle: sinusoidal drift + slow orbital rotation
 * - Audio active (Elsa bicara / user mic): nodes push outward dari center,
 *   connections brighten sedikit, glow rings pada large nodes
 * - AudioLevel decay 0.92 tiap frame supaya smooth pasca spike
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
        });
      }
    }

    function drawFrame() {
      if (!ctx) return;
      ctx.clearRect(0, 0, W, H);

      const audioLevel = window.__elsaAudioLevel ?? 0;
      const maxDist = (140 + audioLevel * 80) * DPR;
      const lineWidth = 1.4 * DPR;

      const cx = W / 2;
      const cy = H / 2;
      const audioBoost = 1 + audioLevel * 2.5;

      const t = performance.now() * 0.0008;
      const isIdle = audioLevel < 0.05;
      const orbitSpeed = isIdle ? 0.0006 : 0;
      const cosO = Math.cos(orbitSpeed);
      const sinO = Math.sin(orbitSpeed);

      // Update positions
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i]!;

        // Drift
        n.x += n.vx * audioBoost;
        n.y += n.vy * audioBoost;
        n.pulse += 0.02 + audioLevel * 0.1;

        // Spring back to home — looser when idle
        const springK = isIdle ? 0.0035 : 0.012;
        n.x += (n.homeX - n.x) * springK;
        n.y += (n.homeY - n.y) * springK;

        // Idle waves + slow orbital rotation
        if (isIdle) {
          const wavePhase = t + i * 0.18;
          n.x += Math.sin(wavePhase) * 0.18 * DPR;
          n.y += Math.cos(wavePhase * 0.85) * 0.14 * DPR;

          const hdx = n.homeX - cx;
          const hdy = n.homeY - cy;
          n.homeX = cx + hdx * cosO - hdy * sinO;
          n.homeY = cy + hdx * sinO + hdy * cosO;
        }

        // Audio pulse: push nodes outward dari center saat audio active
        if (audioLevel > 0.05) {
          const dx = n.x - cx;
          const dy = n.y - cy;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const push = audioLevel * 0.6 * DPR;
          n.x += (dx / dist) * push;
          n.y += (dy / dist) * push;
        }
      }

      // Connections — subtle brightness
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
            const alpha = tt * (0.3 + audioLevel * 0.45);
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
        const r = n.r * (1 + audioLevel * 0.55 + p * 0.4);
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        if (n.accent) {
          ctx.fillStyle = `rgba(242, 101, 34, ${0.7 + p * 0.3})`;
        } else {
          ctx.fillStyle = `rgba(30, 41, 59, ${0.55 + p * 0.3})`;
        }
        ctx.fill();

        // Glow ring pada large nodes saat audio active
        if (n.r > 1.4 * DPR && audioLevel > 0.08) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, r * 3 + audioLevel * 6 * DPR, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(242, 101, 34, ${audioLevel * 0.18})`;
          ctx.lineWidth = 1 * DPR;
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
