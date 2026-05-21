import Link from 'next/link';
import { Eye, Users } from 'lucide-react';
import { createHomecellSchema, updateHomecellSchema } from '@ecc/shared-types';
import type { ResourceConfig } from '../crud-types';
import { statusBadge, nestedField } from './render-helpers';

interface Homecell extends Record<string, unknown> {
  id: string;
  areaId: string;
  nama: string;
  deskripsi: string | null;
  picJemaatId: string | null;
  isActive: boolean;
  area?: { id: string; nama: string; cabang?: { id: string; nama: string } };
  picJemaat?: { id: string; namaLengkap: string } | null;
  memberCount?: number;
}

// Catatan: kolom alamat / hari / jam dihapus dari form & display. Jadwal
// homecell di lapangan ditentukan per kesepakatan tiap minggu, jadi data
// tetap (statis) tidak relevan. Kolom DB masih ada → data lama tidak hilang.
export const homecellResource: ResourceConfig<Homecell> = {
  name: 'homecell',
  label: 'Homecell',
  labelPlural: 'cellgroup / kelompok rumah',
  endpoint: '/admin/homecell',
  displayField: 'nama',
  defaultSort: { field: 'nama', order: 'asc' },
  columns: [
    {
      key: 'nama',
      label: 'Nama Homecell',
      render: (_v, row) => (
        <Link
          href={`/dashboard/homecell/${row.id}`}
          className="flex items-center gap-1.5 text-brand-600 hover:underline font-medium"
        >
          <Eye className="w-3.5 h-3.5 shrink-0" />
          {row.nama}
        </Link>
      ),
    },
    { key: 'area', label: 'Area', render: nestedField('area.nama'), width: '160px' },
    { key: 'cabang', label: 'Cabang', render: nestedField('area.cabang.nama'), width: '140px' },
    {
      key: 'picJemaat',
      label: 'PIC (Leader)',
      width: '170px',
      render: (_v, row) =>
        row.picJemaat ? row.picJemaat.namaLengkap : <span className="text-neutral-400">—</span>,
    },
    {
      key: 'memberCount',
      label: 'Member',
      width: '90px',
      render: (_v, row) => (
        <span className="inline-flex items-center gap-1 text-neutral-700">
          <Users className="w-3.5 h-3.5" />
          {row.memberCount ?? 0}
        </span>
      ),
    },
    { key: 'isActive', label: 'Status', width: '90px', render: statusBadge },
  ],
  fields: [
    {
      name: 'areaId',
      label: 'Homecell Area',
      type: 'relation',
      required: true,
      relation: { endpoint: '/admin/homecell-area', labelKey: 'nama' },
    },
    { name: 'nama', label: 'Nama Homecell', type: 'text', required: true, placeholder: 'Homecell Kelapa Gading' },
    {
      name: 'picJemaatId',
      label: 'PIC (Homecell Leader)',
      type: 'relation',
      relation: {
        endpoint: '/admin/jemaat/by-pelayanan?pelayanan=Penggembalaan&role=Homecell%20Leader',
        labelKey: 'namaLengkap',
      },
      helperText: 'Hanya jemaat dengan Pelayanan Penggembalaan + role Homecell Leader yang tampil.',
    },
    { name: 'deskripsi', label: 'Deskripsi', type: 'textarea' },
    { name: 'isActive', label: 'Status Aktif', type: 'switch', defaultValue: true },
  ],
  createSchema: createHomecellSchema,
  updateSchema: updateHomecellSchema,
};
