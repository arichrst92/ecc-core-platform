import { createCabangSchema, updateCabangSchema } from '@ecc/shared-types';
import type { ResourceConfig } from '../crud-types';
import { statusBadge, nestedField } from './render-helpers';

interface Cabang extends Record<string, unknown> {
  id: string;
  sinodeId: string;
  nama: string;
  kode: string;
  alamat: string | null;
  kontak: string | null;
  isActive: boolean;
  sinode?: { id: string; nama: string; kode: string };
}

export const cabangResource: ResourceConfig<Cabang> = {
  name: 'cabang',
  label: 'Cabang Gereja',
  labelPlural: 'cabang-cabang gereja di tiap sinode',
  endpoint: '/admin/cabang',
  displayField: 'nama',
  defaultSort: { field: 'nama', order: 'asc' },
  columns: [
    { key: 'kode', label: 'Kode', width: '100px' },
    { key: 'nama', label: 'Nama Cabang' },
    { key: 'sinode', label: 'Sinode', render: nestedField('sinode.nama') },
    { key: 'kontak', label: 'Kontak', width: '160px' },
    { key: 'isActive', label: 'Status', width: '90px', render: statusBadge },
  ],
  fields: [
    {
      name: 'sinodeId',
      label: 'Sinode',
      type: 'relation',
      required: true,
      relation: { endpoint: '/admin/sinode', labelKey: 'nama', formatLabel: (i) => `${i.nama} (${i.kode})` },
    },
    { name: 'nama', label: 'Nama Cabang', type: 'text', required: true, placeholder: 'ECC Jakarta' },
    {
      name: 'kode',
      label: 'Kode Cabang',
      type: 'text',
      required: true,
      placeholder: 'JKT',
      helperText: 'Unik per sinode (huruf kapital).',
    },
    { name: 'alamat', label: 'Alamat', type: 'textarea' },
    { name: 'kontak', label: 'Kontak', type: 'text', placeholder: 'No HP / email' },
    { name: 'isActive', label: 'Status Aktif', type: 'switch', defaultValue: true },
  ],
  createSchema: createCabangSchema,
  updateSchema: updateCabangSchema,
};
