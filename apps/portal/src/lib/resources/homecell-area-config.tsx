import Link from 'next/link';
import { CalendarCheck, Home, Users } from 'lucide-react';
import { homecellAttendanceTier } from '@ecc/shared-types';
import { ATTENDANCE_TIER_CLASS } from './homecell-config';
import { createHomecellAreaSchema, updateHomecellAreaSchema } from '@ecc/shared-types';
import type { ResourceConfig } from '../crud-types';
import { statusBadge, nestedField } from './render-helpers';

interface HomecellArea extends Record<string, unknown> {
  id: string;
  cabangId: string;
  nama: string;
  deskripsi: string | null;
  picJemaatId: string | null;
  isActive: boolean;
  cabang?: { id: string; nama: string; kode: string };
  picJemaat?: { id: string; namaLengkap: string; fotoUrl: string | null } | null;
  homecellCount?: number;
  homecellAktif?: number;
  memberCount?: number;
  avgAge?: number | null;
  meetingCount?: number;
  attendancePercent?: number | null;
  homecellNoMeeting?: number;
}

/** Keterangan warna kehadiran (dipakai di halaman Homecell Area). */
export const AREA_TIER_LEGEND = (
  <div className="flex flex-wrap items-center gap-2 text-[11px] text-neutral-500 mt-2">
    <span className="font-medium">Indikator kehadiran:</span>
    <span className={`px-2 py-0.5 rounded-full font-semibold ${ATTENDANCE_TIER_CLASS.merah}`}>0–25%</span>
    <span className={`px-2 py-0.5 rounded-full font-semibold ${ATTENDANCE_TIER_CLASS.oranye}`}>26–50%</span>
    <span className={`px-2 py-0.5 rounded-full font-semibold ${ATTENDANCE_TIER_CLASS.kuning}`}>51–75%</span>
    <span className={`px-2 py-0.5 rounded-full font-semibold ${ATTENDANCE_TIER_CLASS.hijau}`}>76–100%</span>
    <span className="ml-1">· Kehadiran = hadir ÷ (anggota aktif × pertemuan) dalam periode</span>
  </div>
);

export const homecellAreaResource: ResourceConfig<HomecellArea> = {
  name: 'homecell-area',
  label: 'Homecell Area',
  labelPlural: 'zone / area homecell',
  endpoint: '/admin/homecell-area',
  displayField: 'nama',
  defaultSort: { field: 'nama', order: 'asc' },
  columns: [
    { key: 'nama', label: 'Nama Area' },
    { key: 'cabang', label: 'Cabang', render: nestedField('cabang.nama'), width: '160px' },
    {
      key: 'picJemaat',
      label: 'PIC (Zone Leader)',
      width: '200px',
      render: (_v, row) =>
        row.picJemaat ? row.picJemaat.namaLengkap : <span className="text-neutral-400">—</span>,
    },
    {
      key: 'homecellCount',
      label: 'Homecells',
      width: '130px',
      render: (_v, row) => (
        <Link
          href={`/dashboard/homecell?areaId=${row.id}`}
          className="inline-flex items-center gap-1 text-brand-600 hover:underline font-medium"
        >
          <Home className="w-3.5 h-3.5" />
          {row.homecellCount ?? 0}
        </Link>
      ),
    },
    {
      key: 'memberCount',
      label: 'Anggota',
      width: '100px',
      render: (_v, row) => (
        <span className="inline-flex items-center gap-1 text-neutral-700">
          <Users className="w-3.5 h-3.5" />
          {row.memberCount ?? 0}
        </span>
      ),
    },
    {
      key: 'avgAge',
      label: 'Usia Rata²',
      width: '100px',
      render: (_v, row) =>
        row.avgAge != null ? <span className="text-neutral-700">{row.avgAge} th</span> : <span className="text-neutral-400 text-xs">—</span>,
    },
    {
      key: 'attendancePercent',
      label: 'Kehadiran',
      width: '170px',
      render: (_v, row) => {
        const p = row.attendancePercent;
        return (
          <div className="flex flex-col items-start gap-0.5">
            {p == null ? (
              <span className="text-neutral-400 text-xs">—</span>
            ) : (
              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold tabular-nums ${ATTENDANCE_TIER_CLASS[homecellAttendanceTier(p)]}`}>
                {p}%
              </span>
            )}
            <span className="inline-flex items-center gap-1 text-[11px] text-neutral-500">
              <CalendarCheck className="w-3 h-3" />
              {row.meetingCount ?? 0} pertemuan
              {row.homecellNoMeeting ? <span className="text-red-600">· {row.homecellNoMeeting} tanpa pertemuan</span> : null}
            </span>
          </div>
        );
      },
    },
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
      name: 'nama',
      label: 'Nama Area',
      type: 'text',
      required: true,
      placeholder: 'Zone Utara, Zone Selatan, dll',
    },
    {
      name: 'picJemaatId',
      label: 'PIC (Zone Leader)',
      type: 'relation',
      relation: {
        endpoint: '/admin/jemaat/by-pelayanan?pelayanan=Penggembalaan&role=Zone%20Leader',
        labelKey: 'namaLengkap',
      },
      helperText: 'Hanya jemaat dengan Pelayanan Penggembalaan + role Zone Leader yang tampil.',
    },
    { name: 'deskripsi', label: 'Deskripsi', type: 'textarea' },
    { name: 'isActive', label: 'Status Aktif', type: 'switch', defaultValue: true },
  ],
  createSchema: createHomecellAreaSchema,
  updateSchema: updateHomecellAreaSchema,
};
