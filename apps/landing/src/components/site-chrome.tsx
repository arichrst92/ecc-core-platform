'use client';

/**
 * Navbar & Footer situs — disembunyikan di beranda ("/"), karena beranda
 * memakai tampilan satu layar dengan navbar transparan sendiri, dan di
 * halaman Persembahan (/persembahan/*) yang dibuka dari Els App.
 */
import { usePathname } from 'next/navigation';

export function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === '/' || pathname === '/persembahan' || pathname?.startsWith('/persembahan/')) return null;
  return <>{children}</>;
}
