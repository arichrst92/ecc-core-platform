/**
 * Halaman satu item katalog Local Market (2.4.7) — link yang dibagikan dari
 * app. Pratinjau WhatsApp / media sosial memakai foto item (OG image).
 */
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Mail, MessageCircle, Smartphone, Store } from 'lucide-react';
import { apiGet, absoluteUrl } from '@/lib/api';
import { MarketDisclaimer } from '@/components/market-disclaimer';
import { ShareButton } from '@/components/share-button';
import { BrandIconLink } from '@/components/brand-icon';
import { MARKET_ICONS } from '@/lib/brand-icons-data';

const MARKET_LABEL = { shopee: 'Shopee', lazada: 'Lazada', tiktokshop: 'TikTok Shop', tokopedia: 'Tokopedia' } as const;
import { MarketViewPing } from '@/components/market-view-ping';
import { hargaText, type KatalogItem } from '@/lib/katalog';
import { getT } from '@/lib/i18n-server';
import { DetailShell, HeroChip } from '@/components/detail-shell';
import { FitImage } from '@/components/fit-image';
import { HCarousel } from '@/components/h-carousel';

interface ItemDetail extends KatalogItem {
  hargaLabel: string;
  business: {
    id: string;
    nama: string;
    logoUrl: string | null;
    heroImageUrl: string | null;
    waAdmin: string | null;
    email: string | null;
    industri: string | null;
    owner: { cabang: { nama: string } | null } | null;
  };
}

interface PageProps {
  params: { id: string; itemId: string };
}

const SITE = 'https://eccchurch.global';

async function load(p: PageProps['params']) {
  return apiGet<ItemDetail>(`/public/local-market/${p.id}/item/${p.itemId}`, { revalidate: 120 });
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const it = await load(params);
  if (!it) return { title: 'Item tidak ditemukan' };
  const img = absoluteUrl(it.fotoUrls[0] ?? it.business.heroImageUrl ?? it.business.logoUrl);
  const title = `${it.nama} — ${it.business.nama}`;
  const description = `${hargaText(it)} · ${it.deskripsi?.slice(0, 140) ?? `${it.jenis === 'JASA' ? 'Jasa' : 'Produk'} di ECC Local Market`}`;
  const url = `${SITE}/local-market/${params.id}/item/${params.itemId}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: 'website', images: img ? [{ url: img, width: 1200, height: 800, alt: it.nama }] : undefined },
    twitter: { card: img ? 'summary_large_image' : 'summary', title, description, images: img ? [img] : undefined },
  };
}

export default async function LocalMarketItemPage({ params }: PageProps) {
  const { t } = getT();
  const it = await load(params);
  if (!it) notFound();
  const b = it.business;
  const url = `${SITE}/local-market/${params.id}/item/${params.itemId}`;
  // Link produk saja — tidak memakai link toko usaha sebagai cadangan.
  const shops = (Object.keys(MARKET_LABEL) as (keyof typeof MARKET_LABEL)[])
    .filter((k) => it.marketplaceLinks?.[k])
    .map((k) => [k, it.marketplaceLinks![k]!] as const);
  const pesan = `Halo ${b.nama}, saya tertarik dengan ${it.nama} (${hargaText(it)}). ${url}`;
  const wa = b.waAdmin ? `https://wa.me/${b.waAdmin.replace(/\D/g, '')}?text=${encodeURIComponent(pesan)}` : null;
  const mail = b.email ? `mailto:${b.email}?subject=${encodeURIComponent(`Tanya: ${it.nama}`)}&body=${encodeURIComponent(pesan)}` : null;

  const fotos = it.fotoUrls.map((f) => absoluteUrl(f)).filter(Boolean) as string[];
  const media = fotos.length ? (
    <div className="p-2">
      <HCarousel itemWidth="100%">
        {fotos.map((f, i) => (
          <FitImage key={f} src={f} alt={`${it.nama} ${i + 1}`} priority={i === 0} sizes="(max-width: 1024px) 100vw, 600px" className="w-full aspect-[3/2] rounded-2xl" />
        ))}
      </HCarousel>
    </div>
  ) : (
    <div className="aspect-[3/2] bg-brand-grad flex items-center justify-center text-white/85">
      <Store className="w-14 h-14" />
    </div>
  );

  const aside = (
    <div className="p-4 space-y-3">
      <Link href={`/local-market/${b.id}`} className="flex items-center gap-3 p-2.5 rounded-2xl border border-orange-100 hover:border-brand-300">
        <div className="w-11 h-11 relative rounded-xl overflow-hidden bg-brand-grad text-white flex items-center justify-center shrink-0">
          {b.logoUrl ? <Image src={absoluteUrl(b.logoUrl) ?? ''} alt={b.nama} fill className="object-cover" sizes="44px" /> : <Store className="w-5 h-5" />}
        </div>
        <div className="min-w-0">
          <div className="font-bold text-neutral-900 truncate">{b.nama}</div>
          <div className="text-xs text-neutral-500 truncate">{[b.industri, b.owner?.cabang?.nama].filter(Boolean).join(' · ')}</div>
        </div>
      </Link>
      <div className="grid grid-cols-2 gap-2">
        {wa ? (
          <a href={wa} target="_blank" rel="noopener noreferrer" className="col-span-2 flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold">
            <MessageCircle className="w-4 h-4" /> {t('it.ask')}
          </a>
        ) : null}
        {mail ? (
          <a href={mail} className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-2xl border border-orange-100 bg-brand-50/50 hover:border-brand-300 text-neutral-800 font-semibold text-sm">
            <Mail className="w-4 h-4" /> {t('mk.email')}
          </a>
        ) : null}
        <a href={`ecc://local-market/${b.id}/item/${it.id}`} className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-2xl border border-orange-100 bg-brand-50/50 hover:border-brand-300 text-neutral-800 font-semibold text-sm ${mail ? '' : 'col-span-2'}`}>
          <Smartphone className="w-4 h-4" /> {t('common.openApp')}
        </a>
      </div>
    </div>
  );

  return (
    <>
      <MarketViewPing id={b.id} itemId={it.id} />
      <DetailShell
        backHref={`/local-market/${b.id}`}
        backLabel={b.nama}
        Icon={Store}
        badge={it.jenis === 'JASA' ? t('mk.service') : t('mk.product')}
        title={it.nama}
        actions={<ShareButton title={`${it.nama} — ${b.nama}`} text={hargaText(it)} className="!bg-white !text-brand-700 !border-white" />}
        meta={<HeroChip strong>{hargaText(it)}</HeroChip>}
        media={media}
        aside={aside}
      >
        <div className="text-xs font-bold uppercase tracking-wider text-brand-600">{t('it.price')}</div>
        <p className={`text-3xl font-extrabold mt-1 ${it.hargaTipe === 'NEGO' ? 'text-neutral-500' : 'text-brand-700'}`}>{hargaText(it)}</p>
        {shops.length > 0 ? (
          <div className="mt-5">
            <div className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-2">{t('it.buyAlso')}</div>
            <div className="flex flex-wrap gap-2.5">
              {shops.map(([k, url]) => (
                <BrandIconLink key={k} glyph={MARKET_ICONS[k]} url={url} label={MARKET_LABEL[k]} shape="square" />
              ))}
            </div>
          </div>
        ) : null}
        {it.deskripsi ? (
          <>
            <div className="mt-6 text-xs font-bold uppercase tracking-wider text-brand-600">{t('mk.about')}</div>
            <p className="text-neutral-700 whitespace-pre-line leading-relaxed mt-2">{it.deskripsi}</p>
          </>
        ) : null}
        <MarketDisclaimer className="mt-8" />
      </DetailShell>
    </>
  );
}
