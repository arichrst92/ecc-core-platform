'use client';

/**
 * Tab "Visualisasi Daftar & Absen" di detail event Portal (2026-11).
 * Data: GET /admin/event/:id/visualisasi (lib/event-visual.ts).
 * Grafik SVG sendiri (tanpa library) — gaya sama dengan components/charts.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, CalendarDays, Clock, Loader2, PieChart, ScanLine, UserCheck, UserPlus, UserX, Users } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { DonutChart, BarChart } from '@/components/charts/simple-charts';

type Who = 'JEMAAT' | 'NEW_COMER' | 'VISITOR';
type Group = 'SELF' | 'PETUGAS' | 'PORTAL' | 'LAINNYA';
type Visual = {
  event: { butuhKehadiran: boolean; berbayar: boolean; kuota: number | null; tanggalMulai: string; tanggalSelesai: string; jamMulai: string | null; jamSelesai: string | null; selesai: boolean };
  ringkasan: {
    totalDaftar: number;
    aktif: number;
    batal: number;
    hadir: number;
    belumHadir: number;
    lunas: number | null;
    menungguVerifikasi: number | null;
    tanpaDaftar: number;
    aktifPer: Record<Who, number>;
    hadirPer: Record<Who, number>;
  };
  pendaftaran: { tanggal: string[]; hariAcara: string[]; daftar: Record<Who, number[]>; batal: Record<Who, number[]>; kumulatif: number[]; sebelumRentang: number; setelahRentang: number };
  absensi: {
    hari: { tanggal: string; hadir: number }[];
    tanggal: string;
    menitPerBatang: number;
    jam: string[];
    mulaiIdx: number;
    selesaiIdx: number;
    metode: Record<Group, number[]>;
    kategori: Record<Who, number[]>;
    kumulatif: number[];
    puncak: { jam: string; jumlah: number } | null;
    diluarRentang: number;
  };
  proporsi: Record<Group, number>;
  ketepatan: { sebelum: number; telat15: number; telatLebih: number };
  alasanBatal: { label: string; jumlah: number }[];
  petugas: { nama: string; jumlah: number }[];
  cabang: { nama: string; jumlah: number }[];
};

const WHO: { key: Who; label: string; color: string; soft: string }[] = [
  { key: 'JEMAAT', label: 'Jemaat', color: '#F97316', soft: '#FDBA74' },
  { key: 'NEW_COMER', label: 'New Comer', color: '#10B981', soft: '#6EE7B7' },
  { key: 'VISITOR', label: 'Visitor', color: '#0EA5E9', soft: '#7DD3FC' },
];
const GROUP: { key: Group; label: string; color: string }[] = [
  { key: 'SELF', label: 'Self check-in', color: '#F97316' },
  { key: 'PETUGAS', label: 'Scan petugas', color: '#7C3AED' },
  { key: 'PORTAL', label: 'Absen Portal', color: '#0EA5E9' },
  { key: 'LAINNYA', label: 'Tidak tercatat', color: '#A3A3A3' },
];

const fmt = (n: number) => n.toLocaleString('id-ID');
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : '—');
const dLabel = (ymd: string) => new Date(`${ymd}T00:00:00Z`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', timeZone: 'UTC' });

export function EventVisualTab({ eventId }: { eventId: string }) {
  const [hari, setHari] = useState<string | undefined>(undefined);
  const q = useQuery({
    queryKey: ['event', eventId, 'visualisasi', hari ?? ''],
    queryFn: async () =>
      (await apiClient.get<{ data: Visual }>(`/admin/event/${eventId}/visualisasi`, { params: hari ? { hari } : {} })).data.data,
    refetchInterval: 60_000,
    placeholderData: (prev) => prev,
  });
  const d = q.data;
  if (q.isPending) {
    return (
      <div className="py-16 flex justify-center text-neutral-400">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }
  if (q.isError || !d) return <p className="text-sm text-red-600 py-8 text-center">Gagal memuat visualisasi.</p>;
  const r = d.ringkasan;
  const att = d.event.butuhKehadiran;

  return (
    <div className="space-y-4">
      {/* Ringkasan */}
      <div className="grid grid-cols-2 sm:grid-cols-3 2xl:grid-cols-6 gap-2">
        <Kpi Icon={Users} label="Terdaftar aktif" value={fmt(r.aktif)} hint={d.event.kuota ? `kuota ${fmt(d.event.kuota)} · ${pct(r.aktif, d.event.kuota)}` : `${fmt(r.totalDaftar)} total pendaftaran`} />
        <Kpi Icon={UserX} label="Batal" value={fmt(r.batal)} hint={`${pct(r.batal, r.totalDaftar)} dari pendaftaran`} tone="red" />
        {att ? <Kpi Icon={UserCheck} label="Hadir" value={fmt(r.hadir)} hint={`${pct(r.hadir, r.aktif)} dari terdaftar aktif`} tone="green" /> : null}
        {att ? <Kpi Icon={Clock} label={d.event.selesai ? 'Tidak hadir' : 'Belum hadir'} value={fmt(r.belumHadir)} hint={pct(r.belumHadir, r.aktif)} /> : null}
        <Kpi
          Icon={UserPlus}
          label="Tamu aktif"
          value={fmt(r.aktifPer.NEW_COMER + r.aktifPer.VISITOR)}
          hint={`New Comer ${fmt(r.aktifPer.NEW_COMER)} · Visitor ${fmt(r.aktifPer.VISITOR)}`}
          tone="violet"
        />
        {att ? (
          <Kpi Icon={ScanLine} label="Datang tanpa daftar" value={fmt(r.tanpaDaftar)} hint="walk-in / event tanpa daftar" />
        ) : d.event.berbayar ? (
          <Kpi Icon={ScanLine} label="Lunas" value={fmt(r.lunas ?? 0)} hint={`${fmt(r.menungguVerifikasi ?? 0)} menunggu verifikasi`} />
        ) : null}
      </div>

      {/* Pendaftaran harian */}
      <Card Icon={CalendarDays} title="Pendaftaran harian" sub={`H-30 s/d ${dLabel(d.event.tanggalSelesai)} — batang atas = daftar, batang bawah = batal; garis = pendaftar aktif kumulatif`}>
        <RegChart p={d.pendaftaran} />
        {d.pendaftaran.sebelumRentang || d.pendaftaran.setelahRentang ? (
          <p className="text-[11px] text-neutral-500 mt-2">
            {d.pendaftaran.sebelumRentang ? `${fmt(d.pendaftaran.sebelumRentang)} pendaftaran sebelum H-30 (masuk ke garis kumulatif). ` : ''}
            {d.pendaftaran.setelahRentang ? `${fmt(d.pendaftaran.setelahRentang)} pendaftaran setelah event.` : ''}
          </p>
        ) : null}
      </Card>

      {att ? (
        <Card
          Icon={BarChart3}
          title="Absensi per 15 menit"
          sub={`720 menit sebelum mulai s/d 60 menit setelah selesai${d.absensi.puncak ? ` · puncak ${d.absensi.puncak.jam} (${fmt(d.absensi.puncak.jumlah)} orang)` : ''}`}
          right={
            d.absensi.hari.length > 1 ? (
              <select
                value={d.absensi.tanggal}
                onChange={(ev) => setHari(ev.target.value)}
                className="text-xs px-2 py-1 border border-neutral-300 rounded bg-white"
                aria-label="Hari event"
              >
                {d.absensi.hari.map((h) => (
                  <option key={h.tanggal} value={h.tanggal}>
                    {dLabel(h.tanggal)} · {fmt(h.hadir)} hadir
                  </option>
                ))}
              </select>
            ) : null
          }
        >
          <AttChart a={d.absensi} />
          {d.absensi.diluarRentang ? (
            <p className="text-[11px] text-neutral-500 mt-2">{fmt(d.absensi.diluarRentang)} check-in di hari ini berada di luar rentang grafik.</p>
          ) : null}
        </Card>
      ) : null}

      {att ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card Icon={PieChart} title="Proporsi cara absen" sub="Dari semua peserta yang hadir">
            <DonutChart
              data={GROUP.filter((g) => g.key !== 'LAINNYA' || d.proporsi.LAINNYA > 0).map((g) => ({ label: g.label, value: d.proporsi[g.key], color: g.color }))}
              centerLabel={fmt(r.hadir)}
              centerSublabel="hadir"
            />
          </Card>
          <Card Icon={PieChart} title="Yang hadir" sub="Jemaat & tamu (New Comer / Visitor)">
            <DonutChart
              data={WHO.map((w) => ({ label: w.label, value: r.hadirPer[w.key], color: w.color }))}
              centerLabel={fmt(r.hadir)}
              centerSublabel="hadir"
            />
          </Card>
          <Card Icon={Clock} title="Ketepatan waktu" sub="Waktu check-in terhadap jam mulai">
            <DonutChart
              data={[
                { label: 'Sebelum mulai', value: d.ketepatan.sebelum, color: '#10B981' },
                { label: 'Terlambat ≤ 15 menit', value: d.ketepatan.telat15, color: '#F59E0B' },
                { label: 'Terlambat > 15 menit', value: d.ketepatan.telatLebih, color: '#EF4444' },
              ]}
              centerLabel={pct(d.ketepatan.sebelum, r.hadir)}
              centerSublabel="tepat waktu"
            />
          </Card>
          <Card Icon={Users} title="Corong peserta" sub="Dari pendaftaran sampai hadir">
            <BarChart
              max={Math.max(1, r.totalDaftar)}
              data={[
                { label: 'Semua pendaftaran', value: r.totalDaftar },
                { label: 'Terdaftar aktif (tidak batal)', value: r.aktif, sublabel: pct(r.aktif, r.totalDaftar) },
                ...(d.event.berbayar ? [{ label: 'Lunas', value: r.lunas ?? 0, sublabel: pct(r.lunas ?? 0, r.aktif) }] : []),
                { label: 'Hadir', value: r.hadir, sublabel: pct(r.hadir, r.aktif) },
              ]}
            />
          </Card>
          <Card Icon={ScanLine} title="Petugas scan teraktif" sub="Jumlah check-in lewat scan petugas">
            <BarChart color="bg-violet-500" data={d.petugas.map((p) => ({ label: p.nama, value: p.jumlah }))} emptyText="Belum ada scan petugas" />
          </Card>
          <Card Icon={UserX} title="Alasan batal" sub="Peserta yang dibatalkan">
            <BarChart color="bg-red-400" data={d.alasanBatal.map((x) => ({ label: x.label, value: x.jumlah }))} emptyText="Tidak ada yang batal" />
          </Card>
          {d.cabang.length > 1 ? (
            <Card Icon={Users} title="Hadir per cabang" sub="Cabang peserta yang hadir (8 teratas)">
              <BarChart data={d.cabang.map((c) => ({ label: c.nama, value: c.jumlah }))} />
            </Card>
          ) : null}
        </div>
      ) : (
        <Card Icon={UserX} title="Alasan batal" sub="Peserta yang dibatalkan">
          <BarChart color="bg-red-400" data={d.alasanBatal.map((x) => ({ label: x.label, value: x.jumlah }))} emptyText="Tidak ada yang batal" />
        </Card>
      )}
      <p className="text-[11px] text-neutral-400">Diperbarui otomatis tiap menit. Tamu tanpa kategori dihitung Visitor.</p>
    </div>
  );
}

// ------------------------------------------------------------------ kerangka

function Kpi({ Icon, label, value, hint, tone }: { Icon: typeof Users; label: string; value: string; hint?: string; tone?: 'red' | 'green' | 'violet' }) {
  const c = tone === 'red' ? 'text-red-700' : tone === 'green' ? 'text-green-700' : tone === 'violet' ? 'text-violet-700' : 'text-neutral-900';
  return (
    <div className="bg-white border border-neutral-200 rounded-xl px-3 py-2.5 min-w-0">
      <div className="flex items-center gap-1.5 text-[11px] text-neutral-500">
        <Icon className="w-3.5 h-3.5 shrink-0" />
        <span className="truncate">{label}</span>
      </div>
      <div className={`text-xl font-bold leading-7 ${c}`}>{value}</div>
      {hint ? <div className="text-[10px] text-neutral-500 leading-4 truncate" title={hint}>{hint}</div> : null}
    </div>
  );
}

function Card({ Icon, title, sub, right, children }: { Icon: typeof Users; title: string; sub?: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-neutral-200 rounded-xl p-4 min-w-0">
      <div className="flex items-start gap-2 mb-3">
        <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-white flex items-center justify-center shrink-0">
          <Icon className="w-3.5 h-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-neutral-900">{title}</h3>
          {sub ? <p className="text-[11px] text-neutral-500 leading-4">{sub}</p> : null}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

function Legend({ items }: { items: { label: string; color: string; line?: boolean }[] }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
      {items.map((x) => (
        <span key={x.label} className="flex items-center gap-1.5 text-[11px] text-neutral-600">
          {x.line ? <span className="w-4 h-0.5 rounded" style={{ background: x.color }} /> : <span className="w-2.5 h-2.5 rounded-sm" style={{ background: x.color }} />}
          {x.label}
        </span>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ grafik batang bertumpuk

type Stack = { label: string; color: string; data: number[] };

/**
 * Batang bertumpuk: `up` di atas sumbu, `down` (opsional) di bawah sumbu,
 * `line` (opsional) memakai skala kanan. `shade` = rentang indeks yang diarsir
 * (hari / jam acara). Arahkan kursor untuk melihat rincian.
 */
function StackedBars({
  labels,
  up,
  down = [],
  line,
  shade,
  tickEvery,
  tickLabel,
  tipTitle,
}: {
  labels: string[];
  up: Stack[];
  down?: Stack[];
  line?: { label: string; color: string; data: number[] };
  shade?: [number, number];
  tickEvery: number;
  tickLabel: (i: number) => string;
  tipTitle: (i: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const n = labels.length;
  const W = 800;
  const H = 230;
  const padL = 34;
  const padR = line ? 38 : 10;
  const padT = 10;
  const padB = 24;
  const innerW = W - padL - padR;
  const sumAt = (ss: Stack[], i: number) => ss.reduce((a, s) => a + (s.data[i] ?? 0), 0);
  const maxUp = Math.max(1, ...labels.map((_, i) => sumAt(up, i)));
  const maxDown = down.length ? Math.max(0, ...labels.map((_, i) => sumAt(down, i))) : 0;
  const innerH = H - padT - padB;
  const upH = maxDown > 0 ? innerH * (maxUp / (maxUp + maxDown)) : innerH;
  const zeroY = padT + upH;
  const scale = upH / maxUp;
  const bw = innerW / Math.max(1, n);
  const x = (i: number) => padL + i * bw;
  const lineMax = line ? Math.max(1, ...line.data) : 1;
  const ly = (v: number) => padT + innerH - (v / lineMax) * innerH;

  const hasData = up.some((s) => s.data.some((v) => v > 0)) || down.some((s) => s.data.some((v) => v > 0));
  if (!n || !hasData) return <div className="h-40 flex items-center justify-center text-sm text-neutral-400 italic">Belum ada data</div>;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto select-none" onMouseLeave={() => setHover(null)}>
        {shade ? (
          <rect x={x(shade[0])} y={padT} width={Math.max(bw, (shade[1] - shade[0] + 1) * bw)} height={innerH} fill="#FFF7ED" />
        ) : null}
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={padL} x2={W - padR} y1={zeroY - upH * f} y2={zeroY - upH * f} stroke="#F3F4F6" />
            <text x={padL - 4} y={zeroY - upH * f + 3} textAnchor="end" fontSize={9} fill="#9CA3AF">
              {fmt(Math.round(maxUp * f))}
            </text>
          </g>
        ))}
        {maxDown > 0 ? (
          <text x={padL - 4} y={zeroY + (H - padB - zeroY) + 3} textAnchor="end" fontSize={9} fill="#9CA3AF">
            -{fmt(maxDown)}
          </text>
        ) : null}
        <line x1={padL} x2={W - padR} y1={zeroY} y2={zeroY} stroke="#D4D4D4" />
        {labels.map((_, i) => {
          let yUp = zeroY;
          let yDn = zeroY;
          const gap = bw > 6 ? 1.5 : 0.5;
          return (
            <g key={i} onMouseEnter={() => setHover(i)}>
              <rect x={x(i)} y={padT} width={bw} height={innerH} fill={hover === i ? '#0000000A' : 'transparent'} />
              {up.map((s) => {
                const h = (s.data[i] ?? 0) * scale;
                if (h <= 0) return null;
                yUp -= h;
                return <rect key={s.label} x={x(i) + gap} y={yUp} width={Math.max(0.5, bw - gap * 2)} height={h} fill={s.color} rx={bw > 8 ? 1.5 : 0} />;
              })}
              {down.map((s) => {
                const h = (s.data[i] ?? 0) * scale;
                if (h <= 0) return null;
                const y0 = yDn;
                yDn += h;
                return <rect key={s.label} x={x(i) + gap} y={y0} width={Math.max(0.5, bw - gap * 2)} height={h} fill={s.color} rx={bw > 8 ? 1.5 : 0} />;
              })}
            </g>
          );
        })}
        {line ? (
          <>
            <path
              d={line.data.map((v, i) => `${i ? 'L' : 'M'} ${x(i) + bw / 2} ${ly(v)}`).join(' ')}
              fill="none"
              stroke={line.color}
              strokeWidth={2}
              strokeLinejoin="round"
              pointerEvents="none"
            />
            <text x={W - padR + 4} y={padT + 8} fontSize={9} fill={line.color}>
              {fmt(lineMax)}
            </text>
            <text x={W - padR + 4} y={padT + innerH} fontSize={9} fill={line.color}>
              0
            </text>
          </>
        ) : null}
        {labels.map((_, i) =>
          i % tickEvery === 0 || i === n - 1 ? (
            <text key={`t${i}`} x={x(i) + bw / 2} y={H - 8} textAnchor="middle" fontSize={9} fill="#9CA3AF">
              {tickLabel(i)}
            </text>
          ) : null,
        )}
      </svg>
      {hover != null ? (
        <div
          className="absolute top-1 z-10 pointer-events-none bg-neutral-900/95 text-white text-[11px] rounded-lg px-2.5 py-2 shadow-lg min-w-[150px]"
          style={hover / n > 0.6 ? { right: `${100 - ((hover + 0.5) / n) * 100 + 2}%` } : { left: `${((hover + 0.5) / n) * 100 + 2}%` }}
        >
          <div className="font-semibold mb-1">{tipTitle(hover)}</div>
          {[...up, ...down].map((s) =>
            s.data[hover] ? (
              <div key={s.label} className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-sm" style={{ background: s.color }} />
                <span className="flex-1">{s.label}</span>
                <span className="font-semibold tabular-nums">{fmt(s.data[hover]!)}</span>
              </div>
            ) : null,
          )}
          {line ? (
            <div className="flex items-center gap-1.5 mt-1 pt-1 border-t border-white/20">
              <span className="w-2 h-0.5" style={{ background: line.color }} />
              <span className="flex-1">{line.label}</span>
              <span className="font-semibold tabular-nums">{fmt(line.data[hover] ?? 0)}</span>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function RegChart({ p }: { p: Visual['pendaftaran'] }) {
  const first = p.tanggal.indexOf(p.hariAcara[0] ?? '');
  const last = p.tanggal.indexOf(p.hariAcara[p.hariAcara.length - 1] ?? '');
  const evIdx = first >= 0 ? first : p.tanggal.length - 1;
  const up = WHO.map((w) => ({ label: `Daftar · ${w.label}`, color: w.color, data: p.daftar[w.key] }));
  const down = WHO.map((w) => ({ label: `Batal · ${w.label}`, color: w.key === 'JEMAAT' ? '#F87171' : w.key === 'NEW_COMER' ? '#FCA5A5' : '#FECACA', data: p.batal[w.key] }));
  return (
    <>
      <StackedBars
        labels={p.tanggal}
        up={up}
        down={down}
        line={{ label: 'Pendaftar aktif (kumulatif)', color: '#171717', data: p.kumulatif }}
        shade={first >= 0 ? [first, last >= 0 ? last : first] : undefined}
        tickEvery={Math.max(1, Math.ceil(p.tanggal.length / 8))}
        tickLabel={(i) => {
          const h = i - evIdx;
          return h < 0 ? `H${h}` : h === 0 ? 'Hari H' : dLabel(p.tanggal[i]!);
        }}
        tipTitle={(i) => {
          const h = i - evIdx;
          return `${dLabel(p.tanggal[i]!)}${h < 0 ? ` (H${h})` : h >= 0 && i <= (last >= 0 ? last : first) ? ' · hari acara' : ''}`;
        }}
      />
      <Legend
        items={[
          ...WHO.map((w) => ({ label: `Daftar ${w.label}`, color: w.color })),
          { label: 'Batal', color: '#F87171' },
          { label: 'Pendaftar aktif (kumulatif)', color: '#171717', line: true },
        ]}
      />
    </>
  );
}

function AttChart({ a }: { a: Visual['absensi'] }) {
  const [by, setBy] = useState<'metode' | 'kategori'>('metode');
  const stacks = useMemo(
    () =>
      by === 'metode'
        ? GROUP.map((g) => ({ label: g.label, color: g.color, data: a.metode[g.key] }))
        : WHO.map((w) => ({ label: w.label, color: w.color, data: a.kategori[w.key] })),
    [a, by],
  );
  return (
    <>
      <div className="flex gap-1 mb-2">
        {(
          [
            ['metode', 'Per cara absen'],
            ['kategori', 'Per jemaat / tamu'],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            type="button"
            onClick={() => setBy(k)}
            className={`text-[11px] px-2 py-1 rounded-md ${by === k ? 'bg-brand-100 text-brand-800 font-semibold' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'}`}
          >
            {l}
          </button>
        ))}
      </div>
      <StackedBars
        labels={a.jam}
        up={stacks}
        line={{ label: 'Hadir (kumulatif)', color: '#171717', data: a.kumulatif }}
        shade={[a.mulaiIdx, a.selesaiIdx]}
        tickEvery={Math.max(1, Math.ceil(a.jam.length / 10))}
        tickLabel={(i) => a.jam[i] ?? ''}
        tipTitle={(i) => {
          const rel = (i - a.mulaiIdx) * a.menitPerBatang;
          const end = a.jam[i + 1] ?? '';
          return `${a.jam[i]}${end ? `–${end}` : ''} · ${rel < 0 ? `${-rel} mnt sebelum mulai` : i <= a.selesaiIdx ? 'saat acara' : 'setelah selesai'}`;
        }}
      />
      <Legend items={[...stacks.map((s) => ({ label: s.label, color: s.color })), { label: 'Hadir (kumulatif)', color: '#171717', line: true }, { label: 'Jam acara', color: '#FED7AA' }]} />
    </>
  );
}
