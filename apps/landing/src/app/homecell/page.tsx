import type { Metadata } from 'next';
import { HousePlus } from 'lucide-react';
import { apiGet } from '@/lib/api';
import { getL } from '@/lib/i18n-server';
import { ScreenPage, EmptyState } from '@/components/screen-page';
import { HomecellBrowser, type HomecellZona } from './homecell-browser';

export function generateMetadata(): Metadata {
  const { L } = getL();
  return {
    title: 'Homecell',
    description: L(
      'Homecell Elshaddai Creative Community di setiap cabang — zona, pemimpin, dan jadwal pertemuan.',
      'Elshaddai Creative Community homecells in every branch — zones, leaders, and meeting times.',
    ),
  };
}

export default async function HomecellPage() {
  const { L } = getL();
  const zonas = (await apiGet<HomecellZona[]>('/public/homecell', { revalidate: 600 })) ?? [];
  const total = zonas.reduce((n, z) => n + z.homecells.length, 0);

  return (
    <ScreenPage
      Icon={HousePlus}
      badge="Homecell"
      title={L('Homecell', 'Homecell')}
      subtitle={L(
        'Komunitas kecil untuk bertumbuh bersama — temukan homecell di cabang Anda.',
        'Small communities to grow together — find a homecell in your branch.',
      )}
      aside={
        total ? (
          <span className="rounded-full bg-white/15 border border-white/25 px-3 py-1.5 text-sm font-bold">
            {total} homecell
          </span>
        ) : null
      }
    >
      {total === 0 ? (
        <EmptyState Icon={HousePlus}>{L('Untuk saat ini belum ada homecell yang ditampilkan', 'No homecells to show yet')}</EmptyState>
      ) : (
        <HomecellBrowser zonas={zonas} />
      )}
    </ScreenPage>
  );
}
