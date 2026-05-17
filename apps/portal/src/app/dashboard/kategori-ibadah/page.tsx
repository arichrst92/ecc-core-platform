'use client';

import { CrudPage } from '@/components/crud/crud-page';
import { kategoriIbadahResource } from '@/lib/resources/kategori-ibadah-config';

export default function KategoriIbadahPage() {
  return <CrudPage config={kategoriIbadahResource} />;
}
