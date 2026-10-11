/**
 * Proxy client → BE /web-action/*. Session ada di cookie httpOnly (tidak
 * bisa dibaca JS browser), jadi client panel memanggil route ini dan server
 * menambahkan header X-Web-Session.
 *
 * Whitelist path ketat — BE juga membatasi endpoint & scope event.
 */
import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { WA_COOKIE } from '@/lib/web-action-cookies';
import { WA_API_BASE } from '@/lib/web-action-server';

export const dynamic = 'force-dynamic';

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const ALLOWED: Array<{ method: string; re: RegExp }> = [
  { method: 'GET', re: /^session$/ },
  { method: 'GET', re: /^me\/family$/ },
  { method: 'GET', re: new RegExp(`^event/${UUID}/peserta/mine-and-family$`, 'i') },
  { method: 'POST', re: new RegExp(`^event/${UUID}/peserta/batch$`, 'i') },
  { method: 'POST', re: new RegExp(`^event/${UUID}/peserta/${UUID}/bukti$`, 'i') },
];

async function proxy(req: NextRequest, { params }: { params: { path: string[] } }) {
  const path = params.path.join('/');
  if (!ALLOWED.some((a) => a.method === req.method && a.re.test(path))) {
    return NextResponse.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'Not found' } },
      { status: 404 },
    );
  }

  const session = cookies().get(WA_COOKIE)?.value;
  if (!session) {
    return NextResponse.json(
      {
        success: false,
        error: { code: 'WEB_SESSION_EXPIRED', message: 'Sesi kedaluwarsa. Buka ulang dari Els App.' },
      },
      { status: 401 },
    );
  }

  const headers: Record<string, string> = { 'x-web-session': session };
  const contentType = req.headers.get('content-type');
  if (contentType) headers['content-type'] = contentType;

  const init: RequestInit = { method: req.method, headers, cache: 'no-store' };
  if (req.method !== 'GET') init.body = Buffer.from(await req.arrayBuffer());

  const r = await fetch(`${WA_API_BASE}/web-action/${path}`, init);
  const body = await r.text();
  return new NextResponse(body, {
    status: r.status,
    headers: {
      'content-type': r.headers.get('content-type') ?? 'application/json',
      'cache-control': 'no-store',
    },
  });
}

export const GET = proxy;
export const POST = proxy;
