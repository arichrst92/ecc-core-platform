import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Calendar, Tag, Newspaper } from 'lucide-react';
import { apiGet, absoluteUrl } from '@/lib/api';
import { Markdown } from '@/components/markdown';
import { getT } from '@/lib/i18n-server';
import { localeOf } from '@/lib/i18n';
import { DetailShell, HeroChip } from '@/components/detail-shell';
import { DEFAULT_TZ, tzLabel } from '@/lib/tz';

interface NewsDetail {
  id: string;
  slug: string;
  judul: string;
  ringkasan: string | null;
  konten: string;
  heroImageUrl: string | null;
  tanggal: string | null;
  tags: string[];
  viewCount: number;
  cabang: { id: string; nama: string; timezone?: string | null } | null;
  author: { namaLengkap: string } | null;
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const news = await apiGet<NewsDetail>(`/public/news/${params.slug}`);
  if (!news) return { title: 'News' };

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://eccchurch.global').replace(/\/$/, '');
  const url = `${siteUrl}/news/${params.slug}`;
  const ogImage = news.heroImageUrl ? absoluteUrl(news.heroImageUrl) : null;
  const description = news.ringkasan ?? undefined;

  return {
    title: news.judul,
    description,
    openGraph: {
      type: 'article',
      title: news.judul,
      description,
      url,
      siteName: 'Elshaddai Creative Community',
      locale: 'id_ID',
      ...(ogImage
        ? { images: [{ url: ogImage, width: 1200, height: 800, alt: news.judul }] }
        : {}),
    },
    twitter: {
      card: ogImage ? 'summary_large_image' : 'summary',
      title: news.judul,
      description,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
    alternates: { canonical: url },
  };
}

export default async function NewsDetailPage({
  params,
}: {
  params: { slug: string };
}) {
  const { lang, t } = getT();
  const news = await apiGet<NewsDetail>(`/public/news/${params.slug}`);
  if (!news) notFound();

  return (
    <DetailShell
      backHref="/news"
      backLabel={t('nav.news')}
      Icon={Newspaper}
      badge={t('nav.news')}
      title={news.judul}
      image={news.heroImageUrl ? { src: absoluteUrl(news.heroImageUrl) ?? '', alt: news.judul } : null}
      meta={
        <>
          {news.tanggal ? (
            <span className="flex items-center gap-1.5">
              <Calendar className="w-4 h-4" />
              {new Date(news.tanggal).toLocaleDateString(localeOf(lang), { day: 'numeric', month: 'long', year: 'numeric', timeZone: news.cabang?.timezone || DEFAULT_TZ })}{' '}
              · {tzLabel(news.cabang?.timezone)}
            </span>
          ) : null}
          {news.cabang ? <HeroChip>{news.cabang.nama}</HeroChip> : null}
        </>
      }
    >
      {news.ringkasan ? (
        <p className="text-lg text-neutral-700 leading-relaxed mb-6 font-medium border-l-4 border-brand-400 pl-4">{news.ringkasan}</p>
      ) : null}
      <Markdown content={news.konten} />
      {news.tags.length > 0 ? (
        <div className="mt-8 pt-5 border-t border-neutral-200 flex items-center gap-2 flex-wrap">
          <Tag className="w-4 h-4 text-brand-500" />
          {news.tags.map((tag) => (
            <span key={tag} className="px-2.5 py-0.5 bg-brand-50 text-brand-700 rounded-full text-xs font-semibold">
              {tag}
            </span>
          ))}
        </div>
      ) : null}
    </DetailShell>
  );
}
