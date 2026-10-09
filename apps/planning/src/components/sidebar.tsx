'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, ListTree, Columns3, CalendarRange, UserCircle, LogOut } from 'lucide-react';
import clsx from 'clsx';
import { useAuthStore } from '@/lib/auth-store';
import { redirectToPortal } from '@/lib/api-client';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/backlog', label: 'Backlog (Epic Tree)', icon: ListTree },
  { href: '/dashboard/kanban', label: 'Kanban Board', icon: Columns3 },
  { href: '/dashboard/sprints', label: 'Sprints', icon: CalendarRange },
  { href: '/dashboard/my-items', label: 'My Items', icon: UserCircle },
];

export function Sidebar() {
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);

  function handleLogout() {
    clearAuth();
    redirectToPortal();
  }

  return (
    <aside className="w-64 bg-white border-r border-neutral-200 flex flex-col">
      <div className="p-6 flex items-center gap-3 border-b border-neutral-100">
        <div className="w-9 h-9 rounded-lg bg-brand-500 text-white flex items-center justify-center font-bold">
          P
        </div>
        <div>
          <div className="font-bold text-neutral-900">Planning Backlog</div>
          <div className="text-[10px] text-neutral-500 uppercase tracking-wider">IT Minister Team</div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active =
            pathname === item.href ||
            (item.href !== '/dashboard' && pathname?.startsWith(item.href + '/'));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition',
                active
                  ? 'bg-brand-500 text-white shadow-sm'
                  : 'text-neutral-600 hover:bg-neutral-100',
              )}
            >
              <Icon className="w-4 h-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-neutral-100 space-y-3">
        {user && (
          <div className="flex items-center gap-2">
            {user.fotoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.fotoUrl}
                alt={user.namaLengkap}
                className="w-8 h-8 rounded-full object-cover"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-neutral-200 flex items-center justify-center text-xs font-bold text-neutral-600">
                {user.namaLengkap.charAt(0)}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-neutral-800 truncate">{user.namaLengkap}</div>
              <div className="text-[10px] text-neutral-500">IT Team</div>
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={handleLogout}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-neutral-500 hover:bg-neutral-100 transition"
        >
          <LogOut className="w-3.5 h-3.5" />
          Logout
        </button>
        <div className="text-[10px] text-neutral-400">Powered by ECC Core Platform</div>
      </div>
    </aside>
  );
}
