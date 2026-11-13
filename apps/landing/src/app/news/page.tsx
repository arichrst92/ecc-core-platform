import type { Metadata } from 'next';
import { Calendar, Church, Newspaper } from 'lucide-react';
import { apiGet, absoluteUrl } from '@/lib/api';
import { FitImage } from '@/components/fit-image';
import { PanelTrigger } from '@/components/panel-host';
import { getT } from '@/lib/i18n-server';
import { localeOf } from '@/lib/i18n';
import { ScreenPage, EmptyState } from '@/components/screen-page';
import { HCarousel } from '@/components/h-carousel';


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
  const { lang, t } = getT();
  const news = (await apiGet<NewsItem[]>('/public/news?limit=20')) ?? [];
  return (
    <ScreenPage Icon={Newspaper} badge={t('nav.news')} title={t('news.title')} subtitle={t('news.sub')}>
      {news.length === 0 ? (
        <EmptyState Icon={Newspaper}>{t('news.empty')}</EmptyState>
      ) : (
        <HCarousel itemWidth="min(320px, 82vw)" itemH={420}>
          {news.map((item) => (
            <PanelTrigger key={item.id} type="news" id={item.slug} title={item.judul} className="s-card group">
              <div className="relative aspect-[3/2] w-full shrink-0 bg-brand-grad">
                {item.heroImageUrl ? (
                  <FitImage src={absoluteUrl(item.heroImageUrl) ?? ''} alt={item.judul} sizes="340px" className="absolute inset-0" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Newspaper className="w-12 h-12 text-white/85" />
                  </div>
                )}
              </div>
              <div className="s-card-body flex flex-col gap-2">
                {item.cabang ? (
                  <span className="self-start inline-flex items-center gap-1 px-2 py-0.5 bg-brand-50 text-brand-700 rounded-full text-[11px] font-semibold">
                    <Church className="w-3 h-3" />
                    {item.cabang.nama}
                  </span>
                ) : null}
                <h3 className="font-bold text-lg leading-snug text-neutral-900 group-hover:text-brand-600 transition line-clamp-2">{item.judul}</h3>
                {item.ringkasan ? <p className="text-sm text-neutral-600 line-clamp-3">{item.ringkasan}</p> : null}
                <div className="mt-auto flex items-center gap-2 text-xs text-neutral-500 pt-2">
                  {item.tanggal ? (
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {new Date(item.tanggal).toLocaleDateString(localeOf(lang), { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  ) : null}
                  {item.author ? <span className="truncate">· {item.author.namaLengkap}</span> : null}
                </div>
              </div>
            </PanelTrigger>
          ))}
        </HCarousel>
      )}
    </ScreenPage>
  );
}
