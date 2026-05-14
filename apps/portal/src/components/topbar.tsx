'use client';

import { useAuthStore } from '@/lib/auth-store';
import { LogOut, User } from 'lucide-react';
import { useRouter } from 'next/navigation';

export function Topbar() {
  const router = useRouter();
  const { user, clearAuth } = useAuthStore();

  function handleLogout() {
    clearAuth();
    router.push('/login');
  }

  return (
    <header className="h-14 bg-white border-b border-neutral-200 flex items-center justify-between px-6">
      <div className="text-sm text-neutral-500">ECC Master Data Portal</div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-sm">
          {user?.fotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`${process.env.NEXT_PUBLIC_CORE_API_URL ?? ''}${user.fotoUrl}`}
              alt={user.namaLengkap}
              className="w-8 h-8 rounded-full object-cover"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center">
              <User className="w-4 h-4" />
            </div>
          )}
          <div className="hidden sm:block">
            <div className="font-medium text-neutral-900">{user?.namaLengkap ?? 'Guest'}</div>
            <div className="text-xs text-neutral-500">Fulltimer</div>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="p-2 hover:bg-neutral-100 rounded-lg transition"
          title="Logout"
        >
          <LogOut className="w-4 h-4 text-neutral-600" />
        </button>
      </div>
    </header>
  );
}
