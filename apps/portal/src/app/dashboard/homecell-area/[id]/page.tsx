'use client';

/**
 * Detail Homecell Area — isi sama dengan Export PDF: ringkasan, performa
 * kehadiran per homecell, demografi (gender & usia), komposisi kategori,
 * perlu perhatian, dan tabel homecell.
 * API: GET /admin/homecell-area/:id/stats?periode=&from=&to=
 */
import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  Cake,
  CalendarCheck,
  FileText,
  Home,
  Layers,
  Loader2,
  MapPinned,
  TrendingUp,
  UserPlus,
  Users,
} from 'lucide-react';
import { HOMECELL_KATEGORI_LABEL, homecellAttendanceTier, homecellUsiaLabel } from '@ecc/shared-types';
import { apiClient } from '@/lib/api-client';
import { PERIODE_OPTIONS, type PeriodePreset } from '@/components/homecell/homecell-filter-bar';
import { ATTENDANCE_TIER_CLASS } from '@/lib/resources/homecell-config';
import { AREA_TIER_LEGEND } from '@/lib/resources/homecell-area-config';

interface Demografi {
  pria: number;
  wanita: number;
  genderUnknown: number;
  groups: number[];
  ageUnknown: number;
  total: number;
}
interface HcStat {
  id: string;
  nama: string;
  kategori: 'SINGLE' | 'COUPLE' | null;
  usiaMin: number | null;
  usiaMax: number | null;
  pic: string | null;
  memberCount: number;
  avgAge: number | null;
  meetingCount: number;
  attendanceTotal: number;
  attendancePercent: number | null;
  lastMeetingAt: string | null;
  demografi: Demografi;
  tamuVisits?: number;
  tamuUnique?: number;
}
interface StatsResp {
  area: {
    id: string;
    nama: string;
    deskripsi: string | null;
    isActive: boolean;
    cabang: { id: string; nama: string };
    picJemaat: { id: string; namaLengkap: string; noHp: string | null } | null;
  };
  period: { from: string; to: string } | null;
  ageGroups: string[];
  stat: {
    homecellCount: number;
    memberCount: number;
    avgAge: number | null;
    ageKnown: number;
    meetingCount: number;
    attendancePercent: number | null;
    homecellNoMeeting: number;
    kategori: { SINGLE: number; COUPLE: number; UMUM: number };
    homecells: HcStat[];
    demografi: Demografi;
    tamuVisits?: number;
    tamuUnique?: number;
  };
}

const TIER_BAR = { merah: '#ef4444', oranye: '#f97316', kuning: '#eab308', hijau: '#22c55e' } as const;
const fmt = (ymd: string | null) =>
  ymd ? new Date(`${ymd}T00:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const selectCls = 'px-2 py-1.5 border border-neutral-300 rounded text-sm bg-white outline-none focus:ring-2 focus:ring-brand-500';

function PctBadge({ p }: { p: number | null }) {
  if (p == null) return <span className="text-neutral-400 text-xs">—</span>;
  return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold tabular-nums ${ATTENDANCE_TIER_CLASS[homecellAttendanceTier(p)]}`}>{p}%</span>;
}

function Kpi({ icon: Icon, color, label, value, sub }: { icon: typeof Home; color: string; label: string; value: React.ReactNode; sub: string }) {
  return (
    <div className="bg-white border border-neutral-200 rounded-xl p-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">{label}</span>
        <span className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: color }}>
          <Icon className="w-4 h-4 text-white" />
        </span>
      </div>
      <div className="text-2xl font-bold text-neutral-900 mt-1">{value}</div>
      <div className="text-xs text-neutral-500">{sub}</div>
    </div>
  );
}

function Card({ icon: Icon, color, title, sub, children }: { icon: typeof Home; color: string; title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-neutral-200 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: color }}>
          <Icon className="w-4 h-4 text-white" />
        </span>
        <div>
          <div className="text-sm font-semibold text-neutral-900">{title}</div>
          {sub ? <div className="text-xs text-neutral-500">{sub}</div> : null}
        </div>
      </div>
      {children}
    </div>
  );
}

function Bar({ label, value, pct, color, extra }: { label: string; value: string; pct: number; color: string; extra?: string }) {
  return (
    <div className="my-2">
      <div className="flex justify-between gap-2 text-xs text-neutral-700">
        <span className="truncate">{label}</span>
        <span>
          <b>{value}</b>
          {extra ? <span className="text-neutral-400"> · {extra}</span> : null}
        </span>
      </div>
      <div className="h-2 bg-neutral-100 rounded-full overflow-hidden mt-1">
        <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} />
      </div>
    </div>
  );
}

export default function HomecellAreaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
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
    queryKey: ['homecell-area', 'stats', id, params],
    queryFn: async () => (await apiClient.get<{ data: StatsResp }>(`/admin/homecell-area/${id}/stats`, { params })).data.data,
  });

  async function exportPdf() {
    const qs = new URLSearchParams({ format: 'pdf', areaId: id });
    Object.entries(params).forEach(([k, v]) => v && qs.set(k, v));
    const win = window.open('', '_blank');
    try {
      const res = await apiClient.get(`/admin/homecell-area/export?${qs.toString()}`, { responseType: 'blob', timeout: 120_000 });
      const url = URL.createObjectURL(res.data as Blob);
      if (win) win.location.href = url;
      else window.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 20_000);
    } catch {
      if (win) win.close();
      alert('Gagal export.');
    }
  }

  const d = q.data;
  const s = d?.stat;
  const demo = s?.demografi;
  const g = demo ? demo.pria + demo.wanita : 0;
  const pP = g && demo ? Math.round((demo.pria / g) * 100) : 0;
  const ageKnown = demo ? demo.total - demo.ageUnknown : 0;
  const maxAge = Math.max(1, ...(demo?.groups ?? [1]));
  const katTotal = s ? s.kategori.SINGLE + s.kategori.COUPLE + s.kategori.UMUM : 0;
  const ranked = [...(s?.homecells ?? [])].sort((a, b) => (b.attendancePercent ?? -1) - (a.attendancePercent ?? -1));
  const attention = ranked.filter((h) => h.attendanceTotal === 0 || (h.attendancePercent ?? 0) <= 25).reverse();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-3">
        <button onClick={() => router.push('/dashboard/homecell-area')} className="p-2 rounded-lg hover:bg-neutral-100" aria-label="Kembali">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-[200px]">
          <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
            <MapPinned className="w-6 h-6 text-brand-500" /> {d?.area.nama ?? '…'}
          </h1>
          {d ? (
            <div className="text-sm text-neutral-500 mt-0.5">
              {d.area.cabang.nama} · PIC: {d.area.picJemaat?.namaLengkap ?? '—'}
              {!d.area.isActive ? <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-neutral-100">Nonaktif</span> : null}
            </div>
          ) : null}
          {d?.area.deskripsi ? <p className="text-sm text-neutral-600 mt-1">{d.area.deskripsi}</p> : null}
        </div>
        <div className="flex flex-wrap items-end gap-2">
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
      </div>

      {q.isPending ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-neutral-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Memuat…
        </div>
      ) : q.isError || !d || !s || !demo ? (
        <div className="py-16 text-center text-sm text-red-600">Gagal memuat data area.</div>
      ) : (
        <>
          {d.period ? (
            <div className="text-xs text-neutral-500">
              Periode: {fmt(d.period.from)} – {fmt(d.period.to)}
            </div>
          ) : null}

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi icon={Home} color="#8b5cf6" label="Homecell aktif" value={s.homecellCount} sub={`${s.kategori.SINGLE} single · ${s.kategori.COUPLE} couple · ${s.kategori.UMUM} umum`} />
            <Kpi icon={Users} color="#0ea5e9" label="Anggota aktif" value={s.memberCount} sub={`${demo.pria} laki-laki · ${demo.wanita} perempuan`} />
            <Kpi icon={Cake} color="#f59e0b" label="Usia rata-rata" value={s.avgAge != null ? `${s.avgAge} th` : '—'} sub={`dari ${s.ageKnown} anggota dengan tanggal lahir`} />
            <Kpi icon={CalendarCheck} color="#3b82f6" label="Pertemuan" value={s.meetingCount} sub={`${s.homecellNoMeeting} homecell tanpa pertemuan`} />
            <Kpi
              icon={TrendingUp}
              color={s.attendancePercent != null ? TIER_BAR[homecellAttendanceTier(s.attendancePercent)] : '#94a3b8'}
              label="Kehadiran rata-rata"
              value={<PctBadge p={s.attendancePercent} />}
              sub="hadir ÷ (anggota × pertemuan)"
            />
            <Kpi icon={AlertTriangle} color="#ef4444" label="Perlu perhatian" value={attention.length} sub="kehadiran ≤ 25% / tanpa pertemuan" />
            <Kpi icon={UserPlus} color="#14b8a6" label="Kunjungan tamu" value={s.tamuVisits ?? 0} sub="dicatat terpisah, tidak masuk %" />
            <Kpi icon={UserPlus} color="#0d9488" label="Tamu berbeda" value={s.tamuUnique ?? 0} sub="tamu yang hadir di periode" />
          </div>

          <Card icon={TrendingUp} color="#22c55e" title="Performa kehadiran per homecell" sub="Diurutkan dari tertinggi">
            {ranked.length === 0 ? (
              <p className="text-sm text-neutral-400">Belum ada homecell aktif.</p>
            ) : (
              ranked.map((h) =>
                h.attendancePercent == null || h.attendanceTotal === 0 ? (
                  <Bar key={h.id} label={h.nama} value="—" pct={0} color="#e2e8f0" extra="belum ada pertemuan" />
                ) : (
                  <Bar
                    key={h.id}
                    label={h.nama}
                    value={`${h.attendancePercent}%`}
                    pct={h.attendancePercent}
                    color={TIER_BAR[homecellAttendanceTier(h.attendancePercent)]}
                    extra={`${h.meetingCount} pertemuan`}
                  />
                ),
              )
            )}
            {AREA_TIER_LEGEND}
          </Card>

          <div className="grid lg:grid-cols-2 gap-4">
            <Card icon={Users} color="#0ea5e9" title="Demografi anggota" sub="Gender & kelompok usia anggota aktif">
              <div className="flex h-3 rounded-full overflow-hidden bg-neutral-100">
                <div style={{ width: `${g ? pP : 0}%`, background: '#0ea5e9' }} />
                <div style={{ width: `${g ? 100 - pP : 0}%`, background: '#f472b6' }} />
              </div>
              <div className="flex justify-between text-xs mt-1 mb-3">
                <span className="text-sky-700">
                  Laki-laki <b>{demo.pria}</b>
                  {g ? ` · ${pP}%` : ''}
                </span>
                <span className="text-pink-700">
                  Perempuan <b>{demo.wanita}</b>
                  {g ? ` · ${100 - pP}%` : ''}
                </span>
              </div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Kelompok usia</div>
              {d.ageGroups.map((label, i) => {
                const c = demo.groups[i] ?? 0;
                return (
                  <Bar key={label} label={`${label} th`} value={String(c)} pct={(c / maxAge) * 100} color="#f59e0b" extra={`${ageKnown ? Math.round((c / ageKnown) * 100) : 0}%`} />
                );
              })}
              {demo.genderUnknown || demo.ageUnknown ? (
                <p className="text-[11px] text-neutral-400 mt-2">
                  {[demo.genderUnknown ? `${demo.genderUnknown} tanpa data gender` : '', demo.ageUnknown ? `${demo.ageUnknown} tanpa tanggal lahir` : '']
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              ) : null}
            </Card>

            <div className="space-y-4">
              <Card icon={Layers} color="#ec4899" title="Komposisi kategori" sub="Single · Couple · Umum">
                {(
                  [
                    ['Single', s.kategori.SINGLE, '#0ea5e9'],
                    ['Couple', s.kategori.COUPLE, '#ec4899'],
                    ['Umum', s.kategori.UMUM, '#94a3b8'],
                  ] as const
                ).map(([l, v, c]) => (
                  <Bar key={l} label={l} value={String(v)} pct={katTotal ? (v / katTotal) * 100 : 0} color={c} extra={`${katTotal ? Math.round((v / katTotal) * 100) : 0}%`} />
                ))}
              </Card>
              <Card icon={AlertTriangle} color="#ef4444" title="Perlu perhatian" sub="Kehadiran ≤ 25% atau belum ada pertemuan">
                {attention.length === 0 ? (
                  <p className="text-sm text-neutral-500">Semua homecell di atas 25% kehadiran.</p>
                ) : (
                  attention.map((h) => (
                    <div key={h.id} className="flex justify-between gap-2 py-1.5 border-b border-dashed border-neutral-100 text-sm">
                      <Link href={`/dashboard/homecell/${h.id}`} className="font-medium text-neutral-800 hover:text-brand-600">
                        {h.nama}
                      </Link>
                      {h.attendanceTotal === 0 ? (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-neutral-100 text-neutral-600">Belum ada pertemuan</span>
                      ) : (
                        <PctBadge p={h.attendancePercent} />
                      )}
                    </div>
                  ))
                )}
              </Card>
            </div>
          </div>

          <div className="bg-white border border-neutral-200 rounded-xl overflow-x-auto">
            <div className="px-4 py-3 text-sm font-semibold text-neutral-900 border-b border-neutral-100">Homecell di area ini</div>
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-neutral-500 text-xs">
                <tr>
                  <th className="text-left font-medium px-4 py-2">Homecell</th>
                  <th className="text-left font-medium px-4 py-2">PIC</th>
                  <th className="text-right font-medium px-4 py-2">Anggota</th>
                  <th className="text-left font-medium px-4 py-2">L / P</th>
                  <th className="text-right font-medium px-4 py-2">Usia rata²</th>
                  <th className="text-right font-medium px-4 py-2">Pertemuan</th>
                  <th className="text-right font-medium px-4 py-2">Kehadiran</th>
                  <th className="text-right font-medium px-4 py-2" title="Kunjungan tamu (terpisah dari kehadiran anggota)">Tamu</th>
                  <th className="text-left font-medium px-4 py-2">Terakhir</th>
                </tr>
              </thead>
              <tbody>
                {s.homecells.map((h) => (
                  <tr key={h.id} className="border-t border-neutral-100">
                    <td className="px-4 py-2">
                      <Link href={`/dashboard/homecell/${h.id}`} className="font-medium text-brand-600 hover:underline">
                        {h.nama}
                      </Link>
                      <div className="flex gap-1 mt-0.5">
                        {h.kategori ? (
                          <span className={`px-1.5 rounded text-[10px] font-semibold ${h.kategori === 'COUPLE' ? 'bg-pink-50 text-pink-700' : 'bg-sky-50 text-sky-700'}`}>
                            {HOMECELL_KATEGORI_LABEL[h.kategori]}
                          </span>
                        ) : null}
                        {homecellUsiaLabel(h.usiaMin, h.usiaMax) ? (
                          <span className="px-1.5 rounded text-[10px] font-semibold bg-neutral-100 text-neutral-600">{homecellUsiaLabel(h.usiaMin, h.usiaMax)}</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-neutral-600">{h.pic ?? '—'}</td>
                    <td className="px-4 py-2 text-right">{h.memberCount}</td>
                    <td className="px-4 py-2">
                      <span className="text-sky-700">{h.demografi.pria}</span>
                      <span className="text-neutral-300"> / </span>
                      <span className="text-pink-700">{h.demografi.wanita}</span>
                    </td>
                    <td className="px-4 py-2 text-right">{h.avgAge != null ? `${h.avgAge} th` : '—'}</td>
                    <td className="px-4 py-2 text-right">{h.meetingCount}</td>
                    <td className="px-4 py-2 text-right">
                      {h.attendanceTotal === 0 ? <span className="text-neutral-400 text-xs">—</span> : <PctBadge p={h.attendancePercent} />}
                    </td>
                    <td className="px-4 py-2 text-right">{h.tamuVisits ? <span className="text-teal-700 font-medium">{h.tamuVisits}×</span> : <span className="text-neutral-400 text-xs">—</span>}</td>
                    <td className="px-4 py-2 text-neutral-600">{fmt(h.lastMeetingAt)}</td>
                  </tr>
                ))}
                {s.homecells.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-neutral-400">
                      Belum ada homecell aktif.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
