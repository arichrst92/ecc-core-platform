import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  Calendar,
  Clock,
  MapPin,
  CreditCard,
  Tag,
  Smartphone,
  PlayCircle,
  Megaphone
} from 'lucide-react';
import { apiGet, absoluteUrl } from '@/lib/api';
import { Markdown } from '@/components/markdown';
import { getT } from '@/lib/i18n-server';
import { localeOf } from '@/lib/i18n';
import { DetailShell, HeroChip } from '@/components/detail-shell';

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
  const { lang, t } = getT();
  const event = await apiGet<EventDetail>(`/public/event/${params.slug}`);
  if (!event) notFound();

  const fmt = (iso: string) => new Date(iso).toLocaleDateString(localeOf(lang), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const when = `${fmt(event.tanggalMulai)}${event.tanggalSelesai && event.tanggalSelesai !== event.tanggalMulai ? ` – ${fmt(event.tanggalSelesai)}` : ''}`;
  const fee =
    event.tipeBayar === 'GRATIS'
      ? t('common.free')
      : event.nominal
        ? `Rp ${Number(event.nominal).toLocaleString('id-ID')}`
        : t('ev.flexible');

  const info = (
    <div className="p-5 space-y-3 text-sm">
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-xl bg-brand-grad text-white flex items-center justify-center shrink-0">
          <Calendar className="w-4 h-4" />
        </span>
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wide text-neutral-500">{t('ev.when')}</div>
          <div className="font-semibold text-neutral-900">{when}</div>
          {event.jamMulai ? (
            <div className="text-neutral-600 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              {event.jamMulai}
              {event.jamSelesai ? ` – ${event.jamSelesai}` : ''} WIB
            </div>
          ) : null}
        </div>
      </div>
      {event.lokasi || event.cabang ? (
        <div className="flex items-start gap-3">
          <span className="w-9 h-9 rounded-xl bg-brand-grad text-white flex items-center justify-center shrink-0">
            <MapPin className="w-4 h-4" />
          </span>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wide text-neutral-500">{t('ev.where')}</div>
            {event.lokasi ? <div className="font-semibold text-neutral-900">{event.lokasi}</div> : null}
            {event.cabang ? <div className="text-neutral-600">{event.cabang.nama}</div> : null}
          </div>
        </div>
      ) : null}
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-xl bg-brand-grad text-white flex items-center justify-center shrink-0">
          <CreditCard className="w-4 h-4" />
        </span>
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wide text-neutral-500">{t('ev.fee')}</div>
          <div className={`font-semibold ${event.tipeBayar === 'GRATIS' ? 'text-green-700' : 'text-neutral-900'}`}>{fee}</div>
          {event.tipeBayar !== 'GRATIS' && event.bankNama ? <div className="text-xs text-neutral-500">{t('ev.payInfo')}</div> : null}
        </div>
      </div>
      <a href="https://elsapp.eccchurch.global" target="_blank" rel="noopener noreferrer" className="btn-primary w-full justify-center !mt-4">
        <Smartphone className="w-4 h-4" />
        {t('ev.register')}
      </a>
    </div>
  );

  return (
    <DetailShell
      backHref="/event"
      backLabel={t('nav.event')}
      Icon={Megaphone}
      badge={t('nav.event')}
      title={event.judul}
      image={event.heroImageUrl ? { src: absoluteUrl(event.heroImageUrl) ?? '', alt: event.judul } : null}
      aside={info}
      meta={
        <>
          <span className="flex items-center gap-1.5">
            <Calendar className="w-4 h-4" />
            {fmt(event.tanggalMulai)}
          </span>
          {event.cabang ? <HeroChip>{event.cabang.nama}</HeroChip> : null}
          <HeroChip strong>{fee}</HeroChip>
        </>
      }
    >
      {event.ringkasan ? <p className="text-lg text-neutral-700 leading-relaxed mb-6 font-medium border-l-4 border-brand-400 pl-4">{event.ringkasan}</p> : null}
      <Markdown content={(event.deskripsi ?? '').replace(/\n/g, '  \n')} />
      {event.videoUrl ? (
        <div className="mt-8 pt-5 border-t border-neutral-200">
          <h3 className="font-semibold text-neutral-900 mb-2 flex items-center gap-2">
            <PlayCircle className="w-5 h-5 text-brand-500" />
            {t('ev.video')}
          </h3>
          <a href={event.videoUrl} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline break-all text-sm">
            {event.videoUrl}
          </a>
        </div>
      ) : null}
      {event.tags.length > 0 ? (
        <div className="mt-8 pt-5 border-t border-neutral-200 flex items-center gap-2 flex-wrap">
          <Tag className="w-4 h-4 text-brand-500" />
          {event.tags.map((tag) => (
            <span key={tag} className="px-2.5 py-0.5 bg-brand-50 text-brand-700 rounded-full text-xs font-semibold">
              {tag}
            </span>
          ))}
        </div>
      ) : null}
    </DetailShell>
  );
}
