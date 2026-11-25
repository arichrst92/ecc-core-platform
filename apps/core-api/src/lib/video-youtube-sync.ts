/**
 * Sinkron Video Channel dari channel YouTube ECC (2026-12).
 *
 * - Sumber = playlist @ECCChurchChannel & @ECCWorship (+ "Semua unggahan" per channel).
 *   Playlist baru terdeteksi dalam keadaan NONAKTIF; admin Portal mencentang playlist
 *   yang diimpor dan memetakannya ke kategori. Video di beberapa playlist memakai
 *   kategori playlist dengan urutan terkecil.
 * - Video baru langsung Tayang. Yang dilewati: Shorts (video tegak / ≤ 60 detik /
 *   playlist bernama "Shorts"), siaran yang sedang/akan live, video privat, video
 *   yang tidak boleh disematkan, dan video yang pernah dihapus admin (VideoYoutubeIgnore).
 * - Rekaman live yang sudah selesai = video biasa.
 * - Video hasil sinkron yang dihapus/diprivat di YouTube otomatis disembunyikan
 *   (ytUnavailableAt) dan tampil lagi bila tersedia kembali.
 * - Data admin (judul, deskripsi, kategori, unggulan, draft) TIDAK ditimpa sinkron.
 *
 * Kuota YouTube Data API: ±1 unit per 50 item; satu sinkron penuh ±100 unit (kuota harian 10.000).
 * Butuh env YOUTUBE_API_KEY (root .env → ecosystem sharedEnv).
 */
import { prisma } from '@ecc/database';
import { logger } from './logger.js';

export const YT_SYNC_CHANNELS = [
  { key: 'church', id: 'UCNdOfqF_of-ry2pw-iVeBpw', nama: 'ECC Church', handle: '@ECCChurchChannel' },
  { key: 'worship', id: 'UC7blP5mNb-degA_A5vD6CeQ', nama: 'ECC Worship', handle: '@ECCWorship' },
] as const;

const API = 'https://www.googleapis.com/youtube/v3';
const MAX_ITEMS_PER_PLAYLIST = 2500;
const STALE_RUN_MS = 30 * 60_000;

export const youtubeKey = () => process.env.YOUTUBE_API_KEY?.trim() || null;

type Thumbs = { maxres?: { url: string }; high?: { url: string }; medium?: { url: string }; default?: { url: string } };
const bestThumb = (t?: Thumbs) => t?.high?.url ?? t?.medium?.url ?? t?.default?.url ?? null;

async function yt<T>(path: string): Promise<T> {
  const key = youtubeKey();
  if (!key) throw new Error('YOUTUBE_API_KEY belum diisi di server.');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20_000);
  try {
    const res = await fetch(`${API}/${path}${path.includes('?') ? '&' : '?'}key=${encodeURIComponent(key)}`, { signal: ctrl.signal });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: { message?: string; errors?: { reason?: string }[] } } | null;
      const reason = body?.error?.errors?.[0]?.reason;
      if (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded') throw new Error('Kuota harian YouTube API habis — sinkron dicoba lagi besok.');
      throw new Error(`YouTube API ${res.status}: ${body?.error?.message ?? res.statusText}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/** "PT1H2M3S" → detik. */
export function isoDurationSec(d: string | undefined): number {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(d ?? '');
  if (!m) return 0;
  return Number(m[1] ?? 0) * 86400 + Number(m[2] ?? 0) * 3600 + Number(m[3] ?? 0) * 60 + Number(m[4] ?? 0);
}

// ------------------------------------------------------------------ playlist

/** Ambil daftar playlist kedua channel → upsert VideoYoutubeSource. */
export async function refreshYoutubeSources(): Promise<{ total: number; baru: number }> {
  let baru = 0;
  let total = 0;
  const maxUrutan = (await prisma.videoYoutubeSource.aggregate({ where: { isUploads: false }, _max: { urutan: true } }))._max.urutan ?? 0;
  let next = maxUrutan + 1;
  for (const [ci, ch] of YT_SYNC_CHANNELS.entries()) {
    const seen: string[] = [];
    let token: string | undefined;
    for (let page = 0; page < 10; page++) {
      const j = await yt<{ nextPageToken?: string; items: { id: string; snippet: { title: string; thumbnails?: Thumbs }; contentDetails: { itemCount: number } }[] }>(
        `playlists?part=snippet,contentDetails&maxResults=50&channelId=${ch.id}${token ? `&pageToken=${token}` : ''}`,
      );
      for (const p of j.items) {
        seen.push(p.id);
        total++;
        const data = { judul: p.snippet.title.slice(0, 200), thumbnailUrl: bestThumb(p.snippet.thumbnails), itemCount: p.contentDetails.itemCount, missingAt: null };
        const ex = await prisma.videoYoutubeSource.findUnique({ where: { playlistId: p.id }, select: { id: true } });
        if (ex) await prisma.videoYoutubeSource.update({ where: { id: ex.id }, data });
        else {
          await prisma.videoYoutubeSource.create({ data: { ...data, channelKey: ch.key, channelId: ch.id, playlistId: p.id, urutan: next++ } });
          baru++;
        }
      }
      token = j.nextPageToken;
      if (!token) break;
    }
    // "Semua unggahan" channel — video yang tidak masuk playlist mana pun (prioritas terakhir).
    const uploads = 'UU' + ch.id.slice(2);
    const stat = await yt<{ items: { statistics?: { videoCount?: string } }[] }>(`channels?part=statistics&id=${ch.id}`);
    const count = Number(stat.items[0]?.statistics?.videoCount ?? 0);
    seen.push(uploads);
    await prisma.videoYoutubeSource.upsert({
      where: { playlistId: uploads },
      update: { itemCount: count, missingAt: null },
      create: { channelKey: ch.key, channelId: ch.id, playlistId: uploads, judul: `Semua unggahan — ${ch.nama}`, itemCount: count, isUploads: true, urutan: 100_000 + ci },
    });
    // Playlist yang sudah tidak ada di channel → ditandai (tidak disinkron).
    await prisma.videoYoutubeSource.updateMany({ where: { channelId: ch.id, playlistId: { notIn: seen }, missingAt: null }, data: { missingAt: new Date() } });
  }
  return { total, baru };
}

// ------------------------------------------------------------------ video

type PlItem = { snippet: { title: string; resourceId: { videoId: string } } };
type VidItem = {
  id: string;
  snippet: { title: string; description?: string; channelTitle?: string; publishedAt?: string; liveBroadcastContent?: string };
  contentDetails?: { duration?: string };
  status?: { privacyStatus?: string; embeddable?: boolean; uploadStatus?: string };
  player?: { embedWidth?: string | number; embedHeight?: string | number };
  liveStreamingDetails?: { actualStartTime?: string; actualEndTime?: string };
};

async function playlistVideoIds(playlistId: string): Promise<string[]> {
  const out: string[] = [];
  let token: string | undefined;
  while (out.length < MAX_ITEMS_PER_PLAYLIST) {
    const j = await yt<{ nextPageToken?: string; items: PlItem[] }>(
      `playlistItems?part=snippet&maxResults=50&playlistId=${playlistId}${token ? `&pageToken=${token}` : ''}`,
    );
    for (const it of j.items) {
      if (/^(Private|Deleted) video$/i.test(it.snippet.title)) continue;
      out.push(it.snippet.resourceId.videoId);
    }
    token = j.nextPageToken;
    if (!token) break;
  }
  return out;
}

async function videoDetails(ids: string[], parts: string): Promise<Map<string, VidItem>> {
  const map = new Map<string, VidItem>();
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const j = await yt<{ items: VidItem[] }>(`videos?part=${parts}&maxHeight=360&id=${chunk.join(',')}`);
    for (const v of j.items) map.set(v.id, v);
  }
  return map;
}

/** Alasan video dilewati (null = boleh diimpor). */
export function skipReason(v: VidItem | undefined, sourceTitle: string): string | null {
  if (!v) return 'tidak tersedia';
  if (v.status?.privacyStatus === 'private') return 'privat';
  if (v.status?.uploadStatus && v.status.uploadStatus !== 'processed') return 'belum selesai diproses';
  if (v.status?.embeddable === false) return 'tidak boleh disematkan';
  if (v.snippet.liveBroadcastContent && v.snippet.liveBroadcastContent !== 'none') return 'siaran live/terjadwal';
  const w = Number(v.player?.embedWidth ?? 0);
  const h = Number(v.player?.embedHeight ?? 0);
  if (w && h && h > w) return 'Shorts (video tegak)';
  const dur = isoDurationSec(v.contentDetails?.duration);
  if (dur > 0 && dur <= 60) return 'Shorts (≤ 60 detik)';
  if (/\bshorts?\b/i.test(sourceTitle)) return 'playlist Shorts';
  return null;
}

let running = false;
export const isYoutubeSyncRunning = () => running;

export type SyncResult = { added: number; skipped: number; hidden: number; restored: number; playlists: number };

/** Sinkron penuh: perbarui daftar playlist, impor video baru, sembunyikan yang hilang. */
export async function runYoutubeSync(trigger: 'AUTO' | 'MANUAL', byId?: string | null): Promise<SyncResult | null> {
  if (!youtubeKey()) return null;
  if (running) throw new Error('Sinkron sedang berjalan.');
  const stale = await prisma.videoSyncRun.findFirst({ where: { status: 'RUNNING', startedAt: { gt: new Date(Date.now() - STALE_RUN_MS) } } });
  if (stale) throw new Error('Sinkron sedang berjalan.');
  running = true;
  const run = await prisma.videoSyncRun.create({ data: { trigger, status: 'RUNNING', byId: byId ?? null } });
  const r: SyncResult = { added: 0, skipped: 0, hidden: 0, restored: 0, playlists: 0 };
  try {
    await refreshYoutubeSources();
    const sources = await prisma.videoYoutubeSource.findMany({ where: { isEnabled: true, missingAt: null }, orderBy: [{ urutan: 'asc' }] });
    r.playlists = sources.length;

    // videoId → playlist pertama (prioritas urutan)
    const pick = new Map<string, (typeof sources)[number]>();
    for (const s of sources) {
      const ids = await playlistVideoIds(s.playlistId);
      for (const id of ids) if (!pick.has(id)) pick.set(id, s);
    }
    const allIds = [...pick.keys()];
    const [existing, ignored] = await Promise.all([
      prisma.video.findMany({ where: { youtubeId: { in: allIds } }, select: { youtubeId: true } }),
      prisma.videoYoutubeIgnore.findMany({ where: { youtubeId: { in: allIds } }, select: { youtubeId: true } }),
    ]);
    const known = new Set([...existing, ...ignored].map((x) => x.youtubeId));
    const newIds = allIds.filter((id) => !known.has(id));

    if (newIds.length) {
      const det = await videoDetails(newIds, 'snippet,contentDetails,status,player,liveStreamingDetails');
      const rows = [];
      for (const id of newIds) {
        const s = pick.get(id)!;
        const v = det.get(id);
        if (skipReason(v, s.judul)) {
          r.skipped++;
          continue;
        }
        const when = v!.liveStreamingDetails?.actualStartTime ?? v!.snippet.publishedAt;
        rows.push({
          youtubeId: id,
          judul: v!.snippet.title.slice(0, 200),
          deskripsi: v!.snippet.description?.trim().slice(0, 5000) || null,
          kategoriId: s.kategoriId,
          channelNama: v!.snippet.channelTitle?.slice(0, 150) ?? null,
          isPublished: true,
          tayangAt: when ? new Date(when) : null,
          sumber: 'YOUTUBE',
          sourcePlaylistId: s.playlistId,
        });
      }
      if (rows.length) r.added = (await prisma.video.createMany({ data: rows, skipDuplicates: true })).count;
    }

    // Ketersediaan video hasil sinkron (dihapus/diprivat/tidak boleh disematkan di YouTube).
    const synced = await prisma.video.findMany({ where: { sumber: 'YOUTUBE' }, select: { id: true, youtubeId: true, isPublished: true, ytUnavailableAt: true } });
    const st = await videoDetails(
      synced.map((x) => x.youtubeId),
      'status',
    );
    const gone = synced.filter((x) => {
      const v = st.get(x.youtubeId);
      return !v || v.status?.privacyStatus === 'private' || v.status?.embeddable === false;
    });
    const goneIds = new Set(gone.map((x) => x.id));
    const hideIds = gone.filter((x) => !x.ytUnavailableAt).map((x) => x.id);
    if (hideIds.length) r.hidden = (await prisma.video.updateMany({ where: { id: { in: hideIds } }, data: { isPublished: false, ytUnavailableAt: new Date() } })).count;
    const back = synced.filter((x) => x.ytUnavailableAt && !goneIds.has(x.id)).map((x) => x.id);
    if (back.length) r.restored = (await prisma.video.updateMany({ where: { id: { in: back } }, data: { isPublished: true, ytUnavailableAt: null } })).count;

    await prisma.videoYoutubeSource.updateMany({ where: { id: { in: sources.map((s) => s.id) } }, data: { lastSyncedAt: new Date() } });
    await prisma.videoSyncRun.update({
      where: { id: run.id },
      data: {
        status: 'OK',
        finishedAt: new Date(),
        added: r.added,
        skipped: r.skipped,
        hidden: r.hidden,
        playlists: r.playlists,
        message: r.restored ? `${r.restored} video tersedia kembali` : null,
      },
    });
    return r;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err }, 'video youtube sync failed');
    await prisma.videoSyncRun.update({ where: { id: run.id }, data: { status: 'ERROR', finishedAt: new Date(), message: message.slice(0, 1000), ...r } }).catch(() => {});
    throw err;
  } finally {
    running = false;
  }
}

/** Job terjadwal (tiap 6 jam): hanya bila key ada & minimal satu playlist aktif. */
export async function youtubeSyncJob() {
  if (!youtubeKey()) return { skipped: 'no key' };
  const enabled = await prisma.videoYoutubeSource.count({ where: { isEnabled: true } });
  if (!enabled) return { skipped: 'no playlist enabled' };
  return runYoutubeSync('AUTO');
}
