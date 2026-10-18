import { NextResponse, type NextRequest } from 'next/server';
import { WA_COOKIE, WA_ERR_COOKIE } from './lib/web-action-cookies';

const API_BASE = process.env.NEXT_PUBLIC_CORE_API_URL ?? 'https://api.eccchurch.global';

/**
 * Web Action Token exchange (per backend-request-event-bebas-web-action-token.md).
 *
 * App membuka /bayar/event/{id}?wt={token} (versi lama: /event/{id}/pembayaran). Di sini (server-side):
 *   1. Tukar token → session web ke BE (/web-action/exchange)
 *   2. Simpan session di cookie httpOnly
 *   3. Redirect 302 ke URL yang sama TANPA ?wt (token tidak tersisa di history)
 * Kalau gagal (expired/sudah dipakai) → set cookie error singkat, halaman
 * tampil read-only + pesan "Sesi kedaluwarsa".
 */
async function handleWebActionToken(req: NextRequest): Promise<NextResponse | null> {
  const { pathname, searchParams } = req.nextUrl;
  const wt = searchParams.get('wt');
  if (!wt || !/^\/(event\/[^/]+\/pembayaran|bayar\/event\/[^/]+)\/?$/.test(pathname)) return null;

  const clean = req.nextUrl.clone();
  clean.searchParams.delete('wt');
  // Di belakang nginx, nextUrl bisa http — pakai proto asli dari proxy.
  if (req.headers.get('x-forwarded-proto') === 'https') clean.protocol = 'https:';

  const res = NextResponse.redirect(clean, 302);
  res.headers.set('Referrer-Policy', 'no-referrer');
  res.headers.set('Cache-Control', 'no-store');
  const secure = process.env.NODE_ENV === 'production';

  try {
    const r = await fetch(`${API_BASE}/web-action/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: wt }),
      cache: 'no-store',
    });
    if (r.ok) {
      const json = (await r.json()) as { data: { session: string; expiresIn: number } };
      res.cookies.set(WA_COOKIE, json.data.session, {
        httpOnly: true,
        secure,
        sameSite: 'lax',
        path: '/',
        maxAge: json.data.expiresIn,
      });
      res.cookies.delete(WA_ERR_COOKIE);
      return res;
    }
  } catch {
    // jatuh ke cookie error di bawah
  }
  res.cookies.set(WA_ERR_COOKIE, '1', { httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: 60 });
  return res;
}

/**
 * Coming-soon mode toggle.
 *
 * ENV: `LANDING_MODE=coming-soon` → semua route publik di-rewrite ke `/coming-soon`.
 * Nilai lain / kosong → landing normal.
 *
 * Assets, API, dan resource internal Next.js tidak ke-rewrite biar page tetap render.
 */
export async function middleware(req: NextRequest) {
  const waRes = await handleWebActionToken(req);
  if (waRes) return waRes;

  const mode = process.env.LANDING_MODE ?? '';
  if (mode !== 'coming-soon') return NextResponse.next();

  const { pathname } = req.nextUrl;

  // Bypass coming-soon untuk social media OG scrapers (WhatsApp, Facebook,
  // Twitter, LinkedIn, Slack, Telegram, Discord) supaya link preview tampil
  // konten actual (OG image, title, description) — bukan placeholder coming-soon.
  const ua = req.headers.get('user-agent') ?? '';
  const isSocialBot =
    /whatsapp|facebookexternalhit|facebot|twitterbot|linkedinbot|slackbot|telegrambot|discordbot|googlebot|bingbot|pinterest/i.test(
      ua,
    );
  if (isSocialBot) return NextResponse.next();

  // Whitelist: assets, Next internals, dan route yg WAJIB tetap live saat
  // coming-soon (mis. `/persembahan` untuk iOS App Store compliance,
  // `/.well-known/*` untuk Universal Links AASA + assetlinks).
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/.well-known/') ||
    pathname === '/coming-soon' ||
    pathname === '/persembahan' ||
    pathname.startsWith('/persembahan/') ||
    pathname === '/event/pembayaran' ||
    pathname.startsWith('/bayar/') ||
    pathname.startsWith('/event/pembayaran/') ||
    /^\/event\/[^/]+\/(register|payment|pembayaran)/.test(pathname) ||
    // Universal Link target: /event/{slug_or_uuid} harus live supaya "Kembali ke App"
    // tombol di payment page bisa trigger iOS Universal Link / Android App Link.
    // Kalau app NOT installed, user tetap bisa lihat detail event (bukan coming-soon).
    /^\/event\/[^/]+$/.test(pathname) ||
    pathname === '/privacy' ||
    pathname === '/terms' ||
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml' ||
    pathname === '/favicon.ico' ||
    /\.(webp|png|jpg|jpeg|svg|ico|css|js|woff2?|ttf|json|txt|xml)$/i.test(pathname)
  ) {
    return NextResponse.next();
  }

  const url = req.nextUrl.clone();
  url.pathname = '/coming-soon';
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
