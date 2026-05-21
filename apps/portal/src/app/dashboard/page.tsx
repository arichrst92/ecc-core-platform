'use client';

import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';

/**
 * Dashboard page = Globe interaktif yang plot cabang gereja.
 *
 * react-globe.gl pakai WebGL via three.js — tidak compatible dengan SSR.
 * Pakai `next/dynamic` + `ssr: false` supaya hanya di-load di client.
 *
 * Komponen visualisasi sebenarnya ada di GlobeView (file terpisah supaya
 * tree-shaking lebih bersih).
 */
const GlobeView = dynamic(() => import('@/components/dashboard/globe-view'), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex flex-col items-center justify-center text-neutral-500 bg-white">
      <Loader2 className="w-8 h-8 animate-spin mb-3" />
      <p className="text-sm">Memuat globe...</p>
    </div>
  ),
});

export default function DashboardPage() {
  // Dashboard layout (apps/portal/src/app/dashboard/layout.tsx) memberi padding.
  // Untuk globe, kita ingin full-bleed; pakai negative margin + h-screen
  // calc supaya bisa menempati seluruh viewport tinggi konten.
  // Background putih menyesuaikan tema desain portal.
  return (
    <div className="relative -m-6 md:-m-8 bg-white overflow-hidden" style={{ height: 'calc(100vh - 72px)' }}>
      <GlobeView />
    </div>
  );
}
