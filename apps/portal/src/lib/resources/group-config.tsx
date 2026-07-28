import Link from 'next/link';
import { Eye, Users, Globe, Lock } from 'lucide-react';
import { createGroupSchema, updateGroupSchema } from '@ecc/shared-types';
import type { ResourceConfig } from '../crud-types';
import { statusBadge, nestedField } from './render-helpers';

interface Group extends Record<string, unknown> {
  id: string;
  cabangId: string;
  parentId: string | null;
  nama: string;
  deskripsi: string | null;
  jenis: 'FAMILY' | 'MINISTRY' | 'COMMUNITY' | 'HOMECELL_STYLE' | 'SYSTEM' | 'LAINNYA';
  alamat: string | null;
  gps: string | null;
  hari: string | null;
  jam: string | null;
  picJemaatId: string | null;
  isPublic: boolean;
  joinCode: string | null;
  isActive: boolean;
  cabang?: { id: string; nama: string; kode: string };
  parent?: { id: string; nama: string } | null;
  picJemaat?: { id: string; namaLengkap: string; fotoUrl: string | null } | null;
  memberCount?: number;
  childrenCount?: number;
}

// Warna badge per jenis — biar mudah scan di list.
const JENIS_COLORS: Record<Group['jenis'], string> = {
  FAMILY: 'bg-pink-100 text-pink-700',
  MINISTRY: 'bg-blue-100 text-blue-700',
  COMMUNITY: 'bg-purple-100 text-purple-700',
  HOMECELL_STYLE: 'bg-green-100 text-green-700',
  SYSTEM: 'bg-neutral-100 text-neutral-500',
  LAINNYA: 'bg-neutral-100 text-neutral-600',
};

const JENIS_LABEL: Record<Group['jenis'], string> = {
  FAMILY: 'Family',
  MINISTRY: 'Ministry',
  COMMUNITY: 'Community',
  HOMECELL_STYLE: 'Homecell',
  SYSTEM: 'System',
  LAINNYA: 'Lainnya',
};

const HARI_OPTIONS = ['SENIN', 'SELASA', 'RABU', 'KAMIS', 'JUMAT', 'SABTU', 'MINGGU'];

export const groupResource: ResourceConfig<Group> = {
  name: 'group',
  label: 'Group',
  labelPlural: 'grup komunitas / pelayanan / keluarga',
  endpoint: '/admin/group',
  displayField: 'nama',
  defaultSort: { field: 'nama', order: 'asc' },
  columns: [
    {
      key: 'nama',
      label: 'Nama Group',
      render: (_v, row) => (
        <Link
          href={`/dashboard/group/${row.id}`}
          className="flex items-center gap-1.5 text-brand-600 hover:underline font-medium"
        >
          <Eye className="w-3.5 h-3.5 shrink-0" />
          {row.nama}
        </Link>
      ),
    },
    {
      key: 'jenis',
      label: 'Jenis',
      width: '130px',
      render: (_v, row) => (
        <span
          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${JENIS_COLORS[row.jenis]}`}
        >
          {JENIS_LABEL[row.jenis]}
        </span>
      ),
    },
    { key: 'cabang', label: 'Cabang', render: nestedField('cabang.nama'), width: '140px' },
    {
      key: 'picJemaat',
      label: 'PIC',
      width: '160px',
      render: (_v, row) =>
        row.picJemaat ? row.picJemaat.namaLengkap : <span className="text-neutral-400">—</span>,
    },
    {
      key: 'isPublic',
      label: 'Visibility',
      width: '110px',
      render: (_v, row) => (
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
            row.isPublic
              ? 'bg-emerald-100 text-emerald-700'
              : 'bg-amber-100 text-amber-800'
          }`}
          title={row.isPublic ? 'Semua bisa join' : 'Invitation via joinCode / QR scan'}
        >
          {row.isPublic ? <Globe className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
          {row.isPublic ? 'Public' : 'Private'}
        </span>
      ),
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
      name: 'cabangId',
      label: 'Cabang',
      type: 'relation',
      required: true,
      relation: { endpoint: '/admin/cabang', labelKey: 'nama' },
    },
    {
      name: 'nama',
      label: 'Nama Group',
      type: 'text',
      required: true,
      placeholder: 'mis. Cell KFC Kelapa Gading, BRIDGE, Family Wijaya',
    },
    {
      name: 'jenis',
      label: 'Jenis',
      type: 'select',
      required: true,
      options: [
        { value: 'HOMECELL_STYLE', label: 'Homecell Style — cellgroup pemuridan' },
        { value: 'FAMILY', label: 'Family — unit keluarga' },
        { value: 'MINISTRY', label: 'Ministry — tim pelayanan' },
        { value: 'COMMUNITY', label: 'Community — fellowship group' },
        { value: 'SYSTEM', label: 'System — internal group' },
        { value: 'LAINNYA', label: 'Lainnya' },
      ],
      defaultValue: 'LAINNYA',
    },
    {
      name: 'parentId',
      label: 'Parent Group (opsional)',
      type: 'relation',
      relation: { endpoint: '/admin/group?limit=100', labelKey: 'nama' },
      helperText: 'Kalau group ini bagian dari group lain (nested hierarchy).',
    },
    {
      name: 'picJemaatId',
      label: 'PIC (Leader)',
      type: 'relation',
      relation: { endpoint: '/admin/jemaat', labelKey: 'namaLengkap' },
      helperText: 'Kalau kosong, default = creator (yg bikin group).',
    },
    { name: 'deskripsi', label: 'Deskripsi', type: 'textarea' },
    { name: 'alamat', label: 'Lokasi / Tempat', type: 'text', placeholder: 'Jl. Sudirman No. 12' },
    {
      name: 'gps',
      label: 'GPS Koordinat',
      type: 'text',
      placeholder: '-6.2088, 106.8456',
      helperText: 'Format "lat, lng" — copy dari Google Maps',
    },
    {
      name: 'hari',
      label: 'Hari Pertemuan',
      type: 'select',
      options: [
        { value: '', label: '(tidak reguler)' },
        ...HARI_OPTIONS.map((h) => ({ value: h, label: h.charAt(0) + h.slice(1).toLowerCase() })),
      ],
    },
    { name: 'jam', label: 'Jam Mulai (HH:mm)', type: 'text', placeholder: '19:00' },
    {
      name: 'isPublic',
      label: 'Public Group',
      type: 'switch',
      defaultValue: true,
      helperText:
        'Public: siapa saja bisa lihat + join langsung. Private: hidden dari listing, join hanya via kode invitation (QR scan). Toggle ke private otomatis generate joinCode.',
    },
    { name: 'isActive', label: 'Status Aktif', type: 'switch', defaultValue: true },
  ],
  createSchema: createGroupSchema,
  updateSchema: updateGroupSchema,
};
