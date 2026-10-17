'use client';

/**
 * Laporan Ibadah — kehadiran jemaat & tamu, tren mingguan, cara check-in,
 * per pertemuan, dan daftar tamu (untuk tindak lanjut). API: /admin/report/ibadah
 */
import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Armchair, BarChart3, Loader2, UserPlus } from 'lucide-react';
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

interface IbadahReport {
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
