'use client';

import { useEffect, useState } from 'react';
import { Sidebar } from '@/components/sidebar';
import { useAuthStore } from '@/lib/auth-store';
import { redirectToPortal } from '@/lib/api-client';

/**
 * Dashboard shell — gate client-side kalau belum login.
 * SSR tetap render children untuk hindari layout shift; auth check di useEffect.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated && (!user || !accessToken)) {
      redirectToPortal();
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
