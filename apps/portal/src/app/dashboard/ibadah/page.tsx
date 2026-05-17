'use client';

import { CrudPage } from '@/components/crud/crud-page';
import { ibadahResource } from '@/lib/resources/ibadah-config';

export default function IbadahPage() {
  return <CrudPage config={ibadahResource} />;
}
