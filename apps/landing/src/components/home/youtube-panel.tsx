'use client';

/**
 * Panel "Our YouTube Channel" (beranda): pemutar + daftar video terbaru channel
 * @ECCChurchChannel. Data dari /api/youtube (RSS YouTube). Tombol "Putar semua"
 * memutar playlist seluruh unggahan channel; "Buka channel" ke YouTube.
 */
import { useEffect, useState } from 'react';
import { ExternalLink, ListVideo, Loader2, Play, PlaySquare } from 'lucide-react';
import { SlidePanel, PanelChip } from '@/components/slide-panel';
import { useLang } from '@/components/lang-provider';
import { localeOf } from '@/lib/i18n';

const CHANNEL_URL = 'https://www.youtube.com/@ECCChurchChannel';
// Playlist "Uploads" channel = "UU" + ID channel tanpa "UC".
const UPLOADS_LIST = 'UUNdOfqF_of-ry2pw-iVeBpw';

interface Video {
  id: string;
  title: string;
  published: string | null;
  views: number | null;
  thumb: string | null;
}

/** Logo YouTube (Simple Icons, CC0). */
export const YOUTUBE_PATH =
  'M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z';

export function YouTubePanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { lang, L } = useLang();
  const [videos, setVideos] = useState<Video[] | null>(null);
  const [playing, setPlaying] = useState<string | null>(null); // videoId | 'all'

  useEffect(() => {
    if (!open || videos) return;
    fetch('/api/youtube')
      .then((r) => r.json())
      .then((j) => setVideos(j.data ?? []))
      .catch(() => setVideos([]));
  }, [open, videos]);

  const fmt = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString(localeOf(lang), { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  const views = (n: number | null) =>
    n == null ? '' : `${new Intl.NumberFormat(localeOf(lang), { notation: 'compact' }).format(n)} ${L('kali ditonton', 'views')}`;

  const src =
    playing === 'all'
      ? `https://www.youtube-nocookie.com/embed/videoseries?list=${UPLOADS_LIST}&autoplay=1&rel=0`
      : playing
        ? `https://www.youtube-nocookie.com/embed/${playing}?autoplay=1&rel=0`
        : null;
  const current = playing && playing !== 'all' ? videos?.find((v) => v.id === playing) : null;

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
          <button type="button" onClick={() => setPlaying('all')} className="btn-primary justify-center !px-3 text-sm">
            <ListVideo className="w-4 h-4" />
            {L('Putar semua', 'Play all')}
          </button>
          <a href={CHANNEL_URL} target="_blank" rel="noopener noreferrer" className="btn-secondary justify-center !px-3 text-sm">
            <ExternalLink className="w-4 h-4" />
            {L('Buka channel', 'Open channel')}
          </a>
        </div>
      }
    >
      {src ? (
        <section className="bg-white rounded-3xl border border-orange-100 overflow-hidden">
          <div className="relative aspect-video bg-black">
            <iframe
              key={src}
              src={src}
              title={current?.title ?? 'ECC Church — YouTube'}
              className="absolute inset-0 w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          </div>
          <div className="px-4 py-3">
            <p className="font-bold text-sm text-neutral-900 line-clamp-2">
              {current?.title ?? L('Semua video ECC Church', 'All ECC Church videos')}
            </p>
            {current ? <p className="text-xs text-neutral-500 mt-0.5">{[fmt(current.published), views(current.views)].filter(Boolean).join(' · ')}</p> : null}
          </div>
        </section>
      ) : null}

      <h3 className="text-xs font-bold uppercase tracking-wider text-brand-700 px-1 pt-1">{L('Video terbaru', 'Latest videos')}</h3>

      {videos === null ? (
        <div className="h-40 flex items-center justify-center text-neutral-500 gap-2">
          <Loader2 className="w-5 h-5 animate-spin" /> {L('Memuat video…', 'Loading videos…')}
        </div>
      ) : videos.length === 0 ? (
        <section className="bg-white rounded-3xl border border-orange-100 p-5 text-sm text-neutral-600">
          {L('Daftar video belum bisa dimuat. Buka channel di YouTube untuk menonton.', "Couldn't load the video list. Open the channel on YouTube to watch.")}
        </section>
      ) : (
        <div className="space-y-2">
          {videos.map((v) => (
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
                <span className="block text-xs text-neutral-500 mt-1">{[fmt(v.published), views(v.views)].filter(Boolean).join(' · ')}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </SlidePanel>
  );
}
