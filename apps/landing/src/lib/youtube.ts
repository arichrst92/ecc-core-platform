/**
 * Channel YouTube ECC (@ECCChurchChannel) untuk website.
 *
 * Kategori = playlist channel (sama dengan tab Playlists di YouTube).
 * - Dengan env YOUTUBE_API_KEY (YouTube Data API v3): daftar playlist & video
 *   diambil langsung (selalu terbaru, termasuk playlist baru).
 * - Tanpa key: memakai daftar playlist bawaan di bawah, video diputar lewat
 *   pemutar playlist YouTube (daftar video ada di dalam pemutar).
 * (RSS YouTube untuk channel ini mengembalikan 404, jadi tidak dipakai.)
 */
export type YtChannelKey = 'church' | 'worship';
export interface YtChannel {
  key: YtChannelKey;
  id: string;
  handle: string;
  name: string;
  url: string;
  /** Halaman di website. */
  path: string;
  /** Playlist "Uploads" = semua video channel ("UU" + ID channel tanpa "UC"). */
  uploads: string;
}
const ch = (key: YtChannelKey, id: string, handle: string, name: string, path: string): YtChannel => ({
  key,
  id,
  handle,
  name,
  url: `https://www.youtube.com/${handle}`,
  path,
  uploads: 'UU' + id.slice(2),
});
export const YT_CHANNELS: Record<YtChannelKey, YtChannel> = {
  church: ch('church', 'UCNdOfqF_of-ry2pw-iVeBpw', '@ECCChurchChannel', 'ECC Church', '/youtube'),
  worship: ch('worship', 'UC7blP5mNb-degA_A5vD6CeQ', '@ECCWorship', 'ECC Worship', '/youtube/worship'),
};
// Kompatibilitas: channel utama.
export const YT_CHANNEL_ID = YT_CHANNELS.church.id;
export const YT_CHANNEL_URL = YT_CHANNELS.church.url;
export const YT_UPLOADS = YT_CHANNELS.church.uploads;
/** Logo YouTube (Simple Icons, CC0). */
export const YOUTUBE_PATH =
  'M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z';

export interface YtCategory {
  id: string;
  title: string;
  count: number | null;
  thumb: string | null;
}
export interface YtVideo {
  id: string;
  title: string;
  published: string | null;
  thumb: string | null;
}

const T = (v: string) => `https://i.ytimg.com/vi/${v}/hqdefault.jpg`;

/** Snapshot playlist channel @ECCChurchChannel (14 Nov 2026) — dipakai bila tanpa API key. */
export const FALLBACK_CATEGORIES: YtCategory[] = [
  ['PLBJ6iS_VyLf991xBF0I2keApEUHM0eLAj', 'ECC Online Service', 'XK1XRtKNwGk', 336],
  ['PLBJ6iS_VyLf9_vm8aCc0zRzeptNSAM-gT', 'Sunday Sermons', 'lCPxlWAphzE', 3],
  ['PLBJ6iS_VyLf8giFTcHvI-uVmlKPzwTPF5', 'CKIDS Online Service', 'gAtXdqZdn58', 55],
  ['PL82ECD984C53E714C', 'Praise and Worship', '0r7piOVLrcw', 22],
  ['PLBJ6iS_VyLf-gTVZHeryEqwMX5GlFHPzX', 'Music Videos', 'PZW64Ncgqvc', 2],
  ['PLBJ6iS_VyLf-9VrLhUp6rzY0cM4NuIayo', '#Meandmybible - Book of Matthew', 'zqMnXVeiVqI', 29],
  ['PLBJ6iS_VyLf8JT7LPE09GHQICQzwG1KTB', 'ECC Bicara Bisnis', 't3Vml7i5RPY', 6],
  ['PL7BEBEDB35A8CD9E0', 'Testimony', 'Gq8eKu-YlmI', 27],
  ['PL02FF0D08C308C87A', 'ECC NEWS', 'LSURdOXqf1k', 185],
  ['PLBJ6iS_VyLf8LA1Ctx-kzdFTE6lsbiaIp', 'ECC Christmas 2020 - Restart', 'f9rIMQduaak', 2],
  ['PLBJ6iS_VyLf-1x__W8yKQfFxa7kk_qOrL', 'Usher Ministry', '5WujVrScnUY', 15],
  ['PLBJ6iS_VyLf_Ebf_7Wur4y9TuAmwIhbEc', 'Hoblers Award', 'tzcDfytFEcw', 22],
  ['PLBJ6iS_VyLf9OEA9U4Nfrt7BfuCO7jVw1', 'The Bridge Pelajar Spotlight', 'HR8quE4Ga_k', 19],
  ['PLFD9A37D6979D3DBF', 'ECC-The Bridge Pelajar Single Out', 'jdqIrvDl8LU', 7],
  ['PLBJ6iS_VyLf9zQb2mEQVodZOwFMaUJiWf', 'Behind The Scene', 'rC82GHb7930', 2],
  ['PLBJ6iS_VyLf-kVp0Vdsc3HdbSnHRwBaCD', 'Video Clip by ELSECC', 'HQ-hohEfjmg', 2],
  ['PLBJ6iS_VyLf_N10B6-VEGhShmxInAj7hB', 'h.o.p', 'piw7vr9d4xc', 1],
  ['PLB45C99797FACA0A7', 'Dance', '5Wc6RfAjDpk', 3],
  ['PLA5A0E81467EE73F9', 'Bumper', '2eNcpkxEQOw', 16],
  ['PL09CA6F9C366178FF', 'ECC Ads', 'DtJoud61hM0', 35],
].map(([id, title, v, count]) => ({ id: id as string, title: title as string, thumb: T(v as string), count: count as number }));

/** Snapshot playlist channel @ECCWorship (14 Nov 2026). */
export const FALLBACK_WORSHIP: YtCategory[] = [
  ['PLkTRB_XQWzigMptb4vGgdBkXSvlwZTBAi', 'Worship Session', 'hz8STK7IdDY', 11],
  ['PLkTRB_XQWzihqHboxNn2mg7VZbGNRQ2GM', 'Worship Session | ECC Worship', 'QyKnV71uHCY', 4],
  ['PLkTRB_XQWzigS9VYBWueYnSvHcC0vIFmR', 'Worship di Gunung', 'fbuFPbxf0Hg', 5],
  ['PLkTRB_XQWzii42N5q4OrgZzSmTKhgbMlK', 'Worship Experience 2025 - Ascend to The Mountain of The Lord', 'NfLYTQlf6Fk', 3],
  ['PLkTRB_XQWziix4x_llYmU3ZJkiULb3aWc', 'GiFest 2026', 'jl9FocMMzOE', 2],
  ['PLkTRB_XQWzijeWTjc40S4f2SEgg0-CCeY', 'ECC Worship Lyric Video', 'D2VNjTqkAuE', 8],
  ['PLkTRB_XQWziiAWQXrPqBIIq5vyLcUqr8b', 'PASSION // Official Playlist', 'ukil6Rs5yGY', 8],
  ['PLkTRB_XQWzigcE5PHIiHAmhit5jwLh0zR', 'GETSEMANI', 'EtFTK9tmohg', 6],
  ['PLkTRB_XQWzigINlj5l2Y8FdMcLIwqqQWk', 'ECC Worship - Christmas 2025', 'LLIXPELcEbM', 1],
  ['PLkTRB_XQWziiMdk66q1_05_fa9ZGAVbDW', 'ECC Worship - Christmas 2024', 'bd2Flsgn3DQ', 1],
  ['PLkTRB_XQWzii8Wn6onDpTDcuwO12ADHg-', 'ECC Global Worship Night', '9jZz7p1TkLs', 1],
  ['PLkTRB_XQWzij7BDQRvCVBWohh99nCoqs2', 'ECC Worship Kids', '3wAxV25DuMU', 2],
  ['PLkTRB_XQWzigiyZ07ZWdwJTBLRpr9ADPy', "Writer's Talk", 'tg_DTgM_MR8', 1],
  ['PLkTRB_XQWzijULzb9dII_9DPb_SVhQDuS', 'Shorts', 'Cau8WtM2JV0', 15],
].map(([id, title, v, count]) => ({ id: id as string, title: title as string, thumb: T(v as string), count: count as number }));

const FALLBACK: Record<YtChannelKey, YtCategory[]> = { church: FALLBACK_CATEGORIES, worship: FALLBACK_WORSHIP };

// ------------------------------------------------------------
//  Server: data channel (YouTube Data API v3 bila YOUTUBE_API_KEY ada)
// ------------------------------------------------------------
type Thumbs = { maxres?: { url: string }; high?: { url: string }; medium?: { url: string }; default?: { url: string } };
const bestThumb = (t?: Thumbs) => t?.high?.url ?? t?.medium?.url ?? t?.default?.url ?? null;

async function ytApi<T>(path: string, key: string): Promise<T | null> {
  try {
    const res = await fetch(`https://www.googleapis.com/youtube/v3/${path}&key=${key}`, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Semua video sebuah playlist (bertahap 50 per halaman, maks `max`). */
export async function playlistVideos(playlistId: string, key: string, max = 500): Promise<YtVideo[] | null> {
  const out: YtVideo[] = [];
  let token: string | undefined;
  for (let i = 0; i < Math.ceil(max / 50); i++) {
    const j = await ytApi<{
      nextPageToken?: string;
      items: { snippet: { title: string; publishedAt: string; resourceId: { videoId: string }; thumbnails?: Thumbs }; contentDetails?: { videoPublishedAt?: string } }[];
    }>(`playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=${playlistId}${token ? `&pageToken=${token}` : ''}`, key);
    if (!j) return out.length ? out : null;
    for (const it of j.items) {
      if (/^(Private|Deleted) video$/i.test(it.snippet.title)) continue;
      out.push({
        id: it.snippet.resourceId.videoId,
        title: it.snippet.title,
        published: it.contentDetails?.videoPublishedAt ?? it.snippet.publishedAt ?? null,
        thumb: bestThumb(it.snippet.thumbnails),
      });
    }
    token = j.nextPageToken;
    if (!token) break;
  }
  return out;
}

export interface YtChannelData {
  mode: 'api' | 'embed';
  categories: (YtCategory & { videos: YtVideo[] | null })[];
}

/** Kategori (playlist) + videonya. Tanpa key → kategori bawaan tanpa daftar video. */
export async function channelData(channel: YtChannelKey = 'church'): Promise<YtChannelData> {
  const key = process.env.YOUTUBE_API_KEY;
  const fallback = FALLBACK[channel];
  if (!key) return { mode: 'embed', categories: fallback.map((c) => ({ ...c, videos: null })) };
  const pl = await ytApi<{ items: { id: string; snippet: { title: string; thumbnails?: Thumbs }; contentDetails: { itemCount: number } }[] }>(
    `playlists?part=snippet,contentDetails&maxResults=50&channelId=${YT_CHANNELS[channel].id}`,
    key,
  );
  if (!pl) return { mode: 'embed', categories: fallback.map((c) => ({ ...c, videos: null })) };
  const order = new Map(fallback.map((c, i) => [c.id, i]));
  const cats = pl.items
    .filter((p) => p.contentDetails.itemCount > 0)
    .map((p) => ({ id: p.id, title: p.snippet.title, count: p.contentDetails.itemCount, thumb: bestThumb(p.snippet.thumbnails) }))
    .sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999));
  const withVideos = await Promise.all(cats.map(async (c) => ({ ...c, videos: await playlistVideos(c.id, key) })));
  return { mode: 'api', categories: withVideos };
}
