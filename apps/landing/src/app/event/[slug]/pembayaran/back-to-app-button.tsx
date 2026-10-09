'use client';

import { useEffect, useState } from 'react';
import { Smartphone, ExternalLink } from 'lucide-react';

const IOS_APP_URL = 'https://apps.apple.com/id/app/els-global-app/id6743088520';
const ANDROID_APP_URL = 'https://play.google.com/store/apps/details?id=idea.eccchurch.global';

export function BackToAppButton({ eventId }: { eventId: string }) {
  const [platform, setPlatform] = useState<'ios' | 'android' | 'other'>('other');

  useEffect(() => {
    const ua = navigator.userAgent;
    if (/android/i.test(ua)) setPlatform('android');
    else if (/iphone|ipad|ipod/i.test(ua)) setPlatform('ios');
  }, []);

  const isMobile = platform !== 'other';
  const storeUrl = platform === 'ios' ? IOS_APP_URL : ANDROID_APP_URL;

  /**
   * Strategi reliable buat dismiss SFSafariViewController / Chrome Custom Tabs
   * dan buka app ECC:
   *
   * - iOS: pakai Universal Link https://eccchurch.global/event/<id>. AASA sudah
   *   whitelist `/event/*` → iOS akan dismiss SFSafariViewController + launch
   *   app routing ke app/event/[id].tsx. Custom scheme `ecc://` dari dalam
   *   SFSafariViewController sering di-suppress oleh iOS 16+.
   *
   * - Android: pakai Intent URL dengan fallback S.browser_fallback_url ke Play
   *   Store. Chrome Custom Tabs resolve intent → launch native app via
   *   intent-filter autoVerify (assetlinks.json). Kalau app not installed,
   *   fallback ke Play Store (bukan URL web lagi).
   *
   * - Desktop: just show store buttons.
   */
  function handleClick() {
    if (platform === 'ios') {
      // Universal Link — iOS kalau app installed akan intercept & launch app
      window.location.href = `https://eccchurch.global/event/${eventId}`;
      return;
    }
    if (platform === 'android') {
      // Intent URL dengan explicit package + fallback ke Play Store
      const fallback = encodeURIComponent(ANDROID_APP_URL);
      const intent =
        `intent://event/${eventId}` +
        `#Intent;scheme=ecc;package=idea.eccchurch.global;` +
        `S.browser_fallback_url=${fallback};end`;
      window.location.href = intent;
      return;
    }
    // Desktop → open App Store (default iOS link)
    window.open(IOS_APP_URL, '_blank', 'noopener');
  }

  return (
    <>
      <div className="bg-white border-2 border-orange-200 rounded-2xl p-6 text-center shadow-sm">
        <Smartphone className="w-8 h-8 text-orange-500 mx-auto mb-3" />
        <h3 className="font-semibold text-neutral-900 mb-2">Kembali ke Aplikasi ECC</h3>
        <p className="text-xs text-neutral-500 mb-4">
          Setelah transfer, lanjutkan upload bukti & konfirmasi pendaftaran di aplikasi.
        </p>

        {isMobile ? (
          <div className="space-y-2">
            <button
              type="button"
              onClick={handleClick}
              className="inline-flex items-center justify-center gap-2 w-full py-3 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-semibold rounded-xl hover:shadow-lg transition"
            >
              Kembali ke ECC App
            </button>
            <p className="text-[11px] text-neutral-400">
              Belum install?{' '}
              <a
                href={storeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-orange-600 hover:underline inline-flex items-center gap-0.5"
              >
                Download di {platform === 'ios' ? 'App Store' : 'Play Store'}
                <ExternalLink className="w-3 h-3" />
              </a>
            </p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-2">
            <a
              href={IOS_APP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 py-2.5 bg-neutral-900 text-white text-sm font-semibold rounded-xl hover:bg-neutral-800"
            >
              Download di App Store
            </a>
            <a
              href={ANDROID_APP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 py-2.5 bg-neutral-900 text-white text-sm font-semibold rounded-xl hover:bg-neutral-800"
            >
              Download di Play Store
            </a>
          </div>
        )}
      </div>

      {/* Sticky bottom bar — hanya di mobile. Selalu reachable sambil user scroll. */}
      {isMobile && (
        <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-sm border-t border-orange-100 p-3 shadow-[0_-4px_12px_rgba(0,0,0,0.05)] z-50 sm:hidden">
          <button
            type="button"
            onClick={handleClick}
            className="w-full py-3 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-semibold rounded-xl shadow-md flex items-center justify-center gap-2"
          >
            <Smartphone className="w-4 h-4" />
            Kembali ke ECC App
          </button>
        </div>
      )}
    </>
  );
}
