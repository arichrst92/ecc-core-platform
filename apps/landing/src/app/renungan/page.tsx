import type { Metadata } from 'next';
import Link from 'next/link';
import { BookOpen, Calendar, ArrowRight } from 'lucide-react';
import { apiGet } from '@/lib/api';

export const metadata: Metadata = {
  title: 'Renungan',
  description:
    'Renungan harian dari Elshaddai Creative Community — firman Tuhan untuk perjalanan iman Anda.',
};

interface RenunganItem {
  id: string;
  slug: string;
  judul: string;
  ringkasan: string | null;
  ayatAlkitab: string | null;
  tanggal: string | null;
}

export default async function RenunganListPage() {
  const list = (await apiGet<RenunganItem[]>('/public/renungan?limit=30')) ?? [];

  return (
    <>
      <section className="bg-gradient-to-br from-brand-50 to-white py-12 lg:py-16">
        <div className="container-page text-center max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 mb-3 bg-brand-100 text-brand-700 rounded-full text-xs font-semibold uppercase tracking-wider">
            <BookOpen className="w-3.5 h-3.5" />
            Renungan
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-neutral-900 mb-3">
            Renungan Harian
          </h1>
          <p className="text-neutral-600">
            Firman Tuhan untuk menyegarkan iman dan menemani perjalanan harianmu.
          </p>
        </div>
      </section>

      <section className="py-12">
        <div className="container-page max-w-3xl mx-auto">
          {list.length === 0 ? (
            <div className="text-center py-12 text-neutral-500 bg-neutral-50 border border-neutral-200 rounded-xl">
              Belum ada renungan yang dipublikasikan.
            </div>
          ) : (
            <div className="space-y-4">
              {list.map((r) => (
                <Link
                  key={r.id}
                  href={`/renungan/${r.slug}`}
                  className="group block bg-white border border-neutral-200 rounded-2xl p-6 hover:shadow-md hover:border-brand-200 transition"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-brand-50 text-brand-500 rounded-xl flex items-center justify-center shrink-0">
                      <BookOpen className="w-6 h-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-lg text-neutral-900 group-hover:text-brand-600 transition mb-1">
                        {r.judul}
                      </h3>
                      {r.ayatAlkitab && (
                        <p className="text-xs font-medium text-brand-600 mb-2">
                          {r.ayatAlkitab}
                        </p>
                      )}
                      {r.ringkasan && (
                        <p className="text-sm text-neutral-600 line-clamp-2 mb-3">
                          {r.ringkasan}
                        </p>
                      )}
                      <div className="flex items-center justify-between gap-3">
                        {r.tanggal && (
                          <span className="text-xs text-neutral-500 inline-flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {new Date(r.tanggal).toLocaleDateString('id-ID', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </span>
                        )}
                        <span className="text-xs font-medium text-brand-600 inline-flex items-center gap-1 group-hover:gap-2 transition-all">
                          Baca selengkapnya
                          <ArrowRight className="w-3.5 h-3.5" />
                        </span>
                      </div>
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
