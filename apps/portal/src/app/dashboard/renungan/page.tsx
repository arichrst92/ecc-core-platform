'use client';

import { BookOpen } from 'lucide-react';
import { KontenPage } from '@/components/broadcast/konten-page';

export default function RenunganPage() {
  return (
    <KontenPage
      tipe="renungan"
      title="Renungan"
      icon={BookOpen}
      description="Renungan harian dengan ayat Alkitab untuk mobile app jemaat."
    />
  );
}
