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

type Phase = 'verifying' | 'success' | 'error' | 'no-token' | 'mobile-deeplink';

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
  // `?web=1` bypass mobile-deeplink flow (dari tombol "Login di web").
  const forceWeb = params.get('web') === '1';

  const isMobileUA =
    typeof navigator !== 'undefined' &&
    /android|iphone|ipad|ipod/i.test(navigator.userAgent);
  const useMobileFlow = token && isMobileUA && !forceWeb;

  const [phase, setPhase] = useState<Phase>(
    !token ? 'no-token' : useMobileFlow ? 'mobile-deeplink' : 'verifying',
  );
  const [errMsg, setErrMsg] = useState<string>('');

  const mobileDeepLink = token ? `ecc://auth/email/verify?token=${token}` : '';

  // Mobile flow — trigger deep link, DO NOT verify web (biar token tidak
  // ke-consume; app yg pakai token). Kalau user tidak switch ke app dalam
  // beberapa detik, tampilkan tombol "Login di web" sebagai fallback.
  useEffect(() => {
    if (!useMobileFlow) return;
    const t = setTimeout(() => {
      window.location.href = mobileDeepLink;
    }, 300);
    return () => clearTimeout(t);
  }, [useMobileFlow, mobileDeepLink]);

  // Web flow — verify + auto-login. HANYA jalan kalau bukan mobile flow.
  useEffect(() => {
    if (!token || useMobileFlow) return;
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
  }, [token, useMobileFlow, setAuth, router]);

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

        {phase === 'mobile-deeplink' && (
          <div className="py-4">
            <div className="text-center mb-4">
              <Smartphone className="w-10 h-10 text-orange-500 mx-auto mb-2" />
              <p className="text-sm font-medium text-neutral-900">Membuka aplikasi ECC…</p>
              <p className="text-xs text-neutral-500 mt-1">
                Kalau iOS tanya "Buka di ECC?", pilih <strong>Open</strong>.
              </p>
            </div>
            <a
              href={mobileDeepLink}
              className="w-full flex items-center justify-center gap-2 py-2.5 border border-orange-300 text-orange-700 text-sm font-medium rounded-lg hover:bg-orange-50 mb-3"
            >
              <Smartphone className="w-4 h-4" />
              Buka di aplikasi ECC
            </a>
            <button
              onClick={() => {
                const url = new URL(window.location.href);
                url.searchParams.set('web', '1');
                window.location.replace(url.toString());
              }}
              className="w-full py-2.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-sm font-medium rounded-lg"
            >
              Aplikasi belum install? Login di web
            </button>
            <p className="text-[11px] text-neutral-400 mt-3 text-center">
              Catatan: kalau login di web, link tidak bisa dipakai lagi di app.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
