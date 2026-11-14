import type { Metadata } from 'next';
import { Church } from 'lucide-react';
import { apiGet } from '@/lib/api';
import { getL, getT } from '@/lib/i18n-server';
import { ScreenPage, EmptyState } from '@/components/screen-page';
import { IbadahBrowser, type IbadahEvent } from './ibadah-browser';

export function generateMetadata(): Metadata {
  const { L } = getL();
  return {
    title: L('Jadwal Ibadah', 'Service Schedule'),
    description: L(
      'Jadwal ibadah Elshaddai Creative Community di semua cabang.',
      'Elshaddai Creative Community service schedule across all branches.',
    ),
  };
}

type CalendarEvent = IbadahEvent;


export default async function IbadahPage() {
  const { t } = getT();
  // 30 hari ke depan (tanggal WIB).
  const tz = 'Asia/Jakarta';
  const todayIso = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
  const futureIso = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(Date.now() + 30 * 86_400_000));
  const events = (await apiGet<CalendarEvent[]>(`/public/ibadah/calendar?from=${todayIso}&to=${futureIso}`, { revalidate: 120 })) ?? [];

  const total = events.length;

  return (
    <ScreenPage
      Icon={Church}
      badge={t('nav.ibadah')}
      title={t('ibadah.title')}
      subtitle={t('ibadah.sub')}
      aside={total ? <span className="rounded-full bg-white/15 border border-white/25 px-3 py-1.5 text-sm font-bold">{total} {t('ibadah.count')}</span> : null}
    >
      {events.length === 0 ? (
        <EmptyState Icon={Church}>{t('ibadah.empty')}</EmptyState>
      ) : (
        <IbadahBrowser events={events} todayIso={todayIso} />
      )}
    </ScreenPage>
  );
}
