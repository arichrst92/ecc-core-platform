import Link from 'next/link';
import { Eye, Users, CalendarDays, TrendingUp } from 'lucide-react';
import { createHomecellSchema, updateHomecellSchema } from '@ecc/shared-types';
import type { ResourceConfig } from '../crud-types';
import { statusBadge, nestedField } from './render-helpers';

interface Homecell extends Record<string, unknown> {
  id: string;
  areaId: string;
  nama: string;
  deskripsi: string | null;
  picJemaatId: string | null;
  isActive: boolean;
  area?: { id: string; nama: string; cabang?: { id: string; nama: string } };
  picJemaat?: { id: string; namaLengkap: string } | null;
  memberCount?: number;
  scheduleCount?: number;
  totalAttendance?: number;
  /** Persen rata-rata kehadiran (0–100), null kalau belum ada data. */
  avgAttendancePercent?: number | null;
  /** Pertemuan terakhir (jadwal ≤ hari ini dengan ≥1 hadir), YYYY-MM-DD. */
  lastMeetingAt?: string | null;
  lastMeetingDaysAgo?: number | null;
  /** Jumlah pertemuan dalam periode filter; null kalau tidak ada filter periode. */
  periodMeetingCount?: number | null;
}

/** "Terakhir homecell: 6 Okt 2026 · 7 hari lalu" di bawah nama homecell. */
function LastMeeting({ date, daysAgo }: { date?: string | null; daysAgo?: number | null }) {
  if (!date || daysAgo == null) {
    return <div className="text-[11px] text-neutral-400 mt-0.5 font-normal">Belum ada pertemuan tercatat</div>;
  }
  const tgl = new Date(`${date}T00:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  const rel = daysAgo === 0 ? 'hari ini' : daysAgo === 1 ? 'kemarin' : `${daysAgo} hari lalu`;
  const color = daysAgo <= 7 ? 'text-green-700' : daysAgo <= 30 ? 'text-amber-700' : 'text-red-600';
  return (
    <div className="text-[11px] text-neutral-500 mt-0.5 font-normal">
      Terakhir homecell: {tgl} · <span className={`font-semibold ${color}`}>{rel}</span>
    </div>
  );
}

// Catatan: kolom alamat / hari / jam dihapus dari form & display. Jadwal
// homecell di lapangan ditentukan per kesepakatan tiap minggu, jadi data
// tetap (statis) tidak relevan. Kolom DB masih ada → data lama tidak hilang.
export const homecellResource: ResourceConfig<Homecell> = {
  name: 'homecell',
  label: 'Homecell',
  labelPlural: 'cellgroup / kelompok rumah',
  endpoint: '/admin/homecell',
  displayField: 'nama',
  defaultSort: { field: 'nama', order: 'asc' },
  columns: [
    {
      key: 'nama',
      label: 'Nama Homecell',
      render: (_v, row) => (
        <div>
          <Link
            href={`/dashboard/homecell/${row.id}`}
            className="flex items-center gap-1.5 text-brand-600 hover:underline font-medium"
          >
            <Eye className="w-3.5 h-3.5 shrink-0" />
            {row.nama}
          </Link>
          <LastMeeting date={row.lastMeetingAt} daysAgo={row.lastMeetingDaysAgo} />
        </div>
      ),
    },
    { key: 'area', label: 'Area', render: nestedField('area.nama'), width: '160px' },
    { key: 'cabang', label: 'Cabang', render: nestedField('area.cabang.nama'), width: '140px' },
    {
      key: 'picJemaat',
      label: 'PIC (Leader)',
      width: '170px',
      render: (_v, row) =>
        row.picJemaat ? row.picJemaat.namaLengkap : <span className="text-neutral-400">—</span>,
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
    {
      key: 'scheduleCount',
      label: 'Pertemuan',
      width: '150px',
      render: (_v, row) => (
        <span
          className="inline-flex items-center gap-1 text-neutral-700"
          title={`${row.totalAttendance ?? 0} total kehadiran tercatat`}
        >
          <CalendarDays className="w-3.5 h-3.5" />
          {row.scheduleCount ?? 0}
          {row.periodMeetingCount != null ? (
            <span
              className="ml-1 px-1.5 py-0.5 rounded bg-brand-50 text-brand-700 text-[11px] font-semibold"
              title="Jumlah pertemuan dalam periode filter"
            >
              {row.periodMeetingCount} di periode
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: 'avgAttendancePercent',
      label: 'Rata² Hadir',
      width: '120px',
      render: (_v, row) => {
        const pct = row.avgAttendancePercent;
        if (pct === null || pct === undefined) {
          return <span className="text-neutral-400 text-xs">—</span>;
        }
        // Color tier: <50% merah, 50-74% amber, ≥75% hijau.
        const color =
          pct >= 75
            ? 'bg-green-100 text-green-700'
            : pct >= 50
              ? 'bg-amber-100 text-amber-700'
              : 'bg-red-100 text-red-700';
        return (
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold tabular-nums ${color}`}
            title={`${row.totalAttendance ?? 0} hadir dari ${(row.memberCount ?? 0) * (row.scheduleCount ?? 0)} potensi check-in (${row.memberCount ?? 0} member × ${row.scheduleCount ?? 0} pertemuan)`}
          >
            <TrendingUp className="w-3 h-3" />
            {pct}%
          </span>
        );
      },
    },
    { key: 'isActive', label: 'Status', width: '90px', render: statusBadge },
  ],
  fields: [
    {
      name: 'areaId',
      label: 'Homecell Area',
      type: 'relation',
      required: true,
      relation: { endpoint: '/admin/homecell-area', labelKey: 'nama' },
    },
    { name: 'nama', label: 'Nama Homecell', type: 'text', required: true, placeholder: 'Homecell Kelapa Gading' },
    {
      name: 'picJemaatId',
      label: 'PIC (Homecell Leader)',
      type: 'relation',
      relation: {
        endpoint: '/admin/jemaat/by-pelayanan?pelayanan=Penggembalaan&role=Homecell%20Leader',
        labelKey: 'namaLengkap',
      },
      helperText: 'Hanya jemaat dengan Pelayanan Penggembalaan + role Homecell Leader yang tampil.',
    },
    { name: 'deskripsi', label: 'Deskripsi', type: 'textarea' },
    { name: 'alamat', label: 'Alamat Pertemuan', type: 'textarea', placeholder: 'Mis. Rumah Pak Yohanes, Jl. Mawar 5' },
    {
      name: 'mapsUrl',
      label: 'Lokasi (link Google Maps)',
      type: 'text',
      placeholder: 'https://maps.app.goo.gl/… atau -6.2088, 106.8456',
      helperText:
        'Dipakai fitur "Cari homecell terdekat" di app. Buka Google Maps → tekan lama titik lokasi → salin koordinat atau tautan Bagikan.',
    },
    { name: 'isActive', label: 'Status Aktif', type: 'switch', defaultValue: true },
  ],
  createSchema: createHomecellSchema,
  updateSchema: updateHomecellSchema,
};
