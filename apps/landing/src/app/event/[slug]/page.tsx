/**
 * Link event (dibagikan dari Els App / web): eccchurch.global/event/:idOrSlug.
 * Tidak lagi halaman detail terpisah — tampil daftar event (sama dengan
 * /event) dengan side panel detail event ini langsung terbuka.
 * Metadata OG tetap per event supaya pratinjau link (WhatsApp, dll.) benar.
 */
import type { Metadata } from 'next';
import { apiGet, absoluteUrl } from '@/lib/api';
import { AutoOpenPanel } from '@/components/auto-open-panel';
import EventListPage from '../page';

interface EventDetail {
  id: string;
  slug: string;
  judul: string;
  ringkasan: string | null;
  deskripsi: string;
  heroImageUrl: string | null;
  videoUrl: string | null;
  tanggalMulai: string;
  tanggalSelesai: string | null;
  jamMulai: string | null;
  jamSelesai: string | null;
  lokasi: string | null;
  tipeBayar: string;
  nominal: string | null;
  qrisImageUrl: string | null;
  bankNama: string | null;
  bankNomor: string | null;
  bankAtasNama: string | null;
  tags: string[];
  viewCount: number;
  quotaPeserta?: number | null;
  pesertaCount?: number;
  cabang: { id: string; nama: string; timezone?: string | null } | null;
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const event = await apiGet<EventDetail>(`/public/event/${params.slug}`);
  if (!event) return { title: 'Event' };

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://eccchurch.global').replace(/\/$/, '');
  const url = `${siteUrl}/event/${event.slug}`;
  const ogImage = event.heroImageUrl ? absoluteUrl(event.heroImageUrl) : null;
  const description =
    event.ringkasan ??
    (event.deskripsi ? event.deskripsi.slice(0, 200).replace(/\s+/g, ' ').trim() : undefined);

  return {
    title: event.judul,
    description,
    openGraph: {
      type: 'article',
      title: event.judul,
      description,
      url,
      siteName: 'Elshaddai Creative Community',
      locale: 'id_ID',
      ...(ogImage
        ? {
            images: [
              {
                url: ogImage,
                width: 1200,
                height: 630,
                alt: event.judul,
              },
            ],
          }
        : {}),
    },
    twitter: {
      card: ogImage ? 'summary_large_image' : 'summary',
      title: event.judul,
      description,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
    alternates: { canonical: url },
  };
}

export default async function EventSharedPage({ params }: { params: { slug: string } }) {
  // Judul untuk panel (dari cache yang sama dengan metadata). Event tidak publik
  // / tidak ada → panel menampilkan pesan gagal memuat di atas daftar event.
  const event = await apiGet<EventDetail>(`/public/event/${params.slug}`);
  return (
    <>
      <EventListPage />
      <AutoOpenPanel type="event" id={event?.slug ?? params.slug} title={event?.judul} />
    </>
  );
}
