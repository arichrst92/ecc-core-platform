'use client';

import { CrudPage } from '@/components/crud/crud-page';
import { sinodeResource } from '@/lib/resources/sinode-config';

export default function SinodePage() {
  return <CrudPage config={sinodeResource} />;
}
