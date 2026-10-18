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
  Footprints,
  HeartHandshake,
  Smartphone,
  UserPlus,
  PieChart,
  Link2Off,
  Briefcase,
  Armchair,
  Footprints as WalkIcon,
  Baby,
  Gift,
} from 'lucide-react';
import { ExportButtons } from '@/components/report/report-ui';
import { apiClient } from '@/lib/api-client';
import { BarChart, DonutChart, LineChart } from '@/components/charts/simple-charts';
import { RekeningSection } from '@/components/cabang/rekening-section';
import { todayYmd, daysAgoYmd, parseYmd } from '@/lib/dates';

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
  executive: Executive;
}

interface Executive {
  jemaat: {
    aktif: number;
    tamu: number;
    baru: number;
    tamuBaru: number;
    pria: number;
    wanita: number;
    tanpaGender: number;
    tanpaTanggalLahir: number;
  };
  ageGroups: { label: string; count: number }[];
  journey: { total: number; stages: { stage: number; label: string; count: number; pct: number }[] };
  keterlibatan: {
    pelayanan: number;
    pelayananPct: number;
    homecell: number;
    homecellPct: number;
    keduanya: number;
    keduanyaPct: number;
    belumTerhubung: number;
    belumTerhubungPct: number;
  };
  app: { pernahLogin: number; pernahLoginPct: number; aktif30Hari: number; aktif30HariPct: number };
  ibadah: {
    jemaatHadirUnik: number;
    jemaatHadirPct: number;
    tamuHadirUnik: number;
    pertemuan: number;
    rataRataPerPertemuan: number;
  };
  okupansi: {
    rataOkupansi: number | null;
    melebihi: number;
    pertemuanDenganSeat: number;
    ibadahTanpaSeat: number;
    perIbadah: {
      ibadahId: string;
      nama: string;
      jamMulai: string;
      seat: number | null;
      pertemuan: number;
      rataHadir: number;
      rataOkupansi: number | null;
      puncakHadir: number;
      puncakOkupansi: number | null;
      melebihi: number;
    }[];
  };
  visit: {
    total: number;
    pelakuUnik: number;
    dikunjungiUnik: number;
    rataPerPelaku: number;
    topPelaku: { nama: string; count: number }[];
    perMinggu: { week: string; count: number }[];
  };
  ckids: {
    anakTerdaftar: number;
    ibadahAnak: number;
    kehadiran: number;
    anakHadirUnik: number;
    anakHadirPct: number;
    pertemuan: number;
    rataRataPerPertemuan: number;
    poinDiberikan: number;
    poinDitukar: number;
    penukaranHadiah: number;
    hadiahAktif: number;
    stokHadiah: number;
    hadiahStokHabis: number;
    topHadiah: { nama: string; count: number }[];
  };
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
  return todayYmd();
}
function isoDaysAgo(n: number) {
  return daysAgoYmd(n);
}
function formatDateID(iso: string) {
  return parseYmd(iso).toLocaleDateString('id-ID', {
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
        <div className="ml-auto flex items-center gap-3 flex-wrap">
          <span className="text-xs text-neutral-500">
            {formatDateID(stats.periode.from)} – {formatDateID(stats.periode.to)} ({stats.periode.days} hari)
          </span>
          <ExportButtons
            endpoint={`/admin/cabang/${stats.cabang.id}/stats/export`}
            params={{ from, to }}
            filename={`laporan-cabang-${stats.cabang.kode}-${from}_${to}`}
          />
        </div>
      </div>

      {/* ================= Ringkasan eksekutif ================= */}
      <ExecutiveSummary x={stats.executive} kpi={stats.kpi} cabangId={stats.cabang.id} />

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

      {/* Rekening Bank section */}
      <RekeningSection cabangId={stats.cabang.id} />
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

// ============== Ringkasan eksekutif ==============

function ExecutiveSummary({ x, kpi, cabangId }: { x: Executive; kpi: CabangStats['kpi']; cabangId: string }) {
  const n = (v: number) => v.toLocaleString('id-ID');
  const ageMax = Math.max(1, ...x.ageGroups.map((g) => g.count));
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-neutral-900">Ringkasan Eksekutif</h2>
        <p className="text-xs text-neutral-500">
          Persentase dihitung dari jemaat aktif (anggota) cabang saat ini. Kehadiran & jemaat baru mengikuti periode di atas.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard icon={Users} label="Jemaat Aktif" value={x.jemaat.aktif} sublabel={`+${n(x.jemaat.baru)} baru di periode`} color="bg-brand-500" />
        <KpiCard
          icon={UserCheck}
          label="Hadir Ibadah"
          value={x.ibadah.jemaatHadirUnik}
          sublabel={`${x.ibadah.jemaatHadirPct}% jemaat aktif (unik)`}
          color="bg-blue-500"
        />
        <KpiCard icon={UserPlus} label="Tamu Hadir" value={x.ibadah.tamuHadirUnik} sublabel={`${n(x.jemaat.tamuBaru)} tamu baru tercatat`} color="bg-violet-500" />
        <KpiCard icon={HeartHandshake} label="Terlibat Pelayanan" value={x.keterlibatan.pelayanan} sublabel={`${x.keterlibatan.pelayananPct}% jemaat aktif`} color="bg-pink-500" />
        <KpiCard icon={HomeIcon} label="Terlibat Homecell" value={x.keterlibatan.homecell} sublabel={`${x.keterlibatan.homecellPct}% jemaat aktif`} color="bg-purple-500" />
        <KpiCard icon={Smartphone} label="Aktif di App" value={x.app.aktif30Hari} sublabel={`${x.app.aktif30HariPct}% · 30 hari terakhir`} color="bg-emerald-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card icon={Footprints} title="Spiritual Journey" subtitle="Jumlah jemaat aktif per tahap saat ini (berurutan dari tahap 1).">
          {x.journey.total === 0 ? (
            <p className="text-sm text-neutral-400 italic text-center py-6">
              Belum ada tahap. Atur di menu{' '}
              <Link href="/dashboard/spiritual-journey" className="text-brand-600 hover:underline">
                Spiritual Journey
              </Link>
              .
            </p>
          ) : (
            <div className="space-y-2.5">
              {x.journey.stages.map((st) => (
                <PctBar
                  key={st.stage}
                  label={st.label}
                  count={st.count}
                  pct={st.pct}
                  color={st.stage === 0 ? 'bg-neutral-300' : 'bg-emerald-500'}
                  href={`/dashboard/jemaat?cabangId=${cabangId}&journeyStage=${st.stage}`}
                />
              ))}
            </div>
          )}
        </Card>

        <Card icon={PieChart} title="Keterlibatan Jemaat" subtitle="Seberapa banyak jemaat aktif yang terhubung ke pelayanan & homecell.">
          <div className="space-y-2.5">
            <PctBar label="Terlibat pelayanan" count={x.keterlibatan.pelayanan} pct={x.keterlibatan.pelayananPct} color="bg-pink-500" icon={HeartHandshake} />
            <PctBar label="Terlibat homecell" count={x.keterlibatan.homecell} pct={x.keterlibatan.homecellPct} color="bg-purple-500" icon={HomeIcon} />
            <PctBar label="Pelayanan & homecell" count={x.keterlibatan.keduanya} pct={x.keterlibatan.keduanyaPct} color="bg-brand-500" icon={Users} />
            <PctBar label="Belum terhubung" count={x.keterlibatan.belumTerhubung} pct={x.keterlibatan.belumTerhubungPct} color="bg-neutral-400" icon={Link2Off} />
          </div>
          <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-neutral-100 text-center">
            <MiniStat label="Rata-rata hadir / ibadah" value={n(x.ibadah.rataRataPerPertemuan)} />
            <MiniStat label="Pertemuan ibadah" value={n(x.ibadah.pertemuan)} />
            <MiniStat label="Pernah login app" value={`${x.app.pernahLoginPct}%`} />
          </div>
        </Card>
      </div>

      <Card icon={Briefcase} title="Demografi Jemaat Aktif" subtitle="Jenis kelamin & kelompok usia.">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <div className="flex h-3 rounded-full overflow-hidden bg-neutral-100">
              {x.jemaat.aktif > 0 ? (
                <>
                  <div className="bg-sky-500" style={{ width: `${(x.jemaat.pria / x.jemaat.aktif) * 100}%` }} />
                  <div className="bg-pink-400" style={{ width: `${(x.jemaat.wanita / x.jemaat.aktif) * 100}%` }} />
                </>
              ) : null}
            </div>
            <div className="flex justify-between text-xs mt-2">
              <span className="text-sky-700 font-semibold">Laki-laki {n(x.jemaat.pria)}</span>
              <span className="text-pink-700 font-semibold">Perempuan {n(x.jemaat.wanita)}</span>
            </div>
            {x.jemaat.tanpaGender > 0 ? (
              <p className="text-[11px] text-neutral-400 mt-1">{n(x.jemaat.tanpaGender)} belum mengisi jenis kelamin</p>
            ) : null}
            <p className="text-[11px] text-neutral-500 mt-3">
              Tamu tercatat: <strong>{n(x.jemaat.tamu)}</strong> · Ibadah aktif: <strong>{n(kpi.ibadahAktif)}</strong>
            </p>
          </div>
          <div className="md:col-span-2 space-y-1.5">
            {x.ageGroups.map((g) => (
              <div key={g.label} className="flex items-center gap-3 text-xs">
                <span className="w-28 text-neutral-600 shrink-0">{g.label}</span>
                <div className="flex-1 h-2.5 bg-neutral-100 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-500 rounded-full" style={{ width: `${(g.count / ageMax) * 100}%` }} />
                </div>
                <span className="w-12 text-right tabular-nums font-semibold text-neutral-800">{n(g.count)}</span>
              </div>
            ))}
            {x.jemaat.tanpaTanggalLahir > 0 ? (
              <p className="text-[11px] text-neutral-400">{n(x.jemaat.tanpaTanggalLahir)} belum mengisi tanggal lahir</p>
            ) : null}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Okupansi ibadah */}
        <Card icon={Armchair} title="Okupansi Ibadah" subtitle="Rata-rata hadir ÷ jumlah seat (pendataan).">
          <div className="flex items-baseline gap-2 mb-3">
            <span
              className={`text-3xl font-bold tabular-nums ${
                (x.okupansi.rataOkupansi ?? 0) > 100 ? 'text-red-600' : 'text-teal-700'
              }`}
            >
              {x.okupansi.rataOkupansi == null ? '—' : `${x.okupansi.rataOkupansi.toLocaleString('id-ID')}%`}
            </span>
            <span className="text-xs text-neutral-500">
              rata-rata
              {x.okupansi.melebihi ? (
                <span className="text-red-600 font-semibold"> · {x.okupansi.melebihi}× melebihi seat</span>
              ) : null}
            </span>
          </div>
          <div className="space-y-2.5">
            {x.okupansi.perIbadah.slice(0, 6).map((r) => (
              <PctBar
                key={r.ibadahId}
                label={`${r.nama} ${r.jamMulai}`}
                count={r.rataHadir}
                pct={r.rataOkupansi ?? 0}
                pctLabel={r.rataOkupansi == null ? 'seat belum diisi' : `${r.rataOkupansi.toLocaleString('id-ID')}%`}
                color={
                  r.rataOkupansi == null
                    ? 'bg-neutral-200'
                    : r.rataOkupansi > 100
                      ? 'bg-red-500'
                      : r.rataOkupansi >= 80
                        ? 'bg-amber-500'
                        : 'bg-teal-500'
                }
              />
            ))}
            {x.okupansi.perIbadah.length === 0 ? (
              <p className="text-sm text-neutral-400 italic text-center py-4">Belum ada kehadiran ibadah.</p>
            ) : null}
          </div>
          {x.okupansi.ibadahTanpaSeat ? (
            <p className="text-[11px] text-neutral-400 mt-3">{x.okupansi.ibadahTanpaSeat} ibadah belum mengisi jumlah seat (menu Ibadah).</p>
          ) : null}
        </Card>

        {/* Visit */}
        <Card icon={WalkIcon} title="Aktivitas Visit" subtitle="Kunjungan oleh / kepada jemaat cabang ini.">
          <div className="grid grid-cols-3 gap-2 text-center mb-4">
            <MiniStat label="Total visit" value={n(x.visit.total)} />
            <MiniStat label="Pelaku" value={n(x.visit.pelakuUnik)} />
            <MiniStat label="Dikunjungi" value={n(x.visit.dikunjungiUnik)} />
          </div>
          {x.visit.perMinggu.length ? (
            <div className="flex items-end gap-1 h-20 mb-3">
              {x.visit.perMinggu.map((w) => {
                const max = Math.max(1, ...x.visit.perMinggu.map((z) => z.count));
                return (
                  <div key={w.week} className="flex-1 flex flex-col items-center justify-end h-full" title={`Minggu ${formatDateID(w.week)}: ${w.count}`}>
                    <span className="text-[9px] text-neutral-600">{w.count}</span>
                    <div className="w-full bg-rose-400 rounded-t" style={{ height: `${(w.count / max) * 100}%` }} />
                  </div>
                );
              })}
            </div>
          ) : null}
          <div className="space-y-1.5">
            {x.visit.topPelaku.map((p) => (
              <div key={p.nama} className="flex justify-between text-xs">
                <span className="text-neutral-700 truncate">{p.nama}</span>
                <span className="font-semibold text-rose-600">{p.count}×</span>
              </div>
            ))}
            {x.visit.total === 0 ? <p className="text-sm text-neutral-400 italic text-center py-2">Belum ada visit di periode ini.</p> : null}
          </div>
          <Link href="/dashboard/visit" className="text-xs text-brand-600 hover:underline mt-3 inline-block">
            Buka menu Visit →
          </Link>
        </Card>

        {/* CKids */}
        <Card icon={Baby} title="CKids" subtitle="Anak ≤13 tahun, ibadah anak, poin & hadiah.">
          <div className="grid grid-cols-2 gap-2 mb-4">
            <MiniStat label="Anak terdaftar" value={n(x.ckids.anakTerdaftar)} />
            <MiniStat label={`Anak hadir · ${x.ckids.anakHadirPct}%`} value={n(x.ckids.anakHadirUnik)} />
            <MiniStat label="Rata² / pertemuan" value={n(x.ckids.rataRataPerPertemuan)} />
            <MiniStat label="Penukaran hadiah" value={n(x.ckids.penukaranHadiah)} />
          </div>
          <div className="space-y-2.5">
            <PctBar label="Poin diberikan" count={x.ckids.poinDiberikan} pct={100} pctLabel="" color="bg-green-500" />
            <PctBar
              label="Poin ditukar"
              count={x.ckids.poinDitukar}
              pct={x.ckids.poinDiberikan ? (x.ckids.poinDitukar / x.ckids.poinDiberikan) * 100 : 0}
              pctLabel=""
              color="bg-amber-500"
            />
          </div>
          <div className="mt-3 pt-3 border-t border-neutral-100">
            <div className="text-[11px] font-semibold text-neutral-500 uppercase mb-1.5 flex items-center gap-1">
              <Gift className="w-3 h-3" /> Hadiah favorit
            </div>
            {x.ckids.topHadiah.length ? (
              x.ckids.topHadiah.map((h) => (
                <div key={h.nama} className="flex justify-between text-xs py-0.5">
                  <span className="text-neutral-700 truncate">{h.nama}</span>
                  <span className="font-semibold text-violet-600">{h.count}×</span>
                </div>
              ))
            ) : (
              <p className="text-xs text-neutral-400 italic">Belum ada penukaran.</p>
            )}
            <p className="text-[11px] text-neutral-400 mt-2">
              {n(x.ckids.hadiahAktif)} hadiah aktif · stok {n(x.ckids.stokHadiah)}
              {x.ckids.hadiahStokHabis ? <span className="text-red-600 font-semibold"> · {x.ckids.hadiahStokHabis} habis</span> : null}
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}

function PctBar({
  label,
  count,
  pct,
  color,
  icon: Icon,
  href,
  pctLabel,
}: {
  label: string;
  count: number;
  pct: number;
  color: string;
  icon?: typeof Users;
  href?: string;
  /** Teks pengganti "· N%" ('' = sembunyikan). */
  pctLabel?: string;
}) {
  const content = (
    <>
      <div className="flex items-center justify-between text-xs mb-1 gap-2">
        <span className="text-neutral-700 flex items-center gap-1.5 min-w-0">
          {Icon ? <Icon className="w-3.5 h-3.5 text-neutral-400 shrink-0" /> : null}
          <span className="truncate">{label}</span>
        </span>
        <span className="tabular-nums whitespace-nowrap">
          <strong className="text-neutral-900">{count.toLocaleString('id-ID')}</strong>
          {pctLabel === '' ? null : <span className="text-neutral-400"> · {pctLabel ?? `${pct}%`}</span>}
        </span>
      </div>
      <div className="h-2 bg-neutral-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
    </>
  );
  return href ? (
    <Link href={href} className="block hover:opacity-80" title="Lihat daftar jemaat">
      {content}
    </Link>
  ) : (
    <div>{content}</div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-lg font-bold text-neutral-900 tabular-nums">{value}</div>
      <div className="text-[10px] text-neutral-500">{label}</div>
    </div>
  );
}
