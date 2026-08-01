'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Gift, History, BarChart3, LogOut, MapPin, Award, Loader2, ScanLine, ClipboardList } from 'lucide-react';
import { BottomNav } from './bottom-nav';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import { useCabangStore } from '@/lib/cabang-store';

interface CabangItem {
  id: string;
  nama: string;
  kode: string;
}

/**
 * Header dengan:
 *  - Logo + nama app
 *  - Nav: Gift Stall (home) / History / Report
 *  - Cabang selector dropdown (persist localStorage)
 *  - User menu + logout
 */
export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, clearAuth } = useAuthStore();
  const { cabangId, cabangNama, setCabang, clear } = useCabangStore();

  const cabangsQ = useQuery({
    queryKey: ['cabang-list'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: CabangItem[] }>(
        '/admin/cabang?page=1&limit=100&sortBy=nama&sortOrder=asc',
      );
      return res.data.data;
    },
  });

  function handleLogout() {
    clearAuth();
    clear();
    router.push('/login');
  }

  function handleCabangChange(id: string) {
    const c = cabangsQ.data?.find((x) => x.id === id);
    if (c) setCabang({ cabangId: c.id, cabangNama: c.nama });
  }

  const navItems = [
    { href: '/', label: 'Gift Stall', icon: Gift },
    { href: '/ibadah', label: 'Scanner', icon: ScanLine },
    { href: '/hadir', label: 'Daftar Hadir', icon: ClipboardList },
    { href: '/adjust-point', label: 'Adjust Point', icon: Award },
    { href: '/history', label: 'History', icon: History },
    { href: '/report', label: 'Report', icon: BarChart3 },
  ];

  return (
    <>
      <header className="bg-white border-b border-neutral-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-3 py-2.5 flex items-center gap-3">
          {/* Brand */}
          <div className="flex items-center gap-2 shrink-0">
            <Gift className="w-6 h-6 text-kids-500" />
            <div className="hidden sm:block">
              <div className="font-bold text-neutral-900 text-sm sm:text-base">
                CKids Gift Stall
              </div>
              <div className="text-[10px] text-neutral-500 hidden sm:block">
                ECC — Point Redeem
              </div>
            </div>
            <div className="sm:hidden font-bold text-neutral-900">CKids</div>
          </div>

          {/* Nav desktop — hidden di mobile (pakai BottomNav) */}
          <nav className="hidden lg:flex items-center gap-1 flex-1">
            {navItems.map((n) => {
              const active = pathname === n.href;
              const Icon = n.icon;
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium transition ${
                    active
                      ? 'bg-kids-500 text-white'
                      : 'text-neutral-600 hover:bg-neutral-100'
                  }`}
                >
                  <Icon className="w-4 h-4" /> {n.label}
                </Link>
              );
            })}
          </nav>

          {/* Spacer di mobile */}
          <div className="flex-1 lg:hidden" />

          {/* Cabang selector — kompak di mobile */}
          <div className="flex items-center gap-1.5 border border-neutral-300 rounded-lg px-2 sm:px-3 py-1.5 bg-neutral-50 shrink-0">
            <MapPin className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
            <select
              value={cabangId ?? ''}
              onChange={(e) => handleCabangChange(e.target.value)}
              className="text-xs sm:text-sm font-medium text-neutral-800 bg-transparent outline-none max-w-[110px] sm:max-w-none truncate"
            >
              <option value="" disabled>
                {cabangsQ.isLoading ? 'Loading...' : 'Cabang'}
              </option>
              {(cabangsQ.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nama}
                </option>
              ))}
            </select>
          </div>

          {/* User + logout */}
          {user && (
            <div className="flex items-center gap-1.5 text-sm shrink-0">
              <div className="hidden md:block text-neutral-700 font-medium max-w-[120px] truncate">
                {user.namaLengkap}
              </div>
              <button
                onClick={handleLogout}
                className="p-1.5 rounded hover:bg-neutral-100 text-neutral-600"
                title="Logout"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Bottom nav for mobile — di-render sekali di sini */}
      <BottomNav />

      {/* Spacer supaya content gak ke-cover bottom nav (mobile only) */}
      <div className="lg:hidden h-16" aria-hidden="true" />
    </>
  );
}

/**
 * Guard component — redirect ke /login kalau belum login.
 * Wrap page-level content dengan ini.
 *
 * Hydration-safe pattern:
 *   1. `hydrated` state = false saat SSR + first client render → tampil loader
 *      (server & client render output sama, no hydration mismatch)
 *   2. useEffect flip hydrated=true, cek auth, redirect kalau perlu
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, accessToken } = useAuthStore();
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated && (!user || !accessToken)) {
      router.push('/login');
    }
  }, [hydrated, user, accessToken, router]);

  if (!hydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center text-neutral-400">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  if (!user || !accessToken) {
    return (
      <div className="min-h-screen flex items-center justify-center text-neutral-500">
        Redirecting to login…
      </div>
    );
  }

  return <>{children}</>;
}
