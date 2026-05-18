import Link from 'next/link';
import { Church, Users } from 'lucide-react';
import { createSinodeSchema, updateSinodeSchema } from '@ecc/shared-types';
import type { ResourceConfig } from '../crud-types';
import { statusBadge } from './render-helpers';

interface Sinode extends Record<string, unknown> {
  id: string;
  nama: string;
  kode: string;
  alamat: string | null;
  kontak: string | null;
  isActive: boolean;
  cabangCount?: number;
  jemaatCount?: number;
}

export const sinodeResource: ResourceConfig<Sinode> = {
  name: 'sinode',
  label: 'Sinode',
  labelPlural: 'data sinode dalam ekosistem ECC',
  endpoint: '/admin/sinode',
  displayField: 'nama',
  defaultSort: { field: 'nama', order: 'asc' },
  columns: [
    { key: 'kode', label: 'Kode', width: '100px' },
    { key: 'nama', label: 'Nama' },
    {
      key: 'cabangCount',
      label: 'Cabang',
      width: '110px',
      render: (_v, row) => (
        <Link
          href={`/dashboard/cabang?sinodeId=${row.id}`}
          className="inline-flex items-center gap-1 text-brand-600 hover:underline font-medium"
          title="Lihat cabang di sinode ini"
        >
          <Church className="w-3.5 h-3.5" />
          {row.cabangCount ?? 0}
        </Link>
      ),
    },
    {
      key: 'jemaatCount',
      label: 'Jemaat',
      width: '110px',
      render: (_v, row) => (
        <Link
          href={`/dashboard/jemaat?sinodeId=${row.id}`}
          className="inline-flex items-center gap-1 text-brand-600 hover:underline font-medium"
          title="Lihat jemaat di sinode ini"
        >
          <Users className="w-3.5 h-3.5" />
          {row.jemaatCount ?? 0}
        </Link>
      ),
    },
    { key: 'alamat', label: 'Alamat' },
    { key: 'isActive', label: 'Status', width: '90px', render: statusBadge },
  ],
  fields: [
    { name: 'nama', label: 'Nama Sinode', type: 'text', required: true, placeholder: 'Sinode ECC' },
    {
      name: 'kode',
      label: 'Kode',
      type: 'text',
      required: true,
      placeholder: 'ECC',
      helperText: 'Singkatan unik (otomatis dijadikan huruf kapital).',
    },
    { name: 'alamat', label: 'Alamat', type: 'textarea' },
    { name: 'kontak', label: 'Kontak', type: 'text', placeholder: 'No HP / email' },
    {
      name: 'isActive',
      label: 'Status Aktif',
      type: 'switch',
      defaultValue: true,
      helperText: 'Sinode aktif (tampil di list publik).',
    },
  ],
  createSchema: createSinodeSchema,
  updateSchema: updateSinodeSchema,
};
