'use client';

/**
 * Magic link verify page (portal web) — tombol "Masuk" di email login Els App.
 *
 * Email berisi link HTTPS ke halaman ini (?token=…), karena skema `ecc://`
 * diblokir sebagai link di banyak klien email. Halaman ini lalu membuka app.
 *
 * 2026-11 — "di beberapa browser magic link tidak bisa membuka app":
 *  - Chrome / Samsung Internet (Android) memblokir lompatan otomatis ke `ecc://`
 *    tanpa ketukan → sekarang Android memakai URL `intent://…` (didukung
 *    Chrome, Samsung Internet, Custom Tab Gmail) dengan cadangan otomatis ke
 *    Els App web bila app tidak terpasang / tidak bisa dibuka.
 *  - Browser di dalam aplikasi (Instagram, Facebook, LINE, WhatsApp, TikTok,
 *    WebView) tidak bisa membuka app lain sama sekali → tampil petunjuk
 *    "Buka di Chrome/Safari" + tombol salin link.
 *  - Selalu ada cadangan: "Masuk lewat Els App web" (elsapp.eccchurch.global),
 *    berlaku juga di komputer.
 * Token TIDAK dipakai di halaman ini (hanya diteruskan), jadi pemindai link
 * email yang membuka halaman lebih dulu tidak menghabiskan token.
 */
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertCircle, Check, Copy, ExternalLink, Globe, Loader2, Smartphone } from 'lucide-react';

const ANDROID_PACKAGE = 'idea.eccchurch.global';
const WEB_APP = 'https://elsapp.eccchurch.global';
const PLAY_URL = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;
const APPSTORE_URL = 'https://apps.apple.com/id/app/els-app/id6804400672';

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

type Env = { android: boolean; ios: boolean; inApp: boolean };

function detect(): Env {
  if (typeof navigator === 'undefined') return { android: false, ios: false, inApp: false };
  const ua = navigator.userAgent || '';
  const ios = /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && 'ontouchend' in document);
  const android = /android/i.test(ua);
  // Browser di dalam aplikasi lain — tidak bisa membuka aplikasi lain.
  const inApp =
    /FBAN|FBAV|FB_IAB|Instagram|Line\/|WhatsApp|Twitter|TikTok|musical_ly|Snapchat|MicroMessenger|; wv\)/i.test(ua) ||
    (ios && /GSA\//i.test(ua));
  return { android, ios, inApp };
}

function VerifyMagicLinkInner() {
  const params = useSearchParams();
  const token = params.get('token');
  const [env, setEnv] = useState<Env | null>(null);
  const [stillHere, setStillHere] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => setEnv(detect()), []);

  const links = useMemo(() => {
    if (!token) return null;
    const q = `token=${encodeURIComponent(token)}`;
    const web = `${WEB_APP}/auth/email/verify?${q}`;
    return {
      scheme: `ecc://auth/email/verify?${q}`,
      // Android: intent URL → app terpasang dibuka; bila tidak bisa → Els App web.
      intent: `intent://auth/email/verify?${q}#Intent;scheme=ecc;package=${ANDROID_PACKAGE};S.browser_fallback_url=${encodeURIComponent(web)};end`,
      web,
    };
  }, [token]);

  const openAppHref = links && env ? (env.android ? links.intent : links.scheme) : '';

  // Coba buka app otomatis (HP, bukan browser dalam aplikasi). Bila diblokir
  // browser, pengguna tinggal mengetuk tombol (ketukan selalu diizinkan).
  useEffect(() => {
    if (!env || !links || env.inApp || !(env.android || env.ios)) return;
    const t1 = setTimeout(() => {
      window.location.href = env.android ? links.intent : links.scheme;
    }, 300);
    // Masih di halaman ini setelah 2,5 dtk → app kemungkinan tidak terbuka.
    const t2 = setTimeout(() => {
      if (document.visibilityState === 'visible') setStillHere(true);
    }, 2500);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [env, links]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt('Salin link ini lalu buka di Chrome / Safari:', window.location.href);
    }
  }

  const mobile = !!env && (env.android || env.ios);

  return (
    <div className="min-h-screen fabric-cream flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg border border-neutral-200 p-6 sm:p-8">
        <div className="flex items-center gap-3 mb-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-ecc-church-square.webp" alt="" className="w-10 h-10 rounded-xl object-contain" />
          <div className="min-w-0">
            <h1 className="text-base font-semibold text-neutral-900">Masuk ke Els App</h1>
            <p className="text-xs text-neutral-500">Elshaddai Creative Community</p>
          </div>
        </div>

        {!token || !links ? (
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-900">Link tidak lengkap. Buka ulang link dari email, atau minta link baru di Els App.</p>
          </div>
        ) : !env ? (
          <div className="flex justify-center py-6">
            <Loader2 className="w-6 h-6 text-orange-500 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            {env.inApp ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm font-semibold text-amber-900">Buka di browser HP Anda</p>
                <p className="text-xs text-amber-900 mt-1 leading-relaxed">
                  Link ini terbuka di browser dalam aplikasi lain, yang tidak bisa membuka Els App. Ketuk menu{' '}
                  <b>⋮</b> / <b>•••</b> lalu pilih <b>Buka di {env.ios ? 'Safari' : 'Chrome'}</b> / <b>Open in browser</b> — atau salin link
                  di bawah dan tempel di {env.ios ? 'Safari' : 'Chrome'}.
                </p>
                <button
                  onClick={copyLink}
                  className="mt-3 w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-lg bg-white border border-amber-300 text-amber-900 text-sm font-semibold"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copied ? 'Link tersalin' : 'Salin link'}
                </button>
              </div>
            ) : mobile ? (
              <div className="text-center">
                <Smartphone className="w-10 h-10 text-orange-500 mx-auto mb-2" />
                <p className="text-sm font-medium text-neutral-900">Membuka Els App…</p>
                {env.ios ? (
                  <p className="text-xs text-neutral-500 mt-1">
                    Bila muncul pertanyaan <b>&quot;Buka di Els App?&quot;</b>, pilih <b>Buka</b> / <b>Open</b>.
                  </p>
                ) : (
                  <p className="text-xs text-neutral-500 mt-1">Bila app tidak terbuka sendiri, ketuk tombol di bawah.</p>
                )}
              </div>
            ) : (
              <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-lg p-3">
                <AlertCircle className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                <p className="text-sm text-blue-900">
                  Anda membuka link ini di komputer. Masuk lewat <b>Els App web</b> di bawah, atau buka email ini di HP lalu ketuk
                  tombolnya lagi.
                </p>
              </div>
            )}

            {mobile && !env.inApp ? (
              <a
                href={openAppHref}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-br from-orange-500 to-orange-700 text-white text-sm font-semibold shadow-sm"
              >
                <Smartphone className="w-4 h-4" />
                Buka di Els App
              </a>
            ) : null}

            <a
              href={links.web}
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold ${
                mobile && !env.inApp ? 'border border-orange-300 text-orange-700 hover:bg-orange-50' : 'bg-gradient-to-br from-orange-500 to-orange-700 text-white'
              }`}
            >
              <Globe className="w-4 h-4" />
              Masuk lewat Els App web
            </a>

            {stillHere && !env.inApp ? (
              <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-600 leading-relaxed">
                <p className="font-semibold text-neutral-800 mb-1">App tidak terbuka?</p>
                <ul className="list-disc pl-4 space-y-0.5">
                  <li>Pastikan Els App sudah terpasang dan versinya terbaru.</li>
                  <li>Bila browser memblokir, buka link email ini di {env.ios ? 'Safari' : 'Chrome'}.</li>
                  <li>Atau masuk lewat Els App web di atas — sama dengan app.</li>
                </ul>
                <a
                  href={env.ios ? APPSTORE_URL : PLAY_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-orange-700 font-semibold"
                >
                  Pasang / perbarui Els App <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            ) : null}

            <p className="text-[11px] text-neutral-400 text-center">Link berlaku 15 menit dan hanya bisa dipakai sekali.</p>
          </div>
        )}
      </div>
    </div>
  );
}
