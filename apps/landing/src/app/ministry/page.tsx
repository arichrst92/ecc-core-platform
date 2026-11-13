import type { Metadata } from 'next';
import { HandHeart } from 'lucide-react';
import { apiGet } from '@/lib/api';
import { MinistryBrowser } from './ministry-browser';
import { getT } from '@/lib/i18n-server';
import { ScreenPage, EmptyState } from '@/components/screen-page';


export const metadata: Metadata = {
  title: 'Ministry',
  description:
    'Berbagai pelayanan / ministry yang ada di Elshaddai Creative Community.',
};

interface Ministry {
  id: string;
  nama: string;
  deskripsi: string | null;
  ikon?: string | null;
  warna?: string | null;
  roleCount: number;
  memberCount: number;
}

export default async function MinistryPage() {
  const { t } = getT();
  const list = (await apiGet<Ministry[]>('/public/ministry?limit=100')) ?? [];
  return (
    <ScreenPage Icon={HandHeart} badge={t('nav.ministry')} title={t('ministry.title')} subtitle={t('ministry.sub')}>
      {list.length === 0 ? <EmptyState Icon={HandHeart}>{t('ministry.empty')}</EmptyState> : <MinistryBrowser list={list} />}
    </ScreenPage>
  );
}
