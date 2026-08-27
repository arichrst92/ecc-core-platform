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
import { useSearchParams } from 'next/navigation';
import { Loader2, AlertCircle, Smartphone } from 'lucide-react';

type Phase = 'no-token' | 'mobile-deeplink' | 'desktop-notice';

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
  const params = useSearchParams();
  const token = params.get('token');
  const isMobileUA =
    typeof navigator !== 'undefined' &&
    /android|iphone|ipad|ipod/i.test(navigator.userAgent);

  const [phase] = useState<Phase>(
    !token ? 'no-token' : isMobileUA ? 'mobile-deeplink' : 'desktop-notice',
  );

  const mobileDeepLink = token ? `ecc://auth/email/verify?token=${token}` : '';

  // Trigger deep link auto saat mobile UA. Token TIDAK di-verify di web
  // karena magic link email hanya untuk jemaat (mobile app), bukan portal
  // admin. Portal admin login via WA OTP di /login.
  useEffect(() => {
    if (phase !== 'mobile-deeplink') return;
    const t = setTimeout(() => {
      window.location.href = mobileDeepLink;
    }, 300);
    return () => clearTimeout(t);
  }, [phase, mobileDeepLink]);

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

        {phase === 'no-token' && (
          <div className="py-4">
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-900">
                Link tidak mengandung token. Pastikan Anda buka link lengkap dari email.
              </p>
            </div>
          </div>
        )}

        {phase === 'mobile-deeplink' && (
          <div className="py-4">
            <div className="text-center mb-4">
              <Smartphone className="w-10 h-10 text-orange-500 mx-auto mb-2" />
              <p className="text-sm font-medium text-neutral-900">Membuka aplikasi ECC…</p>
              <p className="text-xs text-neutral-500 mt-1">
                Kalau iOS tanya <strong>&quot;Buka di ECC?&quot;</strong>, pilih <strong>Open</strong>.
              </p>
            </div>
            <a
              href={mobileDeepLink}
              className="w-full flex items-center justify-center gap-2 py-2.5 border border-orange-300 text-orange-700 text-sm font-medium rounded-lg hover:bg-orange-50"
            >
              <Smartphone className="w-4 h-4" />
              Buka di aplikasi ECC
            </a>
          </div>
        )}

        {phase === 'desktop-notice' && (
          <div className="py-4">
            <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-lg p-3">
              <AlertCircle className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-blue-900">Buka di perangkat mobile</p>
                <p className="text-xs text-blue-800 mt-1">
                  Link ini hanya bisa dibuka dari aplikasi ECC di HP Anda. Silakan
                  buka email ini di HP dan klik ulang tombol <strong>Masuk ke ECC</strong>.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
