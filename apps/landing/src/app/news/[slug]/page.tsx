import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Calendar, User, ArrowLeft, Tag } from 'lucide-react';
import { apiGet, absoluteUrl } from '@/lib/api';
import { Markdown } from '@/components/markdown';

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
  cabang: { id: string; nama: string } | null;
  author: { namaLengkap: string } | null;
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const news = await apiGet<NewsDetail>(`/public/news/${params.slug}`);
  if (!news) return { title: 'News' };
  return {
    title: news.judul,
    description: news.ringkasan ?? undefined,
    openGraph: news.heroImageUrl
      ? { images: [absoluteUrl(news.heroImageUrl) ?? ''] }
      : undefined,
  };
}

export default async function NewsDetailPage({
  params,
}: {
  params: { slug: string };
}) {
  const news = await apiGet<NewsDetail>(`/public/news/${params.slug}`);
  if (!news) notFound();

  return (
    <article className="py-8 lg:py-12">
      <div className="container-page max-w-3xl mx-auto">
        <Link
          href="/news"
          className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-brand-600 mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Kembali ke News
        </Link>

        <h1 className="text-3xl sm:text-4xl font-bold text-neutral-900 leading-tight mb-4">
          {news.judul}
        </h1>

        <div className="flex flex-wrap items-center gap-4 text-sm text-neutral-500 mb-6">
          {news.tanggal && (
            <span className="flex items-center gap-1.5">
              <Calendar className="w-4 h-4" />
              {new Date(news.tanggal).toLocaleDateString('id-ID', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </span>
          )}
          {news.author && (
            <span className="flex items-center gap-1.5">
              <User className="w-4 h-4" />
              {news.author.namaLengkap}
            </span>
          )}
          {news.cabang && (
            <span className="px-2 py-0.5 bg-brand-50 text-brand-700 rounded text-xs font-medium">
              {news.cabang.nama}
            </span>
          )}
        </div>

        {news.heroImageUrl && (
          <div className="aspect-video relative bg-neutral-100 rounded-2xl overflow-hidden mb-8">
            <Image
              src={absoluteUrl(news.heroImageUrl) ?? ''}
              alt={news.judul}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 768px"
              priority
            />
          </div>
        )}

        {news.ringkasan && (
          <p className="text-lg text-neutral-700 leading-relaxed mb-8 font-medium border-l-4 border-brand-300 pl-4">
            {news.ringkasan}
          </p>
        )}

        <Markdown content={news.konten} />

        {news.tags.length > 0 && (
          <div className="mt-8 pt-6 border-t border-neutral-200">
            <div className="flex items-center gap-2 flex-wrap">
              <Tag className="w-4 h-4 text-neutral-400" />
              {news.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2.5 py-0.5 bg-neutral-100 text-neutral-700 rounded text-xs"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </article>
  );
}
