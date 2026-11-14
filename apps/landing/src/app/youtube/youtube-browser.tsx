'use client';

/**
 * Halaman YouTube: kategori (playlist) → seluruh video kategori dalam grid
 * satu halaman penuh; klik video → pemutar besar (lightbox). Cari judul.
 * Mode "embed" (tanpa API key): pemutar playlist kategori + kartu kategori.
 */
import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, ListVideo, Play, Search, X } from 'lucide-react';
import { useLang } from '@/components/lang-provider';
import { localeOf } from '@/lib/i18n';
import Link from 'next/link';
import { YT_CHANNELS, type YtCategory, type YtChannel, type YtVideo } from '@/lib/youtube';

type Cat = YtCategory & { videos: YtVideo[] | null };

const embed = (q: string) => `https://www.youtube-nocookie.com/embed/${q}${q.includes('?') ? '&' : '?'}rel=0`;

export function YoutubeBrowser({
  channel,
  mode,
  categories,
  latest,
}: {
  channel: YtChannel;
  mode: 'api' | 'embed';
  categories: Cat[];
  latest: YtVideo[] | null;
}) {
  const { lang, L } = useLang();
  const YT_UPLOADS = channel.uploads;
  const all: Cat[] = useMemo(
    () => [{ id: YT_UPLOADS, title: L('Terbaru', 'Latest'), count: latest?.length ?? null, thumb: null, videos: latest }, ...categories],
    [categories, latest, L],
  );
  const [sel, setSel] = useState<string>(YT_UPLOADS);
  // Kategori dari URL (?c=ID) — dibaca setelah mount supaya tidak beda dengan render server.
  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get('c');
    if (c && all.some((x) => x.id === c)) setSel(c);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [q, setQ] = useState('');
  const [playing, setPlaying] = useState<YtVideo | null>(null);
  const cur = all.find((c) => c.id === sel) ?? all[0]!;

  useEffect(() => {
    const u = new URL(window.location.href);
    if (sel === YT_UPLOADS) u.searchParams.delete('c');
    else u.searchParams.set('c', sel);
    window.history.replaceState(null, '', u);
  }, [sel]);
  useEffect(() => {
    if (!playing) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setPlaying(null);
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [playing]);

  const fmt = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString(localeOf(lang), { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  const videos = useMemo(() => {
    const v = cur.videos ?? [];
    const k = q.trim().toLowerCase();
    return k ? v.filter((x) => x.title.toLowerCase().includes(k)) : v;
  }, [cur, q]);
  const openUrl = cur.id === YT_UPLOADS ? `${channel.url}/videos` : `https://www.youtube.com/playlist?list=${cur.id}`;

  return (
    <div className="h-full min-h-0 flex flex-col gap-3">
      {/* Kategori + cari */}
      <div className="shrink-0 bg-white rounded-3xl border border-orange-100 shadow-[0_20px_40px_-30px_rgba(124,45,18,.55)] p-3 sm:p-4 space-y-3">
        {/* Pilih channel */}
        <div className="flex gap-1 rounded-2xl bg-[#FFF7ED] p-1 w-fit">
          {Object.values(YT_CHANNELS).map((c) => (
            <Link
              key={c.key}
              href={c.path}
              className={`rounded-xl px-3.5 py-1.5 text-sm font-bold transition ${
                c.key === channel.key ? 'bg-white text-brand-700 shadow-sm' : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              {c.handle}
            </Link>
          ))}
        </div>
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {all.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                setSel(c.id);
                setQ('');
              }}
              className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold border transition ${
                sel === c.id ? 'bg-brand-grad text-white border-transparent shadow' : 'bg-white text-neutral-700 border-orange-100 hover:border-brand-300'
              }`}
            >
              {c.title}
              {c.count != null ? <span className={`text-xs ${sel === c.id ? 'text-white/80' : 'text-neutral-400'}`}>{c.count}</span> : null}
            </button>
          ))}
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-extrabold text-neutral-900 truncate">{cur.title}</h2>
            <p className="text-xs text-neutral-500">
              {mode === 'api' ? `${videos.length} video` : L('Pilih video dari daftar di dalam pemutar', 'Pick a video from the list inside the player')}
            </p>
          </div>
          {mode === 'api' ? (
            <label className="flex items-center gap-2 rounded-2xl bg-[#FFFBF7] border border-orange-100 px-3 py-2 sm:w-72 focus-within:border-brand-300">
              <Search className="w-4 h-4 text-neutral-400 shrink-0" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={L('Cari judul video…', 'Search video title…')}
                className="w-full bg-transparent text-sm outline-none"
              />
            </label>
          ) : null}
          <a href={openUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary !py-2 text-sm justify-center shrink-0">
            <ExternalLink className="w-4 h-4" />
            {L('Buka di YouTube', 'Open on YouTube')}
          </a>
        </div>
      </div>

      {/* Isi kategori */}
      <div className="flex-1 min-h-0 overflow-y-auto rounded-3xl pb-2">
        {mode === 'api' && cur.videos ? (
          videos.length === 0 ? (
            <div className="bg-white rounded-3xl border border-orange-100 p-8 text-center text-sm text-neutral-600">
              {q ? L('Tidak ada video yang cocok.', 'No matching videos.') : L('Belum ada video di kategori ini.', 'No videos in this category yet.')}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
              {videos.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setPlaying(v)}
                  className="group text-left bg-white rounded-2xl border border-orange-100 overflow-hidden hover:border-brand-300 hover:shadow-[0_20px_40px_-28px_rgba(124,45,18,.6)] transition"
                >
                  <span className="relative block aspect-video bg-neutral-200">
                    {v.thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={v.thumb} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
                    ) : null}
                    <span className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/25 transition">
                      <span className="w-11 h-11 rounded-full bg-white/95 text-brand-700 flex items-center justify-center shadow opacity-90 group-hover:scale-110 transition">
                        <Play className="w-5 h-5 fill-current" />
                      </span>
                    </span>
                  </span>
                  <span className="block p-3">
                    <span className="block text-sm font-bold text-neutral-900 leading-snug line-clamp-2 group-hover:text-brand-700">{v.title}</span>
                    <span className="block text-xs text-neutral-500 mt-1">{fmt(v.published)}</span>
                  </span>
                </button>
              ))}
            </div>
          )
        ) : (
          /* Mode embed: pemutar playlist kategori + kartu kategori */
          <div className="grid lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-4">
            <section className="bg-white rounded-3xl border border-orange-100 overflow-hidden self-start">
              <div className="relative aspect-video bg-black">
                <iframe
                  key={cur.id}
                  src={embed(`videoseries?list=${cur.id}`)}
                  title={cur.title}
                  className="absolute inset-0 w-full h-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              </div>
              <p className="px-4 py-3 text-xs text-neutral-600">
                {L(
                  'Seluruh video kategori ini ada di daftar putar pemutar — ketuk ikon daftar di pojok kanan atas pemutar untuk memilih video.',
                  'All videos in this category are in the player’s playlist — tap the list icon at the top right of the player to pick a video.',
                )}
              </p>
            </section>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 gap-3 self-start">
              {categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSel(c.id)}
                  className={`text-left rounded-2xl border overflow-hidden bg-white transition ${
                    sel === c.id ? 'border-brand-400 ring-2 ring-brand-200' : 'border-orange-100 hover:border-brand-300'
                  }`}
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
          </div>
        )}
      </div>

      {/* Pemutar (lightbox) */}
      {playing ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-8" role="dialog" aria-modal="true" aria-label={playing.title}>
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
                src={embed(`${playing.id}?autoplay=1`)}
                title={playing.title}
                className="absolute inset-0 w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>
            <div className="mt-3 flex items-start justify-between gap-3 text-white">
              <div className="min-w-0">
                <p className="font-bold leading-snug">{playing.title}</p>
                <p className="text-xs text-white/70 mt-0.5">
                  {cur.title} · {fmt(playing.published)}
                </p>
              </div>
              <a
                href={`https://www.youtube.com/watch?v=${playing.id}`}
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
