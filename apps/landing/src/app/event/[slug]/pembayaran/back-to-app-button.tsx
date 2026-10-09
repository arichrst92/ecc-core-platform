'use client';

import { useEffect, useState } from 'react';
import { Smartphone, ExternalLink } from 'lucide-react';

// Store URL tanpa country code (/id/) biar tidak region-locked.
const IOS_APP_URL = 'https://apps.apple.com/app/els-global-app/id6743088520';
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
   * Strategi dismiss SFSafariViewController / Chrome Custom Tabs + launch app:
   *
   * - iOS: custom scheme `ecc://event/<id>`. Dari dalam SFSafariViewController
   *   (host app = ECC), iOS TIDAK auto-launch via Universal Link (anti-circular).
   *   Custom scheme memicu system prompt "Open in Els Global?" → user tap
   *   "Open" → view controller dismiss, app routing ke app/event/[id].tsx.
   *   Fallback setelah 1.5s (user tap Cancel atau app not installed) → App Store.
   *
   * - Android: Intent URL dengan explicit package + S.browser_fallback_url ke
   *   Play Store. Chrome Custom Tabs resolve intent → launch native app via
   *   intent-filter autoVerify. Kalau app not installed, fallback Play Store.
   *
   * - Desktop: open App Store link.
   */
  function handleClick() {
    if (platform === 'ios') {
      // iOS: trigger custom scheme ecc://. Dari dalam SFSafariViewController yg
      // dibuka ECC app sendiri, iOS prompt "Open in Els Global?" → user tap
      // Open → view controller dismiss + app opens.
      //
      // TIDAK ADA fallback redirect ke App Store — kalau prompt gagal / di-cancel,
      // user bisa pakai native button "◁ Els App" di kiri atas (iOS auto-inject).
      window.location.href = `ecc://event/${eventId}`;
      return;
    }
    if (platform === 'android') {
      // Android Intent URL — Chrome Custom Tabs resolve intent → launch app.
      // S.browser_fallback_url hanya aktif kalau app NOT installed.
      const fallback = encodeURIComponent(ANDROID_APP_URL);
      const intent =
        `intent://event/${eventId}` +
        `#Intent;scheme=ecc;package=idea.eccchurch.global;` +
        `S.browser_fallback_url=${fallback};end`;
      window.location.href = intent;
      return;
    }
    // Desktop → open App Store page
    window.open(IOS_APP_URL, '_blank', 'noopener');
  }

  return (
    <div className="bg-white border-2 border-orange-200 rounded-2xl p-6 text-center shadow-sm">
      <Smartphone className="w-8 h-8 text-orange-500 mx-auto mb-3" />
      <h3 className="font-semibold text-neutral-900 mb-2">Kembali ke Els App</h3>
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
            Kembali ke Els App
          </button>
          {platform === 'ios' && (
            <p className="text-[11px] text-neutral-500 leading-relaxed mt-2">
              Tidak muncul prompt? Tap tombol <strong>◁ Els App</strong> di kiri atas
              layar untuk kembali ke aplikasi.
            </p>
          )}
          <p className="text-[11px] text-neutral-400 mt-1">
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
  );
}
