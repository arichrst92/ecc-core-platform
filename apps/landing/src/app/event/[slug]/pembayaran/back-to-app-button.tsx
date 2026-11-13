'use client';

import { useEffect, useState } from 'react';
import { Smartphone, ExternalLink } from 'lucide-react';

import { useLang } from '@/components/lang-provider';
import { APP_STORE_URL as IOS_APP_URL, PLAY_STORE_URL as ANDROID_APP_URL } from '@/lib/app-links';

/**
 * Els App versi web (elsapp.eccchurch.global) membuka halaman ini di tab yang
 * sama dengan `?return=<url kembali>`. Hanya origin di bawah ini yang diterima
 * (cegah open redirect). App native tidak pernah mengirim `return`.
 */
const WEB_APP_ORIGINS = ['https://elsapp.eccchurch.global', 'http://localhost:8081'];

function readWebReturnUrl(): string | null {
  const raw = new URLSearchParams(window.location.search).get('return');
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return WEB_APP_ORIGINS.includes(u.origin) ? u.toString() : null;
  } catch {
    return null;
  }
}

export function BackToAppButton({ eventId }: { eventId: string }) {
  const [platform, setPlatform] = useState<'ios' | 'android' | 'other'>('other');
  const [webReturn, setWebReturn] = useState<string | null>(null);
  const { L } = useLang();

  useEffect(() => {
    const ua = navigator.userAgent;
    if (/android/i.test(ua)) setPlatform('android');
    else if (/iphone|ipad|ipod/i.test(ua)) setPlatform('ios');
    setWebReturn(readWebReturnUrl());
  }, []);

  // Dari Els App web → cukup tombol kembali ke tab app (tanpa deeplink / store).
  if (webReturn) {
    return (
      <div className="bg-white border-2 border-orange-200 rounded-2xl p-6 text-center shadow-sm">
        <Smartphone className="w-8 h-8 text-orange-500 mx-auto mb-3" />
        <h3 className="font-semibold text-neutral-900 mb-2">{L('Kembali ke Els App', 'Back to Els App')}</h3>
        <p className="text-xs text-neutral-500 mb-4">
          {L(
            'Setelah transfer, lanjutkan upload bukti & konfirmasi pendaftaran di Els App.',
            'After transferring, continue uploading the receipt & confirming registration in Els App.',
          )}
        </p>
        <a
          href={webReturn}
          className="inline-flex items-center justify-center gap-2 w-full py-3 bg-brand-grad text-white font-semibold rounded-xl hover:shadow-lg transition"
        >
          {L('Kembali ke Els App', 'Back to Els App')}
        </a>
      </div>
    );
  }

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
    // Mobile app membuka halaman ini via WebBrowser.openAuthSessionAsync
    // dengan redirect URL `ecc://payment-done`. Begitu browser navigate ke
    // scheme ini, iOS SFSafariViewController / Android Chrome Custom Tabs
    // auto-dismiss, kembalikan user ke native payment screen (yang sudah
    // punya form upload bukti).
    if (platform === 'ios' || platform === 'android') {
      window.location.href = 'ecc://payment-done';
      return;
    }
    // Desktop → open App Store page (user tidak datang dari app)
    window.open(IOS_APP_URL, '_blank', 'noopener');
  }

  return (
    <div className="bg-white border-2 border-orange-200 rounded-2xl p-6 text-center shadow-sm">
      <Smartphone className="w-8 h-8 text-orange-500 mx-auto mb-3" />
      <h3 className="font-semibold text-neutral-900 mb-2">{L('Kembali ke Els App', 'Back to Els App')}</h3>
      <p className="text-xs text-neutral-500 mb-4">
        {L(
          'Setelah transfer, lanjutkan upload bukti & konfirmasi pendaftaran di aplikasi.',
          'After transferring, continue uploading the receipt & confirming registration in the app.',
        )}
      </p>

      {isMobile ? (
        <div className="space-y-2">
          <button
            type="button"
            onClick={handleClick}
            className="inline-flex items-center justify-center gap-2 w-full py-3 bg-brand-grad text-white font-semibold rounded-xl hover:shadow-lg transition"
          >
            {L('Kembali ke Els App', 'Back to Els App')}
          </button>
          <p className="text-[11px] text-neutral-500 leading-relaxed mt-2">
            {L('Tombol tidak respon? Tap ', 'Button not responding? Tap ')}
            <strong>Done</strong>
            {L(' di pojok kanan atas atau', ' in the top-right corner or')}
            <strong> ◁ Els App</strong>
            {L(' di kiri atas layar untuk kembali.', ' in the top-left of the screen to go back.')}
          </p>
          <p className="text-[11px] text-neutral-400 mt-1">
            {L('Belum install?', 'Not installed yet?')}{' '}
            <a
              href={storeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-orange-600 hover:underline inline-flex items-center gap-0.5"
            >
              {L('Download di', 'Download on')} {platform === 'ios' ? 'App Store' : 'Play Store'}
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
            {L('Download di App Store', 'Download on the App Store')}
          </a>
          <a
            href={ANDROID_APP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 py-2.5 bg-neutral-900 text-white text-sm font-semibold rounded-xl hover:bg-neutral-800"
          >
            {L('Download di Play Store', 'Get it on Google Play')}
          </a>
        </div>
      )}
    </div>
  );
}
