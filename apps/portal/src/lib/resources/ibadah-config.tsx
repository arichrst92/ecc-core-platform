import { createIbadahSchema, updateIbadahSchema } from '@ecc/shared-types';
import type { ResourceConfig } from '../crud-types';
import { statusBadge, nestedField, dateLocal, chipText } from './render-helpers';

interface Ibadah extends Record<string, unknown> {
  id: string;
  cabangId: string;
  kategoriIbadahId: string;
  nama: string;
  tipeJadwal: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
  tanggalMulai: string;
  hari: string | null;
  jamMulai: string;
  jamSelesai: string;
  lokasi: string | null;
  isOnline: boolean;
  linkStream: string | null;
  isActive: boolean;
  cabang?: { id: string; nama: string };
  kategoriIbadah?: { id: string; nama: string };
}

const HARI_OPTIONS = [
  { value: 'MINGGU', label: 'Minggu' },
  { value: 'SENIN', label: 'Senin' },
  { value: 'SELASA', label: 'Selasa' },
  { value: 'RABU', label: 'Rabu' },
  { value: 'KAMIS', label: 'Kamis' },
  { value: 'JUMAT', label: 'Jumat' },
  { value: 'SABTU', label: 'Sabtu' },
];

const TIPE_OPTIONS = [
  { value: 'WEEKLY', label: 'Mingguan' },
  { value: 'BIWEEKLY', label: 'Dua Mingguan' },
  { value: 'MONTHLY', label: 'Bulanan' },
];

export const ibadahResource: ResourceConfig<Ibadah> = {
  name: 'ibadah',
  label: 'Ibadah',
  labelPlural: 'jadwal ibadah per cabang gereja',
  endpoint: '/admin/ibadah',
  displayField: 'nama',
  defaultSort: { field: 'nama', order: 'asc' },
  columns: [
    { key: 'nama', label: 'Nama Ibadah' },
    { key: 'cabang', label: 'Cabang', render: nestedField('cabang.nama'), width: '140px' },
    { key: 'kategoriIbadah', label: 'Kategori', render: nestedField('kategoriIbadah.nama'), width: '120px' },
    {
      key: 'tipeJadwal',
      label: 'Jadwal',
      width: '180px',
      render: (_v, row) => {
        const tipe = TIPE_OPTIONS.find((t) => t.value === row.tipeJadwal)?.label ?? row.tipeJadwal;
        const hari = row.hari ? HARI_OPTIONS.find((h) => h.value === row.hari)?.label : null;
        return `${tipe}${hari ? ` · ${hari}` : ''}`;
      },
    },
    {
      key: 'jamMulai',
      label: 'Jam',
      width: '120px',
      render: (_v, row) => `${row.jamMulai}–${row.jamSelesai}`,
    },
    {
      key: 'isOnline',
      label: 'Mode',
      width: '90px',
      render: (v) => (v ? chipText('Online', 'blue') : chipText('Offline', 'neutral')),
    },
    { key: 'tanggalMulai', label: 'Mulai', width: '110px', render: (v) => dateLocal(v) },
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
      name: 'kategoriIbadahId',
      label: 'Kategori Ibadah',
      type: 'relation',
      required: true,
      relation: { endpoint: '/admin/ibadah/kategori', labelKey: 'nama' },
    },
    { name: 'nama', label: 'Nama Ibadah', type: 'text', required: true, placeholder: 'Ibadah Umum Pagi' },
    { name: 'tipeJadwal', label: 'Tipe Jadwal', type: 'select', required: true, options: TIPE_OPTIONS },
    {
      name: 'hari',
      label: 'Hari',
      type: 'select',
      options: HARI_OPTIONS,
      helperText: 'Wajib untuk jadwal Mingguan / Dua Mingguan.',
      showIf: (v) => v.tipeJadwal !== 'MONTHLY',
    },
    { name: 'tanggalMulai', label: 'Tanggal Mulai', type: 'date', required: true, helperText: 'Tanggal pertama ibadah ini diadakan.' },
    { name: 'jamMulai', label: 'Jam Mulai', type: 'time', required: true, placeholder: '08:00' },
    { name: 'jamSelesai', label: 'Jam Selesai', type: 'time', required: true, placeholder: '10:00' },
    { name: 'lokasi', label: 'Lokasi', type: 'text', placeholder: 'Sanctuary Lt. 2' },
    { name: 'isOnline', label: 'Online?', type: 'switch', defaultValue: false },
    {
      name: 'linkStream',
      label: 'Link Stream',
      type: 'url',
      placeholder: 'https://youtube.com/...',
      helperText: 'Wajib jika ibadah online.',
      showIf: (v) => !!v.isOnline,
    },
    { name: 'deskripsi', label: 'Deskripsi', type: 'textarea' },
    { name: 'isActive', label: 'Status Aktif', type: 'switch', defaultValue: true },
  ],
  createSchema: createIbadahSchema,
  updateSchema: updateIbadahSchema,
};
