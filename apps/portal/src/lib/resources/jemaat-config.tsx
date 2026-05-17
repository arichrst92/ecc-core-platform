import { createJemaatSchema, updateJemaatSchema } from '@ecc/shared-types';
import type { ResourceConfig } from '../crud-types';
import { statusBadge, nestedField, dateLocal } from './render-helpers';

interface Jemaat extends Record<string, unknown> {
  id: string;
  cabangId: string;
  namaLengkap: string;
  email: string | null;
  noHp: string | null;
  tanggalLahir: string | null;
  jenisKelamin: 'L' | 'P' | null;
  alamat: string | null;
  tanggalBergabung: string | null;
  fotoUrl: string | null;
  isActive: boolean;
  cabang?: { id: string; nama: string };
}

export const jemaatResource: ResourceConfig<Jemaat> = {
  name: 'jemaat',
  label: 'Jemaat',
  labelPlural: 'data anggota jemaat lintas cabang',
  endpoint: '/admin/jemaat',
  displayField: 'namaLengkap',
  defaultSort: { field: 'namaLengkap', order: 'asc' },
  // Jemaat = resource yang paling mungkin punya volume tinggi (10k+ row).
  // Pakai virtual scroll dengan chunk 50/fetch untuk UX yang smooth.
  virtualScroll: true,
  virtualChunkSize: 50,
  virtualHeight: '70vh',
  columns: [
    { key: 'namaLengkap', label: 'Nama Lengkap' },
    { key: 'cabang', label: 'Cabang', render: nestedField('cabang.nama'), width: '160px' },
    { key: 'noHp', label: 'No HP', width: '140px' },
    {
      key: 'jenisKelamin',
      label: 'L/P',
      width: '60px',
      render: (v) => (v === 'L' ? 'Laki-laki' : v === 'P' ? 'Perempuan' : '-'),
    },
    {
      key: 'tanggalBergabung',
      label: 'Bergabung',
      width: '120px',
      render: (v) => dateLocal(v),
    },
    { key: 'isActive', label: 'Status', width: '90px', render: statusBadge },
  ],
  fields: [
    {
      name: 'cabangId',
      label: 'Cabang Home',
      type: 'relation',
      required: true,
      relation: { endpoint: '/admin/cabang', labelKey: 'nama', formatLabel: (i) => `${i.nama} (${i.kode})` },
      helperText: 'Cabang tempat jemaat terdaftar resmi.',
    },
    { name: 'namaLengkap', label: 'Nama Lengkap', type: 'text', required: true },
    { name: 'noHp', label: 'No HP (WhatsApp)', type: 'tel', placeholder: '+628123456789', helperText: 'Format E.164 (+62...). Dipakai untuk login OTP.' },
    { name: 'email', label: 'Email', type: 'email' },
    {
      name: 'jenisKelamin',
      label: 'Jenis Kelamin',
      type: 'select',
      options: [
        { value: 'L', label: 'Laki-laki' },
        { value: 'P', label: 'Perempuan' },
      ],
    },
    { name: 'tanggalLahir', label: 'Tanggal Lahir', type: 'date' },
    { name: 'tanggalBergabung', label: 'Tanggal Bergabung', type: 'date' },
    { name: 'alamat', label: 'Alamat', type: 'textarea' },
    { name: 'isActive', label: 'Status Aktif', type: 'switch', defaultValue: true },
  ],
  createSchema: createJemaatSchema,
  updateSchema: updateJemaatSchema,
};
