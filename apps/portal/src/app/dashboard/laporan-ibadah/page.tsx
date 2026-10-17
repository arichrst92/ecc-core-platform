'use client';

/**
 * Laporan Ibadah — kehadiran jemaat & tamu, tren mingguan, cara check-in,
 * per pertemuan, dan daftar tamu (untuk tindak lanjut). API: /admin/report/ibadah
 */
import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Armchair, BarChart3, Loader2, Star, Target, TrendingDown, TrendingUp, UserPlus, Church } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import {
  ExportButtons,
  Field,
  FilterCard,
  MethodBar,
  MethodInline,
  PeriodFields,
  StatCard,
  fmtTgl,
  periodParams,
  selectCls,
  useCabangOptions,
  type MethodCount,
  type PeriodState,
} from '@/components/report/report-ui';

interface IbadahLabel {
  id: string;
  nama: string;
  jamMulai: string;
  cabang: string | null;
  isKidsIbadah: boolean;
  kapasitasSeat: number | null;
}

const fmtPct = (p: number) => `${p.toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`;

/**
 * Bar okupansi. Lebar dibatasi 100%; kalau melebihi seat (overflow) bar merah
 * penuh + label "+N di atas seat". Hanya pendataan — check-in tidak dibatasi.
 */
function OccupancyBar({ pct, hadir, seat }: { pct: number | null; hadir?: number; seat: number | null }) {
  if (pct == null || !seat) return <span className="text-xs text-neutral-400">— (seat belum diisi)</span>;
  const over = pct > 100;
  const color = over ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div className="min-w-[140px]">
      <div className="flex items-center justify-between text-xs mb-1">
        <span className={`font-semibold ${over ? 'text-red-600' : 'text-neutral-800'}`}>{fmtPct(pct)}</span>
        {hadir != null ? (
          <span className="text-neutral-500">
            {hadir.toLocaleString('id-ID')} / {seat.toLocaleString('id-ID')}
          </span>
        ) : null}
      </div>
      <div className="h-2 bg-neutral-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      {over && hadir != null ? (
        <div className="text-[10px] text-red-600 mt-0.5">+{(hadir - seat).toLocaleString('id-ID')} di atas seat</div>
      ) : null}
    </div>
  );
}

interface IbadahInsights {
  prev: { from: string; to: string; totalHadir: number; uniqueJemaat: number; uniqueTamu: number; pertemuan: number; rataRata: number };
  growth: { totalHadir: number | null; uniqueJemaat: number | null; uniqueTamu: number | null; rataRata: number | null };
  jangkauan: { jemaatAktif: number; hadirUnik: number; pct: number; belumHadir: number };
  frekuensi: { label: string; count: number }[];
  tamu: { baru: number; berulang: number; total: number };
  perIbadah: {
    ibadah: IbadahLabel;
    terjadwal: number;
    pertemuan: number;
    total: number;
    jemaat: number;
    tamu: number;
    tamuBaru: number;
    puncak: number;
    rataRata: number;
    seat: number | null;
    okupansi: number | null;
    growth: number | null;
  }[];
  tertinggi: { ibadah: string; jam: string; tanggal: string; total: number }[];
  terendah: { ibadah: string; jam: string; tanggal: string; total: number }[];
  pertemuanTanpaKehadiran: number;
}

/** Badge perubahan vs periode sebelumnya. */
function Growth({ g }: { g: number | null }) {
  if (g == null) return <span className="text-[11px] text-neutral-400">— vs periode lalu</span>;
  const up = g >= 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${
        up ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
      }`}
    >
      {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {fmtPct(Math.abs(g))} vs periode lalu
    </span>
  );
}

interface IbadahReport {
  insights: IbadahInsights;
  filters: { cabang: string | null; ibadah: string | null };
  period: { from: string; to: string; label: string };
  summary: {
    totalHadir: number;
    jemaatHadir: number;
    tamuHadir: number;
    uniqueJemaat: number;
    uniqueTamu: number;
    tamuBaru: number;
    pertemuan: number;
    pertemuanAdaKehadiran: number;
    rataRata: number;
    methods: MethodCount;
    okupansi: { rataOkupansi: number | null; melebihi: number; pertemuanDenganSeat: number };
  };
  trend: { week: string; jemaat: number; tamu: number }[];
  occurrences: {
    ibadahId: string;
    tanggal: string;
    total: number;
    jemaat: number;
    tamu: number;
    tamuBaru: number;
    methods: MethodCount;
    seat: number | null;
    okupansi: number | null;
    ibadah: IbadahLabel;
  }[];
  occupancy: {
    ibadahId: string;
    seat: number | null;
    pertemuan: number;
    rataHadir: number;
    rataOkupansi: number | null;
    puncakHadir: number;
    puncakOkupansi: number | null;
    melebihi: number;
    ibadah: IbadahLabel;
  }[];
  guests: {
    id: string;
    namaLengkap: string;
    noHp: string | null;
    kunjungan: number;
    kunjunganPertama: string | null;
    kunjunganTerakhir: string;
    isBaru: boolean;
    ibadah: string[];
    inviters: string[];
    walkIn: boolean;
  }[];
}

export default function LaporanIbadahPage() {
  const [cabangId, setCabangId] = useState('');
  const [ibadahId, setIbadahId] = useState('');
  const [period, setPeriod] = useState<PeriodState>({ periode: 'last_30d', from: '', to: '' });
  const [hideEmpty, setHideEmpty] = useState(false);
  const cabangQ = useCabangOptions();
  const ibadahQ = useQuery({
    queryKey: ['ibadah', 'options', cabangId],
    queryFn: async () =>
      ((await apiClient.get('/admin/ibadah', { params: { limit: 500 } })).data as { data: { id: string; nama: string; cabang?: { id: string } }[] }).data,
    staleTime: 5 * 60_000,
  });
  const ibadahOptions = (ibadahQ.data ?? []).filter((i) => !cabangId || i.cabang?.id === cabangId);

  const params = { cabangId: cabangId || undefined, ibadahId: ibadahId || undefined, ...periodParams(period) };
  const q = useQuery({
    queryKey: ['report', 'ibadah', params],
    queryFn: async () => (await apiClient.get<{ data: IbadahReport }>('/admin/report/ibadah', { params })).data.data,
    placeholderData: (p) => p,
  });
  const d = q.data;
  const occ = (d?.occurrences ?? []).filter((o) => !hideEmpty || o.total > 0);
  const maxWeek = Math.max(1, ...(d?.trend ?? []).map((t) => t.jemaat + t.tamu));

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-brand-500" /> Laporan Ibadah
          </h1>
          <p className="text-sm text-neutral-500 mt-0.5">
            Kehadiran jemaat & tamu, tren, dan cara check-in.{' '}
            {d ? `${d.period.label ? `${d.period.label} · ` : ''}${fmtTgl(d.period.from)} – ${fmtTgl(d.period.to)}` : ''}
          </p>
        </div>
        <ExportButtons endpoint="/admin/report/ibadah/export" params={params} filename={`laporan-ibadah-${d?.period.from ?? ''}`} />
      </div>

      <FilterCard>
        <Field label="Cabang">
          <select
            value={cabangId}
            onChange={(e) => {
              setCabangId(e.target.value);
              setIbadahId('');
            }}
            className={selectCls}
          >
            <option value="">Semua cabang</option>
            {(cabangQ.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.nama}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Ibadah">
          <select value={ibadahId} onChange={(e) => setIbadahId(e.target.value)} className={selectCls}>
            <option value="">Semua ibadah</option>
            {ibadahOptions.map((i) => (
              <option key={i.id} value={i.id}>
                {i.nama}
              </option>
            ))}
          </select>
        </Field>
        <PeriodFields value={period} onChange={setPeriod} />
      </FilterCard>

      {q.isLoading || !d ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
        </div>
      ) : (
        <>
          {/* ===== Ringkasan eksekutif: perubahan vs periode lalu ===== */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: 'Total kehadiran', value: d.summary.totalHadir, prev: d.insights.prev.totalHadir, g: d.insights.growth.totalHadir },
              { label: 'Jemaat hadir (unik)', value: d.summary.uniqueJemaat, prev: d.insights.prev.uniqueJemaat, g: d.insights.growth.uniqueJemaat },
              { label: 'Rata-rata / pertemuan', value: d.summary.rataRata, prev: d.insights.prev.rataRata, g: d.insights.growth.rataRata },
              { label: 'Tamu (unik)', value: d.summary.uniqueTamu, prev: d.insights.prev.uniqueTamu, g: d.insights.growth.uniqueTamu },
            ].map((k) => (
              <div key={k.label} className="bg-gradient-to-br from-brand-50 to-white border border-brand-100 rounded-xl p-4">
                <div className="text-xs font-semibold text-brand-700 uppercase tracking-wide">{k.label}</div>
                <div className="text-3xl font-bold text-neutral-900 mt-1 tabular-nums">{k.value.toLocaleString('id-ID')}</div>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <Growth g={k.g} />
                  <span className="text-[11px] text-neutral-400">lalu {k.prev.toLocaleString('id-ID')}</span>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-neutral-500 -mt-2">
            Pembanding: periode sebelumnya dengan panjang sama ({fmtTgl(d.insights.prev.from)} – {fmtTgl(d.insights.prev.to)}).
          </p>

          <div className="grid lg:grid-cols-3 gap-4">
            {/* Jangkauan */}
            <div className="bg-white border border-neutral-200 rounded-xl p-4">
              <h2 className="font-semibold text-neutral-900 flex items-center gap-2 mb-2">
                <Target className="w-4 h-4 text-blue-600" /> Jangkauan jemaat
              </h2>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-blue-700">{fmtPct(d.insights.jangkauan.pct)}</span>
                <span className="text-xs text-neutral-500">jemaat aktif hadir minimal sekali</span>
              </div>
              <div className="h-2.5 bg-neutral-100 rounded-full overflow-hidden mt-2">
                <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(100, d.insights.jangkauan.pct)}%` }} />
              </div>
              <div className="flex justify-between text-xs mt-1.5 text-neutral-600">
                <span>
                  Hadir <b>{d.insights.jangkauan.hadirUnik.toLocaleString('id-ID')}</b>
                </span>
                <span>
                  Belum hadir <b className="text-red-600">{d.insights.jangkauan.belumHadir.toLocaleString('id-ID')}</b>
                </span>
              </div>
              <p className="text-[11px] text-neutral-400 mt-2">
                Dari {d.insights.jangkauan.jemaatAktif.toLocaleString('id-ID')} jemaat aktif {d.filters.cabang ? `cabang ${d.filters.cabang}` : 'semua cabang'}.
              </p>
            </div>

            {/* Frekuensi */}
            <div className="bg-white border border-neutral-200 rounded-xl p-4">
              <h2 className="font-semibold text-neutral-900 mb-3">Frekuensi hadir jemaat</h2>
              <div className="space-y-2">
                {d.insights.frekuensi.map((f) => {
                  const max = Math.max(1, ...d.insights.frekuensi.map((z) => z.count));
                  return (
                    <div key={f.label}>
                      <div className="flex justify-between text-xs mb-0.5">
                        <span className="text-neutral-600">{f.label}</span>
                        <b>{f.count.toLocaleString('id-ID')} jemaat</b>
                      </div>
                      <div className="h-2 bg-neutral-100 rounded-full overflow-hidden">
                        <div className="h-full bg-brand-500 rounded-full" style={{ width: `${(f.count / max) * 100}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-[11px] text-neutral-400 mt-2">
                Tamu: {d.insights.tamu.baru} baru · {d.insights.tamu.berulang} berulang
              </p>
            </div>

            {/* Sorotan */}
            <div className="bg-white border border-neutral-200 rounded-xl p-4">
              <h2 className="font-semibold text-neutral-900 flex items-center gap-2 mb-3">
                <Star className="w-4 h-4 text-amber-500" /> Sorotan pertemuan
              </h2>
              <div className="text-[11px] font-semibold text-neutral-500 uppercase mb-1">Tertinggi</div>
              {d.insights.tertinggi.map((o) => (
                <div key={`t-${o.ibadah}-${o.tanggal}`} className="flex justify-between text-xs py-0.5 gap-2">
                  <span className="truncate">
                    {o.ibadah} <span className="text-neutral-400">{o.jam} · {fmtTgl(o.tanggal)}</span>
                  </span>
                  <b className="text-green-700">{o.total}</b>
                </div>
              ))}
              <div className="text-[11px] font-semibold text-neutral-500 uppercase mt-3 mb-1">Terendah</div>
              {d.insights.terendah.map((o) => (
                <div key={`r-${o.ibadah}-${o.tanggal}`} className="flex justify-between text-xs py-0.5 gap-2">
                  <span className="truncate">
                    {o.ibadah} <span className="text-neutral-400">{o.jam} · {fmtTgl(o.tanggal)}</span>
                  </span>
                  <b className="text-red-600">{o.total}</b>
                </div>
              ))}
              {d.insights.tertinggi.length === 0 ? <p className="text-xs text-neutral-400">Belum ada kehadiran.</p> : null}
              {d.insights.pertemuanTanpaKehadiran ? (
                <p className="text-[11px] text-neutral-400 mt-2">{d.insights.pertemuanTanpaKehadiran} pertemuan terjadwal tanpa data kehadiran.</p>
              ) : null}
            </div>
          </div>

          {/* Ringkasan per ibadah */}
          <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-neutral-100">
              <h2 className="font-semibold text-neutral-900 flex items-center gap-2">
                <Church className="w-4 h-4 text-brand-600" /> Ringkasan per ibadah
              </h2>
              <p className="text-xs text-neutral-500 mt-0.5">Diurutkan dari total kehadiran terbanyak · vs lalu = total dibanding periode sebelumnya.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 text-xs text-neutral-500 uppercase">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium">Ibadah</th>
                    <th className="text-right px-4 py-2 font-medium">Pertemuan</th>
                    <th className="text-right px-4 py-2 font-medium">Total</th>
                    <th className="text-right px-4 py-2 font-medium">Rata²</th>
                    <th className="text-right px-4 py-2 font-medium">Puncak</th>
                    <th className="text-right px-4 py-2 font-medium">Tamu</th>
                    <th className="text-right px-4 py-2 font-medium">Okupansi</th>
                    <th className="text-right px-4 py-2 font-medium">vs lalu</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {d.insights.perIbadah.map((p) => (
                    <tr key={p.ibadah.id}>
                      <td className="px-4 py-2">
                        <Link href={`/dashboard/ibadah/${p.ibadah.id}`} className="font-medium hover:text-brand-600 hover:underline">
                          {p.ibadah.nama}
                        </Link>{' '}
                        <span className="text-xs text-neutral-400">
                          {p.ibadah.jamMulai}
                          {p.ibadah.isKidsIbadah ? ' · 🧒' : ''}
                          {!d.filters.cabang && p.ibadah.cabang ? ` · ${p.ibadah.cabang}` : ''}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right text-neutral-600">
                        {p.pertemuan}/{p.terjadwal}
                      </td>
                      <td className="px-4 py-2 text-right font-semibold">{p.total.toLocaleString('id-ID')}</td>
                      <td className="px-4 py-2 text-right">{p.rataRata.toLocaleString('id-ID')}</td>
                      <td className="px-4 py-2 text-right">{p.puncak}</td>
                      <td className="px-4 py-2 text-right text-violet-700">{p.tamu}</td>
                      <td
                        className={`px-4 py-2 text-right font-semibold ${
                          p.okupansi == null ? 'text-neutral-400' : p.okupansi > 100 ? 'text-red-600' : p.okupansi >= 80 ? 'text-amber-700' : 'text-teal-700'
                        }`}
                      >
                        {p.okupansi == null ? '—' : fmtPct(p.okupansi)}
                      </td>
                      <td className="px-4 py-2 text-right whitespace-nowrap">
                        {p.growth == null ? (
                          <span className="text-neutral-400">—</span>
                        ) : (
                          <span className={p.growth >= 0 ? 'text-green-700' : 'text-red-600'}>
                            {p.growth >= 0 ? '▲' : '▼'} {fmtPct(Math.abs(p.growth))}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {d.insights.perIbadah.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center text-neutral-400 py-8">
                        Belum ada kehadiran di periode ini.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            <StatCard label="Total kehadiran" value={d.summary.totalHadir} hint={`${d.summary.jemaatHadir} jemaat + ${d.summary.tamuHadir} tamu`} />
            <StatCard label="Jemaat hadir (unik)" value={d.summary.uniqueJemaat} />
            <StatCard label="Tamu (unik)" value={d.summary.uniqueTamu} accent="tamu" />
            <StatCard label="Tamu baru" value={d.summary.tamuBaru} hint="Pertama kali datang di periode ini" accent="tamu" />
            <StatCard label="Pertemuan" value={`${d.summary.pertemuanAdaKehadiran}/${d.summary.pertemuan}`} hint="ada kehadiran / terjadwal" />
            <StatCard label="Rata-rata hadir" value={d.summary.rataRata} hint="per pertemuan" />
            <StatCard
              label="Okupansi rata-rata"
              value={d.summary.okupansi.rataOkupansi != null ? fmtPct(d.summary.okupansi.rataOkupansi) : '—'}
              hint={
                d.summary.okupansi.pertemuanDenganSeat
                  ? d.summary.okupansi.melebihi
                    ? `${d.summary.okupansi.melebihi} pertemuan melebihi seat`
                    : 'hadir ÷ jumlah seat'
                  : 'Isi jumlah seat di menu Ibadah'
              }
            />
          </div>

          <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-neutral-100">
              <h2 className="font-semibold text-neutral-900 flex items-center gap-2">
                <Armchair className="w-4 h-4 text-emerald-600" /> Okupansi per ibadah
              </h2>
              <p className="text-xs text-neutral-500 mt-0.5">
                Rata-rata hadir ÷ jumlah seat, dari pertemuan yang ada kehadirannya. Hanya pendataan — check-in tidak dibatasi, jadi bisa
                lebih dari 100%.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 text-xs text-neutral-500 uppercase">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium">Ibadah</th>
                    <th className="text-left px-4 py-2 font-medium">Cabang</th>
                    <th className="text-right px-4 py-2 font-medium">Seat</th>
                    <th className="text-right px-4 py-2 font-medium">Pertemuan</th>
                    <th className="text-right px-4 py-2 font-medium">Rata-rata hadir</th>
                    <th className="text-left px-4 py-2 font-medium w-56">Okupansi rata-rata</th>
                    <th className="text-right px-4 py-2 font-medium">Puncak</th>
                    <th className="text-right px-4 py-2 font-medium">Melebihi seat</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {d.occupancy.map((x) => (
                    <tr key={x.ibadahId}>
                      <td className="px-4 py-2">
                        <Link href={`/dashboard/ibadah/${x.ibadahId}`} className="hover:text-brand-600 hover:underline">
                          {x.ibadah.nama}
                        </Link>{' '}
                        <span className="text-xs text-neutral-400">{x.ibadah.jamMulai}</span>
                      </td>
                      <td className="px-4 py-2 text-neutral-600">{x.ibadah.cabang ?? '—'}</td>
                      <td className="px-4 py-2 text-right">{x.seat?.toLocaleString('id-ID') ?? '—'}</td>
                      <td className="px-4 py-2 text-right">{x.pertemuan}</td>
                      <td className="px-4 py-2 text-right">{x.rataHadir.toLocaleString('id-ID')}</td>
                      <td className="px-4 py-2">
                        <OccupancyBar pct={x.rataOkupansi} seat={x.seat} />
                      </td>
                      <td className="px-4 py-2 text-right whitespace-nowrap">
                        {x.puncakHadir}
                        {x.puncakOkupansi != null ? (
                          <span className={`text-xs ml-1 ${x.puncakOkupansi > 100 ? 'text-red-600 font-semibold' : 'text-neutral-400'}`}>
                            ({fmtPct(x.puncakOkupansi)})
                          </span>
                        ) : null}
                      </td>
                      <td className={`px-4 py-2 text-right ${x.melebihi ? 'text-red-600 font-semibold' : 'text-neutral-400'}`}>
                        {x.melebihi ? `${x.melebihi}×` : '—'}
                      </td>
                    </tr>
                  ))}
                  {d.occupancy.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center text-neutral-400 py-8">
                        Belum ada kehadiran di periode ini.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 bg-white border border-neutral-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-neutral-900">Tren mingguan</h2>
                <div className="flex gap-3 text-xs text-neutral-500">
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-sm bg-brand-500" /> Jemaat
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-sm bg-violet-500" /> Tamu
                  </span>
                </div>
              </div>
              {d.trend.length === 0 ? (
                <p className="text-sm text-neutral-400 py-8 text-center">Belum ada kehadiran di periode ini.</p>
              ) : (
                <div className="flex items-end gap-2 h-48 overflow-x-auto pb-1">
                  {d.trend.map((t) => {
                    const total = t.jemaat + t.tamu;
                    return (
                      <div key={t.week} className="flex flex-col items-center justify-end h-full min-w-[44px] flex-1" title={`Minggu ${fmtTgl(t.week)}: ${t.jemaat} jemaat, ${t.tamu} tamu`}>
                        <span className="text-[11px] font-semibold text-neutral-700 mb-1">{total}</span>
                        <div className="w-full max-w-[36px] flex flex-col justify-end rounded-t overflow-hidden" style={{ height: `${(total / maxWeek) * 100}%` }}>
                          <div className="bg-violet-500" style={{ height: `${total ? (t.tamu / total) * 100 : 0}%` }} />
                          <div className="bg-brand-500 flex-1" />
                        </div>
                        <span className="text-[10px] text-neutral-500 mt-1 whitespace-nowrap">
                          {new Date(`${t.week}T00:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="bg-white border border-neutral-200 rounded-xl p-4">
              <h2 className="font-semibold text-neutral-900 mb-3">Cara check-in</h2>
              <MethodBar methods={d.summary.methods} />
              <p className="text-[11px] text-neutral-400 mt-3">
                "Tidak tercatat" = kehadiran sebelum pencatatan cara check-in diaktifkan.
              </p>
            </div>
          </div>

          <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-neutral-100 flex items-center justify-between gap-2 flex-wrap">
              <h2 className="font-semibold text-neutral-900">Per pertemuan ({occ.length})</h2>
              <label className="flex items-center gap-2 text-xs text-neutral-600">
                <input type="checkbox" checked={hideEmpty} onChange={(e) => setHideEmpty(e.target.checked)} /> Sembunyikan yang tanpa kehadiran
              </label>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 text-xs text-neutral-500 uppercase">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium">Tanggal</th>
                    <th className="text-left px-4 py-2 font-medium">Ibadah</th>
                    <th className="text-left px-4 py-2 font-medium">Cabang</th>
                    <th className="text-right px-4 py-2 font-medium">Hadir</th>
                    <th className="text-left px-4 py-2 font-medium">Okupansi</th>
                    <th className="text-right px-4 py-2 font-medium">Jemaat</th>
                    <th className="text-right px-4 py-2 font-medium">Tamu</th>
                    <th className="text-right px-4 py-2 font-medium">Tamu baru</th>
                    <th className="text-left px-4 py-2 font-medium">Cara check-in</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {occ.map((o) => (
                    <tr key={`${o.ibadahId}-${o.tanggal}`} className={o.total === 0 ? 'text-neutral-400' : ''}>
                      <td className="px-4 py-2 whitespace-nowrap">{fmtTgl(o.tanggal)}</td>
                      <td className="px-4 py-2">
                        <Link href={`/dashboard/ibadah/${o.ibadahId}`} className="hover:text-brand-600 hover:underline">
                          {o.ibadah.nama}
                        </Link>{' '}
                        <span className="text-xs text-neutral-400">{o.ibadah.jamMulai}</span>
                      </td>
                      <td className="px-4 py-2 text-neutral-600">{o.ibadah.cabang ?? '—'}</td>
                      <td className="px-4 py-2 text-right font-semibold">{o.total}</td>
                      <td className="px-4 py-2">
                        {o.total > 0 ? <OccupancyBar pct={o.okupansi} hadir={o.total} seat={o.seat} /> : <span className="text-xs">—</span>}
                      </td>
                      <td className="px-4 py-2 text-right">{o.jemaat}</td>
                      <td className="px-4 py-2 text-right text-violet-700">{o.tamu}</td>
                      <td className="px-4 py-2 text-right text-violet-700">{o.tamuBaru || ''}</td>
                      <td className="px-4 py-2">
                        <MethodInline methods={o.methods} />
                      </td>
                    </tr>
                  ))}
                  {occ.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="text-center text-neutral-400 py-8">
                        Tidak ada pertemuan di periode ini.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-neutral-100">
              <h2 className="font-semibold text-neutral-900 flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-violet-600" /> Daftar tamu ({d.guests.length})
              </h2>
              <p className="text-xs text-neutral-500 mt-0.5">Untuk tindak lanjut tim penyambutan. Tamu baru = pertama kali datang di periode ini.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 text-xs text-neutral-500 uppercase">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium">Nama</th>
                    <th className="text-left px-4 py-2 font-medium">No HP</th>
                    <th className="text-left px-4 py-2 font-medium">Status</th>
                    <th className="text-right px-4 py-2 font-medium">Kunjungan</th>
                    <th className="text-left px-4 py-2 font-medium">Terakhir</th>
                    <th className="text-left px-4 py-2 font-medium">Ibadah</th>
                    <th className="text-left px-4 py-2 font-medium">Dibawa oleh</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {d.guests.map((g) => (
                    <tr key={g.id}>
                      <td className="px-4 py-2">
                        <Link href={`/dashboard/jemaat/${g.id}`} className="font-medium hover:text-brand-600 hover:underline">
                          {g.namaLengkap}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-neutral-600">{g.noHp ?? '—'}</td>
                      <td className="px-4 py-2">
                        {g.isBaru ? (
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">Baru</span>
                        ) : (
                          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-600">Berulang</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right">{g.kunjungan}</td>
                      <td className="px-4 py-2 whitespace-nowrap text-neutral-600">{fmtTgl(g.kunjunganTerakhir)}</td>
                      <td className="px-4 py-2 text-neutral-600">{g.ibadah.join(', ')}</td>
                      <td className="px-4 py-2 text-neutral-600">{g.inviters.length ? g.inviters.join(', ') : g.walkIn ? 'Walk-in' : '—'}</td>
                    </tr>
                  ))}
                  {d.guests.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center text-neutral-400 py-8">
                        Tidak ada tamu di periode ini.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
