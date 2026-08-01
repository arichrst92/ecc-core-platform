'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Gift, ScanLine, Award, BarChart3, ClipboardList } from 'lucide-react';

/**
 * Bottom nav bar — cuma tampil di layar `<lg` (mobile + tablet).
 * Desktop pakai top nav di Header.tsx.
 *
 * Fixed bottom, 5 tab utama, icon + label. Active state highlight.
 */
export function BottomNav() {
  const pathname = usePathname();

  const items = [
    { href: '/', label: 'Gift', icon: Gift },
    { href: '/ibadah', label: 'Scan', icon: ScanLine },
    { href: '/hadir', label: 'Hadir', icon: ClipboardList },
    { href: '/adjust-point', label: 'Adjust', icon: Award },
    { href: '/report', label: 'Report', icon: BarChart3 },
  ];

  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-neutral-200 safe-bottom">
      <div className="grid grid-cols-5">
        {items.map((n) => {
          const active = pathname === n.href;
          const Icon = n.icon;
          return (
            <Link
              key={n.href}
              href={n.href}
              className={`flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition ${
                active ? 'text-kids-600' : 'text-neutral-500 hover:text-neutral-800'
              }`}
            >
              <Icon
                className={`w-5 h-5 transition-transform ${
                  active ? 'scale-110' : ''
                }`}
              />
              {n.label}
              {active && (
                <span className="absolute top-0 h-0.5 w-8 bg-kids-500 rounded-full" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
