/**
 * Video Channel — eccchurch.global/video. Video dari Portal (Broadcast → Video
 * Channel), universal untuk semua cabang; sama dengan tab Video Channel di Els App.
 */
import type { Metadata } from 'next';
import { MonitorPlay } from 'lucide-react';
import { apiGet } from '@/lib/api';
import { getL } from '@/lib/i18n-server';
import { ScreenPage } from '@/components/screen-page';
import { VideoChannelBrowser, type VideoCatalog } from './video-browser';

export const revalidate = 300;

export function generateMetadata(): Metadata {
  const { L } = getL();
  return {
    title: 'Video Channel — ECC Church',
    description: L('Video pilihan ECC Church per kategori: khotbah, kesaksian, pujian, dan lainnya.', 'Selected ECC Church videos by category: sermons, testimonies, worship and more.'),
  };
}

export default async function VideoChannelPage() {
  const { L } = getL();
  const data = await apiGet<VideoCatalog>('/public/videos', { revalidate: 300, tags: ['videos'] });
  return (
    <ScreenPage
      Icon={MonitorPlay}
      badge="Video Channel"
      title={L('Video ECC', 'ECC Videos')}
      subtitle={L('Video pilihan ECC Church — dikelompokkan per kategori. Juga ada di Els App (Beranda → Media).', 'Selected ECC Church videos — grouped by category. Also in Els App (Home → Media).')}
    >
      <VideoChannelBrowser data={data ?? { kategori: [], featured: [], videos: [], total: 0 }} />
    </ScreenPage>
  );
}
