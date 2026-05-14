'use client';

import { Plus, Construction } from 'lucide-react';

interface Props {
  title: string;
  description: string;
  resource: string;
}

/**
 * Placeholder reusable untuk halaman master data.
 * Saat fitur CRUD penuh dibangun, file ini di-replace per resource dengan
 * komponen yang spesifik (table, form modal, dst).
 */
export function MasterDataPagePlaceholder({ title, description, resource }: Props) {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">{title}</h1>
          <p className="text-neutral-500 mt-1">{description}</p>
        </div>
        <button className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded-lg font-medium text-sm">
          <Plus className="w-4 h-4" />
          Tambah
        </button>
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl p-12 text-center">
        <Construction className="w-12 h-12 mx-auto text-brand-400 mb-4" />
        <h2 className="text-lg font-semibold text-neutral-900">UI sedang dibangun</h2>
        <p className="text-sm text-neutral-500 mt-2 max-w-md mx-auto">
          Halaman CRUD untuk <code className="px-1.5 py-0.5 bg-neutral-100 rounded text-brand-600">{resource}</code> akan tersedia setelah komponen
          tabel & form generic selesai. Sementara endpoint API sudah aktif di{' '}
          <code className="px-1.5 py-0.5 bg-neutral-100 rounded">/admin/{resource}</code>.
        </p>
      </div>
    </div>
  );
}
