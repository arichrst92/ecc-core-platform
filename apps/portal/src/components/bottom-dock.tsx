'use client';

/**
 * BottomDock — navigation dock ala macOS untuk portal ECC.
 *
 * Layout:
 *   [Elsa] [User Guide] | [Entity] [Service] [People] [Community] [Movement]
 *   [Broadcast] [App Settings] [Website] [CKids] [Dev Tools] | [Profile]
 *
 * Interaction:
 *   - Hover: icon scale 1.25 + tooltip label muncul di atas
 *   - Click standalone (Elsa/Guide/Profile): navigate langsung
 *   - Click group icon: popover expandable muncul di atas dgn submenu items
 *   - Click submenu item: navigate + close popover
 *
 * Animation:
 *   - Icon hover: transition scale 200ms cubic-bezier bouncy
 *   - Icon click: scale 0.9 → 1.0 spring bounce
 *   - Popover: fade + translateY(8px→0) 180ms ease-out
 *   - Active menu: brand-500 background dot indicator
 *
 * Access control: sama dgn Sidebar sebelumnya — pakai hasMenuAccess().
 * Group ke-hidden kalau semua item tidak accessible.
 */
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  UsersRound,
  MapPin,
  Megaphone,
  Handshake,
  Store,
  FileText,
  Smartphone,
  Wrench,
  Gauge,
  BookOpenCheck,
  Power,
  KeyRound,
  Stethoscope,
  DatabaseZap,
  Gift,
  LayoutTemplate,
  Sparkles,
} from 'lucide-react';
import clsx from 'clsx';
import { hasMenuAccess } from '@ecc/shared-types';
import { useAuthStore } from '@/lib/auth-store';

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  menuKey?: string;
}

interface NavGroup {
  label: string;
  icon: typeof LayoutDashboard;
  items: NavItem[];
}

// Standalone dock items (kiri + kanan)
const STANDALONE_LEFT: NavItem[] = [
  { href: '/dashboard', label: 'Elsa (Els Agentic)', icon: Sparkles },
  { href: '/dashboard/user-guide', label: 'User Guide', icon: BookOpenCheck },
];

const STANDALONE_RIGHT: NavItem[] = [
  { href: '/dashboard/profile', label: 'Profil & Keamanan', icon: UserCog },
];

const GROUPS: NavGroup[] = [
  {
    label: 'Entity',
    icon: Building2,
    items: [
      { href: '/dashboard/sinode', label: 'Sinode', icon: Building2, menuKey: 'sinode' },
      { href: '/dashboard/cabang', label: 'Cabang Gereja', icon: Church, menuKey: 'cabang' },
    ],
  },
  {
    label: 'Service',
    icon: Calendar,
    items: [
      { href: '/dashboard/ibadah', label: 'Ibadah', icon: Calendar, menuKey: 'ibadah' },
      { href: '/dashboard/kategori-ibadah', label: 'Kategori Ibadah', icon: Layers, menuKey: 'kategori-ibadah' },
      { href: '/dashboard/pelayanan', label: 'Pelayanan', icon: HandHeart, menuKey: 'pelayanan' },
      { href: '/dashboard/kehadiran', label: 'Kehadiran', icon: Ticket, menuKey: 'kehadiran' },
    ],
  },
  {
    label: 'People',
    icon: Users,
    items: [
      { href: '/dashboard/jemaat', label: 'Jemaat', icon: Users, menuKey: 'jemaat' },
      { href: '/dashboard/role', label: 'Role Jemaat', icon: Shield, menuKey: 'role-jemaat' },
      { href: '/dashboard/tipe-relasi', label: 'Relasi Jemaat', icon: Heart, menuKey: 'tipe-relasi' },
    ],
  },
  {
    label: 'Community',
    icon: HomeIcon,
    items: [
      { href: '/dashboard/homecell-area', label: 'Homecell Area', icon: MapPin, menuKey: 'homecell-area' },
      { href: '/dashboard/homecell', label: 'Homecell', icon: HomeIcon, menuKey: 'homecell' },
      { href: '/dashboard/group', label: 'Group', icon: UsersRound, menuKey: 'group' },
    ],
  },
  {
    label: 'Movement',
    icon: Megaphone,
    items: [
      { href: '/dashboard/event', label: 'Event', icon: Megaphone, menuKey: 'event' },
      { href: '/dashboard/visit', label: 'Visit', icon: Handshake, menuKey: 'visit' },
      { href: '/dashboard/local-business', label: 'Local Market', icon: Store, menuKey: 'local-business' },
    ],
  },
  {
    label: 'Broadcast',
    icon: Newspaper,
    items: [
      { href: '/dashboard/news', label: 'News', icon: Newspaper, menuKey: 'news' },
      { href: '/dashboard/renungan', label: 'Renungan', icon: BookOpen, menuKey: 'renungan' },
    ],
  },
  {
    label: 'App Settings',
    icon: Smartphone,
    items: [
      { href: '/dashboard/legal', label: 'Legal Docs', icon: FileText, menuKey: 'legal' },
      { href: '/dashboard/app-version', label: 'App Versions', icon: Smartphone, menuKey: 'app-version' },
      { href: '/dashboard/maintenance-mode', label: 'Maintenance Mode', icon: Power, menuKey: 'maintenance-mode' },
    ],
  },
  {
    label: 'Website',
    icon: LayoutTemplate,
    items: [
      { href: '/dashboard/website/content', label: 'Konten Website', icon: LayoutTemplate, menuKey: 'website-content' },
    ],
  },
  {
    label: 'CKids',
    icon: Gift,
    items: [
      { href: '/dashboard/hadiah', label: 'Katalog Hadiah', icon: Gift, menuKey: 'hadiah' },
      { href: 'https://ckids.eccchurch.global', label: 'Gift Stall (CKids)', icon: Store, menuKey: 'gift-stall' },
    ],
  },
  {
    label: 'Developer Tools',
    icon: Wrench,
    items: [
      { href: '/dashboard/role-access', label: 'Role Access', icon: Shield, menuKey: 'role-access' },
      { href: '/dashboard/api-key', label: 'API Keys', icon: Key, menuKey: 'api-key' },
      { href: '/dashboard/audit-log', label: 'Audit Log', icon: Activity, menuKey: 'audit-log' },
      { href: '/dashboard/maintenance', label: 'Maintenance', icon: Wrench, menuKey: 'maintenance' },
      { href: '/dashboard/server-health', label: 'Server Health', icon: Gauge, menuKey: 'server-health' },
      { href: '/dashboard/credential', label: 'Credential', icon: KeyRound, menuKey: 'credential' },
      { href: '/dashboard/diagnostics', label: 'Diagnostics', icon: Stethoscope, menuKey: 'diagnostics' },
      { href: '/dashboard/shiftsoft-sync', label: 'Shiftsoft Sync', icon: DatabaseZap, menuKey: 'shiftsoft-sync' },
    ],
  },
];

function isItemActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (pathname === href) return true;
  if (href === '/dashboard') return false;
  if (href.startsWith('http')) return false;
  return pathname.startsWith(href + '/');
}

export function BottomDock() {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuthStore();
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const dockRef = useRef<HTMLDivElement | null>(null);

  // NOTE: Outside-click detection via backdrop overlay saja (di render bawah).
  // Sebelumnya pakai document mousedown listener yg check `dockRef.contains(target)` —
  // tapi popover sekarang di-render via React portal ke document.body (di luar
  // dockRef tree), jadi click item di popover ke-anggap "outside" → popover
  // dismiss BEFORE navigate. Ganti ke backdrop-only click strategy.

  // Close popover on route change
  useEffect(() => {
    setOpenGroup(null);
  }, [pathname]);

  // Filter groups berdasarkan menuAccess
  const visibleGroups = GROUPS.map((g) => {
    const filteredItems = g.items.filter((item) => {
      if (!item.menuKey) return true;
      return hasMenuAccess(user?.menuAccess ?? {}, item.menuKey, 'read');
    });
    return { ...g, items: filteredItems };
  }).filter((g) => g.items.length > 0);

  // Check if any item in a group is active → highlight group icon
  function isGroupActive(g: NavGroup): boolean {
    return g.items.some((item) => isItemActive(pathname, item.href));
  }

  return (
    <>
      {/* Backdrop untuk close popover saat klik outside */}
      {openGroup && (
        <div
          className="fixed inset-0 z-20 bg-transparent"
          aria-hidden
          onClick={() => setOpenGroup(null)}
        />
      )}

      <div
        ref={dockRef}
        className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-end gap-1.5 px-3 py-2.5 bg-white border border-neutral-200 rounded-2xl shadow-2xl max-w-[calc(100vw-1rem)] overflow-x-auto md:overflow-visible md:max-w-none elsa-dock-scroll"
        style={{ boxShadow: '0 20px 40px -12px rgba(0,0,0,0.15), 0 4px 12px -4px rgba(0,0,0,0.08)' }}
      >
        {/* Logo ECC */}
        <Link
          href="/dashboard"
          className="group flex flex-col items-center gap-1 shrink-0"
        >
          <div className="flex items-center justify-center w-12 h-12 md:w-14 md:h-14 rounded-xl hover:bg-neutral-100 transition group-hover:scale-110 group-hover:-translate-y-0.5 duration-200 ease-out">
            <Image src="/logo-ecc.webp" alt="ECC" width={36} height={36} className="rounded md:w-9 md:h-9" />
          </div>
          <span className="text-[10px] leading-tight font-medium max-w-[76px] text-center truncate text-neutral-600 group-hover:text-brand-600 transition-colors">
            ECC
          </span>
        </Link>

        <div className="w-px h-14 md:h-16 self-center bg-neutral-200 mx-1 shrink-0" />

        {/* Standalone left (Elsa + User Guide) */}
        {STANDALONE_LEFT.map((item) => (
          <DockItem
            key={item.href}
            href={item.href}
            label={item.label}
            Icon={item.icon}
            active={isItemActive(pathname, item.href)}
          />
        ))}

        <div className="w-px h-14 md:h-16 self-center bg-neutral-200 mx-1 shrink-0" />

        {/* Menu groups */}
        {visibleGroups.map((g) => (
          <DockGroup
            key={g.label}
            group={g}
            open={openGroup === g.label}
            active={isGroupActive(g)}
            pathname={pathname}
            onToggle={() => setOpenGroup((prev) => (prev === g.label ? null : g.label))}
            onNavigate={(href) => {
              setOpenGroup(null);
              if (href.startsWith('http')) {
                window.open(href, '_blank', 'noopener,noreferrer');
              } else {
                router.push(href);
              }
            }}
          />
        ))}

        <div className="w-px h-14 md:h-16 self-center bg-neutral-200 mx-1 shrink-0" />

        {/* Standalone right (Profile) */}
        {STANDALONE_RIGHT.map((item) => (
          <DockItem
            key={item.href}
            href={item.href}
            label={item.label}
            Icon={item.icon}
            active={isItemActive(pathname, item.href)}
          />
        ))}
      </div>
    </>
  );
}

// ============================================================
// DockItem — standalone icon
// ============================================================

function DockItem({
  href,
  label,
  Icon,
  active,
}: {
  href: string;
  label: string;
  Icon: typeof LayoutDashboard;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className="group relative flex flex-col items-center gap-1 shrink-0"
    >
      <button
        type="button"
        className={clsx(
          'flex items-center justify-center w-12 h-12 md:w-14 md:h-14 rounded-xl shrink-0',
          'transition-all duration-200 ease-out',
          'active:scale-90',
          'group-hover:scale-110 group-hover:-translate-y-0.5',
          active
            ? 'bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg'
            : 'text-neutral-700 hover:bg-neutral-100',
        )}
      >
        <Icon className="w-5 h-5 md:w-6 md:h-6" />
      </button>

      {/* Label di bawah icon */}
      <span
        className={clsx(
          'text-[10px] leading-tight font-medium max-w-[76px] text-center truncate transition-colors',
          active ? 'text-brand-700' : 'text-neutral-600 group-hover:text-brand-600',
        )}
      >
        {label}
      </span>
    </Link>
  );
}

// ============================================================
// DockGroup — icon + popover submenu
// ============================================================

function DockGroup({
  group,
  open,
  active,
  pathname,
  onToggle,
  onNavigate,
}: {
  group: NavGroup;
  open: boolean;
  active: boolean;
  pathname: string | null;
  onToggle: () => void;
  onNavigate: (href: string) => void;
}) {
  const Icon = group.icon;
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [popoverPos, setPopoverPos] = useState<{ left: number; bottom: number } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Compute popover position based on button rect — pakai position:fixed +
  // portal ke document.body supaya bypass:
  //   1. Overflow-x-auto clipping di dock container (mobile)
  //   2. Ancestor transform (dock's -translate-x-1/2) yg bikin fixed pos
  //      relative ke ancestor, bukan viewport (CSS gotcha)
  useEffect(() => {
    if (!open || !buttonRef.current) {
      setPopoverPos(null);
      return;
    }
    const compute = () => {
      if (!buttonRef.current) return;
      const rect = buttonRef.current.getBoundingClientRect();
      setPopoverPos({
        left: rect.left + rect.width / 2,
        bottom: window.innerHeight - rect.top + 8,
      });
    };
    compute();
    window.addEventListener('resize', compute);
    window.addEventListener('scroll', compute, true);
    return () => {
      window.removeEventListener('resize', compute);
      window.removeEventListener('scroll', compute, true);
    };
  }, [open]);

  // Popover content — di-render via portal supaya escape transform+overflow context
  const popoverEl = open && popoverPos ? (
    <div
      className="fixed z-[45] min-w-[220px] max-w-[calc(100vw-1rem)] py-1.5 bg-white border border-neutral-200 rounded-xl shadow-2xl origin-bottom elsa-dock-popover"
      style={{
        left: popoverPos.left,
        bottom: popoverPos.bottom,
        transform: 'translateX(-50%)',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider font-semibold text-neutral-400 border-b border-neutral-100 mb-1">
        {group.label}
      </div>
      <div className="max-h-[60vh] overflow-y-auto py-1">
        {group.items.map((item) => {
          const ItemIcon = item.icon;
          const isActive = isItemActive(pathname, item.href);
          return (
            <button
              key={item.href}
              type="button"
              onClick={() => onNavigate(item.href)}
              className={clsx(
                'w-full flex items-center gap-3 px-3 py-2 text-sm transition-colors',
                isActive
                  ? 'bg-brand-50 text-brand-700 font-medium'
                  : 'text-neutral-700 hover:bg-neutral-50',
              )}
            >
              <ItemIcon className="w-4 h-4 shrink-0" />
              <span className="flex-1 text-left">{item.label}</span>
              {isActive && <span className="w-1.5 h-1.5 rounded-full bg-brand-500" />}
            </button>
          );
        })}
      </div>
    </div>
  ) : null;

  return (
    <>
      {mounted && popoverEl && createPortal(popoverEl, document.body)}

      <div className="relative flex flex-col items-center gap-1 shrink-0 group">
        <button
          ref={buttonRef}
          type="button"
          onClick={onToggle}
          className={clsx(
            'flex items-center justify-center w-12 h-12 md:w-14 md:h-14 rounded-xl shrink-0',
            'transition-all duration-200 ease-out',
            'active:scale-90',
            !open && 'group-hover:scale-110 group-hover:-translate-y-0.5',
            open
              ? 'bg-neutral-900 text-white shadow-lg -translate-y-0.5'
              : active
                ? 'bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg'
                : 'text-neutral-700 hover:bg-neutral-100',
          )}
        >
          <Icon className="w-5 h-5 md:w-6 md:h-6" />
        </button>

        {/* Label di bawah icon */}
        <span
          className={clsx(
            'text-[10px] leading-tight font-medium max-w-[76px] text-center truncate transition-colors',
            open
              ? 'text-neutral-900'
              : active
                ? 'text-brand-700'
                : 'text-neutral-600 group-hover:text-brand-600',
          )}
        >
          {group.label}
        </span>
      </div>
    </>
  );
}
