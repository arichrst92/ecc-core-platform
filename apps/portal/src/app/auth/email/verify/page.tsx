'use client';

/**
 * Magic link verify page (portal web).
 *
 * User klik tombol "Masuk ke ECC" di email → landing di sini dgn `?token=xxx`.
 * Flow:
 *   1. Pull token dari query
 *   2. POST /auth/email/verify-magic-link → dapat JWT + user
 *   3. Simpan ke auth-store → redirect /dashboard
 *
 * Kalau UA mobile & user punya app ECC: tampilkan tombol "Buka di aplikasi ECC"
 * (deep link `ecc://auth/email/verify?token=...`) selain auto-login web.
 */
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, AlertCircle, CheckCircle2, Smartphone } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';

type Phase = 'verifying' | 'success' | 'error' | 'no-token';

// Next 14 App Router: useSearchParams() harus di dalam Suspense boundary
// supaya page tidak CSR-bailout waktu prerender.
export default function VerifyMagicLinkPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-orange-50">
          <Loader2 className="w-6 h-6 text-orange-500 animate-spin" />
        </div>
      }
    >
      <VerifyMagicLinkInner />
    </Suspense>
  );
}

function VerifyMagicLinkInner() {
  const router = useRouter();
  const params = useSearchParams();
  const setAuth = useAuthStore((s) => s.setAuth);

  const token = params.get('token');
  const [phase, setPhase] = useState<Phase>(token ? 'verifying' : 'no-token');
  const [errMsg, setErrMsg] = useState<string>('');

  const isMobileUA =
    typeof navigator !== 'undefined' &&
    /android|iphone|ipad|ipod/i.test(navigator.userAgent);
  const mobileDeepLink = token ? `ecc://auth/email/verify?token=${token}` : '';

  // Auto-redirect ke deeplink app kalau UA mobile.
  // App diharapkan handle `ecc://auth/email/verify?token=xxx` → panggil
  // /auth/email/verify-magic-link → set session → land di home.
  // Kalau app tidak install, browser tetap di page ini dan auto-login web.
  useEffect(() => {
    if (!token || !isMobileUA) return;
    // Delay kecil supaya browser sempat render page (kasus app tidak install).
    const t = setTimeout(() => {
      window.location.href = mobileDeepLink;
    }, 100);
    return () => clearTimeout(t);
  }, [token, isMobileUA, mobileDeepLink]);

  useEffect(() => {
    if (!token) return;
    let alive = true;

    (async () => {
      try {
        const res = await apiClient.post('/auth/email/verify-magic-link', { token });
        if (!alive) return;
        const auth = res.data?.data ?? res.data;
        if (!auth?.accessToken || !auth?.user) {
          throw new Error('Response invalid');
        }
        setAuth(auth);
        setPhase('success');
        // Kasih delay pendek supaya user liat "berhasil"
        setTimeout(() => alive && router.replace('/dashboard'), 800);
      } catch (e: any) {
        if (!alive) return;
        const msg =
          e?.response?.data?.error?.message ??
          e?.message ??
          'Gagal verifikasi link. Coba minta link baru.';
        setErrMsg(msg);
        setPhase('error');
      }
    })();

    return () => {
      alive = false;
    };
  }, [token, setAuth, router]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-orange-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg border border-neutral-200 p-8">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-white font-bold text-sm">
            ECC
          </div>
          <div>
            <h1 className="text-sm font-semibold text-neutral-900">Elshaddai Creative Community</h1>
            <p className="text-xs text-neutral-500">Magic link login</p>
          </div>
        </div>

        {phase === 'verifying' && (
          <div className="text-center py-8">
            <Loader2 className="w-8 h-8 text-orange-500 animate-spin mx-auto mb-3" />
            <p className="text-sm font-medium text-neutral-900">Memverifikasi link…</p>
            <p className="text-xs text-neutral-500 mt-1">Tunggu sebentar, sedang login otomatis.</p>
          </div>
        )}

        {phase === 'success' && (
          <div className="text-center py-8">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
            <p className="text-sm font-medium text-neutral-900">Berhasil masuk!</p>
            <p className="text-xs text-neutral-500 mt-1">Mengalihkan ke dashboard…</p>
          </div>
        )}

        {phase === 'no-token' && (
          <div className="py-4">
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-900">
                Link tidak mengandung token. Pastikan Anda buka link lengkap dari email.
              </p>
            </div>
            <button
              onClick={() => router.push('/login')}
              className="w-full py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-lg"
            >
              Ke halaman login
            </button>
          </div>
        )}

        {phase === 'error' && (
          <div className="py-4">
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-900">Verifikasi gagal</p>
                <p className="text-xs text-red-800 mt-1">{errMsg}</p>
              </div>
            </div>
            <button
              onClick={() => router.push('/login')}
              className="w-full py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-lg"
            >
              Minta link baru
            </button>
          </div>
        )}

        {isMobileUA && mobileDeepLink && (phase === 'verifying' || phase === 'success') && (
          <div className="mt-6 pt-4 border-t border-neutral-100">
            <p className="text-xs text-neutral-500 mb-2 text-center">Punya aplikasi ECC mobile?</p>
            <a
              href={mobileDeepLink}
              className="w-full flex items-center justify-center gap-2 py-2.5 border border-orange-300 text-orange-700 text-sm font-medium rounded-lg hover:bg-orange-50"
            >
              <Smartphone className="w-4 h-4" />
              Buka di aplikasi ECC
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
