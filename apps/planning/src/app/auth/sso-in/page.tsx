'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';

/**
 * SSO handoff receiver.
 *
 * Portal sidebar klik Planning Backlog → portal buka tab ini dengan tokens di URL hash:
 *   /auth/sso-in#at=<accessToken>&rt=<refreshToken>&u=<base64(user_json)>
 *
 * Hash tidak dikirim ke server (tetap client-side), tokens disimpan ke
 * localStorage lalu redirect ke /dashboard.
 */
export default function SsoInPage() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const hash = window.location.hash.replace(/^#/, '');
      if (!hash) {
        setError('Tidak ada token di URL. Buka Planning Backlog dari menu Portal.');
        return;
      }
      const params = new URLSearchParams(hash);
      const at = params.get('at');
      const rt = params.get('rt');
      const uRaw = params.get('u');
      if (!at || !rt || !uRaw) {
        setError('Token tidak lengkap. Coba buka ulang dari Portal.');
        return;
      }
      const user = JSON.parse(decodeURIComponent(escape(atob(uRaw))));
      setAuth({ accessToken: at, refreshToken: rt, user });

      // Bersihkan hash supaya tidak lingering, lalu redirect.
      window.history.replaceState(null, '', '/dashboard');
      router.replace('/dashboard');
    } catch (err) {
      setError(`Gagal parse SSO payload: ${(err as Error).message}`);
    }
  }, [router, setAuth]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md text-center space-y-3">
        {error ? (
          <>
            <h1 className="text-lg font-bold text-red-600">Login gagal</h1>
            <p className="text-sm text-neutral-600">{error}</p>
            <a
              href={process.env.NEXT_PUBLIC_PORTAL_URL ?? 'http://localhost:3100'}
              className="inline-block px-4 py-2 bg-brand-500 text-white rounded-lg text-sm font-medium"
            >
              Buka Portal
            </a>
          </>
        ) : (
          <>
            <h1 className="text-lg font-bold">Menyiapkan sesi...</h1>
            <p className="text-sm text-neutral-500">Memvalidasi token dari Portal.</p>
          </>
        )}
      </div>
    </div>
  );
}
