import type { Metadata } from 'next';
import { BookOpen, ArrowRight  } from 'lucide-react';
import { apiGet, absoluteUrl } from '@/lib/api';
import { FitImage } from '@/components/fit-image';
import { PanelTrigger } from '@/components/panel-host';
import { getL, getT } from '@/lib/i18n-server';
import { localeOf } from '@/lib/i18n';
import { ScreenPage, EmptyState } from '@/components/screen-page';
import { HCarousel } from '@/components/h-carousel';


export function generateMetadata(): Metadata {
  const { L } = getL();
  return {
    title: L('Renungan', 'Devotionals'),
    description: L(
      'Renungan harian dari Elshaddai Creative Community — firman Tuhan untuk perjalanan iman Anda.',
      'Daily devotionals from Elshaddai Creative Community — God\'s word for your faith journey.',
    ),
  };
}

interface RenunganItem {
  id: string;
  slug: string;
  judul: string;
  ringkasan: string | null;
  ayatAlkitab: string | null;
  tanggal: string | null;
  heroImageUrl?: string | null;
}

export default async function RenunganListPage() {
  const { lang, t } = getT();
  const list = (await apiGet<RenunganItem[]>('/public/renungan?limit=30')) ?? [];
  return (
    <ScreenPage Icon={BookOpen} badge={t('nav.renungan')} title={t('renungan.title')} subtitle={t('renungan.sub')}>
      {list.length === 0 ? (
        <EmptyState Icon={BookOpen}>{t('renungan.empty')}</EmptyState>
      ) : (
        <HCarousel itemWidth="min(300px, 82vw)" itemH={420}>
          {list.map((r) => (
            <PanelTrigger key={r.id} type="renungan" id={r.slug} title={r.judul} className="s-card group">
              {r.heroImageUrl ? (
                <div className="relative aspect-[3/2] w-full shrink-0">
                  <FitImage src={absoluteUrl(r.heroImageUrl) ?? ''} alt={r.judul} sizes="320px" className="absolute inset-0" />
                  {r.tanggal ? (
                    <span className="absolute left-3 top-3 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-bold text-brand-700">
                      {new Date(r.tanggal).toLocaleDateString(localeOf(lang), { day: 'numeric', month: 'short' })}
                    </span>
                  ) : null}
                </div>
              ) : (
                <div className="bg-brand-grad text-white px-5 pt-5 pb-6 shrink-0">
                  <BookOpen className="w-7 h-7 opacity-90" />
                  {r.tanggal ? (
                    <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-white/85">
                      {new Date(r.tanggal).toLocaleDateString(localeOf(lang), { weekday: 'long', day: 'numeric', month: 'long' })}
                    </p>
                  ) : null}
                </div>
              )}
              <div className="s-card-body flex flex-col gap-2">
                {r.ayatAlkitab ? <p className="text-xs font-bold text-brand-600">{r.ayatAlkitab}</p> : null}
                <h3 className="font-bold text-lg leading-snug text-neutral-900 group-hover:text-brand-600 transition line-clamp-2">{r.judul}</h3>
                {r.ringkasan ? <p className="text-sm text-neutral-600 line-clamp-4">{r.ringkasan}</p> : null}
                <span className="mt-auto pt-2 text-sm font-semibold text-brand-600 inline-flex items-center gap-1 group-hover:gap-2 transition-all">
                  {t('common.readMore')}
                  <ArrowRight className="w-4 h-4" />
                </span>
              </div>
            </PanelTrigger>
          ))}
        </HCarousel>
      )}
    </ScreenPage>
  );
}
