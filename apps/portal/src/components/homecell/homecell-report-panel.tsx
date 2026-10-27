'use client';

/**
 * Panel laporan satu homecell (halaman detail portal) — isi sama dengan
 * Export PDF: filter periode, KPI, demografi (gender & usia), dan kehadiran
 * tiap anggota di periode.
 * API: GET /admin/homecell/:id/stats?periode=&from=&to=
 *      GET /admin/homecell/export?format=pdf&homecellId=:id&periode=…
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Cake, CalendarCheck, FileText, Loader2, TrendingUp, UserCheck, UserPlus, Users } from 'lucide-react';
import { homecellAttendanceTier } from '@ecc/shared-types';
import { apiClient } from '@/lib/api-client';
import { PERIODE_OPTIONS, type PeriodePreset } from '@/components/homecell/homecell-filter-bar';
import { ATTENDANCE_TIER_CLASS } from '@/lib/resources/homecell-config';
import { AGE_GROUP_LABELS } from '@/lib/resources/homecell-area-config';

interface Member {
  nama: string;
  kode: string | null;
  usia: number | null;
  jenisKelamin: 'L' | 'P' | null;
  bergabung: string;
  hadir: number;
  lastAt: string | null;
  lastDaysAgo: number | null;
}
interface Stats {
  nama: string;
  usiaMin: number | null;
  usiaMax: number | null;
  meetingCount: number;
  attendanceTotal: number;
  attendancePercent: number | null;
  avgAge: number | null;
  lastMeetingAt: string | null;
  lastMeetingDaysAgo: number | null;
  members: Member[];
  /** Kunjungan tamu di periode — terpisah, tidak masuk % kehadiran. */
  tamuVisits?: number;
  tamus?: { nama: string; noHp: string | null; dicatat: string; hadir: number; lastAt: string | null }[];
  period: { from: string; to: string } | null;
}

const TIER_BAR = { merah: '#ef4444', oranye: '#f97316', kuning: '#eab308', hijau: '#22c55e' } as const;
const AGE_RANGES: [number, number][] = [
  [0, 17],
  [18, 24],
  [25, 29],
  [30, 34],
  [35, 44],
  [45, 59],
  [60, 200],
];
const selectCls = 'px-2 py-1.5 border border-neutral-300 rounded text-sm bg-white outline-none focus:ring-2 focus:ring-brand-500';
const fmt = (ymd: string | null) =>
  ymd ? new Date(`${ymd}T00:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

function Pct({ p }: { p: number | null }) {
  if (p == null) return <span className="text-neutral-400 text-xs">—</span>;
  return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold tabular-nums ${ATTENDANCE_TIER_CLASS[homecellAttendanceTier(p)]}`}>{p}%</span>;
}

function Kpi({ icon: Icon, color, label, value, sub }: { icon: typeof Users; color: string; label: string; value: React.ReactNode; sub: string }) {
  return (
    <div className="bg-neutral-50 border border-neutral-100 rounded-xl p-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">{label}</span>
        <span className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: color }}>
          <Icon className="w-3.5 h-3.5 text-white" />
        </span>
      </div>
      <div className="text-xl font-bold text-neutral-900 mt-1">{value}</div>
      <div className="text-[11px] text-neutral-500">{sub}</div>
    </div>
  );
}

export function HomecellReportPanel({ homecellId }: { homecellId: string }) {
  const [periode, setPeriode] = useState<PeriodePreset>('last_30d');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const custom = periode === 'custom';
  const params: Record<string, string | undefined> = {
    periode: custom && !from && !to ? undefined : periode || undefined,
    from: custom ? from || undefined : undefined,
    to: custom ? to || undefined : undefined,
  };
  const q = useQuery({
    queryKey: ['homecell', 'stats', homecellId, params],
    queryFn: async () => (await apiClient.get<{ data: Stats }>(`/admin/homecell/${homecellId}/stats`, { params })).data.data,
  });

  async function exportPdf() {
    const qs = new URLSearchParams({ format: 'pdf', homecellId });
    Object.entries(params).forEach(([k, v]) => v && qs.set(k, v));
    const win = window.open('', '_blank');
    try {
      const res = await apiClient.get(`/admin/homecell/export?${qs.toString()}`, { responseType: 'blob', timeout: 120_000 });
      const url = URL.createObjectURL(res.data as Blob);
      if (win) win.location.href = url;
      else window.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 20_000);
    } catch {
      if (win) win.close();
      alert('Gagal export.');
    }
  }

  const s = q.data;
  const members = s?.members ?? [];
  const pria = members.filter((m) => m.jenisKelamin === 'L').length;
  const wanita = members.filter((m) => m.jenisKelamin === 'P').length;
  const g = pria + wanita;
  const pP = g ? Math.round((pria / g) * 100) : 0;
  const groups = AGE_RANGES.map(([a, b]) => members.filter((m) => m.usia != null && m.usia >= a && m.usia <= b).length);
  const ageKnown = members.filter((m) => m.usia != null).length;
  const maxG = Math.max(1, ...groups);
  const sorted = [...members].sort((a, b) => b.hadir - a.hadir || a.nama.localeCompare(b.nama));

  return (
    <div className="bg-white border border-neutral-200 rounded-xl p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-[160px]">
          <div className="text-sm font-semibold text-neutral-900">Laporan homecell</div>
          <div className="text-xs text-neutral-500">
            {s?.period ? `Periode ${fmt(s.period.from)} – ${fmt(s.period.to)}` : 'Semua waktu (sampai hari ini)'}
          </div>
        </div>
        <select value={periode} onChange={(e) => setPeriode(e.target.value as PeriodePreset)} className={selectCls}>
          {PERIODE_OPTIONS.map((o) => (
            <option key={o.value || 'all'} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {custom ? (
          <>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={selectCls} />
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={selectCls} />
          </>
        ) : null}
        <button
          onClick={exportPdf}
          className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-50 rounded-lg border border-rose-200"
        >
          <FileText className="w-4 h-4" /> Export PDF
        </button>
      </div>

      {q.isPending ? (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-neutral-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Memuat…
        </div>
      ) : q.isError || !s ? (
        <div className="py-8 text-center text-sm text-red-600">Gagal memuat laporan.</div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-2">
            <Kpi icon={Users} color="#f97316" label="Anggota aktif" value={members.length} sub={`${pria} L · ${wanita} P`} />
            <Kpi icon={Cake} color="#f59e0b" label="Usia rata-rata" value={s.avgAge != null ? `${s.avgAge} th` : '—'} sub={`dari ${ageKnown} anggota`} />
            <Kpi icon={CalendarCheck} color="#3b82f6" label="Pertemuan" value={s.meetingCount} sub="di periode" />
            <Kpi
              icon={TrendingUp}
              color={s.attendancePercent != null && s.attendanceTotal > 0 ? TIER_BAR[homecellAttendanceTier(s.attendancePercent)] : '#94a3b8'}
              label="Kehadiran"
              value={s.attendanceTotal > 0 ? <Pct p={s.attendancePercent} /> : '—'}
              sub="hadir ÷ (anggota × pertemuan)"
            />
            <Kpi icon={UserCheck} color="#10b981" label="Pertemuan terakhir" value={<span className="text-base">{fmt(s.lastMeetingAt)}</span>} sub={s.lastMeetingDaysAgo != null ? `${s.lastMeetingDaysAgo} hari lalu` : 'belum ada'} />
            <Kpi
              icon={UserPlus}
              color="#14b8a6"
              label="Kunjungan tamu"
              value={s.tamuVisits ?? 0}
              sub={`${(s.tamus ?? []).filter((t) => t.hadir > 0).length} tamu · tidak masuk %`}
            />
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 mb-1.5">Gender</div>
              <div className="flex h-3 rounded-full overflow-hidden bg-neutral-100">
                <div style={{ width: `${g ? pP : 0}%`, background: '#0ea5e9' }} />
                <div style={{ width: `${g ? 100 - pP : 0}%`, background: '#f472b6' }} />
              </div>
              <div className="flex justify-between text-xs mt-1">
                <span className="text-sky-700">
                  Laki-laki <b>{pria}</b>
                  {g ? ` · ${pP}%` : ''}
                </span>
                <span className="text-pink-700">
                  Perempuan <b>{wanita}</b>
                  {g ? ` · ${100 - pP}%` : ''}
                </span>
              </div>
              {members.length - g > 0 ? <p className="text-[11px] text-neutral-400 mt-1">{members.length - g} tanpa data gender</p> : null}
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 mb-1.5">Kelompok usia</div>
              {AGE_GROUP_LABELS.map((l, i) => (
                <div key={l} className="flex items-center gap-2 text-xs my-1">
                  <span className="w-14 text-neutral-500">{l} th</span>
                  <div className="flex-1 h-2 bg-neutral-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-amber-500" style={{ width: `${((groups[i] ?? 0) / maxG) * 100}%` }} />
                  </div>
                  <span className="w-14 text-right text-neutral-700">
                    <b>{groups[i]}</b> · {ageKnown ? Math.round(((groups[i] ?? 0) / ageKnown) * 100) : 0}%
                  </span>
                </div>
              ))}
              {members.length - ageKnown > 0 ? <p className="text-[11px] text-neutral-400">{members.length - ageKnown} tanpa tanggal lahir</p> : null}
            </div>
          </div>

          <div className="overflow-x-auto">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 mb-1.5">Kehadiran anggota di periode</div>
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-neutral-500 text-xs">
                <tr>
                  <th className="text-left font-medium px-3 py-2">Nama</th>
                  <th className="text-left font-medium px-3 py-2">L/P</th>
                  <th className="text-right font-medium px-3 py-2">Usia</th>
                  <th className="text-right font-medium px-3 py-2">Hadir</th>
                  <th className="text-left font-medium px-3 py-2">Terakhir hadir</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((m) => {
                  const rate = s.meetingCount > 0 ? Math.round((m.hadir / s.meetingCount) * 100) : null;
                  const out =
                    m.usia != null && ((s.usiaMin != null && m.usia < s.usiaMin) || (s.usiaMax != null && m.usia > s.usiaMax));
                  const d = m.lastDaysAgo;
                  return (
                    <tr key={`${m.nama}-${m.kode}`} className="border-t border-neutral-100">
                      <td className="px-3 py-1.5">
                        <div className="font-medium text-neutral-900">{m.nama}</div>
                        <div className="text-[11px] text-neutral-400">{m.kode ?? ''}</div>
                      </td>
                      <td className="px-3 py-1.5">{m.jenisKelamin ?? <span className="text-neutral-300">—</span>}</td>
                      <td className={`px-3 py-1.5 text-right ${out ? 'text-amber-700 font-semibold' : ''}`} title={out ? 'Di luar rentang usia homecell' : undefined}>
                        {m.usia != null ? `${m.usia} th` : '—'}
                      </td>
                      <td className="px-3 py-1.5 text-right whitespace-nowrap">
                        {s.meetingCount > 0 ? (
                          <>
                            {m.hadir}/{s.meetingCount} <Pct p={rate} />
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-xs">
                        {m.lastAt ? (
                          <>
                            {fmt(m.lastAt)} ·{' '}
                            <span className={d != null && d <= 7 ? 'text-green-700' : d != null && d <= 30 ? 'text-amber-700' : 'text-red-600'}>
                              {d === 0 ? 'hari ini' : d === 1 ? 'kemarin' : `${d} hari lalu`}
                            </span>
                          </>
                        ) : (
                          <span className="text-neutral-400">belum pernah</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {sorted.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-neutral-400">
                      Belum ada anggota aktif.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          {(s.tamus ?? []).length ? (
            <div className="overflow-x-auto">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-teal-700 mb-1.5">
                Tamu ({s.tamus!.length}) · dicatat terpisah, tidak masuk % kehadiran
              </div>
              <table className="w-full text-sm">
                <thead className="bg-teal-50/60 text-neutral-500 text-xs">
                  <tr>
                    <th className="text-left font-medium px-3 py-2">Nama</th>
                    <th className="text-left font-medium px-3 py-2">Dicatat</th>
                    <th className="text-right font-medium px-3 py-2">Hadir di periode</th>
                    <th className="text-left font-medium px-3 py-2">Terakhir hadir</th>
                  </tr>
                </thead>
                <tbody>
                  {[...s.tamus!]
                    .sort((a, b) => b.hadir - a.hadir || a.nama.localeCompare(b.nama))
                    .map((t) => (
                      <tr key={`${t.nama}-${t.noHp}`} className="border-t border-neutral-100">
                        <td className="px-3 py-1.5">
                          <div className="font-medium text-neutral-900">{t.nama}</div>
                          <div className="text-[11px] text-neutral-400">{t.noHp ?? ''}</div>
                        </td>
                        <td className="px-3 py-1.5 text-xs">{fmt(t.dicatat)}</td>
                        <td className="px-3 py-1.5 text-right">{s.meetingCount > 0 ? `${t.hadir}/${s.meetingCount}` : '—'}</td>
                        <td className="px-3 py-1.5 text-xs">{t.lastAt ? fmt(t.lastAt) : <span className="text-neutral-400">belum pernah</span>}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
