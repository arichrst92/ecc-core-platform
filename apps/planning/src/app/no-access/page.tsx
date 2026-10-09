'use client';

import { ShieldOff } from 'lucide-react';
import { useAuthStore } from '@/lib/auth-store';

export default function NoAccessPage() {
  const user = useAuthStore((s) => s.user);
  const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL ?? 'http://localhost:3100';

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-neutral-50">
      <div className="max-w-md w-full bg-white border border-neutral-200 rounded-xl p-8 text-center space-y-4">
        <div className="w-16 h-16 mx-auto rounded-full bg-red-50 text-red-600 flex items-center justify-center">
          <ShieldOff className="w-8 h-8" />
        </div>
        <h1 className="text-xl font-bold text-neutral-900">Akses Ditolak</h1>
        <p className="text-sm text-neutral-600">
          {user ? (
            <>
              Hi <strong>{user.namaLengkap}</strong>, akun kamu belum terdaftar sebagai anggota
              <strong> IT Minister Team</strong>. Planning Backlog hanya untuk tim dev internal.
            </>
          ) : (
            'Akun kamu belum terdaftar sebagai anggota IT Minister Team. Planning Backlog hanya untuk tim dev internal.'
          )}
        </p>
        <div className="text-xs text-neutral-500">
          Perlu akses? Minta Head IT Minister untuk assign kamu via Portal → Team IT Minister.
        </div>
        <a
          href={portalUrl}
          className="inline-block px-4 py-2 bg-brand-500 text-white rounded-lg text-sm font-medium hover:bg-brand-600"
        >
          Kembali ke Portal
        </a>
      </div>
    </div>
  );
}
