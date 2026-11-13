/**
 * Data detail untuk panel geser (klik kartu di halaman daftar).
 * Proxy ke API publik — browser tidak perlu akses langsung (tanpa CORS).
 */
import { NextResponse } from 'next/server';
import { apiGet } from '@/lib/api';

const PATHS: Record<string, (id: string) => string> = {
  news: (id) => `/public/news/${id}`,
  renungan: (id) => `/public/renungan/${id}`,
  event: (id) => `/public/event/${id}`,
  market: (id) => `/public/local-market/${id}`,
};

export async function GET(_req: Request, { params }: { params: { type: string; id: string } }) {
  const path = PATHS[params.type];
  if (!path || !/^[\w-]{1,200}$/.test(params.id)) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  const data = await apiGet<unknown>(path(encodeURIComponent(params.id)), { revalidate: 300 });
  if (!data) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ data });
}
