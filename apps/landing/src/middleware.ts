import { NextResponse, type NextRequest } from 'next/server';

/**
 * Coming-soon mode toggle.
 *
 * ENV: `LANDING_MODE=coming-soon` → semua route publik di-rewrite ke `/coming-soon`.
 * Nilai lain / kosong → landing normal.
 *
 * Assets, API, dan resource internal Next.js tidak ke-rewrite biar page tetap render.
 */
export function middleware(req: NextRequest) {
  const mode = process.env.LANDING_MODE ?? '';
  if (mode !== 'coming-soon') return NextResponse.next();

  const { pathname } = req.nextUrl;

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
    pathname.startsWith('/event/pembayaran/') ||
    /^\/event\/[^/]+\/(register|payment|pembayaran)/.test(pathname) ||
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
