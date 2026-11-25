'use client';

/** Video Channel: unggulan, kategori, cari, grid; klik → pemutar (lightbox). ?v=<id> membuka video. */
import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Play, Search, Star, X } from 'lucide-react';
import { useLang } from '@/components/lang-provider';
import { localeOf } from '@/lib/i18n';

export type VideoItem = {
  id: string;
  youtubeId: string;
  judul: string;
  deskripsi: string | null;
  kategori: { id: string; nama: string } | null;
  channelNama: string | null;
  isFeatured: boolean;
  thumbnailUrl: string;
  tayangAt: string;
};
export type VideoCatalog = { kategori: { id: string; nama: string }[]; featured: VideoItem[]; videos: VideoItem[]; total: number };

const embed = (id: string) => `https://www.youtube-nocookie.com/embed/${id}?rel=0&autoplay=1`;

export function VideoChannelBrowser({ data }: { data: VideoCatalog }) {
  const { lang, L } = useLang();
  const [kat, setKat] = useState('all');
  const [q, setQ] = useState('');
  const [playing, setPlaying] = useState<VideoItem | null>(null);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const v = p.get('v');
    const c = p.get('c');
    if (c && data.kategori.some((k) => k.id === c)) setKat(c);
    if (v) setPlaying(data.videos.find((x) => x.id === v) ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const u = new URL(window.location.href);
    if (kat === 'all') u.searchParams.delete('c');
    else u.searchParams.set('c', kat);
    if (playing) u.searchParams.set('v', playing.id);
    else u.searchParams.delete('v');
    window.history.replaceState(null, '', u);
  }, [kat, playing]);
  useEffect(() => {
    if (!playing) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setPlaying(null);
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [playing]);

  const fmt = (iso: string) => new Date(iso).toLocaleDateString(localeOf(lang), { day: 'numeric', month: 'short', year: 'numeric' });
  const videos = useMemo(() => {
    const k = q.trim().toLowerCase();
    return data.videos.filter((v) => (kat === 'all' || v.kategori?.id === kat) && (!k || v.judul.toLowerCase().includes(k)));
  }, [data, kat, q]);
  const showFeatured = kat === 'all' && !q.trim() && data.featured.length > 0;

  if (!data.total) {
    return <div className="bg-white rounded-3xl border border-orange-100 p-10 text-center text-sm text-neutral-600">{L('Belum ada video.', 'No videos yet.')}</div>;
  }

  const Card = ({ v, big }: { v: VideoItem; big?: boolean }) => (
    <button
      type="button"
      onClick={() => setPlaying(v)}
      className="group text-left bg-white rounded-2xl border border-orange-100 overflow-hidden hover:border-brand-300 hover:shadow-[0_20px_40px_-28px_rgba(124,45,18,.6)] transition"
    >
      <span className="relative block aspect-video bg-neutral-200">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={v.thumbnailUrl} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
        <span className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/25 transition">
          <span className={`${big ? 'w-14 h-14' : 'w-11 h-11'} rounded-full bg-white/95 text-brand-700 flex items-center justify-center shadow opacity-90 group-hover:scale-110 transition`}>
            <Play className="w-5 h-5 fill-current" />
          </span>
        </span>
      </span>
      <span className="block p-3">
        <span className={`block ${big ? 'text-base' : 'text-sm'} font-bold text-neutral-900 leading-snug line-clamp-2 group-hover:text-brand-700`}>{v.judul}</span>
        <span className="block text-xs text-neutral-500 mt-1">{[v.kategori?.nama, fmt(v.tayangAt)].filter(Boolean).join(' · ')}</span>
      </span>
    </button>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-white rounded-3xl border border-orange-100 shadow-[0_20px_40px_-30px_rgba(124,45,18,.55)] p-3 sm:p-4 space-y-3">
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {[{ id: 'all', nama: L('Semua', 'All') }, ...data.kategori].map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setKat(c.id)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold border transition ${
                kat === c.id ? 'bg-brand-grad text-white border-transparent shadow' : 'bg-white text-neutral-700 border-orange-100 hover:border-brand-300'
              }`}
            >
              {c.nama}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 rounded-2xl bg-[#FFFBF7] border border-orange-100 px-3 py-2 sm:w-80 focus-within:border-brand-300">
          <Search className="w-4 h-4 text-neutral-400 shrink-0" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={L('Cari judul video…', 'Search video title…')} className="w-full bg-transparent text-sm outline-none" />
        </label>
      </div>

      {showFeatured ? (
        <section>
          <h2 className="text-lg font-extrabold text-neutral-900 mb-2 flex items-center gap-1.5">
            <Star className="w-4 h-4 text-amber-500 fill-amber-400" /> {L('Unggulan', 'Featured')}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
            {data.featured.slice(0, 2).map((v) => (
              <Card key={v.id} v={v} big />
            ))}
          </div>
        </section>
      ) : null}

      <section>
        {showFeatured ? <h2 className="text-lg font-extrabold text-neutral-900 mb-2">{L('Terbaru', 'Latest')}</h2> : null}
        {videos.length === 0 ? (
          <div className="bg-white rounded-3xl border border-orange-100 p-8 text-center text-sm text-neutral-600">{L('Tidak ada video yang cocok.', 'No matching videos.')}</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
            {videos.map((v) => (
              <Card key={v.id} v={v} />
            ))}
          </div>
        )}
      </section>

      {playing ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-8" role="dialog" aria-modal="true" aria-label={playing.judul}>
          <div className="absolute inset-0 bg-neutral-950/80 backdrop-blur-sm" onClick={() => setPlaying(null)} />
          <div className="relative w-full max-w-5xl">
            <button
              type="button"
              onClick={() => setPlaying(null)}
              aria-label={L('Tutup', 'Close')}
              className="absolute -top-11 right-0 w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="relative aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl">
              <iframe
                src={embed(playing.youtubeId)}
                title={playing.judul}
                className="absolute inset-0 w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>
            <div className="mt-3 flex items-start justify-between gap-3 text-white">
              <div className="min-w-0">
                <p className="font-bold leading-snug">{playing.judul}</p>
                <p className="text-xs text-white/70 mt-0.5">{[playing.kategori?.nama, fmt(playing.tayangAt)].filter(Boolean).join(' · ')}</p>
                {playing.deskripsi ? <p className="text-sm text-white/85 mt-2 whitespace-pre-line line-clamp-4">{playing.deskripsi}</p> : null}
              </div>
              <a
                href={`https://www.youtube.com/watch?v=${playing.youtubeId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-white/15 hover:bg-white/25 px-3 py-1.5 text-xs font-semibold"
              >
                <ExternalLink className="w-3.5 h-3.5" /> YouTube
              </a>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
