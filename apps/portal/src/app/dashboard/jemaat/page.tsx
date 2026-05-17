'use client';

import Link from 'next/link';
import { Upload } from 'lucide-react';
import { CrudPage } from '@/components/crud/crud-page';
import { jemaatResource } from '@/lib/resources/jemaat-config';

export default function JemaatPage() {
  return (
    <div>
      {/* Bar action sekunder di atas tabel */}
      <div className="flex justify-end mb-3 -mt-2">
        <Link
          href="/dashboard/jemaat/import"
          className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-brand-600 hover:bg-brand-50 rounded-lg border border-brand-200"
        >
          <Upload className="w-4 h-4" />
          Import CSV
        </Link>
      </div>
      <CrudPage config={jemaatResource} />
    </div>
  );
}
