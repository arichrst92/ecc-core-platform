import type { Metadata } from 'next';
import Image from 'next/image';
import {
  Store,
  MapPin,
  Building2,
  ArrowRight,
} from 'lucide-react';
import { MarketDisclaimer } from '@/components/market-disclaimer';
import { apiGet, absoluteUrl } from '@/lib/api';
import { FitImage } from '@/components/fit-image';
import { PanelTrigger } from '@/components/panel-host';
import { getL, getT } from '@/lib/i18n-server';
import { ScreenPage, EmptyState } from '@/components/screen-page';
import { GroupCarousel } from '@/components/h-carousel';


export function generateMetadata(): Metadata {
  const { L } = getL();
  return {
    title: L('Local Market', 'Local Market'),
    description: L(
      'Marketplace bisnis jemaat Elshaddai Creative Community — dukung sesama dengan berbelanja dari komunitas.',
      'Marketplace of Elshaddai Creative Community member businesses — support one another by shopping from the community.',
    ),
  };
}

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
  const { t } = getT();
  const list = (await apiGet<LocalBusiness[]>('/public/local-market?limit=50')) ?? [];
  const groups = new Map<string, { label: string; items: LocalBusiness[] }>();
  for (const b of list) {
    const c = b.owner?.cabang;
    const key = c?.id ?? UNASSIGNED;
    const g = groups.get(key) ?? { label: c?.nama ?? t('common.others'), items: [] };
    g.items.push(b);
    groups.set(key, g);
  }
  const sorted = [...groups.entries()].sort(([ka, a], [kb, b]) =>
    ka === UNASSIGNED ? 1 : kb === UNASSIGNED ? -1 : a.label.localeCompare(b.label),
  );

  const card = (b: LocalBusiness) => (
    <PanelTrigger key={b.id} type="market" id={b.id} title={b.nama} className="s-card group">
      <div className="relative aspect-video w-full shrink-0 bg-brand-grad">
        {b.heroImageUrl ? (
          <FitImage src={absoluteUrl(b.heroImageUrl) ?? ''} alt={b.nama} sizes="320px" className="absolute inset-0" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Store className="w-12 h-12 text-white/85" />
          </div>
        )}
      </div>
      <div className="s-card-body !p-4 flex flex-col gap-1.5">
        <div className="flex items-start gap-3">
          {b.logoUrl ? (
            <div className="w-10 h-10 relative shrink-0 rounded-xl overflow-hidden bg-neutral-100 border border-neutral-200">
              <Image src={absoluteUrl(b.logoUrl) ?? ''} alt="" fill className="object-cover" sizes="40px" />
            </div>
          ) : null}
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-neutral-900 leading-tight group-hover:text-brand-600 transition line-clamp-1">{b.nama}</h3>
            {b.industri ? <p className="text-xs text-neutral-500 mt-0.5 line-clamp-1">{b.industri}</p> : null}
          </div>
        </div>
        {b.deskripsi ? <p className="text-sm text-neutral-600 line-clamp-1">{b.deskripsi}</p> : null}
        <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
          {b.tipeBisnis ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-neutral-100">
              <Building2 className="w-3 h-3" />
              {b.tipeBisnis}
            </span>
          ) : null}
          {b.isOnline ? <span className="px-2 py-0.5 rounded-full bg-brand-50 text-brand-700">{t('common.online')}</span> : null}
          {b.lokasi ? (
            <span className="inline-flex items-center gap-1 min-w-0 max-w-full">
              <MapPin className="w-3 h-3 shrink-0" />
              <span className="truncate">{b.lokasi}</span>
            </span>
          ) : null}
        </div>
        <span className="mt-auto pt-1 text-sm font-semibold text-brand-600 inline-flex items-center gap-1 group-hover:gap-2 transition-all">
          {t('common.detail')}
          <ArrowRight className="w-4 h-4" />
        </span>
      </div>
    </PanelTrigger>
  );

  return (
    <ScreenPage Icon={Store} badge={t('nav.market')} title={t('market.title')} subtitle={t('market.sub')} aside={<MarketDisclaimer className="max-w-sm !bg-white/15 !text-white [&_svg]:!text-white" />}>
      {list.length === 0 ? (
        <EmptyState Icon={Store}>{t('market.empty')}</EmptyState>
      ) : (
        <GroupCarousel itemWidth="min(260px, 80vw)" minItemH={290} itemH={330} groups={sorted.map(([key, g]) => ({ key, label: g.label, items: g.items.map(card) }))} />
      )}
    </ScreenPage>
  );
}
