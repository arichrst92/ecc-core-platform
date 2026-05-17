'use client';

import { CrudPage } from '@/components/crud/crud-page';
import { cabangResource } from '@/lib/resources/cabang-config';

export default function CabangPage() {
  return <CrudPage config={cabangResource} />;
}
