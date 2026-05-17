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
    { key: 'alamat', label: 'Alamat' },
    { key: 'kontak', label: 'Kontak', width: '160px' },
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
