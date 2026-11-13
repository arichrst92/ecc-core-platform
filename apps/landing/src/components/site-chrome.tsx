'use client';

/**
 * Navbar & Footer situs — disembunyikan di beranda ("/"), karena beranda
 * memakai tampilan satu layar dengan navbar transparan sendiri.
 */
import { usePathname } from 'next/navigation';

export function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === '/') return null;
  return <>{children}</>;
}
