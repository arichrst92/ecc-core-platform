/**
 * Petugas pelayanan satu pertemuan ibadah (panel di /ibadah).
 * Proxy ke API publik — browser tidak perlu akses langsung (tanpa CORS).
 */
import { NextResponse } from 'next/server';
import { apiGet } from '@/lib/api';

export async function GET(req: Request) {
  const u = new URL(req.url);
  const id = u.searchParams.get('id') ?? '';
  const tanggal = u.searchParams.get('tanggal') ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(id) || !/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }
  const data = await apiGet<unknown[]>(`/public/ibadah/${id}/petugas?tanggal=${tanggal}`, { revalidate: 300 });
  return NextResponse.json({ data: data ?? [] });
}
