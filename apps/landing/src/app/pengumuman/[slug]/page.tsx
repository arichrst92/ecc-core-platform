/**
 * Halaman publik Announcement — eccchurch.global/pengumuman/:slug.
 * Dipakai sebagai pratinjau link WhatsApp (OG image = banner) dan untuk
 * jemaat yang membuka link tanpa app. Konten terpusat, lebar maks 600 px.
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ExternalLink, Megaphone, Smartphone } from 'lucide-react';
import { apiGet, absoluteUrl } from '@/lib/api';
import { Markdown } from '@/components/markdown';
import { getL } from '@/lib/i18n-server';

interface PublicAnnouncement {
  slug: string;
  judul: string;
  isi: string;
  bannerUrl: string | null;
  links: { label: string; url: string }[];
  sentAt: string | null;
}

const plain = (md: string) =>
  md
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[#*_~>`]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const a = await apiGet<PublicAnnouncement>(`/public/announcement/${encodeURIComponent(params.slug)}`, { revalidate: 300 });
  if (!a) return { title: 'Pengumuman' };
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://eccchurch.global').replace(/\/$/, '');
  const url = `${siteUrl}/pengumuman/${a.slug}`;
  const description = plain(a.isi).slice(0, 180);
  const og = a.bannerUrl ? absoluteUrl(a.bannerUrl) : `${siteUrl}/og-home.jpg`;
  return {
    title: a.judul,
    description,
    openGraph: {
      type: 'article',
      title: a.judul,
      description,
      url,
      siteName: 'Elshaddai Creative Community',
      locale: 'id_ID',
      images: og ? [{ url: og, width: 1280, height: 720, alt: a.judul }] : undefined,
    },
    twitter: { card: 'summary_large_image', title: a.judul, description, images: og ? [og] : undefined },
    alternates: { canonical: url },
  };
}

export default async function AnnouncementPublicPage({ params }: { params: { slug: string } }) {
  const { L } = getL();
  const a = await apiGet<PublicAnnouncement>(`/public/announcement/${encodeURIComponent(params.slug)}`, { revalidate: 300 });
  if (!a) notFound();
  const banner = a.bannerUrl ? absoluteUrl(a.bannerUrl) : null;
  const tanggal = a.sentAt
    ? new Date(a.sentAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' })
    : null;

  return (
    <div className="page-fabric min-h-[70vh] px-4 py-8 sm:py-12">
      <article className="mx-auto w-full max-w-[600px] bg-white rounded-3xl border border-orange-100 overflow-hidden shadow-[0_24px_48px_-32px_rgba(124,45,18,.5)]">
        {banner ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={banner} alt="" className="block w-full aspect-video object-cover max-h-[45vh]" />
        ) : null}
        <header className={banner ? 'px-6 pt-5' : 'hero-fabric text-white px-6 py-6'}>
          <p className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${banner ? 'text-brand-600' : 'text-white/90'}`}>
            <Megaphone className="w-4 h-4" /> {L('Pengumuman', 'Announcement')}
          </p>
          <h1 className={`mt-1 text-2xl font-extrabold leading-tight ${banner ? 'text-neutral-900' : ''}`}>{a.judul}</h1>
          {tanggal ? <p className={`mt-1 text-xs ${banner ? 'text-neutral-500' : 'text-white/80'}`}>{tanggal}</p> : null}
        </header>
        <div className="px-6 py-5">
          <Markdown content={a.isi} />
        </div>
        {a.links.length ? (
          <div className="px-6 pb-6 grid gap-2">
            {a.links.map((l) => (
              <a
                key={l.url + l.label}
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary w-full justify-center"
              >
                {l.label} <ExternalLink className="w-4 h-4" />
              </a>
            ))}
          </div>
        ) : null}
        <footer className="px-6 py-4 border-t border-orange-100 bg-[#FFFBF7] flex items-center gap-3">
          <Smartphone className="w-5 h-5 text-brand-600 shrink-0" />
          <p className="flex-1 text-xs text-neutral-600">
            {L('Dapatkan pengumuman & reservasi ibadah lewat Els App.', 'Get announcements and service reservations in Els App.')}
          </p>
          <a href="https://elsapp.eccchurch.global" target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-brand-700 hover:underline">
            {L('Buka Els App', 'Open Els App')}
          </a>
        </footer>
      </article>
    </div>
  );
}
