'use client';

import { Newspaper } from 'lucide-react';
import { KontenPage } from '@/components/broadcast/konten-page';

export default function NewsPage() {
  return (
    <KontenPage
      tipe="news"
      title="News"
      icon={Newspaper}
      description="Berita & pengumuman untuk publikasi di mobile app jemaat."
    />
  );
}
