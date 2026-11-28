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
  ChevronDown,
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
  HeartHandshake,
  Ticket,
  Newspaper,
  Music,
  MonitorPlay,
  BellRing,
  BookOpen,
  Home as HomeIcon,
  UsersRound,
  MapPin,
  Megaphone,
  Handshake,
  Store,
  ShieldCheck,
  Baby,
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
  TrendingUp,
  MapPinned,
  UserPlus,
  MessageSquareText,
  BarChart3,
  Footprints,
  Contact,
  ShieldAlert,
  CloudUpload,
  ClipboardList,
  UserCheck,
  Download, Library,
  Inbox,
} from 'lucide-react';
import clsx from 'clsx';
import { hasMenuAccess } from '@ecc/shared-types';
import { useAuthStore } from '@/lib/auth-store';
import { PENDING_META, badgeText, usePendingCounts, type PendingCounts, type PendingKey } from '@/lib/pending-counts';
import { FILL_META, useNeedsFillCounts, type FillCounts, type FillKey } from '@/lib/needs-fill-counts';

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  menuKey?: string;
  /** External URL (open in new tab). Kalau true, href boleh https:// */
  external?: boolean;
  /** Badge request menunggu tindakan (GET /admin/pending-counts). */
  badge?: PendingKey;
  /** Badge biru "Perlu diisi" (GET /admin/needs-fill-counts). */
  fill?: FillKey;
}

interface NavGroup {
  label: string;
  icon: typeof LayoutDashboard;
  items: NavItem[];
}

// Standalone dock items (kiri + kanan)
const STANDALONE_LEFT: NavItem[] = [
  { href: '/dashboard', label: 'Elsa (Els Agentic)', icon: Sparkles },
  { href: '/dashboard/forecast', label: 'Forecast', icon: TrendingUp, menuKey: 'forecast' },
  { href: '/dashboard/map', label: 'Map View', icon: MapPinned, menuKey: 'map-view' },
  { href: '/dashboard/user-guide', label: 'User Guide', icon: BookOpenCheck },
];

const STANDALONE_RIGHT: NavItem[] = [
  { href: '/dashboard/profile', label: 'Profil & Keamanan', icon: UserCog },
];

const GROUPS: NavGroup[] = [
  {
    label: 'Sinode',
    icon: Building2,
    items: [
      { href: '/dashboard/sinode', label: 'Gereja', icon: Building2, menuKey: 'sinode' },
      { href: '/dashboard/cabang', label: 'Cabang Gereja', icon: Church, menuKey: 'cabang', fill: 'cabang' },
    ],
  },
  {
    label: 'Service',
    icon: Calendar,
    items: [
      { href: '/dashboard/ibadah', label: 'Ibadah', icon: Calendar, menuKey: 'ibadah', fill: 'ibadah' },
      { href: '/dashboard/kategori-ibadah', label: 'Kategori Ibadah', icon: Layers, menuKey: 'kategori-ibadah' },
      { href: '/dashboard/pelayanan', label: 'Pelayanan', icon: HandHeart, menuKey: 'pelayanan', fill: 'pelayanan' },
      { href: '/dashboard/pelayanan/join-requests', label: 'Permintaan Volunteer', icon: UserPlus, menuKey: 'ministry-join-requests', badge: 'volunteer' },
      { href: '/dashboard/kehadiran', label: 'Kehadiran', icon: Ticket, menuKey: 'kehadiran' },
      { href: '/dashboard/laporan-ibadah', label: 'Laporan Ibadah', icon: BarChart3, menuKey: 'laporan-ibadah' },
    ],
  },
  {
    label: 'People',
    icon: Users,
    items: [
      { href: '/dashboard/jemaat', label: 'Jemaat', icon: Users, menuKey: 'jemaat', badge: 'jemaatDuplicate' },
      { href: '/dashboard/role', label: 'Role Jemaat', icon: Shield, menuKey: 'role-jemaat' },
      { href: '/dashboard/tipe-relasi', label: 'Relasi Jemaat', icon: Heart, menuKey: 'tipe-relasi' },
      { href: '/dashboard/feedback', label: 'Kritik & Saran', icon: MessageSquareText, menuKey: 'feedback', badge: 'feedback' },
      { href: '/dashboard/prayer-request', label: 'Prayer Request', icon: HandHeart, menuKey: 'prayer-request', badge: 'prayer' },
      { href: '/dashboard/konseling', label: 'Konseling', icon: HeartHandshake, menuKey: 'konseling', badge: 'konseling' },
      { href: '/dashboard/bible365', label: 'Bible 365', icon: BookOpen, menuKey: 'bible365' },
      { href: '/dashboard/tamu', label: 'Tamu', icon: Contact, menuKey: 'tamu', badge: 'tamu' },
    ],
  },
  {
    label: 'Community',
    icon: HomeIcon,
    items: [
      { href: '/dashboard/homecell-area', label: 'Zona', icon: MapPin, menuKey: 'homecell-area', fill: 'zona' },
      { href: '/dashboard/homecell', label: 'Homecell', icon: HomeIcon, menuKey: 'homecell', badge: 'homecellLokasi', fill: 'homecell' },
      { href: '/dashboard/homecell-material', label: 'Homecell Material', icon: Library, menuKey: 'homecell-material' },
      { href: '/dashboard/group', label: 'Group', icon: UsersRound, menuKey: 'group', badge: 'groupJoin', fill: 'group' },
      { href: '/dashboard/group?pengajuan=1', label: 'Pengajuan Group', icon: UsersRound, menuKey: 'group', badge: 'groupApproval' },
    ],
  },
  {
    label: 'Movement',
    icon: Megaphone,
    items: [
      { href: '/dashboard/event', label: 'Event', icon: Megaphone, menuKey: 'event', badge: 'eventPayment', fill: 'event' },
      { href: '/dashboard/laporan-event', label: 'Laporan Event', icon: BarChart3, menuKey: 'laporan-event' },
      { href: '/dashboard/visit', label: 'Visit', icon: Handshake, menuKey: 'visit' },
      { href: '/dashboard/spiritual-journey', label: 'Spiritual Journey', icon: Footprints, menuKey: 'spiritual-journey' },
      { href: '/dashboard/spiritual-journey/request', label: 'Request Spiritual Journey', icon: Inbox, menuKey: 'spiritual-journey-request', badge: 'sjRequest' },
      { href: '/dashboard/local-business', label: 'Local Market', icon: Store, menuKey: 'local-business' },
    ],
  },
  {
    label: 'Broadcast',
    icon: Newspaper,
    items: [
      { href: '/dashboard/news', label: 'News', icon: Newspaper, menuKey: 'news' },
      { href: '/dashboard/renungan', label: 'Renungan', icon: BookOpen, menuKey: 'renungan' },
      { href: '/dashboard/worship', label: 'ECC Worship', icon: Music, menuKey: 'ecc-worship' },
      { href: '/dashboard/video-channel', label: 'Video Channel', icon: MonitorPlay, menuKey: 'video-channel' },
      { href: '/dashboard/announcement', label: 'Announcement', icon: BellRing, menuKey: 'announcement' },
      { href: '/dashboard/universal-form', label: 'Universal Form', icon: ClipboardList, menuKey: 'universal-form' },
    ],
  },
  {
    label: 'Compliance',
    icon: ShieldAlert,
    items: [
      { href: '/dashboard/compliance/sop', label: 'SOP Compliance', icon: ShieldAlert, menuKey: 'compliance-sop' },
      { href: '/dashboard/compliance/pemrosesan', label: 'Catatan Pemrosesan & Risiko', icon: ClipboardList, menuKey: 'compliance-ropa' },
      { href: '/dashboard/compliance/backup-email', label: 'Kirim Backup Bulanan', icon: CloudUpload, menuKey: 'compliance-backup' },
    ],
  },
  {
    label: 'App Settings',
    icon: Smartphone,
    items: [
      { href: '/dashboard/legal', label: 'Legal Docs', icon: FileText, menuKey: 'legal' },
      { href: '/dashboard/app-version', label: 'App Versions', icon: Smartphone, menuKey: 'app-version' },
      { href: '/dashboard/maintenance-mode', label: 'Maintenance Mode', icon: Power, menuKey: 'maintenance-mode' },
      { href: '/dashboard/onboarding-config', label: 'Onboarding Config', icon: UserCheck, menuKey: 'onboarding-config' },
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
      { href: '/dashboard/data-anak', label: 'Data Anak', icon: Baby, menuKey: 'data-anak' },
      { href: '/dashboard/ckids-access', label: 'Akses CKids', icon: ShieldCheck, menuKey: 'ckids-access' },
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
      { href: '/dashboard/analitik', label: 'Analitik App', icon: BarChart3, menuKey: 'analitik' },
      { href: '/dashboard/credential', label: 'Credential', icon: KeyRound, menuKey: 'credential' },
      { href: '/dashboard/diagnostics', label: 'Diagnostics', icon: Stethoscope, menuKey: 'diagnostics' },
      { href: '/dashboard/shiftsoft-sync', label: 'Shiftsoft Sync', icon: DatabaseZap, menuKey: 'shiftsoft-sync' },
      { href: '/dashboard/tech-docs', label: 'Technical Documentation', icon: FileText, menuKey: 'tech-docs' },
      { href: '/dashboard/dev-download', label: 'Download', icon: Download, menuKey: 'dev-download' },
      { href: '/dashboard/api-access', label: 'API Access', icon: KeyRound, menuKey: 'api-access' },
      { href: '/dashboard/it-minister-team', label: 'Team IT Minister', icon: UsersRound, menuKey: 'it-minister-team' },
      { href: '/dashboard/wa-config', label: 'Message Provider', icon: FileText, menuKey: 'wa-config' },
      // Operations Tickets — DISEMBUNYIKAN sampai apps/operations dibangun (2026-10-11).
      // { href: '/operations', label: 'Operations Tickets', icon: Activity, menuKey: 'ops-tickets', external: true },
      { href: '/planning', label: 'Ticketing Tools', icon: Ticket, menuKey: 'planning-backlog', external: true },
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
  // Dock bisa disembunyikan → tinggal gelembung logo ECC di tengah bawah.
  // Pilihan diingat per browser (localStorage).
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    try {
      setHidden(localStorage.getItem(DOCK_HIDDEN_KEY) === '1');
    } catch {
      /* abaikan */
    }
  }, []);
  const setDockHidden = (v: boolean) => {
    setHidden(v);
    setOpenGroup(null);
    try {
      localStorage.setItem(DOCK_HIDDEN_KEY, v ? '1' : '0');
    } catch {
      /* abaikan */
    }
  };

  // NOTE: Outside-click detection via backdrop overlay saja (di render bawah).
  // Sebelumnya pakai document mousedown listener yg check `dockRef.contains(target)` —
  // tapi popover sekarang di-render via React portal ke document.body (di luar
  // dockRef tree), jadi click item di popover ke-anggap "outside" → popover
  // dismiss BEFORE navigate. Ganti ke backdrop-only click strategy.

  // Ruang bawah konten = tinggi dock nyata (bisa 2 baris / ada scrollbar di
  // layar sempit) + jarak dari tepi + safe-area. Disimpan di CSS var
  // --dock-space yang dipakai <main> di dashboard layout.
  useEffect(() => {
    const el = dockRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const root = document.documentElement;
    const update = () => {
      // Tersembunyi → ruang bawah cukup untuk gelembung (56px).
      const h = hidden ? 56 : el.getBoundingClientRect().height;
      root.style.setProperty('--dock-space', `${Math.ceil(h + 16 + 24)}px`);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [hidden]);

  // Close popover on route change
  useEffect(() => {
    setOpenGroup(null);
  }, [pathname]);

  // Badge request menunggu tindakan (grup + menu tujuan).
  const pending = usePendingCounts();
  const fill = useNeedsFillCounts();

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

      {/* Gelembung logo ECC (dock tersembunyi) — klik untuk membuka menu lagi */}
      <button
        type="button"
        onClick={() => setDockHidden(false)}
        aria-label="Tampilkan menu"
        title="Tampilkan menu"
        aria-hidden={!hidden}
        tabIndex={hidden ? 0 : -1}
        className={`fixed left-1/2 z-30 w-14 h-14 rounded-full bg-white border border-neutral-200 flex items-center justify-center transition-all duration-300 ease-out hover:scale-110 hover:ring-4 hover:ring-brand-100 ${
          hidden ? 'opacity-100 -translate-x-1/2 translate-y-0' : 'opacity-0 -translate-x-1/2 translate-y-8 pointer-events-none'
        }`}
        style={{
          bottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))',
          boxShadow: '0 12px 28px -8px rgba(234,88,12,0.35), 0 4px 12px -4px rgba(0,0,0,0.12)',
        }}
      >
        <Image src="/logo-ecc-church.webp" alt="ECC Church" width={27} height={36} className="h-8 w-auto" />
      </button>

      <div
        ref={dockRef}
        aria-hidden={hidden}
        className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-end gap-1.5 px-3 py-2.5 bg-white border border-neutral-200 rounded-2xl shadow-2xl max-w-[calc(100vw-1rem)] overflow-x-auto md:overflow-visible md:max-w-none elsa-dock-scroll transition-all duration-300 ease-out ${
          hidden ? 'opacity-0 translate-y-[120%] pointer-events-none' : 'opacity-100 translate-y-0'
        }`}
        style={{
          boxShadow: '0 20px 40px -12px rgba(0,0,0,0.15), 0 4px 12px -4px rgba(0,0,0,0.08)',
          bottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))',
        }}
      >
        {/* Logo ECC */}
        <Link
          href="/dashboard"
          className="group flex flex-col items-center gap-1 shrink-0"
        >
          <div className="flex items-center justify-center w-12 h-12 md:w-14 md:h-14 rounded-xl hover:bg-neutral-100 transition group-hover:scale-110 group-hover:-translate-y-0.5 duration-200 ease-out">
            <Image src="/logo-ecc-church.webp" alt="ECC Church" width={27} height={36} className="h-8 w-auto md:h-9" />
          </div>
          <span className="text-[10px] leading-tight font-medium max-w-[76px] text-center truncate text-neutral-600 group-hover:text-brand-600 transition-colors">
            ECC
          </span>
        </Link>

        <div className="w-px h-14 md:h-16 self-center bg-neutral-200 mx-1 shrink-0" />

        {/* Standalone left (Elsa + User Guide) */}
        {STANDALONE_LEFT.filter((item) => !item.menuKey || hasMenuAccess(user?.menuAccess ?? {}, item.menuKey, 'read')).map((item) => (
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
            pending={pending}
            fill={fill}
            onToggle={() => setOpenGroup((prev) => (prev === g.label ? null : g.label))}
            onNavigate={(href, external) => {
              setOpenGroup(null);
              if (external || href.startsWith('http')) {
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

        {/* Sembunyikan menu → gelembung logo ECC */}
        <button
          type="button"
          onClick={() => setDockHidden(true)}
          title="Sembunyikan menu"
          aria-label="Sembunyikan menu"
          className="group flex flex-col items-center gap-1 shrink-0 self-center"
        >
          <span className="w-8 h-8 rounded-full bg-neutral-100 text-neutral-500 flex items-center justify-center group-hover:bg-brand-50 group-hover:text-brand-600 transition">
            <ChevronDown className="w-4 h-4" />
          </span>
          <span className="text-[10px] leading-tight font-medium text-neutral-500 group-hover:text-brand-600">Sembunyikan</span>
        </button>
      </div>
    </>
  );
}

const DOCK_HIDDEN_KEY = 'portal_dock_hidden';

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
  pending,
  fill,
  onToggle,
  onNavigate,
}: {
  group: NavGroup;
  open: boolean;
  active: boolean;
  pathname: string | null;
  pending: PendingCounts;
  fill: FillCounts;
  onToggle: () => void;
  onNavigate: (href: string, external?: boolean) => void;
}) {
  const Icon = group.icon;
  const countOf = (item: NavItem) => (item.badge ? pending[item.badge] ?? 0 : 0);
  const groupTotal = group.items.reduce((n, it) => n + countOf(it), 0);
  const fillOf = (item: NavItem) => (item.fill ? fill[item.fill] ?? 0 : 0);
  const fillTotal = group.items.reduce((n, it) => n + fillOf(it), 0);
  const groupTitle = [
    ...group.items.filter((it) => countOf(it) > 0).map((it) => `${countOf(it)} ${PENDING_META[it.badge as PendingKey].label}`),
    ...group.items.filter((it) => fillOf(it) > 0).map((it) => `Perlu diisi: ${fillOf(it)} ${FILL_META[it.fill as FillKey].label}`),
  ].join('\n');
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
          const n = countOf(item);
          const meta = item.badge ? PENDING_META[item.badge] : null;
          const nf = fillOf(item);
          const fmeta = item.fill ? FILL_META[item.fill] : null;
          return (
            <div
              key={item.href}
              className={clsx(
                'w-full flex items-center gap-2 pr-2 text-sm transition-colors',
                isActive ? 'bg-brand-50 text-brand-700 font-medium' : 'text-neutral-700 hover:bg-neutral-50',
              )}
            >
              <button
                type="button"
                onClick={() => onNavigate(item.href, item.external)}
                className="flex-1 min-w-0 flex items-center gap-3 pl-3 py-2 text-left"
              >
                <ItemIcon className="w-4 h-4 shrink-0" />
                <span className="flex-1 truncate">{item.label}</span>
                {isActive && !n && !nf ? <span className="w-1.5 h-1.5 rounded-full bg-brand-500" /> : null}
              </button>
              {nf > 0 && fmeta ? (
                <button
                  type="button"
                  onClick={() => onNavigate(fmeta.target)}
                  title={`Perlu diisi: ${nf} ${fmeta.label} — buka`}
                  className="needs-fill-badge shrink-0 min-w-[22px] h-5 px-1.5 rounded-full text-white text-[11px] font-bold leading-5 text-center"
                >
                  {badgeText(nf)}
                </button>
              ) : null}
              {n > 0 && meta ? (
                <button
                  type="button"
                  onClick={() => onNavigate(meta.target)}
                  title={`${n} ${meta.label} — buka`}
                  className="shrink-0 min-w-[22px] h-5 px-1.5 rounded-full bg-red-500 hover:bg-red-600 text-white text-[11px] font-bold leading-5 text-center"
                >
                  {badgeText(n)}
                </button>
              ) : null}
            </div>
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
          title={groupTitle || undefined}
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
        {groupTotal > 0 ? (
          <span
            className="pointer-events-none absolute -top-1 right-0 md:-right-0.5 min-w-[20px] h-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold leading-5 text-center ring-2 ring-white"
            aria-label={`${groupTotal} menunggu tindakan`}
          >
            {badgeText(groupTotal)}
          </span>
        ) : null}
        {fillTotal > 0 ? (
          <span
            className="needs-fill-badge pointer-events-none absolute -top-1 left-0 md:-left-0.5 min-w-[20px] h-5 px-1 rounded-full text-white text-[10px] font-bold leading-5 text-center ring-2 ring-white"
            aria-label={`${fillTotal} data perlu diisi`}
          >
            {badgeText(fillTotal)}
          </span>
        ) : null}

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
