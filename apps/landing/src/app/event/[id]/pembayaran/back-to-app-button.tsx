'use client';

import { useEffect, useState } from 'react';
import { Smartphone, ExternalLink } from 'lucide-react';

const IOS_APP_URL = 'https://apps.apple.com/id/app/els-global-app/id6743088520';
const ANDROID_APP_URL = 'https://play.google.com/store/apps/details?id=idea.eccchurch.global';

export function BackToAppButton({ eventId }: { eventId: string }) {
  const [platform, setPlatform] = useState<'ios' | 'android' | 'other'>('other');
  const deepLink = `ecc://event/${eventId}`;

  useEffect(() => {
    const ua = navigator.userAgent;
    if (/android/i.test(ua)) setPlatform('android');
    else if (/iphone|ipad|ipod/i.test(ua)) setPlatform('ios');
  }, []);

  const storeUrl = platform === 'ios' ? IOS_APP_URL : ANDROID_APP_URL;
  const isMobile = platform !== 'other';

  return (
    <div className="bg-white border border-orange-100 rounded-2xl p-6 text-center">
      <Smartphone className="w-8 h-8 text-orange-500 mx-auto mb-3" />
      <h3 className="font-semibold text-neutral-900 mb-2">Kembali ke Aplikasi ECC</h3>
      <p className="text-xs text-neutral-500 mb-4">
        Setelah transfer, lanjutkan proses upload bukti & konfirmasi di aplikasi.
      </p>

      {isMobile ? (
        <div className="space-y-2">
          <a
            href={deepLink}
            className="inline-flex items-center justify-center gap-2 w-full py-3 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-semibold rounded-xl hover:shadow-lg transition"
          >
            Kembali ke ECC App
          </a>
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
  );
}
