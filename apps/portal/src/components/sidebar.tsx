'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Building2,
  Church,
  Users,
  Shield,
  Calendar,
  Layers,
  Heart,
  Key,
  UserCog,
  Activity,
} from 'lucide-react';
import clsx from 'clsx';

const nav = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/sinode', label: 'Sinode', icon: Building2 },
  { href: '/dashboard/cabang', label: 'Cabang Gereja', icon: Church },
  { href: '/dashboard/jemaat', label: 'Jemaat', icon: Users },
  { href: '/dashboard/role', label: 'Role', icon: Shield },
  { href: '/dashboard/ibadah', label: 'Ibadah', icon: Calendar },
  { href: '/dashboard/kategori-ibadah', label: 'Kategori Ibadah', icon: Layers },
  { href: '/dashboard/tipe-relasi', label: 'Tipe Relasi', icon: Heart },
  { href: '/dashboard/api-key', label: 'API Keys', icon: Key },
  { href: '/dashboard/audit-log', label: 'Audit Log', icon: Activity },
  { href: '/dashboard/profile', label: 'Profil & Keamanan', icon: UserCog },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="w-64 bg-white border-r border-neutral-200 flex flex-col">
      <div className="p-6 flex items-center gap-3">
        <Image src="/logo-ecc.webp" alt="ECC" width={36} height={36} />
        <div>
          <div className="font-bold text-neutral-900">ECC Portal</div>
          <div className="text-[10px] text-neutral-500 uppercase tracking-wider">Master Data</div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/dashboard' && pathname?.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition',
                active
                  ? 'bg-brand-500 text-white shadow-sm'
                  : 'text-neutral-600 hover:bg-neutral-100',
              )}
            >
              <Icon className="w-4 h-4" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-neutral-100">
        <div className="flex items-center gap-2 opacity-60">
          <span className="text-[10px] text-neutral-500">Powered by</span>
          <Image src="/logo-idea.webp" alt="IDEA" width={36} height={14} />
        </div>
      </div>
    </aside>
  );
}
