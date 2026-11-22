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
  // Halaman pembayaran event (dibuka dari Els App di browser bawaan): tanpa
  // navbar & footer situs — layar HP penuh untuk info bayar; halaman punya
  // catatan kaki & tautan legal sendiri (sama dengan /persembahan).
  if (pathname?.startsWith('/bayar/') || /^\/event\/[^/]+\/pembayaran\/?$/.test(pathname ?? '')) return null;
  return <>{children}</>;
}
