'use client';

/**
 * Tombol "Kembali ke Els App" untuk halaman pembayaran event — tampilan sama
 * dengan halaman Persembahan (bar gelap di atas + kartu besar di akhir).
 *
 * Alur kembali (TIDAK diubah):
 *  - Els App web  → `?return=<url>` (origin di-whitelist) → kembali ke tab app.
 *  - App native   → `ecc://payment-done`: app membuka halaman ini lewat
 *    WebBrowser.openAuthSessionAsync dengan redirect `ecc://payment-done`,
 *    jadi browser (SFSafariViewController / Custom Tabs) tertutup otomatis
 *    dan pengguna kembali ke detail event di app.
 *  - Desktop (bukan dari app) → tidak ada bar; kartu akhir menampilkan unduh app.
 */
import { useEffect, useState } from 'react';
import { ArrowLeft, ExternalLink } from 'lucide-react';

import { useLang } from '@/components/lang-provider';
import { APP_STORE_URL as IOS_APP_URL, PLAY_STORE_URL as ANDROID_APP_URL } from '@/lib/app-links';

const WEB_APP_ORIGINS = ['https://elsapp.eccchurch.global', 'http://localhost:8081'];

type Mode = { kind: 'web'; url: string } | { kind: 'native'; platform: 'ios' | 'android' } | { kind: 'desktop' };

function readMode(): Mode {
  const raw = new URLSearchParams(window.location.search).get('return');
  if (raw) {
    try {
      const u = new URL(raw);
      if (WEB_APP_ORIGINS.includes(u.origin)) return { kind: 'web', url: u.toString() };
    } catch {
      // abaikan
    }
  }
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return { kind: 'native', platform: 'android' };
  if (/iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && 'ontouchend' in document)) return { kind: 'native', platform: 'ios' };
  return { kind: 'desktop' };
}

function goBack(mode: Mode) {
  if (mode.kind === 'web') window.location.href = mode.url;
  else if (mode.kind === 'native') window.location.href = 'ecc://payment-done';
}

function useMode(): Mode | null {
  const [mode, setMode] = useState<Mode | null>(null);
  useEffect(() => setMode(readMode()), []);
  return mode;
}

/** Bar gelap di atas — selalu terlihat (dari app native / web). */
export function EventReturnBar() {
  const mode = useMode();
  const { L } = useLang();
  if (!mode || mode.kind === 'desktop') return null;
  return (
    <div className="sticky top-0 z-50 bg-neutral-900 text-white shadow-md">
      <button
        type="button"
        onClick={() => goBack(mode)}
        className="max-w-3xl mx-auto w-full flex items-center gap-2 px-4 py-3 text-sm font-semibold"
      >
        <ArrowLeft className="w-4 h-4" />
        {L('Kembali ke Els App', 'Back to Els App')}
      </button>
    </div>
  );
}

/** Kartu besar di akhir halaman. `withSession` = daftar & upload bisa langsung di halaman ini. */
export function EventReturnFooter({ withSession }: { withSession: boolean }) {
  const mode = useMode();
  const { L } = useLang();
  if (!mode) return null;

  if (mode.kind === 'desktop') {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 pb-10">
        <div className="bg-white border-2 border-orange-200 rounded-2xl p-5 text-center">
          <p className="text-sm text-neutral-600 mb-3">
            {L(
              'Pendaftaran & upload bukti transfer dilakukan di Els App.',
              'Registration & receipt upload are done in Els App.',
            )}
          </p>
          <div className="grid sm:grid-cols-2 gap-2">
            <a href={IOS_APP_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 py-2.5 bg-neutral-900 text-white text-sm font-semibold rounded-xl hover:bg-neutral-800">
              {L('Download di App Store', 'Download on the App Store')}
            </a>
            <a href={ANDROID_APP_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 py-2.5 bg-neutral-900 text-white text-sm font-semibold rounded-xl hover:bg-neutral-800">
              {L('Download di Play Store', 'Get it on Google Play')}
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 pb-10">
      <div className="bg-white border-2 border-orange-200 rounded-2xl p-5 text-center">
        <p className="text-sm text-neutral-600 mb-3">
          {withSession
            ? L('Sudah mendaftar & upload bukti? Kembali ke Els App — status tampil di detail event.', 'Registered & uploaded your receipt? Go back to Els App — the status appears on the event details.')
            : L('Sudah transfer? Kembali ke Els App untuk upload bukti & konfirmasi pendaftaran.', 'Transferred already? Go back to Els App to upload the receipt & confirm registration.')}
        </p>
        <button
          type="button"
          onClick={() => goBack(mode)}
          className="inline-flex items-center justify-center gap-2 w-full py-3 bg-brand-grad text-white font-semibold rounded-xl"
        >
          <ArrowLeft className="w-4 h-4" />
          {L('Kembali ke Els App', 'Back to Els App')}
        </button>
        {mode.kind === 'native' ? (
          <>
            <p className="text-[11px] text-neutral-400 mt-2">
              {L('Tombol tidak merespons? Tap ', 'Button not responding? Tap ')}
              <strong>Done</strong>
              {L(' di pojok kanan atas atau ', ' in the top-right corner or ')}
              <strong>◀ Els App</strong>
              {L(' di kiri atas layar.', ' at the top left of the screen.')}
            </p>
            <p className="text-[11px] text-neutral-400 mt-1">
              {L('Belum install?', 'Not installed yet?')}{' '}
              <a
                href={mode.platform === 'ios' ? IOS_APP_URL : ANDROID_APP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-orange-600 hover:underline inline-flex items-center gap-0.5"
              >
                {L('Download di', 'Download on')} {mode.platform === 'ios' ? 'App Store' : 'Play Store'}
                <ExternalLink className="w-3 h-3" />
              </a>
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}
