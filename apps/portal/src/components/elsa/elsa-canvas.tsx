'use client';

/**
 * ElsaCanvas — audio-reactive particle node visualization.
 *
 * Adopted dari ide.asia /agent public/js/agent.js particle system.
 * - Nodes distributed di soft disk sekitar center
 * - Idle: sinusoidal drift + slow orbital rotation
 * - Audio active: nodes push outward, connections brighten, glow rings
 * - AudioLevel decay 0.92 tiap frame supaya smooth pasca spike
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
      // Range koneksi meluas saat audio (140→220px)
      const maxDist = (140 + audioLevel * 80) * DPR;
      // Line width: idle 1.4 → peak 3.0 (was 1.4 + 0.8 = 2.2)
      const lineWidth = (1.4 + audioLevel * 1.6) * DPR;

      const cx = W / 2;
      const cy = H / 2;
      const audioBoost = 1 + audioLevel * 2.5;

      const t = performance.now() * 0.0008;
      const isIdle = audioLevel < 0.05;
      const orbitSpeed = isIdle ? 0.0006 : 0;
      const cos = Math.cos(orbitSpeed);
      const sin = Math.sin(orbitSpeed);

      // Update positions
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i]!;
        n.x += n.vx * audioBoost;
        n.y += n.vy * audioBoost;
        n.pulse += 0.02 + audioLevel * 0.1;

        const springK = isIdle ? 0.0035 : 0.012;
        n.x += (n.homeX - n.x) * springK;
        n.y += (n.homeY - n.y) * springK;

        if (isIdle) {
          const wavePhase = t + i * 0.18;
          n.x += Math.sin(wavePhase) * 0.18 * DPR;
          n.y += Math.cos(wavePhase * 0.85) * 0.14 * DPR;
          const hdx = n.homeX - cx;
          const hdy = n.homeY - cy;
          n.homeX = cx + hdx * cos - hdy * sin;
          n.homeY = cy + hdx * sin + hdy * cos;
        }

        if (audioLevel > 0.05) {
          const dx = n.x - cx;
          const dy = n.y - cy;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const push = audioLevel * 0.6 * DPR;
          n.x += (dx / dist) * push;
          n.y += (dy / dist) * push;
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
            // Alpha jauh lebih terang saat audio active — idle 0.3, peak audio 1.0
            const alpha = tt * (0.3 + audioLevel * 0.9);
            ctx.beginPath();
            ctx.strokeStyle = `rgba(242, 101, 34, ${alpha})`;
            ctx.lineWidth = lineWidth;
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      // Nodes — brightness boost saat audio active
      for (const n of nodes) {
        const p = Math.sin(n.pulse) * 0.5 + 0.5;
        // Radius node: idle 1 → peak 2.2 (was 0.55)
        const r = n.r * (1 + audioLevel * 1.0 + p * 0.4);
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        if (n.accent) {
          // Accent (orange) — full brightness saat audio
          ctx.fillStyle = `rgba(242, 101, 34, ${Math.min(1, 0.7 + p * 0.3 + audioLevel * 0.4)})`;
        } else {
          // Regular (ink) — shift ke orange saat audio active (color mix)
          const blendR = 30 + audioLevel * 212;
          const blendG = 41 + audioLevel * 60;
          const blendB = 59 - audioLevel * 25;
          ctx.fillStyle = `rgba(${blendR}, ${blendG}, ${blendB}, ${Math.min(1, 0.55 + p * 0.3 + audioLevel * 0.35)})`;
        }
        ctx.fill();

        // Glow ring: expanded saat audio, ALL nodes not just large ones
        if (audioLevel > 0.05) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, r * 3 + audioLevel * 10 * DPR, 0, Math.PI * 2);
          // Glow alpha jauh lebih terang: idle 0 → peak 0.5 (was 0.18)
          ctx.strokeStyle = `rgba(242, 101, 34, ${audioLevel * 0.5})`;
          ctx.lineWidth = (1 + audioLevel * 2) * DPR;
          ctx.stroke();

          // Extra outer glow ring untuk drama
          if (audioLevel > 0.15 && n.accent) {
            ctx.beginPath();
            ctx.arc(n.x, n.y, r * 5 + audioLevel * 18 * DPR, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(242, 101, 34, ${audioLevel * 0.2})`;
            ctx.lineWidth = 1 * DPR;
            ctx.stroke();
          }
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
