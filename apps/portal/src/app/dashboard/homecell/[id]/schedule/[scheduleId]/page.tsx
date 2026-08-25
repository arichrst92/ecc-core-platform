'use client';

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Calendar,
  MapPin,
  Users,
  UserCheck,
  UserX,
  Loader2,
  Info,
  Clock,
  Smartphone,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';

interface ScheduleDetail {
  id: string;
  homecellId: string;
  tanggal: string;
  lokasi: string;
  catatan: string | null;
  creator: { id: string; namaLengkap: string } | null;
  createdBy: string | null;
  createdAt: string;
  attendanceCount: number;
  memberCount: number;
  attendances: {
    id: string;
    jemaatId: string;
    scannedAt: string;
    scannedBy: string | null;
    source: 'QR_SCAN' | 'MANUAL';
    jemaat: {
      id: string;
      namaLengkap: string;
      kode: string;
      fotoUrl: string | null;
    };
    scanner: { id: string; namaLengkap: string } | null;
  }[];
  missingMembers: {
    jemaatId: string;
    namaLengkap: string;
    kode: string;
  }[];
}

export default function HomecellScheduleDetailPage() {
  const params = useParams<{ id: string; scheduleId: string }>();
  const router = useRouter();
  const homecellId = params.id;
  const scheduleId = params.scheduleId;

  const q = useQuery({
    queryKey: ['homecell', 'schedule', 'detail', homecellId, scheduleId],
    queryFn: async () => {
      const res = await apiClient.get<{ data: ScheduleDetail }>(
        `/admin/homecell/${homecellId}/schedule/${scheduleId}`,
      );
      return res.data.data;
    },
    enabled: !!homecellId && !!scheduleId,
  });

  if (q.isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-neutral-500">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Memuat jadwal...
      </div>
    );
  }
  if (!q.data) {
    return <div className="p-6 text-center text-neutral-500">Jadwal tidak ditemukan.</div>;
  }

  const s = q.data;
  const attendanceRate = s.memberCount > 0
    ? Math.round((s.attendanceCount / s.memberCount) * 100)
    : 0;

  return (
    <div className="space-y-6 p-6 w-full">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="p-2 rounded-lg hover:bg-neutral-100 text-neutral-600"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
            <Calendar className="w-6 h-6 text-brand-500" />
            {new Date(s.tanggal).toLocaleDateString('id-ID', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </h1>
          <div className="text-sm text-neutral-500 mt-0.5">
            <Link href={`/dashboard/homecell/${homecellId}`} className="hover:underline">
              ← Kembali ke detail homecell
            </Link>
          </div>
        </div>
      </div>

      {/* Info banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3 text-sm text-blue-800">
        <Info className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
        <div>
          <p className="font-medium mb-1">Jadwal pertemuan — read-only</p>
          <p className="text-xs text-blue-700">
            Jadwal pertemuan dan absensi dibuat oleh PIC homecell via aplikasi mobile (scan
            QR jemaat). Portal menampilkan report saja — tidak ada CRUD.
          </p>
        </div>
      </div>

      {/* Meta card */}
      <div className="bg-white border border-neutral-200 rounded-xl p-5 space-y-3 text-sm">
        <div className="flex items-start gap-3">
          <MapPin className="w-5 h-5 text-brand-500 shrink-0 mt-0.5" />
          <div>
            <div className="text-xs text-neutral-500 mb-0.5">Lokasi</div>
            <div className="text-neutral-900">{s.lokasi}</div>
          </div>
        </div>
        {s.catatan && (
          <div className="flex items-start gap-3 pt-3 border-t border-neutral-100">
            <Info className="w-5 h-5 text-neutral-400 shrink-0 mt-0.5" />
            <div>
              <div className="text-xs text-neutral-500 mb-0.5">Catatan PIC</div>
              <div className="text-neutral-700 whitespace-pre-line">{s.catatan}</div>
            </div>
          </div>
        )}
        <div className="flex items-start gap-3 pt-3 border-t border-neutral-100 text-xs text-neutral-500">
          <Clock className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            Dibuat oleh{' '}
            <strong className="text-neutral-700">{s.creator?.namaLengkap ?? '-'}</strong>
            {' · '}
            {new Date(s.createdAt).toLocaleString('id-ID', {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          icon={UserCheck}
          label="Hadir"
          value={s.attendanceCount}
          tone="green"
        />
        <StatCard icon={Users} label="Total Member" value={s.memberCount} tone="neutral" />
        <StatCard
          icon={UserX}
          label="Tidak Hadir"
          value={s.missingMembers.length}
          tone="amber"
          sub={`${attendanceRate}% kehadiran`}
        />
      </div>

      {/* Attendance list */}
      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-neutral-100">
          <h2 className="font-bold text-neutral-900 flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-green-500" />
            Hadir ({s.attendances.length})
          </h2>
        </div>
        {s.attendances.length === 0 ? (
          <div className="p-8 text-center text-sm text-neutral-400">
            Belum ada absensi tercatat.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-neutral-50/50 border-b border-neutral-100 text-neutral-600 uppercase text-xs">
              <tr>
                <th className="px-5 py-2 text-left font-medium">Nama</th>
                <th className="px-5 py-2 text-left font-medium" style={{ width: '180px' }}>
                  Kode
                </th>
                <th className="px-5 py-2 text-left font-medium" style={{ width: '160px' }}>
                  Waktu Scan
                </th>
                <th className="px-5 py-2 text-left font-medium" style={{ width: '180px' }}>
                  Scanner
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {s.attendances.map((a) => (
                <tr key={a.id} className="hover:bg-neutral-50">
                  <td className="px-5 py-2.5">
                    <Link
                      href={`/dashboard/jemaat/${a.jemaat.id}`}
                      className="text-brand-600 hover:underline font-medium"
                    >
                      {a.jemaat.namaLengkap}
                    </Link>
                  </td>
                  <td className="px-5 py-2.5 font-mono text-xs text-neutral-500">
                    {a.jemaat.kode}
                  </td>
                  <td className="px-5 py-2.5 text-neutral-700 tabular-nums">
                    {new Date(a.scannedAt).toLocaleTimeString('id-ID', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}{' '}
                    <span className="text-neutral-400 text-xs">
                      {new Date(a.scannedAt).toLocaleDateString('id-ID', {
                        day: '2-digit',
                        month: 'short',
                      })}
                    </span>
                  </td>
                  <td className="px-5 py-2.5 text-neutral-600">
                    {a.scanner?.namaLengkap ?? '-'}
                    {a.source === 'MANUAL' && (
                      <span className="ml-1.5 px-1.5 py-0.5 bg-amber-50 text-amber-700 text-xs rounded">
                        Manual
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Missing members */}
      {s.missingMembers.length > 0 && (
        <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-neutral-100">
            <h2 className="font-bold text-neutral-900 flex items-center gap-2">
              <UserX className="w-5 h-5 text-amber-500" />
              Tidak Hadir ({s.missingMembers.length})
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Member aktif homecell yang belum scan absensi di pertemuan ini.
            </p>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-neutral-50/50 border-b border-neutral-100 text-neutral-600 uppercase text-xs">
              <tr>
                <th className="px-5 py-2 text-left font-medium">Nama</th>
                <th className="px-5 py-2 text-left font-medium" style={{ width: '200px' }}>
                  Kode
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {s.missingMembers.map((m) => (
                <tr key={m.jemaatId} className="hover:bg-neutral-50">
                  <td className="px-5 py-2.5">
                    <Link
                      href={`/dashboard/jemaat/${m.jemaatId}`}
                      className="text-neutral-700 hover:text-brand-600 hover:underline"
                    >
                      {m.namaLengkap}
                    </Link>
                  </td>
                  <td className="px-5 py-2.5 font-mono text-xs text-neutral-500">
                    {m.kode}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* CTA — pancing PIC scan via mobile */}
      <div className="p-5 bg-brand-50 border border-brand-200 rounded-xl flex items-start gap-3">
        <Smartphone className="w-6 h-6 text-brand-500 shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-medium text-brand-900 mb-1">Scan absensi via aplikasi mobile</p>
          <p className="text-brand-700 text-xs">
            PIC homecell bisa scan QR jemaat untuk catat kehadiran langsung dari aplikasi
            ECC. Update list di sini akan refresh saat reload page.
          </p>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
  sub,
}: {
  icon: typeof Users;
  label: string;
  value: number;
  tone: 'green' | 'neutral' | 'amber';
  sub?: string;
}) {
  const tones = {
    green: 'bg-green-50 text-green-700 border-green-200',
    neutral: 'bg-neutral-50 text-neutral-700 border-neutral-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
  };
  return (
    <div className={`border rounded-xl p-4 ${tones[tone]}`}>
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wider opacity-70">{label}</div>
        <Icon className="w-4 h-4 opacity-60" />
      </div>
      <div className="text-3xl font-bold mt-2 tabular-nums">{value}</div>
      {sub && <div className="text-xs opacity-70 mt-1">{sub}</div>}
    </div>
  );
}
