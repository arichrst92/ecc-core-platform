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

  // Whitelist: assets & Next internals
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname === '/coming-soon' ||
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
