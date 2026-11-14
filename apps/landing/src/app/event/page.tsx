import type { Metadata } from 'next';
import {
  Calendar,
  MapPin,
  Clock,
  Megaphone,
  CreditCard,
} from 'lucide-react';
import { apiGet, absoluteUrl } from '@/lib/api';
import { FitImage } from '@/components/fit-image';
import { PanelTrigger } from '@/components/panel-host';
import { getL, getT } from '@/lib/i18n-server';
import { localeOf } from '@/lib/i18n';
import { ScreenPage, EmptyState } from '@/components/screen-page';
import { GroupCarousel } from '@/components/h-carousel';
import { CARD_TITLE, summaryClamp } from '@/lib/card-text';
import { tzLabel } from '@/lib/tz';

export function generateMetadata(): Metadata {
  const { L } = getL();
  return {
    title: L('Event', 'Events'),
    description: L(
      'Acara mendatang Elshaddai Creative Community.',
      'Upcoming Elshaddai Creative Community events.',
    ),
  };
}

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
  deskripsi?: string | null;
  cabang: { id: string; nama: string; timezone?: string | null } | null;
}

const UNASSIGNED = '__unassigned__';

/** Cuplikan teks polos dari deskripsi (buang sintaks markdown sederhana). */
const plainText = (s: string) =>
  s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#*_>`~]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();

export default async function EventListPage() {
  const { lang, t } = getT();
  const loc = localeOf(lang);
  const fmt = (iso: string) => new Date(iso).toLocaleDateString(loc, { day: 'numeric', month: 'short', year: 'numeric' });
  const events = (await apiGet<EventItem[]>('/public/event?limit=50')) ?? [];

  // Per cabang; event tanpa cabang (sinode) di grup terakhir.
  const groups = new Map<string, { label: string; items: EventItem[] }>();
  for (const e of events) {
    const key = e.cabang?.id ?? UNASSIGNED;
    const g = groups.get(key) ?? { label: e.cabang?.nama ?? t('common.crossBranch'), items: [] };
    g.items.push(e);
    groups.set(key, g);
  }
  const sorted = [...groups.entries()].sort(([ka, a], [kb, b]) =>
    ka === UNASSIGNED ? 1 : kb === UNASSIGNED ? -1 : a.label.localeCompare(b.label),
  );

  const card = (e: EventItem) => (
    <PanelTrigger key={e.id} type="event" id={e.slug} title={e.judul} className="s-card group">
      <div className="relative aspect-[3/2] w-full shrink-0 bg-brand-grad">
        {e.heroImageUrl ? (
          <FitImage src={absoluteUrl(e.heroImageUrl) ?? ''} alt={e.judul} sizes="340px" className="absolute inset-0" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Megaphone className="w-14 h-14 text-white/85" />
          </div>
        )}
        <span className="absolute left-3 top-3 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-bold text-brand-700">
          {fmt(e.tanggalMulai)}
        </span>
      </div>
      <div className="s-card-body flex flex-col gap-2">
        <h3 className={CARD_TITLE}>{e.judul}</h3>
        {e.ringkasan || e.deskripsi ? (
          <p className={`shrink-0 text-sm text-neutral-600 ${summaryClamp(e.judul, 2)}`}>{e.ringkasan || plainText(e.deskripsi ?? '')}</p>
        ) : null}
        <div className="mt-auto shrink-0 space-y-1.5 text-[13px] text-neutral-600">
          <p className="flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-brand-500" />
            {fmt(e.tanggalMulai)}
            {e.tanggalSelesai && e.tanggalSelesai !== e.tanggalMulai ? ` – ${fmt(e.tanggalSelesai)}` : ''}
            {e.jamMulai ? '' : ` · ${tzLabel(e.cabang?.timezone)}`}
          </p>
          {e.jamMulai ? (
            <p className="flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-brand-500" />
              {e.jamMulai}
              {e.jamSelesai ? ` – ${e.jamSelesai}` : ''} {tzLabel(e.cabang?.timezone)}
            </p>
          ) : null}
          {e.lokasi ? (
            <p className="flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-brand-500 shrink-0" />
              <span className="truncate">{e.lokasi}</span>
            </p>
          ) : null}
          <div className="pt-1">
            {e.tipeBayar === 'GRATIS' ? (
              <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-bold">{t('common.free')}</span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full text-xs font-bold">
                <CreditCard className="w-3 h-3" />
                {e.nominal ? `Rp ${Number(e.nominal).toLocaleString('id-ID')}` : t('common.paid')}
              </span>
            )}
          </div>
        </div>
      </div>
    </PanelTrigger>
  );

  return (
    <ScreenPage Icon={Megaphone} badge={t('nav.event')} title={t('event.title')} subtitle={t('event.sub')}>
      {events.length === 0 ? (
        <EmptyState Icon={Megaphone}>{t('event.empty')}</EmptyState>
      ) : (
        <GroupCarousel
          itemWidth="min(310px, 82vw)" itemH={460}
          groups={sorted.map(([key, g]) => ({ key, label: g.label, items: g.items.map(card) }))}
        />
      )}
    </ScreenPage>
  );
}
