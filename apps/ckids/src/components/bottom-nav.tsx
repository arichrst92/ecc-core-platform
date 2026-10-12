'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Gift, ScanLine, Award, BarChart3, ClipboardList, History } from 'lucide-react';

/**
 * Floating bottom dock — pola sama dengan BottomDock portal.
 * Tampil di SEMUA ukuran layar (menggantikan top nav desktop).
 *
 * Tidak menutupi konten: body diberi padding-bottom setinggi dock + safe-area
 * (lihat globals.css `--dock-space`). Layar sempit: dock bisa di-scroll
 * horizontal, scrollbar disembunyikan.
 */
const ITEMS = [
  { href: '/', label: 'Gift Stall', short: 'Gift', icon: Gift },
  { href: '/ibadah', label: 'Scanner', short: 'Scan', icon: ScanLine },
  { href: '/hadir', label: 'Daftar Hadir', short: 'Hadir', icon: ClipboardList },
  { href: '/adjust-point', label: 'Adjust Point', short: 'Adjust', icon: Award },
  { href: '/history', label: 'History', short: 'History', icon: History },
  { href: '/report', label: 'Report', short: 'Report', icon: BarChart3 },
];

function isActive(pathname: string | null, href: string) {
  if (!pathname) return false;
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(href + '/');
}

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Menu utama"
      data-dock
      className="fixed left-1/2 -translate-x-1/2 z-40 max-w-[calc(100vw-1rem)]"
      style={{ bottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
    >
      <div className="dock-scroll flex items-end gap-0.5 sm:gap-1.5 px-1.5 sm:px-3 py-2 bg-white/95 backdrop-blur border border-neutral-200 rounded-2xl shadow-2xl overflow-x-auto">
        {ITEMS.map((n) => {
          const active = isActive(pathname, n.href);
          const Icon = n.icon;
          return (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active ? 'page' : undefined}
              title={n.label}
              className="group flex flex-col items-center gap-1 shrink-0 w-[50px] sm:w-[72px]"
            >
              <span
                className={`flex items-center justify-center w-11 h-11 sm:w-12 sm:h-12 rounded-xl transition-all duration-200 ease-out active:scale-90 group-hover:-translate-y-0.5 ${
                  active
                    ? 'bg-gradient-to-br from-kids-500 to-kids-600 text-white shadow-lg'
                    : 'text-neutral-700 group-hover:bg-neutral-100'
                }`}
              >
                <Icon className="w-5 h-5 sm:w-6 sm:h-6" />
              </span>
              <span
                className={`text-[10px] leading-tight font-medium text-center truncate max-w-full transition-colors ${
                  active ? 'text-kids-600' : 'text-neutral-600 group-hover:text-kids-600'
                }`}
              >
                <span className="sm:hidden">{n.short}</span>
                <span className="hidden sm:inline">{n.label}</span>
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
