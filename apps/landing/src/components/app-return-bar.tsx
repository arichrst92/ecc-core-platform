'use client';

/**
 * Bar "Kembali ke Els App" untuk halaman yang dibuka dari aplikasi
 * (persembahan / giving). Muncul hanya kalau URL membawa `from=app`
 * (app native) atau `return=` (Els App web) — tersimpan di sessionStorage
 * supaya tetap muncul saat pindah halaman cabang.
 *
 *  - Els App web  → kembali ke URL `return` (origin di-whitelist).
 *  - iOS          → ecc://giving-done (Safari menawarkan "Buka di Els App").
 *  - Android      → intent ke paket app (fallback Play Store).
 */
import { useEffect, useState } from 'react';
import { useLang } from '@/components/lang-provider';
import { ArrowLeft } from 'lucide-react';

const KEY = 'els-app-return';
const WEB_APP_ORIGINS = ['https://elsapp.eccchurch.global', 'http://localhost:8081'];
const ANDROID_PKG = 'idea.eccchurch.global';
const PLAY_URL = `https://play.google.com/store/apps/details?id=${ANDROID_PKG}`;

type Mode = { kind: 'native' } | { kind: 'web'; url: string };

function readMode(): Mode | null {
  const q = new URLSearchParams(window.location.search);
  const ret = q.get('return');
  if (ret) {
    try {
      const u = new URL(ret);
      if (WEB_APP_ORIGINS.includes(u.origin)) return { kind: 'web', url: u.toString() };
    } catch {
      // abaikan
    }
  }
  if (q.get('from') === 'app') return { kind: 'native' };
  try {
    const saved = sessionStorage.getItem(KEY);
    return saved ? (JSON.parse(saved) as Mode) : null;
  } catch {
    return null;
  }
}

export function AppReturnBar() {
  const [mode, setMode] = useState<Mode | null>(null);
  const { L } = useLang();
  const [platform, setPlatform] = useState<'ios' | 'android' | 'other'>('other');

  useEffect(() => {
    const m = readMode();
    setMode(m);
    if (m) {
      try {
        sessionStorage.setItem(KEY, JSON.stringify(m));
      } catch {
        // abaikan
      }
    }
    const ua = navigator.userAgent;
    setPlatform(/android/i.test(ua) ? 'android' : /iphone|ipad|ipod|macintosh/i.test(ua) && 'ontouchend' in document ? 'ios' : 'other');
  }, []);

  if (!mode) return null;

  function back() {
    if (!mode) return;
    if (mode.kind === 'web') {
      window.location.href = mode.url;
      return;
    }
    if (platform === 'android') {
      window.location.href = `intent://giving-done#Intent;scheme=ecc;package=${ANDROID_PKG};S.browser_fallback_url=${encodeURIComponent(PLAY_URL)};end`;
      return;
    }
    window.location.href = 'ecc://giving-done';
  }

  return (
    <>
      {/* Bar atas — selalu terlihat */}
      <div className="sticky top-0 z-50 bg-neutral-900 text-white shadow-md">
        <button
          type="button"
          data-app-return
          onClick={back}
          className="max-w-3xl mx-auto w-full flex items-center gap-2 px-4 py-3 text-sm font-semibold"
        >
          <ArrowLeft className="w-4 h-4" />
          {L('Kembali ke Els App', 'Back to Els App')}
        </button>
      </div>
    </>
  );
}

/** Tombol besar di akhir halaman (sama fungsinya dengan bar atas). */
export function AppReturnFooter() {
  const [show, setShow] = useState(false);
  const { L } = useLang();
  useEffect(() => setShow(!!readMode()), []);
  if (!show) return null;
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 pb-10">
      <div className="bg-white border-2 border-orange-200 rounded-2xl p-5 text-center">
        <p className="text-sm text-neutral-600 mb-3">{L('Sudah selesai memberi? Terima kasih, Tuhan memberkati.', 'Done giving? Thank you, God bless you.')}</p>
        <AppReturnButton />
        <p className="text-[11px] text-neutral-400 mt-2">
          {L('Tombol tidak merespons? Tap ', 'Button not responding? Tap ')}
          <strong>◀ Els App</strong>
          {L(' di kiri atas (iPhone) atau tombol tutup / kembali di browser.', ' at the top left (iPhone) or the close / back button in your browser.')}
        </p>
      </div>
    </div>
  );
}

function AppReturnButton() {
  const { L } = useLang();
  return (
    <button
      type="button"
      onClick={() => {
        const btn = document.querySelector<HTMLButtonElement>('[data-app-return]');
        btn?.click();
      }}
      className="inline-flex items-center justify-center gap-2 w-full py-3 bg-brand-grad text-white font-semibold rounded-xl"
    >
      <ArrowLeft className="w-4 h-4" />
      {L('Kembali ke Els App', 'Back to Els App')}
    </button>
  );
}
