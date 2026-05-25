import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { Calendar, User, Newspaper, ArrowRight } from 'lucide-react';
import { apiGet, absoluteUrl } from '@/lib/api';

export const metadata: Metadata = {
  title: 'News',
  description: 'Berita terbaru dari Elshaddai Creative Community.',
};

interface NewsItem {
  id: string;
  slug: string;
  judul: string;
  ringkasan: string | null;
  heroImageUrl: string | null;
  tanggal: string | null;
  tags: string[];
  cabang: { id: string; nama: string } | null;
  author: { namaLengkap: string } | null;
}

export default async function NewsListPage() {
  const news = (await apiGet<NewsItem[]>('/public/news?limit=20')) ?? [];

  return (
    <>
      {/* Hero */}
      <section className="bg-gradient-to-br from-brand-50 to-white py-12 lg:py-16">
        <div className="container-page text-center max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 mb-3 bg-brand-100 text-brand-700 rounded-full text-xs font-semibold uppercase tracking-wider">
            <Newspaper className="w-3.5 h-3.5" />
            News
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-neutral-900 mb-3">Berita Terbaru</h1>
          <p className="text-neutral-600">
            Kabar dan kegiatan terbaru dari ECC dan cabang-cabang gereja.
          </p>
        </div>
      </section>

      {/* List */}
      <section className="py-12">
        <div className="container-page max-w-5xl mx-auto">
          {news.length === 0 ? (
            <div className="text-center py-12 text-neutral-500 bg-neutral-50 border border-neutral-200 rounded-xl">
              Belum ada berita yang dipublikasikan. Kembali lagi nanti.
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {news.map((item) => (
                <Link
                  key={item.id}
                  href={`/news/${item.slug}`}
                  className="group bg-white border border-neutral-200 rounded-2xl overflow-hidden hover:shadow-lg transition"
                >
                  {item.heroImageUrl ? (
                    <div className="aspect-video relative bg-neutral-100">
                      <Image
                        src={absoluteUrl(item.heroImageUrl) ?? ''}
                        alt={item.judul}
                        fill
                        className="object-cover group-hover:scale-105 transition duration-500"
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      />
                    </div>
                  ) : (
                    <div className="aspect-video bg-gradient-to-br from-brand-100 to-accent-400/30 flex items-center justify-center">
                      <Newspaper className="w-12 h-12 text-brand-300" />
                    </div>
                  )}
                  <div className="p-5">
                    <h3 className="font-bold text-neutral-900 mb-2 group-hover:text-brand-600 transition line-clamp-2">
                      {item.judul}
                    </h3>
                    {item.ringkasan && (
                      <p className="text-sm text-neutral-600 line-clamp-2 mb-3">
                        {item.ringkasan}
                      </p>
                    )}
                    <div className="flex items-center gap-3 text-xs text-neutral-500">
                      {item.tanggal && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(item.tanggal).toLocaleDateString('id-ID', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </span>
                      )}
                      {item.cabang && <span>· {item.cabang.nama}</span>}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
