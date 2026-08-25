'use client';

import { useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Building2,
  Users,
  Calendar,
  Megaphone,
  Home as HomeIcon,
  TrendingUp,
  Loader2,
  MapPin,
  Phone,
  ExternalLink,
  CalendarDays,
  UserCheck,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { BarChart, DonutChart, LineChart } from '@/components/charts/simple-charts';
import { RekeningSection } from '@/components/cabang/rekening-section';

// ============== Types ==============

interface CabangStats {
  cabang: {
    id: string;
    nama: string;
    kode: string;
    alamat: string | null;
    kontak: string | null;
    sinode: { id: string; nama: string; kode: string };
  };
  periode: { from: string; to: string; days: number };
  kpi: {
    jemaatAktif: number;
    ibadahAktif: number;
    homecellAktif: number;
    homecellArea: number;
    eventDiPeriode: number;
    totalIbadahCheckin: number;
    totalEventCheckin: number;
    totalHomecellPertemuan: number;
    totalHomecellKehadiran: number;
  };
  topIbadah: Array<{
    ibadahId: string;
    ibadahNama: string;
    kategori: string | null;
    kehadiran: number;
  }>;
  topEvent: Array<{
    eventId: string;
    judul: string;
    tanggalMulai: string;
    butuhKehadiran: boolean;
    kapasitas: number | null;
    hadir: number;
    bayar: number;
    daftar: number;
    totalPartisipasi: number;
  }>;
  timeSeries: Array<{ tanggal: string; ibadahCheckin: number; eventCheckin: number }>;
  homecells: Array<{
    id: string;
    nama: string;
    area: string;
    memberAktif: number;
    memberBaru: number;
    scheduleCount: number;
    totalAttendance: number;
    avgAttendancePercent: number | null;
    isActive: boolean;
  }>;
  reservasiStatusBreakdown: { JOIN: number; RESERVE: number; CANCEL: number };
}

// ============== Page ==============

// Preset range periode
const PERIODE_PRESETS = [
  { label: '7 hari', days: 7 },
  { label: '30 hari', days: 30 },
  { label: '90 hari', days: 90 },
  { label: '1 tahun', days: 365 },
];

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}
function isoDaysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
function formatDateID(iso: string) {
  return new Date(iso).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default function CabangDetailPage() {
  const params = useParams<{ id: string }>();
  const cabangId = params.id;

  const [from, setFrom] = useState(() => isoDaysAgo(29));
  const [to, setTo] = useState(() => isoToday());

  const statsQ = useQuery({
    queryKey: ['cabang', 'stats', cabangId, from, to],
    queryFn: async () => {
      const res = await apiClient.get<{ data: CabangStats }>(
        `/admin/cabang/${cabangId}/stats`,
        { params: { from, to } },
      );
      return res.data.data;
    },
  });

  function applyPreset(days: number) {
    setFrom(isoDaysAgo(days - 1));
    setTo(isoToday());
  }

  if (statsQ.isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
      </div>
    );
  }
  if (!statsQ.data) {
    return (
      <div className="text-center py-20 text-neutral-500">
        Cabang tidak ditemukan.
        <Link href="/dashboard/cabang" className="block mt-2 text-brand-600 hover:underline">
          ← Kembali ke daftar cabang
        </Link>
      </div>
    );
  }

  const stats = statsQ.data;

  return (
    <div className="w-full space-y-6">
      <Link
        href="/dashboard/cabang"
        className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900"
      >
        <ArrowLeft className="w-3 h-3" /> Kembali ke daftar cabang
      </Link>

      {/* Header */}
      <div className="bg-white border border-neutral-200 rounded-xl p-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
              <Building2 className="w-6 h-6 text-brand-500" />
              {stats.cabang.nama}
              <span className="text-base font-mono px-2 py-0.5 bg-neutral-100 text-neutral-600 rounded">
                {stats.cabang.kode}
              </span>
            </h1>
            <p className="text-sm text-neutral-500 mt-1">
              Sinode {stats.cabang.sinode.nama} · {stats.cabang.sinode.kode}
            </p>
            <div className="mt-3 text-sm text-neutral-700 space-y-1">
              {stats.cabang.alamat && (
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-neutral-400 shrink-0" />
                  {stats.cabang.alamat}
                </div>
              )}
              {stats.cabang.kontak && (
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-neutral-400 shrink-0" />
                  {stats.cabang.kontak}
                </div>
              )}
            </div>
          </div>
          <Link
            href={`/dashboard/jemaat?cabangId=${stats.cabang.id}`}
            className="text-sm text-brand-600 hover:underline inline-flex items-center gap-1"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Lihat jemaat
          </Link>
        </div>
      </div>

      {/* Rekening Bank section */}
      <RekeningSection cabangId={stats.cabang.id} />

      {/* Filter periode */}
      <div className="bg-white border border-neutral-200 rounded-xl p-4 flex items-end gap-3 flex-wrap">
        <div>
          <label className="block text-[11px] text-neutral-500 font-medium mb-1">Dari</label>
          <input
            type="date"
            value={from}
            max={to}
            onChange={(e) => setFrom(e.target.value)}
            className="px-2 py-1.5 border border-neutral-300 rounded text-sm bg-white"
          />
        </div>
        <div>
          <label className="block text-[11px] text-neutral-500 font-medium mb-1">Sampai</label>
          <input
            type="date"
            value={to}
            min={from}
            max={isoToday()}
            onChange={(e) => setTo(e.target.value)}
            className="px-2 py-1.5 border border-neutral-300 rounded text-sm bg-white"
          />
        </div>
        <div className="flex items-center gap-1">
          {PERIODE_PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => applyPreset(p.days)}
              className="px-2.5 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-100 border border-neutral-300 rounded"
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="ml-auto text-xs text-neutral-500">
          {formatDateID(stats.periode.from)} – {formatDateID(stats.periode.to)} ({stats.periode.days} hari)
        </div>
      </div>

      {/* KPI cards — row 1: jemaat + 3 jenis kehadiran */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          icon={Users}
          label="Jemaat Aktif"
          value={stats.kpi.jemaatAktif}
          color="bg-brand-500"
        />
        <KpiCard
          icon={Calendar}
          label="Kehadiran Ibadah"
          value={stats.kpi.totalIbadahCheckin}
          sublabel={`dari ${stats.kpi.ibadahAktif} ibadah aktif`}
          color="bg-blue-500"
        />
        <KpiCard
          icon={Megaphone}
          label="Kehadiran Event"
          value={stats.kpi.totalEventCheckin}
          sublabel={`dari ${stats.kpi.eventDiPeriode} event di periode`}
          color="bg-amber-500"
        />
        <KpiCard
          icon={UserCheck}
          label="Kehadiran Homecell"
          value={stats.kpi.totalHomecellKehadiran}
          sublabel={`dari ${stats.kpi.totalHomecellPertemuan} pertemuan di periode`}
          color="bg-purple-500"
        />
      </div>

      {/* KPI cards — row 2: struktur cabang (area + homecell + total pertemuan) */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <KpiCard
          icon={MapPin}
          label="Homecell Area"
          value={stats.kpi.homecellArea}
          sublabel="zona pengelompokan"
          color="bg-teal-500"
        />
        <KpiCard
          icon={HomeIcon}
          label="Homecell Aktif"
          value={stats.kpi.homecellAktif}
          sublabel={`di ${stats.kpi.homecellArea} area`}
          color="bg-green-500"
        />
        <KpiCard
          icon={CalendarDays}
          label="Total Pertemuan"
          value={stats.kpi.totalHomecellPertemuan}
          sublabel="jadwal homecell di periode"
          color="bg-indigo-500"
        />
      </div>

      {/* Time series */}
      <Card
        icon={TrendingUp}
        title="Tren Kehadiran"
        subtitle="Kehadiran ibadah & event per hari di rentang periode."
      >
        <LineChart
          xLabels={stats.timeSeries.map((t) => t.tanggal)}
          series={[
            {
              label: 'Ibadah',
              color: '#3b82f6',
              data: stats.timeSeries.map((t) => t.ibadahCheckin),
              fill: true,
            },
            {
              label: 'Event',
              color: '#f59e0b',
              data: stats.timeSeries.map((t) => t.eventCheckin),
              fill: false,
            },
          ]}
        />
      </Card>

      {/* Row: top ibadah + reservasi breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card
          icon={Calendar}
          title="Ibadah Terpopuler"
          subtitle="Top 10 ibadah berdasarkan total check-in di periode."
        >
          <BarChart
            data={stats.topIbadah.map((i) => ({
              label: i.ibadahNama,
              value: i.kehadiran,
              hint: i.kategori ?? undefined,
            }))}
            color="bg-blue-500"
          />
        </Card>
        <Card
          icon={TrendingUp}
          title="Status Reservasi Ibadah"
          subtitle="Distribusi status reservasi sepanjang periode."
        >
          <ReservasiDonut data={stats.reservasiStatusBreakdown} />
        </Card>
      </div>

      {/* Top event */}
      <Card
        icon={Megaphone}
        title="Partisipasi Event"
        subtitle="Event di periode + breakdown peserta dari cabang ini."
      >
        {stats.topEvent.length === 0 ? (
          <p className="text-sm text-neutral-400 italic text-center py-6">
            Belum ada event di periode ini.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-neutral-200 text-neutral-500">
                <tr>
                  <th className="text-left py-2 px-2 font-medium">Event</th>
                  <th className="text-left py-2 px-2 font-medium w-32">Tanggal</th>
                  <th className="text-right py-2 px-2 font-medium w-16">Daftar</th>
                  <th className="text-right py-2 px-2 font-medium w-16">Bayar</th>
                  <th className="text-right py-2 px-2 font-medium w-16">Hadir</th>
                  <th className="text-right py-2 px-2 font-medium w-20">Total</th>
                </tr>
              </thead>
              <tbody>
                {stats.topEvent.map((e) => (
                  <tr key={e.eventId} className="border-b border-neutral-100 hover:bg-neutral-50">
                    <td className="py-2 px-2">
                      <Link
                        href={`/dashboard/event/${e.eventId}`}
                        className="text-brand-600 hover:underline font-medium"
                      >
                        {e.judul}
                      </Link>
                      {e.kapasitas && (
                        <span className="ml-1.5 text-[10px] text-neutral-400">
                          (max {e.kapasitas})
                        </span>
                      )}
                      {e.butuhKehadiran && (
                        <span className="ml-1.5 inline-block px-1.5 py-0.5 text-[10px] bg-green-100 text-green-700 rounded">
                          Absensi
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-2 text-neutral-600">
                      {formatDateID(e.tanggalMulai)}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums text-neutral-600">
                      {e.daftar}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums text-blue-700">{e.bayar}</td>
                    <td className="py-2 px-2 text-right tabular-nums text-green-700 font-semibold">
                      {e.hadir}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums text-neutral-900 font-semibold">
                      {e.totalPartisipasi}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Homecell summary table — per-homecell: member aktif, pertemuan,
          attendance, dan rata-rata kehadiran. Sengaja table (bukan bar chart)
          biar bisa surface 4 metric sekaligus dengan ranking yg jelas. */}
      <Card
        icon={HomeIcon}
        title="Aktivitas Homecell"
        subtitle="Per homecell di cabang ini: anggota aktif, pertemuan, kehadiran, dan rata-rata persentase."
      >
        {stats.homecells.length === 0 ? (
          <p className="text-sm text-neutral-400 italic text-center py-6">
            Belum ada homecell di cabang ini.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-neutral-200 text-neutral-500">
                <tr>
                  <th className="text-left py-2 px-2 font-medium">Homecell</th>
                  <th className="text-left py-2 px-2 font-medium w-28">Area</th>
                  <th className="text-right py-2 px-2 font-medium w-20">Member</th>
                  <th className="text-right py-2 px-2 font-medium w-24">Baru</th>
                  <th className="text-right py-2 px-2 font-medium w-24">Pertemuan</th>
                  <th className="text-right py-2 px-2 font-medium w-24">Hadir</th>
                  <th className="text-right py-2 px-2 font-medium w-28">Rata² Hadir</th>
                </tr>
              </thead>
              <tbody>
                {stats.homecells.map((h) => {
                  const pct = h.avgAttendancePercent;
                  const pctColor =
                    pct === null
                      ? 'text-neutral-400'
                      : pct >= 75
                        ? 'text-green-700'
                        : pct >= 50
                          ? 'text-amber-700'
                          : 'text-red-700';
                  return (
                    <tr
                      key={h.id}
                      className={`border-b border-neutral-100 hover:bg-neutral-50 ${h.isActive ? '' : 'opacity-50'}`}
                    >
                      <td className="py-2 px-2">
                        <Link
                          href={`/dashboard/homecell/${h.id}`}
                          className="text-brand-600 hover:underline font-medium"
                        >
                          {h.nama}
                        </Link>
                        {!h.isActive && (
                          <span className="ml-1.5 text-[10px] text-neutral-400">
                            (nonaktif)
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-neutral-600 truncate">{h.area}</td>
                      <td className="py-2 px-2 text-right tabular-nums text-neutral-700">
                        {h.memberAktif}
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums text-green-700">
                        {h.memberBaru > 0 ? `+${h.memberBaru}` : '—'}
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums text-neutral-700">
                        {h.scheduleCount}
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums text-neutral-700">
                        {h.totalAttendance}
                      </td>
                      <td
                        className={`py-2 px-2 text-right tabular-nums font-semibold ${pctColor}`}
                        title={
                          pct === null
                            ? 'Belum ada pertemuan atau member di periode ini'
                            : `${h.totalAttendance} hadir dari ${h.memberAktif * h.scheduleCount} potensi check-in`
                        }
                      >
                        {pct === null ? '—' : `${pct}%`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ============== Sub-components ==============

function KpiCard({
  icon: Icon,
  label,
  value,
  sublabel,
  color,
}: {
  icon: typeof Users;
  label: string;
  value: number;
  sublabel?: string;
  color: string;
}) {
  return (
    <div className="bg-white border border-neutral-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] text-neutral-500 uppercase tracking-wider font-semibold">
          {label}
        </span>
        <div className={`w-7 h-7 ${color} text-white rounded-lg flex items-center justify-center`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <div className="text-2xl font-bold text-neutral-900 tabular-nums">
        {value.toLocaleString('id-ID')}
      </div>
      {sublabel && <div className="text-[11px] text-neutral-500 mt-0.5">{sublabel}</div>}
    </div>
  );
}

function Card({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: typeof Users;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-neutral-200 rounded-xl p-5">
      <div className="mb-4">
        <h2 className="font-semibold text-neutral-900 flex items-center gap-2">
          <Icon className="w-4 h-4 text-neutral-400" />
          {title}
        </h2>
        {subtitle && <p className="text-xs text-neutral-500 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function ReservasiDonut({
  data,
}: {
  data: { JOIN: number; RESERVE: number; CANCEL: number };
}) {
  const total = data.JOIN + data.RESERVE + data.CANCEL;
  const segments = useMemo(
    () => [
      { label: 'Hadir (JOIN)', value: data.JOIN, color: '#22c55e' },
      { label: 'Reservasi (RESERVE)', value: data.RESERVE, color: '#3b82f6' },
      { label: 'Batal (CANCEL)', value: data.CANCEL, color: '#ef4444' },
    ],
    [data],
  );
  return (
    <DonutChart
      data={segments}
      centerLabel={total.toLocaleString('id-ID')}
      centerSublabel="Total"
    />
  );
}
