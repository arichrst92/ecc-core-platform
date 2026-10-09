'use client';

import { useEffect, useState } from 'react';
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
    <div className="min-h-screen flex bg-neutral-50">
      <Sidebar />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
