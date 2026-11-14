import type { Metadata } from 'next';
import { getL } from '@/lib/i18n-server';
import { ChannelPage } from '../channel-page';

export const revalidate = 3600;

export function generateMetadata(): Metadata {
  const { L } = getL();
  return {
    title: 'YouTube @ECCWorship',
    description: L(
      'Video ECC Worship: worship session, lyric video, dan album — per kategori.',
      'ECC Worship videos: worship sessions, lyric videos, and albums — by category.',
    ),
  };
}

export default function YoutubeWorshipPage() {
  return <ChannelPage channel="worship" />;
}
