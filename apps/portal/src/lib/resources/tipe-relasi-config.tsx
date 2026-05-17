import { createTipeRelasiSchema, updateTipeRelasiSchema } from '@ecc/shared-types';
import type { ResourceConfig } from '../crud-types';
import { statusBadge } from './render-helpers';

interface TipeRelasi extends Record<string, unknown> {
  id: string;
  nama: string;
  deskripsi: string | null;
  isActive: boolean;
}

export const tipeRelasiResource: ResourceConfig<TipeRelasi> = {
  name: 'tipe-relasi',
  label: 'Tipe Relasi Keluarga',
  labelPlural: 'tipe-tipe hubungan kekeluargaan antar jemaat',
  endpoint: '/admin/keluarga/tipe',
  displayField: 'nama',
  defaultSort: { field: 'nama', order: 'asc' },
  searchable: false,
  columns: [
    { key: 'nama', label: 'Nama', width: '30%' },
    { key: 'deskripsi', label: 'Deskripsi' },
    { key: 'isActive', label: 'Status', width: '90px', render: statusBadge },
  ],
  fields: [
    { name: 'nama', label: 'Nama Relasi', type: 'text', required: true, placeholder: 'Suami' },
    { name: 'deskripsi', label: 'Deskripsi', type: 'textarea' },
    { name: 'isActive', label: 'Status Aktif', type: 'switch', defaultValue: true },
  ],
  createSchema: createTipeRelasiSchema,
  updateSchema: updateTipeRelasiSchema,
};
