import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import {
  Calendar,
  MapPin,
  Clock,
  Megaphone,
  CreditCard,
  Church,
} from 'lucide-react';
import { apiGet, absoluteUrl } from '@/lib/api';

export const metadata: Metadata = {
  title: 'Event',
  description: 'Acara mendatang Elshaddai Creative Community.',
};

interface EventItem {
  id: string;
  slug: string;
  judul: string;
  ringkasan: string | null;
  heroImageUrl: string | null;
  tanggalMulai: string;
  tanggalSelesai: string | null;
  jamMulai: string | null;
  jamSelesai: string | null;
  lokasi: string | null;
  tipeBayar: 'GRATIS' | 'NOMINAL_TETAP' | 'NOMINAL_BEBAS' | string;
  nominal: string | null;
  cabang: { id: string; nama: string } | null;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

const UNASSIGNED = '__unassigned__';

export default async function EventListPage() {
  const events = (await apiGet<EventItem[]>('/public/event?limit=50')) ?? [];

  // Group by cabang. Event tanpa cabang (sinode-level) masuk ke grup "Lintas Cabang".
  const groups = new Map<string, { nama: string; items: EventItem[] }>();
  for (const e of events) {
    const key = e.cabang?.id ?? UNASSIGNED;
    const nama = e.cabang?.nama ?? 'Lintas Cabang / Sinode';
    const bucket = groups.get(key) ?? { nama, items: [] };
    bucket.items.push(e);
    groups.set(key, bucket);
  }
  // Sort: cabang alphabetical, unassigned last
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
            <Megaphone className="w-3.5 h-3.5" />
            Event
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-neutral-900 mb-3">Acara Mendatang</h1>
          <p className="text-neutral-600">
            Event, retreat, conference, dan acara khusus yang akan datang —
            dikelompokkan per cabang.
          </p>
        </div>
      </section>

      <section className="py-12">
        <div className="container-page max-w-5xl mx-auto">
          {events.length === 0 ? (
            <div className="text-center py-12 text-neutral-500 bg-neutral-50 border border-neutral-200 rounded-xl">
              Belum ada event terjadwal. Kembali lagi nanti.
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
                        {items.length} event mendatang
                      </p>
                    </div>
                  </div>
                  <div className="space-y-4">
                    {items.map((e) => (
                      <Link
                        key={e.id}
                        href={`/event/${e.slug}`}
                        className="group flex flex-col sm:flex-row gap-5 bg-white border border-neutral-200 rounded-2xl overflow-hidden hover:shadow-lg transition"
                      >
                        {e.heroImageUrl ? (
                          <div className="sm:w-64 aspect-video sm:aspect-square relative bg-neutral-100 shrink-0">
                            <Image
                              src={absoluteUrl(e.heroImageUrl) ?? ''}
                              alt={e.judul}
                              fill
                              className="object-cover group-hover:scale-105 transition duration-500"
                              sizes="(max-width: 640px) 100vw, 256px"
                            />
                          </div>
                        ) : (
                          <div className="sm:w-64 aspect-video sm:aspect-square bg-gradient-to-br from-brand-100 to-accent-400/30 flex items-center justify-center shrink-0">
                            <Megaphone className="w-16 h-16 text-brand-300" />
                          </div>
                        )}
                        <div className="flex-1 p-5 sm:py-5 sm:pl-1 sm:pr-6 min-w-0">
                          <h3 className="font-bold text-xl text-neutral-900 mb-2 group-hover:text-brand-600 transition">
                            {e.judul}
                          </h3>
                          {e.ringkasan && (
                            <p className="text-sm text-neutral-600 mb-3 line-clamp-2">
                              {e.ringkasan}
                            </p>
                          )}
                          <div className="flex flex-wrap items-center gap-3 text-sm text-neutral-600 mb-3">
                            <span className="flex items-center gap-1.5">
                              <Calendar className="w-4 h-4 text-neutral-400" />
                              {formatDate(e.tanggalMulai)}
                              {e.tanggalSelesai && e.tanggalSelesai !== e.tanggalMulai
                                ? ` – ${formatDate(e.tanggalSelesai)}`
                                : ''}
                            </span>
                            {e.jamMulai && (
                              <span className="flex items-center gap-1.5">
                                <Clock className="w-4 h-4 text-neutral-400" />
                                {e.jamMulai}
                                {e.jamSelesai ? ` – ${e.jamSelesai}` : ''}
                              </span>
                            )}
                            {e.lokasi && (
                              <span className="flex items-center gap-1.5">
                                <MapPin className="w-4 h-4 text-neutral-400" />
                                <span className="truncate max-w-[200px]">{e.lokasi}</span>
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            {e.tipeBayar === 'GRATIS' ? (
                              <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded font-medium">
                                GRATIS
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-800 rounded font-medium">
                                <CreditCard className="w-3 h-3" />
                                {e.nominal
                                  ? `Rp ${Number(e.nominal).toLocaleString('id-ID')}`
                                  : 'Berbayar'}
                              </span>
                            )}
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-12 p-6 bg-brand-50 border border-brand-200 rounded-2xl text-center">
            <p className="text-sm text-brand-800 mb-3">
              Ingin daftar event atau lihat detail lengkap pendaftaran?
            </p>
            <a
              href="https://apps.apple.com/app/ecc-church"
              className="btn-primary text-sm"
            >
              Download Aplikasi ECC
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
