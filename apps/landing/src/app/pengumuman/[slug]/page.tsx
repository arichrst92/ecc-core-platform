/**
 * Halaman publik Announcement — eccchurch.global/pengumuman/:slug.
 * Dipakai sebagai pratinjau link WhatsApp (OG image = banner) dan untuk
 * jemaat yang membuka link tanpa app. Lebar penuh dengan kerangka detail yang
 * sama seperti Berita/Renungan (DetailShell): desktop = banner & tautan di kiri,
 * isi di kanan; HP = bertumpuk (banner → tautan → isi).
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Calendar, ExternalLink, Megaphone, Smartphone } from 'lucide-react';
import { DetailShell } from '@/components/detail-shell';
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
    <DetailShell
      backHref="/"
      backLabel={L('Beranda', 'Home')}
      Icon={Megaphone}
      badge={L('Pengumuman', 'Announcement')}
      title={a.judul}
      image={banner ? { src: banner, alt: a.judul, ratio: '16 / 9' } : null}
      meta={
        tanggal ? (
          <span className="flex items-center gap-1.5">
            <Calendar className="w-4 h-4" />
            {tanggal}
          </span>
        ) : null
      }
      aside={
        <div className="p-4 sm:p-5 grid gap-3">
          {a.links.map((l) => (
            <a
              key={l.url + l.label}
              href={l.url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary w-full justify-center text-center break-words"
            >
              {l.label} <ExternalLink className="w-4 h-4 shrink-0" />
            </a>
          ))}
          <div className={`flex items-center gap-3 ${a.links.length ? 'pt-3 border-t border-orange-100' : ''}`}>
            <Smartphone className="w-5 h-5 text-brand-600 shrink-0" />
            <p className="flex-1 min-w-0 text-xs text-neutral-600">
              {L('Dapatkan pengumuman & reservasi ibadah lewat Els App.', 'Get announcements and service reservations in Els App.')}
            </p>
            <a
              href="https://elsapp.eccchurch.global"
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-xs font-bold text-brand-700 hover:underline"
            >
              {L('Buka Els App', 'Open Els App')}
            </a>
          </div>
        </div>
      }
    >
      <Markdown content={a.isi} />
    </DetailShell>
  );
}
