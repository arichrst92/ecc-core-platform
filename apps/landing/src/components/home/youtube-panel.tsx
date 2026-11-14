'use client';

/**
 * Panel "Our YouTube Channel" (beranda) — video channel @ECCChurchChannel
 * dikelompokkan per kategori (playlist), sama seperti tab Playlists di YouTube.
 *
 * - Kategori "Terbaru" = semua unggahan channel.
 * - Mode "api" (server punya YOUTUBE_API_KEY): daftar video per kategori tampil,
 *   klik video → diputar di atas daftar.
 * - Mode "embed": pemutar playlist YouTube untuk kategori terpilih (daftar
 *   video ada di dalam pemutar) + tombol buka di YouTube.
 */
import { useEffect, useState } from 'react';
import { ExternalLink, ListVideo, Loader2, Play, PlaySquare } from 'lucide-react';
import { SlidePanel, PanelChip } from '@/components/slide-panel';
import { useLang } from '@/components/lang-provider';
import { localeOf } from '@/lib/i18n';
import { YT_CHANNEL_URL, YT_UPLOADS, type YtCategory, type YtVideo } from '@/lib/youtube';

/** Logo YouTube (Simple Icons, CC0). */
export const YOUTUBE_PATH =
  'M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z';

const embed = (q: string) => `https://www.youtube-nocookie.com/embed/${q}${q.includes('?') ? '&' : '?'}rel=0`;

export function YouTubePanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { lang, L } = useLang();
  const LATEST: YtCategory = { id: YT_UPLOADS, title: L('Terbaru', 'Latest'), count: null, thumb: null };
  const [mode, setMode] = useState<'api' | 'embed' | null>(null);
  const [cats, setCats] = useState<YtCategory[] | null>(null);
  const [sel, setSel] = useState<string>(YT_UPLOADS);
  const [videos, setVideos] = useState<Record<string, YtVideo[] | null>>({});
  const [playing, setPlaying] = useState<string | null>(null); // videoId

  // Kategori
  useEffect(() => {
    if (!open || cats) return;
    fetch('/api/youtube')
      .then((r) => r.json())
      .then((j) => {
        setMode(j.mode);
        setCats(j.categories ?? []);
      })
      .catch(() => {
        setMode('embed');
        setCats([]);
      });
  }, [open, cats]);

  // Video kategori terpilih (mode api)
  useEffect(() => {
    if (mode !== 'api' || sel in videos) return;
    setVideos((v) => ({ ...v, [sel]: null }));
    fetch(`/api/youtube?playlist=${encodeURIComponent(sel)}`)
      .then((r) => r.json())
      .then((j) => {
        if (j.mode === 'embed') setMode('embed');
        setVideos((v) => ({ ...v, [sel]: j.videos ?? [] }));
      })
      .catch(() => setVideos((v) => ({ ...v, [sel]: [] })));
  }, [mode, sel, videos]);

  const all = [LATEST, ...(cats ?? [])];
  const cur = all.find((c) => c.id === sel) ?? LATEST;
  const list = videos[sel];
  const fmt = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString(localeOf(lang), { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  const nowPlaying = playing ? list?.find((v) => v.id === playing) : null;

  const pick = (id: string) => {
    setSel(id);
    setPlaying(null);
  };

  const player = (src: string, caption: string) => (
    <section className="bg-white rounded-3xl border border-orange-100 overflow-hidden">
      <div className="relative aspect-video bg-black">
        <iframe
          key={src}
          src={src}
          title={caption}
          className="absolute inset-0 w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      </div>
      <p className="px-4 py-3 font-bold text-sm text-neutral-900 line-clamp-2">{caption}</p>
    </section>
  );

  return (
    <SlidePanel
      open={open}
      onClose={() => {
        setPlaying(null);
        onClose();
      }}
      Icon={PlaySquare}
      badge="YouTube"
      title="Our YouTube Channel"
      chips={
        <>
          <PanelChip strong>@ECCChurchChannel</PanelChip>
          <PanelChip>{L('Ibadah, khotbah & pujian ECC', 'ECC services, sermons & worship')}</PanelChip>
        </>
      }
      footer={
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => setPlaying('__all__')} className="btn-primary justify-center !px-3 text-sm">
            <ListVideo className="w-4 h-4" />
            {L('Putar kategori ini', 'Play this category')}
          </button>
          <a
            href={cur.id === YT_UPLOADS ? `${YT_CHANNEL_URL}/videos` : `https://www.youtube.com/playlist?list=${cur.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary justify-center !px-3 text-sm"
          >
            <ExternalLink className="w-4 h-4" />
            {L('Buka di YouTube', 'Open on YouTube')}
          </a>
        </div>
      }
    >
      {/* Kategori (playlist) */}
      <div className="-mx-5 px-5 flex gap-2 overflow-x-auto no-scrollbar pb-1">
        {cats === null ? (
          <span className="text-sm text-neutral-500 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> {L('Memuat kategori…', 'Loading categories…')}
          </span>
        ) : (
          all.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => pick(c.id)}
              className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold border transition ${
                sel === c.id ? 'bg-brand-grad text-white border-transparent shadow' : 'bg-white text-neutral-700 border-orange-100 hover:border-brand-300'
              }`}
            >
              {c.title}
              {c.count != null ? <span className={sel === c.id ? 'text-white/80' : 'text-neutral-400'}>{c.count}</span> : null}
            </button>
          ))
        )}
      </div>

      {/* Pemutar */}
      {playing === '__all__' || (mode === 'embed' && cats !== null)
        ? player(embed(`videoseries?list=${cur.id}${playing === '__all__' ? '&autoplay=1' : ''}`), cur.title)
        : nowPlaying
          ? player(embed(`${nowPlaying.id}?autoplay=1`), nowPlaying.title)
          : null}

      {mode === 'embed' && cats !== null ? (
        <p className="text-xs text-neutral-600 bg-white/80 rounded-2xl border border-orange-100 px-4 py-3">
          {L(
            'Daftar video kategori ini ada di dalam pemutar — ketuk ikon daftar putar di pojok kanan atas pemutar untuk memilih video.',
            'The videos in this category are inside the player — tap the playlist icon at the top right of the player to pick a video.',
          )}
        </p>
      ) : null}

      {/* Daftar video (mode api) */}
      {mode === 'api' ? (
        list === undefined || list === null ? (
          <div className="h-32 flex items-center justify-center text-neutral-500 gap-2">
            <Loader2 className="w-5 h-5 animate-spin" /> {L('Memuat video…', 'Loading videos…')}
          </div>
        ) : list.length === 0 ? (
          <section className="bg-white rounded-3xl border border-orange-100 p-5 text-sm text-neutral-600">
            {L('Belum ada video di kategori ini.', 'No videos in this category yet.')}
          </section>
        ) : (
          <div className="space-y-2">
            {list.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setPlaying(v.id)}
                className={`w-full text-left flex gap-3 rounded-2xl border p-2 transition group ${
                  playing === v.id ? 'border-brand-400 bg-brand-50' : 'bg-white border-orange-100 hover:border-brand-300'
                }`}
              >
                <span className="relative w-32 sm:w-36 aspect-video shrink-0 overflow-hidden rounded-xl bg-neutral-200">
                  {v.thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={v.thumb} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
                  ) : null}
                  <span className="absolute inset-0 flex items-center justify-center bg-black/10 group-hover:bg-black/25 transition">
                    <span className="w-8 h-8 rounded-full bg-white/90 text-brand-700 flex items-center justify-center shadow">
                      <Play className="w-4 h-4 fill-current" />
                    </span>
                  </span>
                </span>
                <span className="min-w-0 flex-1 py-0.5">
                  <span className="block text-sm font-bold text-neutral-900 leading-snug line-clamp-2">{v.title}</span>
                  <span className="block text-xs text-neutral-500 mt-1">{fmt(v.published)}</span>
                </span>
              </button>
            ))}
          </div>
        )
      ) : null}

      {/* Mode embed: kartu kategori dengan sampul */}
      {mode === 'embed' && cats && cats.length ? (
        <div className="grid grid-cols-2 gap-2 pt-1">
          {cats.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => pick(c.id)}
              className={`text-left rounded-2xl border overflow-hidden bg-white transition ${sel === c.id ? 'border-brand-400 ring-2 ring-brand-200' : 'border-orange-100 hover:border-brand-300'}`}
            >
              <span className="relative block aspect-video bg-neutral-200">
                {c.thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.thumb} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
                ) : null}
                {c.count != null ? (
                  <span className="absolute right-1.5 bottom-1.5 inline-flex items-center gap-1 rounded-md bg-black/75 px-1.5 py-0.5 text-[10px] font-bold text-white">
                    <ListVideo className="w-3 h-3" /> {c.count}
                  </span>
                ) : null}
              </span>
              <span className="block px-2.5 py-2 text-xs font-bold text-neutral-900 leading-snug line-clamp-2">{c.title}</span>
            </button>
          ))}
        </div>
      ) : null}
    </SlidePanel>
  );
}
