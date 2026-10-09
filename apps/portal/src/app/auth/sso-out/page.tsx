'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/lib/auth-store';

/**
 * SSO handoff emitter.
 *
 * Dibuka dari planning / operations app saat user belum punya tokens di localStorage
 * mereka (karena localStorage origin-scoped). URL: /auth/sso-out?return=<encoded_url>
 *
 * Alur:
 *   1. Baca localStorage portal (auth-store).
 *   2. Kalau logged in: redirect ke return URL + hash tokens (hash tidak dikirim ke server).
 *   3. Kalau NOT logged in: redirect ke /login?next=/auth/sso-out?return=...
 */
export default function SsoOutPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const [status, setStatus] = useState<'checking' | 'handoff' | 'error'>('checking');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const returnUrl = searchParams?.get('return');
    if (!returnUrl) {
      setStatus('error');
      setError('Parameter `return` wajib.');
      return;
    }

    // Validasi: return URL harus match whitelist domain (eccchurch.global atau localhost).
    try {
      const parsed = new URL(returnUrl);
      const okHost =
        parsed.host.endsWith('.eccchurch.global') ||
        parsed.hostname === 'eccchurch.global' ||
        parsed.hostname === 'localhost';
      if (!okHost) {
        setStatus('error');
        setError(`Return URL domain tidak diizinkan: ${parsed.host}`);
        return;
      }
    } catch {
      setStatus('error');
      setError('Return URL invalid.');
      return;
    }

    if (!user || !accessToken || !refreshToken) {
      // Belum login — kirim ke login, kembalikan ke sini after.
      const nextUrl = `/auth/sso-out?return=${encodeURIComponent(returnUrl)}`;
      router.replace(`/login?next=${encodeURIComponent(nextUrl)}`);
      return;
    }

    // Encode user as base64(JSON) agar aman di URL
    const userPayload = btoa(unescape(encodeURIComponent(JSON.stringify(user))));
    const hash = `at=${encodeURIComponent(accessToken)}&rt=${encodeURIComponent(refreshToken)}&u=${userPayload}`;
    setStatus('handoff');
    window.location.href = `${returnUrl}#${hash}`;
  }, [router, searchParams, user, accessToken, refreshToken]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md text-center space-y-3">
        {status === 'error' ? (
          <>
            <h1 className="text-lg font-bold text-red-600">SSO gagal</h1>
            <p className="text-sm text-neutral-600">{error}</p>
          </>
        ) : (
          <>
            <h1 className="text-lg font-bold">Meneruskan sesi...</h1>
            <p className="text-sm text-neutral-500">
              {status === 'handoff' ? 'Membuka aplikasi tujuan.' : 'Memeriksa autentikasi.'}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
