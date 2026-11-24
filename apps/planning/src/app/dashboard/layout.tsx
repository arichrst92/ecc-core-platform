'use client';

import { useEffect, useState } from 'react';
import { Menu } from 'lucide-react';
import { Sidebar } from '@/components/sidebar';
import { useAuthStore } from '@/lib/auth-store';

/**
 * Dashboard shell — gate client-side kalau belum login.
 * Same-origin dengan portal: localStorage key 'ecc-auth' auto-shared.
 * Kalau tidak ada auth → redirect ke /login (portal) dengan next back ke sini.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const [hydrated, setHydrated] = useState(false);
  // HP: sidebar jadi laci (drawer) — dulu sidebar 256 px tetap tampil & memakan layar.
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated && (!user || !accessToken) && typeof window !== 'undefined') {
      const currentPath = window.location.pathname + window.location.search;
      window.location.href = `/login?next=${encodeURIComponent(currentPath)}`;
    }
  }, [hydrated, user, accessToken]);

  if (!hydrated || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-neutral-500">
        Memuat sesi...
      </div>
    );
  }

  return (
    <div className="min-h-screen md:flex bg-neutral-50">
      {/* Bar atas HP */}
      <div className="md:hidden sticky top-0 z-30 flex items-center gap-3 px-4 h-12 bg-white border-b border-neutral-200">
        <button type="button" onClick={() => setNavOpen(true)} className="p-1.5 -ml-1.5 rounded-lg hover:bg-neutral-100" aria-label="Buka menu">
          <Menu className="w-5 h-5" />
        </button>
        <span className="font-bold text-neutral-900 text-sm">Ticketing Tools</span>
      </div>
      {navOpen ? <div className="md:hidden fixed inset-0 z-40 bg-black/40" onClick={() => setNavOpen(false)} /> : null}
      <Sidebar open={navOpen} onNavigate={() => setNavOpen(false)} />
      <main className="flex-1 min-w-0 overflow-auto">{children}</main>
    </div>
  );
}
