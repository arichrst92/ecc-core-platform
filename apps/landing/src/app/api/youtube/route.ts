/**
 * Daftar video terbaru channel YouTube ECC (@ECCChurchChannel) dari RSS publik
 * YouTube (tanpa API key; berisi ±15 video terbaru). Cache 1 jam.
 */
import { NextResponse } from 'next/server';

export const revalidate = 3600;

const YT_CHANNEL_ID = 'UCNdOfqF_of-ry2pw-iVeBpw';

const decode = (s: string) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");

export async function GET() {
  try {
    const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${YT_CHANNEL_ID}`, {
      next: { revalidate: 3600 },
      headers: { 'User-Agent': 'Mozilla/5.0 (eccchurch.global)' },
    });
    if (!res.ok) return NextResponse.json({ data: [] }, { status: 200 });
    const xml = await res.text();
    const videos = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((m) => {
      const e = m[1]!;
      const pick = (re: RegExp) => re.exec(e)?.[1] ?? null;
      const id = pick(/<yt:videoId>([^<]+)<\/yt:videoId>/);
      return {
        id,
        title: decode(pick(/<title>([^<]*)<\/title>/) ?? ''),
        published: pick(/<published>([^<]+)<\/published>/),
        views: Number(pick(/<media:statistics views="(\d+)"/) ?? 0) || null,
        thumb: id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null,
      };
    });
    return NextResponse.json({ data: videos.filter((v) => v.id) });
  } catch {
    return NextResponse.json({ data: [] });
  }
}
