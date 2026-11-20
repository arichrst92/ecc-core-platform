'use client';

/**
 * Penjaga halaman Portal berdasarkan Role Access.
 * Halaman /dashboard/* dicocokkan ke menu di MENU_CATALOG (awalan href terpanjang);
 * tanpa akses baca → tampil pesan "tidak punya akses" + daftar menu yang boleh dibuka.
 * Fulltimer lolos. Halaman di luar katalog (Profil, User Guide) selalu terbuka.
 * Server tetap menjadi penjaga utama — ini supaya halaman tidak terbuka kosong.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { ShieldOff } from 'lucide-react';
import { MENU_CATALOG, hasMenuAccess } from '@ecc/shared-types';
import { useAuthStore } from '@/lib/auth-store';

const PAGES = MENU_CATALOG.filter((m) => m.href.startsWith('/dashboard')).sort((a, b) => b.href.length - a.href.length);

/** Menu katalog untuk sebuah path (null = halaman tidak diatur Role Access). */
export function menuForPath(pathname: string) {
  return PAGES.find((m) => (m.href === '/dashboard' ? pathname === '/dashboard' : pathname === m.href || pathname.startsWith(`${m.href}/`))) ?? null;
}

export function MenuGate({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? '';
  const user = useAuthStore((s) => s.user);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    // Tunggu data login dari penyimpanan browser supaya tidak salah menolak.
    const p = (useAuthStore as unknown as { persist?: { hasHydrated: () => boolean; onFinishHydration: (f: () => void) => () => void } }).persist;
    if (!p || p.hasHydrated()) return setReady(true);
    return p.onFinishHydration(() => setReady(true));
  }, []);

  if (!ready) return null;
  const menu = menuForPath(pathname);
  if (!user || !menu || user.isFulltimer || hasMenuAccess(user.menuAccess ?? {}, menu.key, 'read')) return <>{children}</>;

  const allowed = MENU_CATALOG.filter(
    (m) => m.href.startsWith('/dashboard') && m.key !== menu.key && hasMenuAccess(user.menuAccess ?? {}, m.key, 'read'),
  );
  return (
    <div className="max-w-xl mx-auto mt-10 bg-white border border-neutral-200 rounded-2xl p-6 text-center">
      <div className="w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto">
        <ShieldOff className="w-6 h-6" />
      </div>
      <h1 className="mt-3 text-lg font-bold text-neutral-900">Anda tidak punya akses ke menu ini</h1>
      <p className="mt-1 text-sm text-neutral-600">
        Menu <b>{menu.label}</b>
        {menu.group ? ` (${menu.group})` : ''} belum diberikan untuk role Anda. Minta admin mengaturnya di Developer Tools → Role Access.
      </p>
      {allowed.length ? (
        <div className="mt-5 text-left">
          <div className="text-xs font-semibold text-neutral-500 uppercase mb-2">Menu yang bisa Anda buka</div>
          <div className="flex flex-wrap gap-1.5">
            {allowed.map((m) => (
              <Link key={m.key} href={m.href} className="px-2.5 py-1 rounded-full border border-neutral-200 text-xs text-neutral-700 hover:bg-neutral-50">
                {m.label}
              </Link>
            ))}
          </div>
        </div>
      ) : null}
      <div className="mt-5 flex justify-center gap-2 text-sm">
        <Link href="/dashboard/profile" className="px-3 py-1.5 rounded-lg border border-neutral-300 hover:bg-neutral-50">
          Profil saya
        </Link>
        <Link href="/dashboard/user-guide" className="px-3 py-1.5 rounded-lg border border-neutral-300 hover:bg-neutral-50">
          User Guide
        </Link>
      </div>
    </div>
  );
}
