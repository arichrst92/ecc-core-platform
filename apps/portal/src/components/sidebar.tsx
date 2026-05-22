'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
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
  Newspaper,
  BookOpen,
  Home as HomeIcon,
  MapPin,
  Megaphone,
  Handshake,
  ChevronDown,
} from 'lucide-react';
import clsx from 'clsx';
import { hasMenuAccess } from '@ecc/shared-types';
import { useAuthStore } from '@/lib/auth-store';

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  /**
   * menuKey RBAC. Kalau diset, item hanya ditampilkan kalau user punya
   * canRead access di menu ini. Item tanpa menuKey selalu tampil (mis. Dashboard, Profile).
   */
  menuKey?: string;
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
      { href: '/dashboard/sinode', label: 'Sinode', icon: Building2, menuKey: 'sinode' },
      { href: '/dashboard/cabang', label: 'Cabang Gereja', icon: Church, menuKey: 'cabang' },
    ],
  },
  {
    label: 'Service',
    items: [
      { href: '/dashboard/ibadah', label: 'Ibadah', icon: Calendar, menuKey: 'ibadah' },
      { href: '/dashboard/kategori-ibadah', label: 'Kategori Ibadah', icon: Layers, menuKey: 'kategori-ibadah' },
      { href: '/dashboard/pelayanan', label: 'Pelayanan', icon: HandHeart, menuKey: 'pelayanan' },
      { href: '/dashboard/kehadiran', label: 'Kehadiran', icon: Ticket, menuKey: 'kehadiran' },
    ],
  },
  {
    label: 'People',
    items: [
      { href: '/dashboard/jemaat', label: 'Jemaat', icon: Users, menuKey: 'jemaat' },
      { href: '/dashboard/role', label: 'Role Jemaat', icon: Shield, menuKey: 'role-jemaat' },
      { href: '/dashboard/tipe-relasi', label: 'Relasi Jemaat', icon: Heart, menuKey: 'tipe-relasi' },
    ],
  },
  {
    label: 'Community',
    items: [
      { href: '/dashboard/homecell-area', label: 'Homecell Area', icon: MapPin, menuKey: 'homecell-area' },
      { href: '/dashboard/homecell', label: 'Homecell', icon: HomeIcon, menuKey: 'homecell' },
    ],
  },
  {
    label: 'Movement',
    items: [
      { href: '/dashboard/event', label: 'Event', icon: Megaphone, menuKey: 'event' },
      { href: '/dashboard/visit', label: 'Visit', icon: Handshake, menuKey: 'visit' },
    ],
  },
  {
    label: 'Broadcast',
    items: [
      { href: '/dashboard/news', label: 'News', icon: Newspaper, menuKey: 'news' },
      { href: '/dashboard/renungan', label: 'Renungan', icon: BookOpen, menuKey: 'renungan' },
    ],
  },
  {
    label: 'Developer Tools',
    items: [
      { href: '/dashboard/role-access', label: 'Role Access', icon: Shield, menuKey: 'role-access' },
      { href: '/dashboard/api-key', label: 'API Keys', icon: Key, menuKey: 'api-key' },
      { href: '/dashboard/audit-log', label: 'Audit Log', icon: Activity, menuKey: 'audit-log' },
    ],
  },
];

const bottom: NavItem[] = [
  { href: '/dashboard/profile', label: 'Profil & Keamanan', icon: UserCog },
];

const COLLAPSE_STORAGE_KEY = 'ecc-portal-sidebar-collapsed-groups';

function isItemActive(pathname: string | null, href: string) {
  if (!pathname) return false;
  if (pathname === href) return true;
  if (href === '/dashboard') return false;
  // Match nested routes (e.g. /dashboard/homecell/123) but avoid prefix
  // collisions like /dashboard/homecell-area matching /dashboard/homecell.
  return pathname.startsWith(href + '/');
}

export function Sidebar() {
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);

  // RBAC filter: item dengan menuKey hanya tampil kalau user punya canRead.
  // Item tanpa menuKey selalu tampil. Selama menuAccess belum tersedia
  // (mis. cache lama), tampilkan semua supaya tidak kosong total.
  function isItemVisible(item: NavItem): boolean {
    if (!item.menuKey) return true;
    if (!user?.menuAccess) return true;
    return hasMenuAccess(user.menuAccess, item.menuKey, 'read');
  }

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [hydrated, setHydrated] = useState(false);

  // Load persisted collapse state on mount.
  useEffect(() => {
    try {
      const raw =
        typeof window !== 'undefined'
          ? window.localStorage.getItem(COLLAPSE_STORAGE_KEY)
          : null;
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, boolean>;
        setCollapsed(parsed ?? {});
      }
    } catch {
      // Ignore malformed storage values.
    }
    setHydrated(true);
  }, []);

  // Persist whenever the collapse state changes (after hydration).
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(COLLAPSE_STORAGE_KEY, JSON.stringify(collapsed));
    } catch {
      // Storage might be unavailable (e.g. private mode); ignore.
    }
  }, [collapsed, hydrated]);

  function toggleGroup(label: string) {
    setCollapsed((prev) => ({ ...prev, [label]: !prev[label] }));
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
          {top.filter(isItemVisible).map((item) => (
            <NavLink key={item.href} item={item} active={isItemActive(pathname, item.href)} />
          ))}
        </div>

        {/* Grouped items — kalau grup tidak punya item yang visible setelah
            RBAC filter, jangan render header-nya sama sekali. */}
        {groups.map((group) => {
          const visibleItems = group.items.filter(isItemVisible);
          if (visibleItems.length === 0) return null;
          const isCollapsed = Boolean(collapsed[group.label]);

          return (
            <div key={group.label}>
              <button
                type="button"
                onClick={() => toggleGroup(group.label)}
                aria-expanded={!isCollapsed}
                className="w-full flex items-center justify-between px-3 mb-1.5 text-[10px] uppercase tracking-wider text-neutral-400 font-semibold hover:text-neutral-600 transition"
              >
                <span>{group.label}</span>
                <ChevronDown
                  className={clsx(
                    'w-3 h-3 transition-transform',
                    isCollapsed && '-rotate-90',
                  )}
                />
              </button>
              <div
                className={clsx(
                  'space-y-0.5 overflow-hidden transition-all',
                  isCollapsed ? 'max-h-0' : 'max-h-[1000px]',
                )}
              >
                {visibleItems.map((item) => (
                  <NavLink
                    key={item.href}
                    item={item}
                    active={isItemActive(pathname, item.href)}
                  />
                ))}
              </div>
            </div>
          );
        })}

        {/* Bottom items (Profile) */}
        <div className="pt-2 mt-2 border-t border-neutral-100 space-y-1">
          {bottom.map((item) => (
            <NavLink key={item.href} item={item} active={isItemActive(pathname, item.href)} />
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
