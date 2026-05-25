import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  Calendar,
  Clock,
  MapPin,
  CreditCard,
  ArrowLeft,
  Tag,
  Smartphone,
  PlayCircle,
} from 'lucide-react';
import { apiGet, absoluteUrl } from '@/lib/api';
import { Markdown } from '@/components/markdown';

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
  cabang: { id: string; nama: string } | null;
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const event = await apiGet<EventDetail>(`/public/event/${params.slug}`);
  if (!event) return { title: 'Event' };
  return {
    title: event.judul,
    description: event.ringkasan ?? undefined,
    openGraph: event.heroImageUrl
      ? { images: [absoluteUrl(event.heroImageUrl) ?? ''] }
      : undefined,
  };
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default async function EventDetailPage({
  params,
}: {
  params: { slug: string };
}) {
  const event = await apiGet<EventDetail>(`/public/event/${params.slug}`);
  if (!event) notFound();

  return (
    <article className="py-8 lg:py-12">
      <div className="container-page max-w-3xl mx-auto">
        <Link
          href="/event"
          className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-brand-600 mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Kembali ke Event
        </Link>

        {event.heroImageUrl && (
          <div className="aspect-video relative bg-neutral-100 rounded-2xl overflow-hidden mb-8">
            <Image
              src={absoluteUrl(event.heroImageUrl) ?? ''}
              alt={event.judul}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 768px"
              priority
            />
          </div>
        )}

        <h1 className="text-3xl sm:text-4xl font-bold text-neutral-900 leading-tight mb-4">
          {event.judul}
        </h1>

        {event.ringkasan && (
          <p className="text-lg text-neutral-700 mb-6">{event.ringkasan}</p>
        )}

        {/* Event meta card */}
        <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-5 mb-8 space-y-3 text-sm">
          <div className="flex items-start gap-3">
            <Calendar className="w-5 h-5 text-brand-500 shrink-0" />
            <div>
              <div className="font-medium text-neutral-900">
                {formatDate(event.tanggalMulai)}
                {event.tanggalSelesai && event.tanggalSelesai !== event.tanggalMulai
                  ? ` – ${formatDate(event.tanggalSelesai)}`
                  : ''}
              </div>
              {event.jamMulai && (
                <div className="text-neutral-600 mt-0.5 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  {event.jamMulai}
                  {event.jamSelesai ? ` – ${event.jamSelesai}` : ''} WIB
                </div>
              )}
            </div>
          </div>
          {event.lokasi && (
            <div className="flex items-start gap-3">
              <MapPin className="w-5 h-5 text-brand-500 shrink-0" />
              <div className="text-neutral-700">{event.lokasi}</div>
            </div>
          )}
          {event.cabang && (
            <div className="flex items-start gap-3">
              <span className="text-brand-500 w-5 text-center">⛪</span>
              <div className="text-neutral-700">{event.cabang.nama}</div>
            </div>
          )}
          <div className="flex items-start gap-3 pt-3 border-t border-neutral-200">
            <CreditCard className="w-5 h-5 text-brand-500 shrink-0" />
            <div>
              {event.tipeBayar === 'GRATIS' ? (
                <span className="font-medium text-green-700">GRATIS</span>
              ) : (
                <div>
                  <div className="font-medium text-neutral-900">
                    {event.nominal
                      ? `Rp ${Number(event.nominal).toLocaleString('id-ID')}`
                      : 'Berbayar (nominal bebas)'}
                  </div>
                  {event.bankNama && (
                    <div className="text-xs text-neutral-500 mt-1">
                      Info pembayaran tersedia di aplikasi ECC saat daftar.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Description */}
        <Markdown content={event.deskripsi} />

        {/* Video embed */}
        {event.videoUrl && (
          <div className="mt-8 pt-6 border-t border-neutral-200">
            <h3 className="font-semibold text-neutral-900 mb-3 flex items-center gap-2">
              <PlayCircle className="w-5 h-5 text-brand-500" />
              Video Promo
            </h3>
            <a
              href={event.videoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-600 hover:underline break-all text-sm"
            >
              {event.videoUrl}
            </a>
          </div>
        )}

        {event.tags.length > 0 && (
          <div className="mt-8 pt-6 border-t border-neutral-200">
            <div className="flex items-center gap-2 flex-wrap">
              <Tag className="w-4 h-4 text-neutral-400" />
              {event.tags.map((tag) => (
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

        {/* Download CTA — view-only di landing, daftar via app */}
        <div className="mt-10 p-6 bg-gradient-to-br from-brand-500 to-brand-600 rounded-2xl text-center text-white">
          <Smartphone className="w-10 h-10 mx-auto mb-3 opacity-90" />
          <h3 className="font-bold text-lg mb-2">Mau Daftar Event Ini?</h3>
          <p className="text-brand-50 text-sm mb-4">
            Pendaftaran event tersedia di aplikasi ECC. Download untuk daftar + dapat info
            real-time.
          </p>
          <a
            href="https://apps.apple.com/app/ecc-church"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-white text-brand-600 hover:bg-brand-50 rounded-lg font-semibold transition"
          >
            Download Aplikasi ECC
          </a>
        </div>
      </div>
    </article>
  );
}
