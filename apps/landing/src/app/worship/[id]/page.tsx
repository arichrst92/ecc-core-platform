/**
 * Halaman share lagu ECC Worship — eccchurch.global/worship/:id
 * Tanpa lirik & tanpa audio (lagu hanya bisa didengar di Els App setelah login).
 * OG: cover album, nama lagu, nama album, pencipta.
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Headphones, Music } from 'lucide-react';
import { apiGet } from '@/lib/api';

interface WorshipShare {
  id: string;
  judul: string;
  ciptaan: string | null;
  tahun: number | null;
  durasi: number | null;
  album: { id: string; tipe: 'ALBUM' | 'SINGLE'; judul: string; coverUrl: string | null };
}

const URL_IOS = 'https://apps.apple.com/id/app/els-app/id6804400672';
const URL_ANDROID = 'https://play.google.com/store/apps/details?id=idea.eccchurch.global';

const subtitle = (s: WorshipShare) =>
  [s.album.tipe === 'SINGLE' ? 'Single' : `Album ${s.album.judul}`, s.ciptaan ? `Cipt. ${s.ciptaan}` : null].filter(Boolean).join(' · ');

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const s = await apiGet<WorshipShare>(`/public/worship/songs/${params.id}`);
  if (!s) return { title: 'ECC Worship' };
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://eccchurch.global').replace(/\/$/, '');
  const title = `${s.judul} — ECC Worship`;
  const description = `${subtitle(s)}. Dengarkan di Els App.`;
  const images = s.album.coverUrl ? [{ url: s.album.coverUrl, width: 1000, height: 1000, alt: s.judul }] : undefined;
  return {
    title,
    description,
    openGraph: {
      type: 'music.song',
      title,
      description,
      url: `${siteUrl}/worship/${s.id}`,
      siteName: 'Elshaddai Creative Community',
      locale: 'id_ID',
      ...(images ? { images } : {}),
    },
    twitter: { card: 'summary_large_image', title, description, ...(images ? { images: images.map((i) => i.url) } : {}) },
  };
}

export default async function WorshipSharePage({ params }: { params: { id: string } }) {
  const s = await apiGet<WorshipShare>(`/public/worship/songs/${params.id}`);
  if (!s) notFound();
  return (
    <main className="min-h-screen bg-gradient-to-b from-orange-50 to-white flex items-center justify-center px-5 py-16">
      <div className="w-full max-w-sm text-center">
        <div className="text-xs font-semibold tracking-wide text-orange-700 mb-4">ECC WORSHIP</div>
        <div className="mx-auto w-60 h-60 rounded-2xl overflow-hidden shadow-lg bg-orange-100 flex items-center justify-center">
          {s.album.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={s.album.coverUrl} alt={s.judul} className="w-full h-full object-cover" />
          ) : (
            <Music className="w-16 h-16 text-orange-300" />
          )}
        </div>
        <h1 className="mt-6 text-2xl font-bold text-neutral-900">{s.judul}</h1>
        <p className="mt-1 text-sm text-neutral-600">{s.album.tipe === 'SINGLE' ? 'Single' : `Album ${s.album.judul}`}</p>
        {s.ciptaan ? <p className="text-sm text-neutral-500">Cipt. {s.ciptaan}</p> : null}
        <a
          href={`ecc://worship/song/${s.id}`}
          className="mt-8 inline-flex items-center gap-2 px-6 py-3 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 text-white font-semibold shadow"
        >
          <Headphones className="w-5 h-5" /> Dengarkan di Els App
        </a>
        <p className="mt-3 text-xs text-neutral-500">Belum punya Els App? Unduh lalu masuk untuk mendengarkan.</p>
        <div className="mt-3 flex justify-center gap-3 text-sm">
          <a href={URL_IOS} className="px-4 py-2 rounded-lg border border-neutral-300 bg-white hover:bg-neutral-50">
            App Store
          </a>
          <a href={URL_ANDROID} className="px-4 py-2 rounded-lg border border-neutral-300 bg-white hover:bg-neutral-50">
            Google Play
          </a>
        </div>
      </div>
    </main>
  );
}
