'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Gift, History, BarChart3, LogOut, MapPin } from 'lucide-react';
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
    { href: '/history', label: 'History', icon: History },
    { href: '/report', label: 'Report', icon: BarChart3 },
  ];

  return (
    <header className="bg-white border-b border-neutral-200 sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Gift className="w-6 h-6 text-kids-500" />
          <div>
            <div className="font-bold text-neutral-900">CKids Gift Stall</div>
            <div className="text-[10px] text-neutral-500">ECC — Point Redeem Admin</div>
          </div>
        </div>

        <nav className="flex items-center gap-1 flex-1">
          {navItems.map((n) => {
            const active = pathname === n.href;
            const Icon = n.icon;
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
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

        {/* Cabang selector */}
        <div className="flex items-center gap-2 border border-neutral-300 rounded-lg px-3 py-1.5 bg-neutral-50">
          <MapPin className="w-4 h-4 text-neutral-500" />
          <select
            value={cabangId ?? ''}
            onChange={(e) => handleCabangChange(e.target.value)}
            className="text-sm font-medium text-neutral-800 bg-transparent outline-none"
          >
            <option value="" disabled>
              {cabangsQ.isLoading ? 'Memuat...' : 'Pilih Cabang'}
            </option>
            {(cabangsQ.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.nama}
              </option>
            ))}
          </select>
        </div>

        {user && (
          <div className="flex items-center gap-2 text-sm">
            <div className="text-neutral-700 font-medium">{user.namaLengkap}</div>
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
  );
}

/**
 * Guard component — redirect ke /login kalau belum login.
 * Wrap page-level content dengan ini.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, accessToken } = useAuthStore();
  const router = useRouter();
  if (typeof window !== 'undefined' && (!user || !accessToken)) {
    router.push('/login');
    return (
      <div className="p-10 text-center text-neutral-500">Redirecting to login...</div>
    );
  }
  if (!user) return null;
  return <>{children}</>;
}
