import Link from 'next/link';
import { Eye, Users, Globe, Lock, MapPin, Pencil, Trash2, UserRound, UsersRound, Clock } from 'lucide-react';
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
  heroImageUrl?: string | null;
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

const apiBase = process.env.NEXT_PUBLIC_CORE_API_URL ?? '';
const imgSrc = (u: string) => (/^https?:\/\//.test(u) ? u : `${apiBase}${u}`);
const titleCase = (h: string) => h.charAt(0) + h.slice(1).toLowerCase();

/** Kartu group (tampilan seperti Local Market) — gambar 16:9 utuh, tidak terpotong. */
function GroupCard({ g, onEdit, onDelete }: { g: Group; onEdit: () => void; onDelete: () => void }) {
  const jadwal = [g.hari ? titleCase(g.hari) : null, g.jam].filter(Boolean).join(' · ');
  return (
    <div className={`h-full bg-white border border-neutral-200 rounded-xl overflow-hidden flex flex-col hover:shadow-md transition ${g.isActive ? '' : 'opacity-60'}`}>
      <Link href={`/dashboard/group/${g.id}`} className="flex-1 flex flex-col">
        {g.heroImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imgSrc(g.heroImageUrl)} alt={g.nama} className="w-full aspect-video object-cover bg-neutral-100" />
        ) : (
          <div className="w-full aspect-video bg-gradient-to-br from-brand-100 to-brand-50 flex items-center justify-center">
            <UsersRound className="w-9 h-9 text-brand-400" />
          </div>
        )}
        <div className="p-4 flex-1 flex flex-col gap-1.5">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold text-neutral-900 leading-snug line-clamp-2 flex-1">{g.nama}</h3>
            <span className={`shrink-0 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${JENIS_COLORS[g.jenis]}`}>{JENIS_LABEL[g.jenis]}</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
            {g.cabang?.nama ? (
              <span className="inline-flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {g.cabang.nama}
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1">
              <Users className="w-3 h-3" />
              {g.memberCount ?? 0} anggota
            </span>
            {jadwal ? (
              <span className="inline-flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {jadwal}
              </span>
            ) : null}
          </div>
          {g.deskripsi ? <p className="text-xs text-neutral-500 line-clamp-2">{g.deskripsi}</p> : null}
        </div>
      </Link>
      <div className="px-4 py-2.5 border-t border-neutral-100 flex items-center gap-2">
        <span className="flex items-center gap-1.5 min-w-0 flex-1 text-xs text-neutral-600">
          {g.picJemaat?.fotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imgSrc(g.picJemaat.fotoUrl)} alt="" className="w-5 h-5 rounded-full object-cover shrink-0" />
          ) : (
            <UserRound className="w-4 h-4 text-neutral-400 shrink-0" />
          )}
          <span className="truncate">{g.picJemaat?.namaLengkap ?? 'Belum ada PIC'}</span>
        </span>
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium shrink-0 ${
            g.isPublic ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'
          }`}
          title={g.isPublic ? 'Semua bisa join' : 'Invitation via joinCode / QR scan'}
        >
          {g.isPublic ? <Globe className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
          {g.isPublic ? 'Public' : 'Private'}
        </span>
        <button type="button" onClick={onEdit} className="p-1.5 rounded-lg text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800" title="Edit">
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button type="button" onClick={onDelete} className="p-1.5 rounded-lg text-neutral-500 hover:bg-red-50 hover:text-red-600" title="Hapus">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

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
        <div className="min-w-0">
          <Link
            href={`/dashboard/group/${row.id}`}
            className="flex items-center gap-1.5 text-brand-600 hover:underline font-medium"
          >
            <Eye className="w-3.5 h-3.5 shrink-0" />
            {row.nama}
            {Number(row.pendingJoinCount ?? 0) > 0 ? (
              <span
                className="ml-1 px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none no-underline"
                title="Permintaan bergabung menunggu persetujuan — buka detail group"
              >
                {Number(row.pendingJoinCount)} menunggu
              </span>
            ) : null}
          </Link>
          {row.parent ? (
            <Link href={`/dashboard/group/${row.parent.id}`} className="block text-xs text-neutral-500 hover:underline truncate pl-5">
              ↳ {row.parent.nama}
            </Link>
          ) : null}
        </div>
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
      // ~500 group → cari (dropdown lama hanya memuat 100 group pertama).
      relation: {
        endpoint: '/admin/group',
        labelKey: 'nama',
        searchable: true,
        excludeSelf: true,
        formatLabel: (i) => {
          const cab = (i.cabang as { nama?: string } | null | undefined)?.nama;
          return cab ? `${String(i.nama)} · ${cab}` : String(i.nama);
        },
      },
      multiSource: 'parent',
      helperText: 'Kalau group ini bagian dari group lain (nested hierarchy). Ketik nama group untuk mencari.',
    },
    {
      name: 'picJemaatId',
      label: 'PIC (Leader)',
      type: 'jemaat-single',
      multiSource: 'picJemaat',
      helperText: 'Ketik minimal 2 huruf nama / no HP / email / kode lalu pilih. Kalau kosong, default = pembuat group.',
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
        'Public: siapa saja bisa lihat + join langsung. Private: hidden dari listing, join hanya via kode invitation (QR scan). Semua group punya QR (lihat halaman detail group); dijadikan private → kode QR diganti baru.',
    },
    { name: 'isActive', label: 'Status Aktif', type: 'switch', defaultValue: true },
  ],
  createSchema: createGroupSchema,
  updateSchema: updateGroupSchema,
  // Tampilan kartu seperti Local Market (tabel diganti grid).
  gridCard: (row, a) => <GroupCard g={row} onEdit={a.onEdit} onDelete={a.onDelete} />,
};
