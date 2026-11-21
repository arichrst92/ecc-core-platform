import { NeedsFillBadge } from '@/components/ui/needs-fill-badge';
import Link from 'next/link';
import { Users, Home, BarChart3, MapPin, Smartphone } from 'lucide-react';
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
  latitude: number | null;
  longitude: number | null;
  mapsUrl: string | null;
  timezone: string;
  isActive: boolean;
  sinode?: { id: string; nama: string; kode: string };
  jemaatCount?: number;
  /** Jemaat aktif yang sudah memakai Els App (selesai onboarding di app). */
  appUserCount?: number;
  ibadahCount?: number;
  homecellAreaCount?: number;
  homecellCount?: number;
}

/** Link hasil migrasi dari koordinat lama (bukan link tempat asli dari Google Maps). */
const LEGACY_COORD_LINK = /maps\/search\/\?api=1&query=-?\d+(\.\d+)?,-?\d+(\.\d+)?$/;

/** Zona waktu IANA yang umum dipakai cabang ECC. */
const TIMEZONE_OPTIONS = [
  { value: 'Asia/Jakarta', label: 'WIB — Asia/Jakarta (UTC+7)' },
  { value: 'Asia/Makassar', label: 'WITA — Asia/Makassar (UTC+8)' },
  { value: 'Asia/Jayapura', label: 'WIT — Asia/Jayapura (UTC+9)' },
  { value: 'Asia/Singapore', label: 'Singapore (UTC+8)' },
  { value: 'Asia/Kuala_Lumpur', label: 'Kuala Lumpur (UTC+8)' },
  { value: 'Asia/Hong_Kong', label: 'Hong Kong (UTC+8)' },
  { value: 'Asia/Taipei', label: 'Taipei (UTC+8)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (UTC+9)' },
  { value: 'Asia/Seoul', label: 'Seoul (UTC+9)' },
  { value: 'Australia/Perth', label: 'Perth (UTC+8)' },
  { value: 'Australia/Brisbane', label: 'Brisbane (UTC+10)' },
  { value: 'Australia/Sydney', label: 'Sydney / Melbourne (UTC+10/+11)' },
  { value: 'Pacific/Auckland', label: 'Auckland (UTC+12/+13)' },
  { value: 'Asia/Dubai', label: 'Dubai (UTC+4)' },
  { value: 'Europe/London', label: 'London (UTC+0/+1)' },
  { value: 'Europe/Amsterdam', label: 'Amsterdam / Berlin (UTC+1/+2)' },
  { value: 'America/New_York', label: 'New York (UTC−5/−4)' },
  { value: 'America/Chicago', label: 'Chicago (UTC−6/−5)' },
  { value: 'America/Denver', label: 'Denver (UTC−7/−6)' },
  { value: 'America/Los_Angeles', label: 'Los Angeles (UTC−8/−7)' },
  { value: 'America/Toronto', label: 'Toronto (UTC−5/−4)' },
];

export const cabangResource: ResourceConfig<Cabang> = {
  name: 'cabang',
  label: 'Cabang Gereja',
  labelPlural: 'cabang-cabang gereja di tiap sinode',
  endpoint: '/admin/cabang',
  displayField: 'nama',
  defaultSort: { field: 'nama', order: 'asc' },
  columns: [
    { key: 'kode', label: 'Kode', width: '100px' },
    {
      key: 'nama',
      label: 'Nama Cabang',
      render: (_v, row) => (
        <Link
          href={`/dashboard/cabang/${row.id}`}
          className="inline-flex items-center gap-1.5 text-brand-600 hover:underline font-medium"
          title="Lihat detail + statistik cabang"
        >
          <BarChart3 className="w-3.5 h-3.5 shrink-0" />
          {row.nama}
        </Link>
      ),
    },
    { key: 'sinode', label: 'Sinode', render: nestedField('sinode.nama'), width: '160px' },
    {
      key: 'jemaatCount',
      label: 'Jemaat',
      width: '100px',
      render: (_v, row) => (
        <Link
          href={`/dashboard/jemaat?cabangId=${row.id}`}
          className="inline-flex items-center gap-1 text-brand-600 hover:underline font-medium"
          title="Lihat jemaat di cabang ini"
        >
          <Users className="w-3.5 h-3.5" />
          {row.jemaatCount ?? 0}
        </Link>
      ),
    },
    {
      key: 'appUserCount',
      label: 'Pakai Els App',
      width: '130px',
      render: (_v, row) => {
        const n = row.appUserCount ?? 0;
        const total = row.jemaatCount ?? 0;
        const pct = total ? Math.round((n / total) * 100) : 0;
        return (
          <span
            className="inline-flex items-center gap-1 font-medium text-neutral-800"
            title="Jemaat aktif (bukan tamu) yang sudah masuk & menyelesaikan pendaftaran di Els App"
          >
            <Smartphone className="w-3.5 h-3.5 text-brand-500" />
            {n.toLocaleString('id-ID')}
            {total ? <span className="text-[11px] text-neutral-500">({pct}%)</span> : null}
          </span>
        );
      },
    },
    {
      key: 'homecellCount',
      label: 'Homecell',
      width: '110px',
      render: (_v, row) => (
        <Link
          href={`/dashboard/homecell?cabangId=${row.id}`}
          className="inline-flex items-center gap-1 text-brand-600 hover:underline font-medium"
          title="Lihat homecell di cabang ini"
        >
          <Home className="w-3.5 h-3.5" />
          {row.homecellCount ?? 0}
          {row.homecellAreaCount ? (
            <span className="text-[10px] text-neutral-400">/{row.homecellAreaCount} area</span>
          ) : null}
        </Link>
      ),
    },
    { key: 'kontak', label: 'Kontak', width: '140px' },
    {
      key: 'mapsUrl',
      label: 'Lokasi',
      width: '110px',
      render: (_v, row) =>
        row.mapsUrl && LEGACY_COORD_LINK.test(row.mapsUrl) ? (
          <span
            className="text-xs text-amber-700"
            title="Masih link dari koordinat lama. Ganti dengan link Bagikan dari Google Maps supaya Petunjuk arah menuju titik tempat."
          >
            Perlu link Google Maps
          </span>
        ) : row.mapsUrl ? (
          <a
            href={row.mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-brand-600 hover:underline"
            title={row.latitude != null && row.longitude != null ? `Titik: ${row.latitude.toFixed(7)}, ${row.longitude.toFixed(7)}` : undefined}
          >
            <MapPin className="w-3.5 h-3.5" />
            Buka peta
          </a>
        ) : (
          <NeedsFillBadge hint="Lokasi cabang belum diisi — dipakai petunjuk arah, Map View, dan jarak homecell ke cabang. Klik Edit untuk mengisi link Google Maps." />
        ),
    },
    {
      key: 'rekeningCount',
      label: 'Rekening / QRIS',
      width: '170px',
      render: (_v, row) => {
        const rek = Number(row.rekeningCount ?? 0);
        const tanpa = Number(row.rekeningTanpaQris ?? 0);
        if (!row.isActive) return <span className="text-xs text-neutral-400">{rek} rekening</span>;
        if (!rek)
          return (
            <Link href={`/dashboard/cabang/${row.id}`} onClick={(e) => e.stopPropagation()}>
              <NeedsFillBadge label="Rekening perlu diisi" hint="Belum ada rekening — buka detail cabang → Tambah Rekening" />
            </Link>
          );
        return (
          <div className="leading-tight">
            <span className="text-xs text-neutral-700">{rek} rekening</span>
            {tanpa ? (
              <div className="mt-0.5">
                <Link href={`/dashboard/cabang/${row.id}`} onClick={(e) => e.stopPropagation()}>
                  <NeedsFillBadge
                    label={`${tanpa} QRIS perlu diisi`}
                    hint="Rekening aktif tanpa QRIS — buka detail cabang → Upload QRIS"
                  />
                </Link>
              </div>
            ) : (
              <div className="text-[11px] text-emerald-700">QRIS lengkap</div>
            )}
          </div>
        );
      },
    },
    { key: 'timezone', label: 'Zona Waktu', width: '150px' },
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
    {
      name: 'mapsUrl',
      label: 'Titik lokasi (link Google Maps)',
      type: 'text',
      placeholder: 'https://maps.app.goo.gl/… atau -6.2088, 106.8456',
      helperText:
        'Tempel link "Bagikan" dari Google Maps. Dipakai untuk tombol Petunjuk arah, radius self check-in (ibadah/event tanpa titik sendiri), dan Globe dasbor. Kosongkan untuk menghapus titik.',
    },
    {
      name: 'timezone',
      label: 'Zona Waktu',
      type: 'select',
      required: true,
      defaultValue: 'Asia/Jakarta',
      options: TIMEZONE_OPTIONS,
      helperText:
        'Jam jadwal ibadah & event cabang ini mengikuti zona waktu ini. Jemaat di zona lain melihat jam yang sudah dikonversi ke zona waktu HP mereka.',
    },
    { name: 'isActive', label: 'Status Aktif', type: 'switch', defaultValue: true },
  ],
  createSchema: createCabangSchema,
  updateSchema: updateCabangSchema,
};
