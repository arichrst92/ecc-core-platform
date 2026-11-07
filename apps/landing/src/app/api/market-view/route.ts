/**
 * Proxy hitung kunjungan Local Market dari web (2.4.7).
 * Browser → POST /api/market-view { id, itemId? } → BE /public/local-market/…/view
 * dengan IP asli pengunjung (header x-viewer-ip) untuk dedupe di server.
 */
import { NextResponse, type NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

const API_BASE = process.env.NEXT_PUBLIC_CORE_API_URL ?? 'https://api.eccchurch.global';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BOT = /bot|crawl|spider|preview|facebookexternalhit|whatsapp|telegram|slack|discord|embed/i;

export async function POST(req: NextRequest) {
  const ok = NextResponse.json({ success: true }, { headers: { 'cache-control': 'no-store' } });
  if (BOT.test(req.headers.get('user-agent') ?? '')) return ok;
  const body = (await req.json().catch(() => null)) as { id?: string; itemId?: string } | null;
  const id = body?.id ?? '';
  const itemId = body?.itemId;
  if (!UUID.test(id) || (itemId !== undefined && !UUID.test(itemId))) return ok;
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0]?.trim() || req.headers.get('x-real-ip') || '';
  const path = itemId ? `/public/local-market/${id}/item/${itemId}/view` : `/public/local-market/${id}/view`;
  await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'x-viewer-ip': ip },
    cache: 'no-store',
  }).catch(() => undefined);
  return ok;
}
