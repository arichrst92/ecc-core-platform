import { jamZone } from '../tz-label';
import Link from 'next/link';
import { Eye } from 'lucide-react';
import { createIbadahSchema, updateIbadahSchema } from '@ecc/shared-types';
import type { ResourceConfig } from '../crud-types';
import { statusBadge, nestedField, dateLocal, chipText } from './render-helpers';

interface Ibadah extends Record<string, unknown> {
  id: string;
  cabangId: string;
  kategoriIbadahId: string;
  nama: string;
  tipeJadwal: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'ONCE';
  tanggalMulai: string;
  hari: string | null;
  mingguKe?: number | null;
  jamMulai: string;
  jamSelesai: string;
  lokasi: string | null;
  isOnline: boolean;
  linkOnline: string | null;
  requiresCheckout: boolean;
  isKidsIbadah: boolean;
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

const MINGGU_KE_OPTIONS = [
  { value: '1', label: 'Minggu pertama' },
  { value: '2', label: 'Minggu kedua' },
  { value: '3', label: 'Minggu ketiga' },
  { value: '4', label: 'Minggu keempat' },
];
const MINGGU_KE_LABEL = ['', 'pertama', 'kedua', 'ketiga', 'keempat'];

/** "Bulanan · Sabtu minggu kedua" / "Mingguan · Minggu". */
export function jadwalLabel(row: { tipeJadwal: string; hari: string | null; mingguKe?: number | null; tanggalMulai: string }) {
  const tipe = TIPE_OPTIONS.find((t) => t.value === row.tipeJadwal)?.label ?? row.tipeJadwal;
  if (row.tipeJadwal === 'ONCE') return `${tipe} · ${dateLocal(row.tanggalMulai)}`;
  const hari = row.hari ? HARI_OPTIONS.find((h) => h.value === row.hari)?.label : null;
  if (row.tipeJadwal === 'MONTHLY') {
    if (row.mingguKe && hari) return `${tipe} · ${hari} minggu ${MINGGU_KE_LABEL[row.mingguKe]}`;
    return `${tipe} · tiap tgl ${new Date(row.tanggalMulai).getUTCDate()}`;
  }
  return `${tipe}${hari ? ` · ${hari}` : ''}`;
}

const TIPE_OPTIONS = [
  { value: 'WEEKLY', label: 'Mingguan' },
  { value: 'BIWEEKLY', label: 'Dua Mingguan' },
  { value: 'MONTHLY', label: 'Bulanan' },
  { value: 'ONCE', label: 'Sekali (Event)' },
];

export const ibadahResource: ResourceConfig<Ibadah> = {
  name: 'ibadah',
  label: 'Ibadah',
  labelPlural: 'jadwal ibadah per cabang gereja',
  endpoint: '/admin/ibadah',
  displayField: 'nama',
  defaultSort: { field: 'nama', order: 'asc' },
  columns: [
    {
      key: 'nama',
      label: 'Nama Ibadah',
      render: (_v, row) => (
        <Link
          href={`/dashboard/ibadah/${row.id}`}
          className="flex items-center gap-1.5 text-brand-600 hover:underline font-medium"
        >
          <Eye className="w-3.5 h-3.5 shrink-0" />
          {row.nama}
        </Link>
      ),
    },
    { key: 'cabang', label: 'Cabang', render: nestedField('cabang.nama'), width: '140px' },
    { key: 'kategoriIbadah', label: 'Kategori', render: nestedField('kategoriIbadah.nama'), width: '120px' },
    {
      key: 'tipeJadwal',
      label: 'Jadwal',
      width: '180px',
      render: (_v, row) => jadwalLabel(row),
    },
    {
      key: 'jamMulai',
      label: 'Jam',
      width: '170px',
      render: (_v, row) => jamZone(row.jamMulai, row.jamSelesai, (row.cabang as { timezone?: string } | undefined)?.timezone),
    },
    {
      key: 'isOnline',
      label: 'Mode',
      width: '90px',
      render: (v) => (v ? chipText('Online', 'blue') : chipText('Offline', 'neutral')),
    },
    {
      key: 'kapasitasSeat',
      label: 'Seat',
      width: '80px',
      render: (v) => (typeof v === 'number' ? v.toLocaleString('id-ID') : '—'),
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
      name: 'mingguKe',
      label: 'Setiap minggu ke',
      type: 'select',
      options: MINGGU_KE_OPTIONS,
      helperText: 'Jadwal Bulanan: pilih minggu ke-berapa dalam bulan, lalu pilih harinya.',
      showIf: (v) => v.tipeJadwal === 'MONTHLY',
    },
    {
      name: 'hari',
      label: 'Hari',
      type: 'select',
      options: HARI_OPTIONS,
      helperText: 'Mingguan / Dua Mingguan: hari ibadah. Bulanan: hari pada minggu yang dipilih (mis. Sabtu minggu kedua).',
      // Hide untuk ONCE (pakai tanggal spesifik)
      showIf: (v) => v.tipeJadwal === 'WEEKLY' || v.tipeJadwal === 'BIWEEKLY' || v.tipeJadwal === 'MONTHLY',
    },
    {
      name: 'tanggalMulai',
      label: 'Tanggal',
      type: 'date',
      required: true,
      helperText:
        'Untuk recurring: tanggal pertama ibadah dimulai. Untuk Sekali (ONCE): tanggal event berlangsung.',
    },
    { name: 'jamMulai', label: 'Jam Mulai', type: 'time', required: true, placeholder: '08:00' },
    { name: 'jamSelesai', label: 'Jam Selesai', type: 'time', required: true, placeholder: '10:00' },
    { name: 'lokasi', label: 'Lokasi', type: 'text', placeholder: 'Sanctuary Lt. 2' },
    {
      name: 'mapsUrl',
      label: 'Titik lokasi (link Google Maps)',
      type: 'text',
      placeholder: 'https://maps.app.goo.gl/… atau -6.2088, 106.8456',
      helperText:
        'Titik untuk cek radius self check-in. Kosong → memakai titik cabang (kalau ada).',
    },
    {
      name: 'selfCheckinRadiusM',
      label: 'Self check-in jemaat',
      type: 'select',
      defaultValue: '',
      options: [
        { value: '', label: 'Di mana saja (tanpa cek lokasi)' },
        { value: '50', label: 'Dalam radius 50 m' },
        { value: '100', label: 'Dalam radius 100 m' },
        { value: '200', label: 'Dalam radius 200 m' },
        { value: '300', label: 'Dalam radius 300 m' },
        { value: '500', label: 'Dalam radius 500 m' },
        { value: '1000', label: 'Dalam radius 1 km' },
        { value: '2000', label: 'Dalam radius 2 km' },
        { value: '5000', label: 'Dalam radius 5 km' },
      ],
      helperText:
        'Dengan radius: jemaat harus berada di dekat titik lokasi (GPS HP dicek). Di luar radius diarahkan ke usher untuk scan QR. Radius butuh titik lokasi ibadah atau cabang.',
    },
    {
      name: 'kapasitasSeat',
      label: 'Jumlah Seat',
      type: 'number',
      placeholder: '300',
      helperText:
        'Hanya untuk pendataan % okupansi di laporan & aplikasi. Tidak membatasi check-in — jemaat tetap bisa masuk walau sudah penuh.',
    },
    { name: 'isOnline', label: 'Online?', type: 'switch', defaultValue: false },
    {
      name: 'linkOnline',
      label: 'Link Stream',
      type: 'url',
      placeholder: 'https://youtube.com/...',
      helperText: 'Wajib jika ibadah online.',
      showIf: (v) => !!v.isOnline,
    },
    { name: 'deskripsi', label: 'Deskripsi', type: 'textarea' },
    {
      name: 'isKidsIbadah',
      label: 'Ibadah Anak? 🧒',
      type: 'switch',
      defaultValue: false,
      helperText:
        'Kalau ON: (1) mobile tampil badge "Ibadah Anak" di list, (2) saat check-in auto-generate 6-digit kode jemput untuk parent, (3) point earn di-enable saat check-in.',
    },
    {
      name: 'requiresCheckout',
      label: 'Wajib Checkout?',
      type: 'switch',
      defaultValue: false,
      helperText:
        'Kalau ON, jemaat yg sudah check-in HARUS di-scan lagi saat keluar (admin scan QR). Biasanya untuk ibadah anak — security tracking. Ibadah dewasa umumnya OFF.',
    },
    { name: 'isActive', label: 'Status Aktif', type: 'switch', defaultValue: true },
  ],
  createSchema: createIbadahSchema,
  updateSchema: updateIbadahSchema,
};
