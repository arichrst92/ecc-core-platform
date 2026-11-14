import type { Metadata } from 'next';
import { getL } from '@/lib/i18n-server';
import { ChannelPage } from './channel-page';

export const revalidate = 3600;

export function generateMetadata(): Metadata {
  const { L } = getL();
  return {
    title: 'YouTube @ECCChurchChannel',
    description: L(
      'Video ECC Church: ibadah online, khotbah, pujian, CKids, kesaksian, dan lainnya — per kategori.',
      'ECC Church videos: online services, sermons, worship, CKids, testimonies and more — by category.',
    ),
  };
}

export default function YoutubeChurchPage() {
  return <ChannelPage channel="church" />;
}
