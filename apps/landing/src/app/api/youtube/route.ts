/**
 * Data channel YouTube ECC untuk panel "Our YouTube Channel" (beranda).
 *
 *   GET /api/youtube                → { mode, categories }   (kategori = playlist)
 *   GET /api/youtube?playlist=ID    → { mode, videos }       (maks 50 video)
 *
 * mode "api"   : pakai YouTube Data API v3 (env YOUTUBE_API_KEY) — daftar video tampil.
 * mode "embed" : tanpa key — kategori bawaan, video diputar lewat pemutar playlist.
 * Cache 1 jam.
 */
import { NextResponse } from 'next/server';
import { FALLBACK_CATEGORIES, YT_CHANNEL_ID, type YtCategory, type YtVideo } from '@/lib/youtube';

export const revalidate = 3600;

const KEY = process.env.YOUTUBE_API_KEY;
const API = 'https://www.googleapis.com/youtube/v3';

async function yt<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API}/${path}&key=${KEY}`, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

type Thumbs = { maxres?: { url: string }; high?: { url: string }; medium?: { url: string }; default?: { url: string } };
const best = (t?: Thumbs) => t?.high?.url ?? t?.medium?.url ?? t?.default?.url ?? null;

export async function GET(req: Request) {
  const playlist = new URL(req.url).searchParams.get('playlist');
  if (!KEY) {
    return NextResponse.json(playlist ? { mode: 'embed', videos: null } : { mode: 'embed', categories: FALLBACK_CATEGORIES });
  }

  if (playlist) {
    if (!/^[\w-]{10,64}$/.test(playlist)) return NextResponse.json({ mode: 'api', videos: [] });
    const j = await yt<{ items: { snippet: { title: string; publishedAt: string; resourceId: { videoId: string }; thumbnails?: Thumbs }; contentDetails?: { videoPublishedAt?: string } }[] }>(
      `playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=${playlist}`,
    );
    if (!j) return NextResponse.json({ mode: 'embed', videos: null });
    const videos: YtVideo[] = j.items
      .filter((i) => !/^(Private|Deleted) video$/i.test(i.snippet.title))
      .map((i) => ({
        id: i.snippet.resourceId.videoId,
        title: i.snippet.title,
        published: i.contentDetails?.videoPublishedAt ?? i.snippet.publishedAt ?? null,
        thumb: best(i.snippet.thumbnails),
      }));
    return NextResponse.json({ mode: 'api', videos });
  }

  const j = await yt<{ items: { id: string; snippet: { title: string; thumbnails?: Thumbs }; contentDetails: { itemCount: number } }[] }>(
    `playlists?part=snippet,contentDetails&maxResults=50&channelId=${YT_CHANNEL_ID}`,
  );
  if (!j) return NextResponse.json({ mode: 'embed', categories: FALLBACK_CATEGORIES });
  // Urutan mengikuti daftar bawaan (kategori utama dulu), playlist baru di belakang.
  const order = new Map(FALLBACK_CATEGORIES.map((c, i) => [c.id, i]));
  const categories: YtCategory[] = j.items
    .filter((p) => p.contentDetails.itemCount > 0)
    .map((p) => ({ id: p.id, title: p.snippet.title, count: p.contentDetails.itemCount, thumb: best(p.snippet.thumbnails) }))
    .sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999));
  return NextResponse.json({ mode: 'api', categories });
}
