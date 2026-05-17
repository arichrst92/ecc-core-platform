'use client';

import { CrudPage } from '@/components/crud/crud-page';
import { tipeRelasiResource } from '@/lib/resources/tipe-relasi-config';

export default function TipeRelasiPage() {
  return <CrudPage config={tipeRelasiResource} />;
}
