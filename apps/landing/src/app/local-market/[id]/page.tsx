import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowLeft,
  Store,
  Globe,
  MapPin,
  MessageCircle,
  Building2,
  Church,
  FileText,
  ExternalLink,
  Calendar,
  Mail
} from 'lucide-react';
import { apiGet, absoluteUrl } from '@/lib/api';
import { MarketDisclaimer } from '@/components/market-disclaimer';
import { ShareButton } from '@/components/share-button';
import { BrandIconLink } from '@/components/brand-icon';
import { MARKET_ICONS, SOCIAL_ICONS } from '@/lib/brand-icons-data';
import { MarketViewPing } from '@/components/market-view-ping';
import { hargaText, type KatalogItem } from '@/lib/katalog';
import { getT } from '@/lib/i18n-server';
import { localeOf } from '@/lib/i18n';
import { HCarousel } from '@/components/h-carousel';
import { FitImage } from '@/components/fit-image';

interface SocialLink {
  platform: string;
  url: string;
}

interface LocalBusinessDetail {
  id: string;
  nama: string;
  deskripsi: string | null;
  industri: string | null;
  tipeBisnis: 'B2C' | 'B2B' | 'B2B2C' | null;
  heroImageUrl: string | null;
  logoUrl: string | null;
  companyProfileUrl: string | null;
  socialLinks: SocialLink[] | null;
  websiteUrl: string | null;
  whatsappUrl: string | null;
  waAdmin?: string | null;
  mapsUrl?: string | null;
  marketplaceLinks?: Partial<Record<keyof typeof MARKET_LABEL, string>> | null;
  email?: string | null;
  items?: KatalogItem[];
  isOnline: boolean;
  lokasi: string | null;
  createdAt: string;
  owner: { cabang: { id: string; nama: string } | null } | null;
}

interface PageProps {
  params: { id: string };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const item = await apiGet<LocalBusinessDetail>(
    `/public/local-market/${params.id}`,
  );
  if (!item) return { title: 'Bisnis tidak ditemukan' };
  return {
    title: `${item.nama} — Local Market`,
    description:
      item.deskripsi?.slice(0, 160) ??
      `${item.nama} di ECC Local Market — ${item.industri ?? 'bisnis komunitas'}`,
    openGraph: item.heroImageUrl
      ? { images: [absoluteUrl(item.heroImageUrl) ?? ''] }
      : undefined,
  };
}

// Helper — smart label detection berdasarkan platform / URL.
type SocialKey = keyof typeof SOCIAL_ICONS;
const SOCIAL_LABEL: Record<SocialKey, string> = {
  instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', youtube: 'YouTube', x: 'X', linkedin: 'LinkedIn', threads: 'Threads',
};
/** Platform dari URL sosmed (socialLinks disinkronkan dari username sejak 2.4.7). */
function platformOf(url: string): SocialKey | null {
  const h = (/^https?:\/\/(?:www\.|m\.)?([^/?#]+)/i.exec(url)?.[1] ?? '').toLowerCase();
  if (h.endsWith('instagram.com')) return 'instagram';
  if (h.endsWith('facebook.com') || h === 'fb.com') return 'facebook';
  if (h.endsWith('tiktok.com')) return 'tiktok';
  if (h.endsWith('youtube.com') || h === 'youtu.be') return 'youtube';
  if (h === 'x.com' || h.endsWith('twitter.com')) return 'x';
  if (h.endsWith('linkedin.com')) return 'linkedin';
  if (h.endsWith('threads.net') || h.endsWith('threads.com')) return 'threads';
  return null;
}
const MARKET_LABEL = { shopee: 'Shopee', lazada: 'Lazada', tiktokshop: 'TikTok Shop', tokopedia: 'Tokopedia' } as const;

export default async function LocalMarketDetailPage({ params }: PageProps) {
  const { lang, t } = getT();
  const b = await apiGet<LocalBusinessDetail>(
    `/public/local-market/${params.id}`,
  );
  if (!b) notFound();

  const socials = Array.isArray(b.socialLinks) ? b.socialLinks : [];
  const shops = (Object.keys(MARKET_LABEL) as (keyof typeof MARKET_LABEL)[])
    .filter((k) => b.marketplaceLinks?.[k])
    .map((k) => [k, b.marketplaceLinks![k]!] as const);

  const wa = b.waAdmin ? `https://wa.me/${b.waAdmin.replace(/\D/g, '')}` : b.whatsappUrl;
  const items = b.items ?? [];
  const actions = [
    b.mapsUrl ? { href: b.mapsUrl, Icon: MapPin, label: t('mk.location'), value: b.lokasi || t('mk.maps') } : null,
    b.websiteUrl ? { href: b.websiteUrl, Icon: Globe, label: t('mk.website'), value: b.websiteUrl.replace(/^https?:\/\//, '') } : null,
    b.email ? { href: `mailto:${b.email}`, Icon: Mail, label: t('mk.email'), value: b.email } : null,
    b.companyProfileUrl ? { href: absoluteUrl(b.companyProfileUrl) ?? '#', Icon: FileText, label: t('mk.profile'), value: t('mk.download') } : null,
  ].filter(Boolean) as { href: string; Icon: typeof MapPin; label: string; value: string }[];

  return (
    <div className="screen-page">
      <MarketViewPing id={b.id} />
      {/* Pita judul: logo + nama + info singkat */}
      <section className="screen-hero !pb-16">
        <div className="container-page">
          <Link href="/local-market" className="inline-flex items-center gap-1.5 text-sm text-white/85 hover:text-white mb-3">
            <ArrowLeft className="w-4 h-4" />
            {t('nav.market')}
          </Link>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 sm:w-20 sm:h-20 relative shrink-0 rounded-2xl overflow-hidden bg-white border-4 border-white/70 shadow-lg">
              {b.logoUrl ? (
                <Image src={absoluteUrl(b.logoUrl) ?? ''} alt={`${b.nama} logo`} fill className="object-cover" sizes="80px" />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-brand-600">
                  <Store className="w-8 h-8" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl sm:text-4xl font-extrabold leading-tight line-clamp-2">{b.nama}</h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                {b.industri ? <span className="px-2.5 py-0.5 rounded-full bg-white/20 border border-white/25 font-semibold">{b.industri}</span> : null}
                {b.tipeBisnis ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white/20 border border-white/25">
                    <Building2 className="w-3 h-3" />
                    {b.tipeBisnis}
                  </span>
                ) : null}
                {b.isOnline ? <span className="px-2.5 py-0.5 rounded-full bg-white text-brand-700 font-bold">{t('common.online')}</span> : null}
                {b.owner?.cabang ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white/20 border border-white/25">
                    <Church className="w-3 h-3" />
                    {b.owner.cabang.nama}
                  </span>
                ) : null}
                <span className="hidden sm:inline-flex items-center gap-1 text-white/80">
                  <Calendar className="w-3 h-3" />
                  {t('mk.joined')} {new Date(b.createdAt).toLocaleDateString(localeOf(lang), { month: 'short', year: 'numeric' })}
                </span>
              </div>
            </div>
            <ShareButton title={b.nama} text={b.industri ?? 'ECC Local Market'} className="shrink-0 self-start !bg-white !text-brand-700 !border-white" />
          </div>
        </div>
      </section>

      {/* Isi: kiri = foto + tentang, kanan = hubungi + katalog. Setinggi layar. */}
      <div className="screen-body container-page grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] overflow-y-auto lg:overflow-visible">
        <div className="s-card lg:h-full">
          {b.heroImageUrl ? (
            <FitImage src={absoluteUrl(b.heroImageUrl) ?? ''} alt={b.nama} priority sizes="(max-width: 1024px) 100vw, 560px" className="shrink-0 w-full aspect-video" />
          ) : null}
          <div className="s-card-body s-scroll">
            <h2 className="text-xs font-bold uppercase tracking-wider text-brand-600 mb-2">{t('mk.about')}</h2>
            <p className="text-neutral-700 whitespace-pre-line leading-relaxed text-[15px]">{b.deskripsi || t('mk.noDesc')}</p>
            {b.lokasi ? (
              <p className="mt-4 text-sm text-neutral-600 flex items-start gap-2">
                <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-brand-500" />
                <span className="whitespace-pre-line">{b.lokasi}</span>
              </p>
            ) : null}
            <MarketDisclaimer className="mt-5" />
          </div>
        </div>

        <div className="flex flex-col gap-4 min-h-0 lg:h-full">
          {/* Hubungi */}
          <div className="s-card shrink-0">
            <div className="p-5 space-y-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-brand-600">{t('mk.contact')}</h2>
              {wa ? (
                <a href={wa} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 transition">
                  <MessageCircle className="w-5 h-5" />
                  {t('mk.chat')}
                </a>
              ) : null}
              {actions.length ? (
                <div className="grid grid-cols-2 gap-2">
                  {actions.map((x) => (
                    <a
                      key={x.label}
                      href={x.href}
                      target={x.href.startsWith('mailto:') ? undefined : '_blank'}
                      rel="noopener noreferrer"
                      className="flex items-center gap-2.5 rounded-2xl border border-orange-100 bg-brand-50/50 px-3 py-2.5 hover:border-brand-300 hover:bg-brand-50 transition min-w-0"
                    >
                      <span className="w-9 h-9 rounded-xl bg-brand-grad text-white flex items-center justify-center shrink-0">
                        <x.Icon className="w-4 h-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[11px] font-bold uppercase tracking-wide text-neutral-500">{x.label}</span>
                        <span className="block text-sm text-neutral-900 truncate">{x.value}</span>
                      </span>
                    </a>
                  ))}
                </div>
              ) : null}
              {socials.length > 0 || shops.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2.5 pt-1">
                  {socials.map((s, idx) => {
                    const k = platformOf(s.url);
                    return k ? (
                      <BrandIconLink key={`${s.url}-${idx}`} glyph={SOCIAL_ICONS[k]} url={s.url} label={SOCIAL_LABEL[k]} size={36} />
                    ) : (
                      <a key={`${s.url}-${idx}`} href={s.url} target="_blank" rel="noopener noreferrer" title={s.platform || s.url} className="w-9 h-9 rounded-full bg-neutral-200 text-neutral-700 inline-flex items-center justify-center hover:opacity-80">
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    );
                  })}
                  {socials.length > 0 && shops.length > 0 ? <span className="w-px h-6 bg-neutral-200 mx-1" /> : null}
                  {shops.map(([k, url]) => (
                    <BrandIconLink key={k} glyph={MARKET_ICONS[k]} url={url} label={MARKET_LABEL[k]} shape="square" size={36} />
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          {/* Katalog — geser menyamping */}
          <div className="s-card flex-1 min-h-[300px] lg:min-h-0">
            <div className="px-5 pt-4 pb-2 flex items-center justify-between shrink-0">
              <h2 className="text-xs font-bold uppercase tracking-wider text-brand-600">{t('mk.catalog')}</h2>
              {items.length ? (
                <span className="text-xs text-neutral-500">
                  {items.length} {t('mk.items')}
                </span>
              ) : null}
            </div>
            <div className="flex-1 min-h-0 px-5 pb-4">
              {items.length === 0 ? (
                <div className="h-full flex items-center justify-center text-sm text-neutral-500 rounded-2xl border border-dashed border-orange-200">{t('mk.noCatalog')}</div>
              ) : (
                <HCarousel itemWidth="min(200px, 60vw)" itemH={320}>
                  {items.map((it) => (
                    <Link key={it.id} href={`/local-market/${b.id}/item/${it.id}`} className="h-full flex flex-col rounded-2xl border border-neutral-200 overflow-hidden hover:border-brand-300 transition bg-white">
                      <div className="relative aspect-[3/2] w-full shrink-0 bg-brand-grad">
                        {it.fotoUrls[0] ? (
                          <FitImage src={absoluteUrl(it.fotoUrls[0]) ?? ''} alt={it.nama} sizes="200px" className="absolute inset-0" />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center text-white/85">
                            <Store className="w-8 h-8" />
                          </div>
                        )}
                        <span className="absolute left-2 top-2 rounded-full bg-white/95 px-2 py-0.5 text-[10px] font-bold uppercase text-brand-700">
                          {it.jenis === 'JASA' ? t('mk.service') : t('mk.product')}
                        </span>
                      </div>
                      <div className="p-3 shrink-0 flex flex-col">
                        <div className="text-sm font-bold text-neutral-900 line-clamp-1">{it.nama}</div>
                        {it.deskripsi ? <div className="text-xs text-neutral-500 line-clamp-1 mt-0.5">{it.deskripsi}</div> : null}
                        <div className={`pt-1 text-sm font-extrabold ${it.hargaTipe === 'NEGO' ? 'text-neutral-500' : 'text-brand-700'}`}>{hargaText(it)}</div>
                      </div>
                    </Link>
                  ))}
                </HCarousel>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
