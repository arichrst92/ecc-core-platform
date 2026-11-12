'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { LogOut, MapPin, Loader2 } from 'lucide-react';
import { BottomNav } from './bottom-nav';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import { useCabangStore } from '@/lib/cabang-store';
import { MENU_HREF, useCkidsMenus, type CkidsMenuKey } from '@/lib/access';

/** Menu CKids yang dibutuhkan tiap halaman (salah satu cukup). */
const PAGE_MENUS: [string, CkidsMenuKey[]][] = [
  ['/ibadah', ['scanner']],
  ['/hadir', ['hadir']],
  ['/adjust-point', ['adjust-point']],
  ['/history', ['history', 'cancel-redeem']],
  ['/report', ['report']],
  ['/', ['gift', 'katalog']],
];
const menusForPath = (p: string) =>
  PAGE_MENUS.find(([href]) => (href === '/' ? p === '/' : p === href || p.startsWith(href + '/')))?.[1] ?? [];

interface CabangItem {
  id: string;
  nama: string;
  kode: string;
}

/**
 * Header dengan:
 *  - Logo + nama app
 *  - (Navigasi utama dipindah ke BottomNav floating dock)
 *  - Cabang selector dropdown (persist localStorage)
 *  - User menu + logout
 */
export function Header() {
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

  return (
    <>
      <header className="bg-white border-b border-neutral-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-3 py-2.5 flex items-center gap-3">
          {/* Brand */}
          <div className="flex items-center gap-2 shrink-0">
            <Image src="/logo-ckids.webp" alt="CKids — Creative Kids" width={44} height={44} className="-my-1" priority />
            <div className="hidden sm:block">
              <div className="font-bold text-neutral-900 text-sm sm:text-base">
                CKids
              </div>
              <div className="text-[10px] text-neutral-500 hidden sm:block">
                Portal untuk kakak CKids
              </div>
            </div>
            <div className="sm:hidden font-bold text-neutral-900">CKids</div>
          </div>

          {/* Spacer — navigasi utama ada di BottomNav (floating dock) */}
          <div className="flex-1" />

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

      {/* Floating dock (semua ukuran layar) — di-render sekali di sini.
          Ruang bawah supaya konten tidak ketutup di-handle body padding
          di globals.css (--dock-space). */}
      <BottomNav />
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
  const pathname = usePathname() ?? '/';
  const allowed = useCkidsMenus();
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  // Muat ulang hak akses (admin bisa mengubah Akses CKids kapan saja) —
  // tidak perlu login ulang.
  useEffect(() => {
    if (!hydrated || !accessToken) return;
    apiClient
      .get<{ data: { menuAccess: Record<string, { canRead: boolean; canWrite: boolean; canDelete: boolean }> } }>('/auth/me/access')
      .then((r) => {
        const cur = useAuthStore.getState();
        if (cur.user && cur.accessToken && cur.refreshToken) {
          cur.setAuth({
            accessToken: cur.accessToken,
            refreshToken: cur.refreshToken,
            user: { ...cur.user, menuAccess: r.data.data.menuAccess },
          });
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, accessToken]);

  // Halaman yang tidak diizinkan → pindah ke menu pertama yang diizinkan.
  const need = menusForPath(pathname);
  const pageOk = need.length === 0 || need.some((m) => allowed.has(m));
  const firstAllowed = [...allowed][0];
  useEffect(() => {
    if (!hydrated || !user || pageOk) return;
    if (firstAllowed && MENU_HREF[firstAllowed] !== pathname) router.replace(MENU_HREF[firstAllowed]);
  }, [hydrated, user, pageOk, firstAllowed, pathname, router]);

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

  if (!pageOk) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-2 text-center px-6 text-neutral-500">
        <div className="font-semibold text-neutral-800">Tidak ada akses ke menu ini</div>
        <div className="text-sm">
          {firstAllowed ? 'Mengalihkan…' : 'Minta admin menambahkan pelayanan / role Anda di Portal → Akses CKids.'}
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
