import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Calendar, BookOpen  } from 'lucide-react';
import { apiGet, absoluteUrl } from '@/lib/api';
import { Markdown } from '@/components/markdown';
import { getL, getT } from '@/lib/i18n-server';
import { localeOf } from '@/lib/i18n';
import { DetailShell, HeroChip } from '@/components/detail-shell';
import { DEFAULT_TZ, tzLabel } from '@/lib/tz';

interface RenunganDetail {
  id: string;
  slug: string;
  judul: string;
  ringkasan: string | null;
  konten: string | null;
  ayatAlkitab: string | null;
  heroImageUrl: string | null;
  tanggal: string | null;
  viewCount: number;
}

interface PageProps {
  params: { slug: string };
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const item = await apiGet<RenunganDetail>(
    `/public/renungan/${params.slug}`,
  );
  if (!item) {
    return { title: getL().L('Renungan tidak ditemukan', 'Devotional not found') };
  }

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://eccchurch.global').replace(/\/$/, '');
  const url = `${siteUrl}/renungan/${params.slug}`;
  // Pratinjau link: hero image renungan (3:2); logo ECC hanya bila belum ada gambar.
  const hero = absoluteUrl(item.heroImageUrl);
  const ogImage = hero ?? `${siteUrl}/logo-ecc.webp`;
  const description = item.ringkasan ?? item.ayatAlkitab ?? undefined;

  return {
    title: item.judul,
    description,
    openGraph: {
      type: 'article',
      title: item.judul,
      description,
      url,
      siteName: 'Elshaddai Creative Community',
      locale: 'id_ID',
      images: [hero ? { url: hero, width: 1200, height: 800, alt: item.judul } : { url: ogImage, alt: item.judul }],
    },
    twitter: {
      card: 'summary_large_image',
      title: item.judul,
      description,
      images: [ogImage],
    },
    alternates: { canonical: url },
  };
}

export default async function RenunganDetailPage({ params }: PageProps) {
  const { lang, t } = getT();
  const item = await apiGet<RenunganDetail>(
    `/public/renungan/${params.slug}`,
  );
  if (!item) notFound();

  return (
    <DetailShell
      backHref="/renungan"
      backLabel={t('nav.renungan')}
      Icon={BookOpen}
      badge={t('nav.renungan')}
      title={item.judul}
      image={item.heroImageUrl ? { src: absoluteUrl(item.heroImageUrl) ?? '', alt: item.judul } : null}
      meta={
        <>
          {item.ayatAlkitab ? <HeroChip strong>{item.ayatAlkitab}</HeroChip> : null}
          {item.tanggal ? (
            <span className="inline-flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              {new Date(item.tanggal).toLocaleDateString(localeOf(lang), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: DEFAULT_TZ })} · {tzLabel()}
            </span>
          ) : null}
          <span>
            · {item.viewCount.toLocaleString(localeOf(lang))} {t('dt.reads')}
          </span>
        </>
      }
    >
      {item.ringkasan ? <p className="text-lg text-neutral-600 leading-relaxed mb-6 italic border-l-4 border-brand-400 pl-4">{item.ringkasan}</p> : null}
      {item.konten ? <Markdown content={item.konten} /> : <p className="text-neutral-500 italic">{t('dt.noContent')}</p>}
    </DetailShell>
  );
}
