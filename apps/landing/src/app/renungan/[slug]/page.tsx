import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Calendar, BookOpen } from 'lucide-react';
import { apiGet } from '@/lib/api';
import { Markdown } from '@/components/markdown';

interface RenunganDetail {
  id: string;
  slug: string;
  judul: string;
  ringkasan: string | null;
  konten: string | null;
  ayatAlkitab: string | null;
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
    return { title: 'Renungan tidak ditemukan' };
  }
  return {
    title: item.judul,
    description: item.ringkasan ?? item.ayatAlkitab ?? undefined,
  };
}

export default async function RenunganDetailPage({ params }: PageProps) {
  const item = await apiGet<RenunganDetail>(
    `/public/renungan/${params.slug}`,
  );
  if (!item) notFound();

  return (
    <article className="py-12 lg:py-16">
      <div className="container-page max-w-3xl mx-auto">
        <Link
          href="/renungan"
          className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-brand-600 transition mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Semua renungan
        </Link>

        <div className="inline-flex items-center gap-2 px-3 py-1 mb-4 bg-brand-100 text-brand-700 rounded-full text-xs font-semibold uppercase tracking-wider">
          <BookOpen className="w-3.5 h-3.5" />
          Renungan
        </div>

        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-neutral-900 mb-3">
          {item.judul}
        </h1>

        {item.ayatAlkitab && (
          <p className="text-base font-semibold text-brand-600 mb-3">
            {item.ayatAlkitab}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3 text-sm text-neutral-500 mb-8 pb-8 border-b border-neutral-200">
          {item.tanggal && (
            <span className="inline-flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              {new Date(item.tanggal).toLocaleDateString('id-ID', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </span>
          )}
          <span>· {item.viewCount.toLocaleString('id-ID')} dibaca</span>
        </div>

        {item.ringkasan && (
          <p className="text-lg text-neutral-600 leading-relaxed mb-6">
            {item.ringkasan}
          </p>
        )}

        {item.konten ? (
          <Markdown content={item.konten} />
        ) : (
          <p className="text-neutral-500 italic">
            Isi renungan belum tersedia.
          </p>
        )}
      </div>
    </article>
  );
}
