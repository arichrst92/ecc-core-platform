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
  HandHeart,
  Ticket,
} from 'lucide-react';
import clsx from 'clsx';

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const top: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
];

const groups: NavGroup[] = [
  {
    label: 'Entity',
    items: [
      { href: '/dashboard/sinode', label: 'Sinode', icon: Building2 },
      { href: '/dashboard/cabang', label: 'Cabang Gereja', icon: Church },
    ],
  },
  {
    label: 'Service',
    items: [
      { href: '/dashboard/ibadah', label: 'Ibadah', icon: Calendar },
      { href: '/dashboard/kategori-ibadah', label: 'Kategori Ibadah', icon: Layers },
      { href: '/dashboard/pelayanan', label: 'Pelayanan', icon: HandHeart },
      { href: '/dashboard/kehadiran', label: 'Kehadiran', icon: Ticket },
    ],
  },
  {
    label: 'People',
    items: [
      { href: '/dashboard/jemaat', label: 'Jemaat', icon: Users },
      { href: '/dashboard/role', label: 'Role Jemaat', icon: Shield },
      { href: '/dashboard/tipe-relasi', label: 'Relasi Jemaat', icon: Heart },
    ],
  },
  {
    label: 'Developer Tools',
    items: [
      { href: '/dashboard/api-key', label: 'API Keys', icon: Key },
      { href: '/dashboard/audit-log', label: 'Audit Log', icon: Activity },
    ],
  },
];

const bottom: NavItem[] = [
  { href: '/dashboard/profile', label: 'Profil & Keamanan', icon: UserCog },
];

export function Sidebar() {
  const pathname = usePathname();

  function isActive(href: string) {
    return pathname === href || (href !== '/dashboard' && pathname?.startsWith(href));
  }

  return (
    <aside className="w-64 bg-white border-r border-neutral-200 flex flex-col">
      <div className="p-6 flex items-center gap-3">
        <Image src="/logo-ecc.webp" alt="ECC" width={36} height={36} />
        <div>
          <div className="font-bold text-neutral-900">ECC Portal</div>
          <div className="text-[10px] text-neutral-500 uppercase tracking-wider">Master Data</div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-2 space-y-4 overflow-y-auto">
        {/* Top items (Dashboard) */}
        <div className="space-y-1">
          {top.map((item) => (
            <NavLink key={item.href} item={item} active={isActive(item.href)} />
          ))}
        </div>

        {/* Grouped items */}
        {groups.map((group) => (
          <div key={group.label}>
            <div className="px-3 mb-1.5 text-[10px] uppercase tracking-wider text-neutral-400 font-semibold">
              {group.label}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavLink key={item.href} item={item} active={isActive(item.href)} />
              ))}
            </div>
          </div>
        ))}

        {/* Bottom items (Profile) */}
        <div className="pt-2 mt-2 border-t border-neutral-100 space-y-1">
          {bottom.map((item) => (
            <NavLink key={item.href} item={item} active={isActive(item.href)} />
          ))}
        </div>
      </nav>

      <div className="p-4 border-t border-neutral-100">
        <div className="flex items-center gap-2 opacity-60">
          <span className="text-[10px] text-neutral-500">Powered by</span>
          <Image
            src="/logo-idea.webp"
            alt="IDEA"
            width={36}
            height={14}
            style={{ width: 'auto', height: '14px' }}
          />
        </div>
      </div>
    </aside>
  );
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const { href, label, icon: Icon } = item;
  return (
    <Link
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
}
