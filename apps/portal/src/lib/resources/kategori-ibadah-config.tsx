import { createKategoriIbadahSchema, updateKategoriIbadahSchema } from '@ecc/shared-types';
import type { ResourceConfig } from '../crud-types';
import { statusBadge } from './render-helpers';

interface KategoriIbadah extends Record<string, unknown> {
  id: string;
  nama: string;
  deskripsi: string | null;
  isActive: boolean;
}

export const kategoriIbadahResource: ResourceConfig<KategoriIbadah> = {
  name: 'kategori-ibadah',
  label: 'Kategori Ibadah',
  labelPlural: 'kategori master ibadah (Umum, Doa, Pemuda, dll)',
  endpoint: '/admin/ibadah/kategori',
  displayField: 'nama',
  defaultSort: { field: 'nama', order: 'asc' },
  searchable: false,
  columns: [
    { key: 'nama', label: 'Nama', width: '30%' },
    { key: 'deskripsi', label: 'Deskripsi' },
    { key: 'isActive', label: 'Status', width: '90px', render: statusBadge },
  ],
  fields: [
    { name: 'nama', label: 'Nama Kategori', type: 'text', required: true, placeholder: 'Ibadah Doa' },
    { name: 'deskripsi', label: 'Deskripsi', type: 'textarea' },
    { name: 'isActive', label: 'Status Aktif', type: 'switch', defaultValue: true },
  ],
  createSchema: createKategoriIbadahSchema,
  updateSchema: updateKategoriIbadahSchema,
};
