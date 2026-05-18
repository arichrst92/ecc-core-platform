import Link from 'next/link';
import { Home } from 'lucide-react';
import { createHomecellAreaSchema, updateHomecellAreaSchema } from '@ecc/shared-types';
import type { ResourceConfig } from '../crud-types';
import { statusBadge, nestedField } from './render-helpers';

interface HomecellArea extends Record<string, unknown> {
  id: string;
  cabangId: string;
  nama: string;
  deskripsi: string | null;
  picJemaatId: string | null;
  isActive: boolean;
  cabang?: { id: string; nama: string; kode: string };
  picJemaat?: { id: string; namaLengkap: string; fotoUrl: string | null } | null;
  homecellCount?: number;
}

export const homecellAreaResource: ResourceConfig<HomecellArea> = {
  name: 'homecell-area',
  label: 'Homecell Area',
  labelPlural: 'zone / area homecell',
  endpoint: '/admin/homecell-area',
  displayField: 'nama',
  defaultSort: { field: 'nama', order: 'asc' },
  columns: [
    { key: 'nama', label: 'Nama Area' },
    { key: 'cabang', label: 'Cabang', render: nestedField('cabang.nama'), width: '160px' },
    {
      key: 'picJemaat',
      label: 'PIC (Zone Leader)',
      width: '200px',
      render: (_v, row) =>
        row.picJemaat ? row.picJemaat.namaLengkap : <span className="text-neutral-400">—</span>,
    },
    {
      key: 'homecellCount',
      label: 'Homecells',
      width: '130px',
      render: (_v, row) => (
        <Link
          href={`/dashboard/homecell?areaId=${row.id}`}
          className="inline-flex items-center gap-1 text-brand-600 hover:underline font-medium"
        >
          <Home className="w-3.5 h-3.5" />
          {row.homecellCount ?? 0}
        </Link>
      ),
    },
    { key: 'isActive', label: 'Status', width: '90px', render: statusBadge },
  ],
  fields: [
    {
      name: 'cabangId',
      label: 'Cabang',
      type: 'relation',
      required: true,
      relation: { endpoint: '/admin/cabang', labelKey: 'nama', formatLabel: (i) => `${i.nama} (${i.kode})` },
    },
    {
      name: 'nama',
      label: 'Nama Area',
      type: 'text',
      required: true,
      placeholder: 'Zone Utara, Zone Selatan, dll',
    },
    {
      name: 'picJemaatId',
      label: 'PIC (Zone Leader)',
      type: 'relation',
      relation: {
        endpoint: '/admin/jemaat/by-pelayanan?pelayanan=Penggembalaan&role=Zone%20Leader',
        labelKey: 'namaLengkap',
      },
      helperText: 'Hanya jemaat dengan Pelayanan Penggembalaan + role Zone Leader yang tampil.',
    },
    { name: 'deskripsi', label: 'Deskripsi', type: 'textarea' },
    { name: 'isActive', label: 'Status Aktif', type: 'switch', defaultValue: true },
  ],
  createSchema: createHomecellAreaSchema,
  updateSchema: updateHomecellAreaSchema,
};
