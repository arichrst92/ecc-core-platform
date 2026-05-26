import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import {
  Store,
  ExternalLink,
  MapPin,
  Building2,
  Church,
  ArrowRight,
} from 'lucide-react';
import { apiGet, absoluteUrl } from '@/lib/api';

export const metadata: Metadata = {
  title: 'Local Market',
  description:
    'Marketplace bisnis jemaat Elshaddai Creative Community — dukung sesama dengan berbelanja dari komunitas.',
};

interface LocalBusiness {
  id: string;
  nama: string;
  deskripsi: string | null;
  industri: string | null;
  tipeBisnis: 'B2C' | 'B2B' | 'B2B2C' | null;
  heroImageUrl: string | null;
  logoUrl: string | null;
  websiteUrl: string | null;
  whatsappUrl: string | null;
  isOnline: boolean;
  lokasi: string | null;
  // Owner sengaja tidak diambil/ditampilkan (privacy) — kecuali cabang
  // untuk keperluan grouping per cabang gereja.
  owner: { cabang: { id: string; nama: string } | null } | null;
}

const UNASSIGNED = '__unassigned__';

export default async function LocalMarketPage() {
  // limit max 50 per public schema (publicLocalMarketQuerySchema). Request
  // limit=100 akan ditolak Zod dengan 400. Untuk landing showcase 50 sudah
  // cukup — kalau perlu lebih, expand schema.max() di shared-types.
  const list =
    (await apiGet<LocalBusiness[]>('/public/local-market?limit=50')) ?? [];

  // Group by cabang gereja. Bisnis tanpa cabang/owner masuk ke "Lainnya".
  const groups = new Map<string, { nama: string; items: LocalBusiness[] }>();
  for (const b of list) {
    const cabang = b.owner?.cabang;
    const key = cabang?.id ?? UNASSIGNED;
    const nama = cabang?.nama ?? 'Lainnya';
    const bucket = groups.get(key) ?? { nama, items: [] };
    bucket.items.push(b);
    groups.set(key, bucket);
  }
  const groupsSorted = [...groups.entries()].sort(([ka, va], [kb, vb]) => {
    if (ka === UNASSIGNED) return 1;
    if (kb === UNASSIGNED) return -1;
    return va.nama.localeCompare(vb.nama);
  });

  return (
    <>
      <section className="bg-gradient-to-br from-brand-50 to-white py-12 lg:py-16">
        <div className="container-page text-center max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 mb-3 bg-brand-100 text-brand-700 rounded-full text-xs font-semibold uppercase tracking-wider">
            <Store className="w-3.5 h-3.5" />
            Local Market
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-neutral-900 mb-3">
            Marketplace Komunitas ECC
          </h1>
          <p className="text-neutral-600">
            Dukung bisnis jemaat — dikelompokkan per cabang gereja.
          </p>
        </div>
      </section>

      <section className="py-12">
        <div className="container-page max-w-6xl mx-auto">
          {list.length === 0 ? (
            <div className="text-center py-12 text-neutral-500 bg-neutral-50 border border-neutral-200 rounded-xl">
              Belum ada bisnis terdaftar. Kembali lagi nanti.
            </div>
          ) : (
            <div className="space-y-12">
              {groupsSorted.map(([key, { nama, items }]) => (
                <div key={key}>
                  <div className="flex items-center gap-3 mb-5 pb-3 border-b border-neutral-200">
                    <div className="w-10 h-10 bg-brand-100 text-brand-600 rounded-lg flex items-center justify-center shrink-0">
                      <Church className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h2 className="font-bold text-xl text-neutral-900 leading-tight">{nama}</h2>
                      <p className="text-xs text-neutral-500">
                        {items.length} bisnis terdaftar
                      </p>
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {items.map((b) => (
                      <Link
                        key={b.id}
                        href={`/local-market/${b.id}`}
                        className="group bg-white border border-neutral-200 rounded-2xl overflow-hidden hover:shadow-lg hover:border-brand-200 transition flex flex-col"
                      >
                        {b.heroImageUrl ? (
                          <div className="aspect-video relative bg-neutral-100">
                            <Image
                              src={absoluteUrl(b.heroImageUrl) ?? ''}
                              alt={b.nama}
                              fill
                              className="object-cover group-hover:scale-105 transition duration-500"
                              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                            />
                          </div>
                        ) : (
                          <div className="aspect-video bg-gradient-to-br from-brand-100 to-accent-400/30 flex items-center justify-center">
                            <Store className="w-12 h-12 text-brand-300" />
                          </div>
                        )}
                        <div className="p-5 flex flex-col flex-1">
                          <div className="flex items-start gap-3 mb-2">
                            {b.logoUrl && (
                              <div className="w-10 h-10 relative shrink-0 rounded-lg overflow-hidden bg-neutral-100 border border-neutral-200">
                                <Image
                                  src={absoluteUrl(b.logoUrl) ?? ''}
                                  alt={`${b.nama} logo`}
                                  fill
                                  className="object-cover"
                                  sizes="40px"
                                />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <h3 className="font-bold text-neutral-900 leading-tight group-hover:text-brand-600 transition">
                                {b.nama}
                              </h3>
                              {b.industri && (
                                <p className="text-xs text-neutral-500 mt-0.5">{b.industri}</p>
                              )}
                            </div>
                          </div>

                          {b.deskripsi && (
                            <p className="text-sm text-neutral-600 line-clamp-3 mb-3">
                              {b.deskripsi}
                            </p>
                          )}

                          <div className="flex flex-wrap items-center gap-2 mb-4 text-xs text-neutral-500">
                            {b.tipeBisnis && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-neutral-100">
                                <Building2 className="w-3 h-3" />
                                {b.tipeBisnis}
                              </span>
                            )}
                            {b.isOnline && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand-50 text-brand-700">
                                Online
                              </span>
                            )}
                            {b.lokasi && (
                              <span className="inline-flex items-center gap-1">
                                <MapPin className="w-3 h-3" />
                                {b.lokasi}
                              </span>
                            )}
                          </div>

                          <div className="mt-auto flex items-center justify-end text-xs font-medium text-brand-600 gap-1 group-hover:gap-2 transition-all">
                            Lihat detail
                            <ArrowRight className="w-3.5 h-3.5" />
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-12 p-6 bg-neutral-50 border border-neutral-200 rounded-2xl text-center">
            <Store className="w-10 h-10 mx-auto mb-3 text-brand-500" />
            <p className="text-sm text-neutral-700 mb-3">
              Punya bisnis dan ingin tampil di Local Market? Daftar via aplikasi ECC.
            </p>
            <a
              href="https://apps.apple.com/app/ecc-church"
              className="btn-primary text-sm"
            >
              Download Aplikasi ECC
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
