'use client';

/**
 * Forecast — Pertumbuhan Jemaat (menu "forecast", dock di sebelah Elsa).
 * Patokan: jemaat aktif Els App per bulan. Data: GET /admin/forecast (core-api lib/forecast.ts).
 */
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  Armchair,
  FileText,
  HeartHandshake,
  Home,
  Info,
  Lightbulb,
  Loader2,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  TrendingUp,
  UserPlus,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useMenuAccess } from '@/lib/use-menu-access';
import { PersonaTabs } from '@/components/ui/persona-tabs';
import { DonutChart } from '@/components/charts/simple-charts';
import { Bars, ForecastChart, Legend, Lines, Spark } from '@/components/forecast/charts';
import { mLabel, nf, pf, type ForecastData, type ForecastSettings } from '@/lib/forecast-types';

type Tab = 'ringkasan' | 'cabang' | 'platform' | 'tamu' | 'hcevent' | 'kapasitas' | 'simulasi' | 'keandalan';
const PCOL = { android: '#16A34A', ios: '#2563EB', web: '#F59E0B', lainnya: '#A3A3A3' } as const;
const PLAB = { android: 'Android', ios: 'iOS', web: 'Web', lainnya: 'Lainnya' } as const;

export default function ForecastPage() {
  const [cabangId, setCabangId] = useState('');
  const [range, setRange] = useState<12 | 24 | 0>(24);
  const [horizon, setHorizon] = useState(60);
  const [scenario, setScenario] = useState<'pes' | 'normal' | 'opt'>('normal');
  const [tab, setTab] = useState<Tab>('ringkasan');
  const [exporting, setExporting] = useState(false);

  const cabangQ = useQuery({
    queryKey: ['cabang', 'options-forecast'],
    queryFn: async () => (await apiClient.get<{ data: { id: string; nama: string }[] }>('/admin/cabang', { params: { limit: 100, sortBy: 'nama', sortOrder: 'asc' } })).data.data,
    staleTime: 300_000,
  });
  const q = useQuery({
    queryKey: ['forecast', cabangId, horizon],
    queryFn: async () => (await apiClient.get<{ data: ForecastData }>('/admin/forecast', { params: { cabangId: cabangId || undefined, horizon }, timeout: 120_000 })).data.data,
    placeholderData: (p) => p,
    staleTime: 120_000,
  });
  const d = q.data;

  async function exportPdf() {
    const win = window.open('', '_blank');
    setExporting(true);
    try {
      const res = await apiClient.get('/admin/forecast/export', { params: { cabangId: cabangId || undefined, horizon }, responseType: 'blob', timeout: 120_000 });
      const url = URL.createObjectURL(res.data as Blob);
      if (win) win.location.href = url;
      else window.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch {
      win?.close();
      toast.error('Gagal membuat laporan PDF');
    } finally {
      setExporting(false);
    }
  }

  // Riwayat yang ditampilkan (12 / 24 bulan / semua).
  const view = useMemo(() => {
    if (!d) return null;
    const cut = range && d.months.length > range ? d.months.length - range : 0;
    return { months: d.months.slice(cut), series: d.series.slice(cut) };
  }, [d, range]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white flex items-center justify-center">
              <TrendingUp className="w-5 h-5" />
            </span>
            Forecast — Pertumbuhan Jemaat
          </h1>
          <p className="text-sm text-neutral-500 mt-1 max-w-3xl">
            Jemaat aktif di Els App per bulan, dari mana pertumbuhan datang, pemakaian iOS / Android / Web, tamu, homecell & event, kesiapan tempat ibadah, dan perkiraan ke depan.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={cabangId} onChange={(e) => setCabangId(e.target.value)} className="px-3 py-1.5 border border-neutral-300 rounded-lg text-sm bg-white" aria-label="Cabang">
            <option value="">Seluruh sinode</option>
            {(cabangQ.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.nama}
              </option>
            ))}
          </select>
          <Seg value={range} onChange={setRange} options={[[12, '12 bln'], [24, '24 bln'], [0, 'Semua']]} />
          <Seg value={horizon} onChange={setHorizon} options={[[6, 'Prediksi 6 bln'], [12, '12'], [24, '24'], [36, '36'], [60, '60 bln']]} />
          <button onClick={exportPdf} disabled={!d || exporting} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-brand-200 bg-white text-sm font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-50">
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />} Export PDF
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-brand-200 bg-gradient-to-br from-brand-50 to-white px-4 py-2.5 text-[12.5px] text-brand-900 flex gap-2.5">
        <Info className="w-4 h-4 shrink-0 mt-0.5 text-brand-700" />
        <div>
          <b>Jemaat aktif Els App</b> = jemaat (bukan tamu) yang membuka Els App dalam keadaan login minimal sekali dalam bulan itu. <b>Berhenti aktif</b> = sebelumnya aktif,
          lalu tidak membuka Els App 2 bulan berturut-turut. Angka bulanan memakai bulan yang sudah lengkap; bulan berjalan ditampilkan terpisah.
        </div>
      </div>

      {!d ? (
        <div className="py-20 flex justify-center text-neutral-400">{q.isError ? <span className="text-sm text-red-600">Gagal memuat data Forecast.</span> : <Loader2 className="w-6 h-6 animate-spin" />}</div>
      ) : (
        <>
          {d.maturity.early ? <MaturityBanner d={d} onDetail={() => setTab('keandalan')} /> : null}

          <PersonaTabs
            value={tab}
            onChange={setTab}
            items={[
              { key: 'ringkasan', label: 'Ringkasan & Prediksi', Icon: TrendingUp },
              { key: 'cabang', label: 'Per Cabang', Icon: Home },
              { key: 'platform', label: 'Platform', Icon: Smartphone },
              { key: 'tamu', label: 'Tamu', Icon: UserPlus },
              { key: 'hcevent', label: 'Homecell & Event', Icon: HeartHandshake },
              { key: 'kapasitas', label: 'Kapasitas Ibadah', Icon: Armchair },
              { key: 'simulasi', label: 'Simulasi', Icon: SlidersHorizontal },
              { key: 'keandalan', label: 'Keandalan Data', Icon: ShieldCheck },
            ]}
          />
          {q.isFetching ? <div className="text-[11px] text-neutral-400 -mt-2">Memperbarui…</div> : null}

          {tab === 'ringkasan' && view ? <Ringkasan d={d} view={view} scenario={scenario} setScenario={setScenario} /> : null}
          {tab === 'cabang' ? <Cabang d={d} /> : null}
          {tab === 'platform' ? <Platform d={d} /> : null}
          {tab === 'tamu' ? <Tamu d={d} /> : null}
          {tab === 'hcevent' ? <HcEvent d={d} /> : null}
          {tab === 'kapasitas' ? <Kapasitas d={d} /> : null}
          {tab === 'simulasi' ? <Simulasi d={d} /> : null}
          {tab === 'keandalan' ? <Keandalan d={d} /> : null}
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ kerangka

function Seg<T extends string | number>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <div className="inline-flex rounded-lg border border-neutral-300 bg-white p-0.5 gap-0.5">
      {options.map(([v, l]) => (
        <button
          key={String(v)}
          type="button"
          onClick={() => onChange(v)}
          className={`px-2.5 py-1 rounded-md text-xs ${value === v ? 'bg-gradient-to-br from-brand-500 to-brand-700 text-white font-semibold' : 'text-neutral-600 hover:bg-neutral-50'}`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

function Card({ title, sub, right, children, className = '' }: { title: string; sub?: string; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`bg-white border border-neutral-200 rounded-xl p-4 min-w-0 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
        <div className="flex items-start gap-2 min-w-0">
          <span className="w-6 h-6 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-neutral-900">{title}</h3>
            {sub ? <p className="text-[11.5px] text-neutral-500 leading-4 mt-0.5">{sub}</p> : null}
          </div>
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

function Kpi({ label, value, sub, color }: { label: string; value: string; sub?: React.ReactNode; color: string }) {
  return (
    <div className="bg-white border border-neutral-200 rounded-xl px-3.5 py-3 min-w-0">
      <div className="flex items-center justify-between gap-2 text-xs text-neutral-500">
        <span className="truncate">{label}</span>
        <span className="w-6 h-6 rounded-lg shrink-0" style={{ background: `linear-gradient(135deg, ${color}, ${color}bb)` }} />
      </div>
      <div className="text-2xl font-bold text-neutral-900 tabular-nums mt-1">{value}</div>
      {sub ? <div className="text-[11px] text-neutral-500 mt-0.5">{sub}</div> : null}
    </div>
  );
}

const Up = ({ v, suffix = '%' }: { v: number | null | undefined; suffix?: string }) =>
  v == null ? <span className="text-neutral-400">—</span> : <span className={`font-semibold ${v >= 0 ? 'text-green-700' : 'text-red-600'}`}>{v >= 0 ? '▲' : '▼'} {Math.abs(v).toLocaleString('id-ID')}{suffix}</span>;

const Badge = ({ children, tone }: { children: React.ReactNode; tone: 'ok' | 'warn' | 'bad' | 'muted' }) => (
  <span
    className={`text-[10.5px] font-bold px-2 py-0.5 rounded-full ${
      tone === 'ok' ? 'bg-green-100 text-green-800' : tone === 'warn' ? 'bg-amber-100 text-amber-800' : tone === 'bad' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'
    }`}
  >
    {children}
  </span>
);
const EarlyTag = ({ show }: { show: boolean }) => (show ? <Badge tone="warn">perkiraan awal</Badge> : null);

function MaturityBanner({ d, onDetail }: { d: ForecastData; onDetail: () => void }) {
  const m = d.maturity;
  const pctBar = Math.min(100, (m.dataMonths / Math.max(1, m.seasonMin)) * 100);
  return (
    <div className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white px-4 py-3 flex flex-wrap gap-3 items-start">
      <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-amber-700 text-white flex items-center justify-center shrink-0">
        <AlertTriangle className="w-4 h-4" />
      </span>
      <div className="flex-1 min-w-[16rem]">
        <div className="font-semibold text-amber-900">Data masih terlalu dini — prediksi masih perkiraan awal</div>
        <div className="text-[12.5px] text-amber-900/90 mt-0.5">
          Aktivitas Els App baru tercatat <b>{m.dataMonths} bulan</b>. Agar prediksi lebih tepat dibutuhkan minimal <b>{m.trendMin} bulan</b>; pola musiman (Natal, Paskah) baru terbaca
          penuh setelah <b>{m.seasonMin} bulan</b>.
          {m.riwayatSampai ? ` Bulan sampai ${mLabel(m.riwayatSampai, true)} berasal dari riwayat login yang kurang lengkap — hanya ditampilkan, tidak dipakai untuk prediksi.` : ''}
          {!d.forecast && !d.hidePrediction ? ' Prediksi muncul setelah ada minimal 3 bulan data.' : ''}
        </div>
        <div className="flex flex-wrap items-center gap-2.5 mt-2">
          <div className="relative w-full max-w-[420px] h-2 bg-amber-100 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-amber-500 to-amber-700 rounded-full" style={{ width: `${pctBar}%` }} />
          </div>
          <span className="text-[11.5px] text-amber-900">
            {m.dataMonths} / {m.seasonMin} bulan{m.akuratMulai ? ` · cukup akurat mulai ${mLabel(m.akuratMulai, true)}` : ''}
            {m.lengkapMulai ? ` · lengkap ${mLabel(m.lengkapMulai, true)}` : ''}
          </span>
        </div>
      </div>
      <button onClick={onDetail} className="px-3 py-1.5 rounded-lg border border-amber-300 bg-white text-xs font-semibold text-amber-800 hover:bg-amber-50">
        Lihat detail
      </button>
    </div>
  );
}

// ------------------------------------------------------------------ Ringkasan

function Ringkasan({ d, view, scenario, setScenario }: { d: ForecastData; view: { months: string[]; series: number[] }; scenario: 'pes' | 'normal' | 'opt'; setScenario: (s: 'pes' | 'normal' | 'opt') => void }) {
  const r = d.ringkasan;
  const comp = d.components.slice(-12);
  const lastP = d.platform.series[d.platform.series.length - 1];
  const early = d.maturity.early;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi label={`Jemaat aktif ${r.bulan ? mLabel(r.bulan) : ''}`} value={nf(r.aktif)} color="#F97316" sub={<><Up v={r.vsBulanLalu} /> vs bulan sebelumnya{r.vsTahunLalu != null ? <> · <Up v={r.vsTahunLalu} /> vs tahun lalu</> : null}</>} />
        <Kpi label="Pengguna baru" value={`+${nf(r.baru)}`} color="#10B981" sub="pertama kali aktif" />
        <Kpi label="Kembali aktif" value={`+${nf(r.kembali)}`} color="#0EA5E9" sub="sempat berhenti, kini aktif lagi" />
        <Kpi label="Berhenti aktif" value={`−${nf(r.berhenti)}`} color="#EF4444" sub="tidak membuka 2 bulan" />
        <Kpi
          label={d.akhir ? `Prediksi ${mLabel(d.akhir.month)}` : 'Prediksi'}
          value={d.akhir ? nf(d.akhir.value) : '—'}
          color="#8B5CF6"
          sub={d.akhir ? <>rentang {nf(d.akhir.lo)} – {nf(d.akhir.hi)} {early ? <EarlyTag show /> : null}</> : d.hidePrediction ? 'disembunyikan — data belum cukup' : 'data belum cukup'}
        />
      </div>
      <div className="text-[11.5px] text-neutral-500 -mt-2">
        Bulan berjalan ({mLabel(d.berjalan.month, true)}): <b>{nf(d.berjalan.aktif)}</b> jemaat aktif sejauh ini.
      </div>

      <Card
        title="Jemaat aktif Els App per bulan + prediksi"
        sub="Garis tebal = riwayat · garis putus = prediksi · pita = rentang kemungkinan (80%) · arahkan kursor untuk detail"
        right={<Seg value={scenario} onChange={setScenario} options={[['pes', 'Pesimis'], ['normal', 'Normal'], ['opt', 'Optimis']]} />}
      >
        <ForecastChart months={view.months} series={view.series} fc={d.forecast} scenario={scenario} milestones={d.milestones} riwayatSampai={d.maturity.riwayatSampai} />
        <Legend
          items={[
            { label: 'Riwayat jemaat aktif', color: '#F97316' },
            { label: 'Prediksi', color: '#8B5CF6', line: true },
            { label: 'Rentang prediksi', color: '#EDE9FE' },
            { label: 'Pesimis / optimis', color: '#94A3B8', line: true },
            { label: 'Tonggak', color: '#C4B5FD', line: true },
          ]}
        />
        {d.hidePrediction ? <p className="text-xs text-amber-700 mt-2">Prediksi disembunyikan karena data belum mencapai batas minimal (Pengaturan di tab Keandalan Data).</p> : null}
      </Card>

      <Kumulatif d={d} />

      {d.perTahun.length ? (
        <Card title="Proyeksi per tahun" sub="Jemaat aktif Els App di akhir tiap tahun · makin jauh makin lebar rentangnya" right={<Badge tone="warn">&gt; 24 bulan = gambaran arah</Badge>}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead className="text-[11px] uppercase text-neutral-500 bg-neutral-50">
                <tr>
                  <th className="text-left px-3 py-2">Akhir tahun</th>
                  <th className="text-right px-3 py-2">Prediksi normal</th>
                  <th className="text-right px-3 py-2">Rentang 80%</th>
                  <th className="text-right px-3 py-2">Pesimis</th>
                  <th className="text-right px-3 py-2">Optimis</th>
                  <th className="text-right px-3 py-2">vs sekarang</th>
                </tr>
              </thead>
              <tbody>
                {d.perTahun.map((y) => (
                  <tr key={y.tahun} className="border-t border-neutral-100">
                    <td className="px-3 py-2 font-semibold">
                      Des {y.tahun} {y.jangkaPanjang ? <Badge tone="muted">jangka panjang</Badge> : null} <EarlyTag show={early} />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-bold">{nf(y.value)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-neutral-500">
                      {nf(y.lo)} – {nf(y.hi)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-neutral-500">{nf(y.pes)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-neutral-500">{nf(y.opt)}</td>
                    <td className="px-3 py-2 text-right">
                      <Up v={r.aktif ? Math.round((y.value / r.aktif - 1) * 100) : null} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-neutral-400 mt-2">Proyeksi lebih dari 2 tahun sangat bergantung pada asumsi. Dipakai untuk arah perencanaan, bukan target pasti. Dihitung ulang tiap awal bulan.</p>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <Card title="Komponen pertumbuhan per bulan" sub="Atas = masuk (baru + kembali aktif) · bawah = berhenti aktif · garis = pertumbuhan bersih">
          <Bars
            labels={comp.map((c) => c.month)}
            tick={(k) => mLabel(k)}
            up={[
              { label: 'Pengguna baru', color: '#10B981', data: comp.map((c) => c.baru) },
              { label: 'Kembali aktif', color: '#0EA5E9', data: comp.map((c) => c.kembali) },
            ]}
            down={[{ label: 'Berhenti aktif', color: '#F87171', data: comp.map((c) => c.berhenti) }]}
          />
          <Legend items={[{ label: 'Pengguna baru', color: '#10B981' }, { label: 'Kembali aktif', color: '#0EA5E9' }, { label: 'Berhenti aktif', color: '#F87171' }]} />
        </Card>
        <Card title="Yang perlu diperhatikan" sub="Dihitung otomatis dari data terbaru">
          <div className="space-y-2">
            {d.insights.length ? (
              d.insights.map((i) => <Insight key={i.judul} tone={i.tone} judul={i.judul} isi={i.isi} />)
            ) : (
              <p className="text-sm text-neutral-500">Belum ada catatan khusus.</p>
            )}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Platform" sub="Jemaat aktif menurut perangkat (bulan lengkap terakhir)">
          {lastP ? (
            <DonutChart
              data={(['android', 'ios', 'web'] as const).map((p) => ({ label: PLAB[p], value: lastP[p], color: PCOL[p] }))}
              centerLabel={nf(r.aktif)}
              centerSublabel="aktif"
              size={120}
            />
          ) : null}
          <p className="text-[11px] text-neutral-400 mt-2">{nf(d.platform.multiPlatform)} jemaat memakai lebih dari satu platform.</p>
        </Card>
        <Card title="Kelompok usia" sub="Jemaat aktif & perubahan 3 bulan">
          <BarList items={d.usia.map((u) => ({ label: u.label, value: u.aktif, right: <Up v={u.tren3} /> }))} color="from-brand-500 to-brand-700" />
        </Card>
        <Card title="Keterlibatan jemaat aktif" sub="% dari jemaat aktif Els App">
          <BarList items={d.keterlibatan.map((k) => ({ label: k.label, value: k.persen ?? 0, right: <b>{pf(k.persen)}</b> }))} max={100} color="from-violet-500 to-violet-700" />
        </Card>
      </div>

      {d.langkah.length ? (
        <Card title="Apa yang perlu gereja kerjakan" sub="Disusun otomatis, diurutkan dari yang paling berdampak (juga di export PDF)">
          <div className="grid gap-2 md:grid-cols-2">
            {d.langkah.map((a) => (
              <div key={a.no} className="flex gap-3 rounded-xl border border-neutral-200 p-3">
                <span className="w-8 h-8 rounded-lg text-white font-bold flex items-center justify-center shrink-0" style={{ background: `linear-gradient(135deg, ${a.tone}, ${a.tone}bb)` }}>
                  {a.no}
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-neutral-900">{a.judul}</div>
                  <div className="text-xs text-neutral-600 mt-0.5">{a.isi}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function Kumulatif({ d }: { d: ForecastData }) {
  const k = d.kumulatif;
  const [showTable, setShowTable] = useState(false);
  if (!k || !k.months.length) return null;
  const n = k.months.length;
  const last = n - 1;
  const fcN = Math.min(12, k.prediksi.akun.length);
  const labels = [...k.months, ...k.prediksi.months.slice(0, fcN)].map((m) => mLabel(m));
  const pad = (arr: (number | null)[]) => [...arr, ...Array.from({ length: fcN }, () => null)];
  const bj = k.berjalan ?? null;
  const bjOnChart = !!bj && fcN > 0 && k.prediksi.months[0] === bj.month;
  const sampaiLabel = bj ? new Date(`${bj.sampai}T00:00:00.000Z`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : '';
  return (
    <Card
      title="Total jemaat per bulan (terus bertambah)"
      sub="Jumlah keseluruhan yang terkumpul sampai akhir tiap bulan · pertumbuhan majemuk = rata-rata kenaikan per bulan yang 'berbunga'"
      right={
        <button type="button" onClick={() => setShowTable((v) => !v)} className="text-xs font-semibold text-brand-700 border border-brand-200 rounded-lg px-2.5 py-1 hover:bg-brand-50">
          {showTable ? 'Sembunyikan tabel' : 'Lihat tabel per bulan'}
        </button>
      }
    >
      {bj ? (
        <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 flex flex-wrap gap-x-4 gap-y-1 items-center">
          <span className="font-bold">
            {mLabel(bj.month, true)} · s/d {sampaiLabel} (hari ke-{bj.hari} dari {bj.hariDalamBulan})
          </span>
          <span>
            Total akun <b>{nf(bj.akun)}</b> (+{nf(bj.akunBaru)})
          </span>
          <span>
            Jemaat terdaftar <b>{nf(bj.jemaat)}</b> (+{nf(bj.jemaatBaru)})
          </span>
          <span>
            Aktif <b>{nf(bj.aktif)}</b> ({pf(bj.persenAktif)})
          </span>
          <span className="basis-full text-amber-800/80">
            Catatan: bulan berjalan belum lengkap — angka masih bisa bertambah sampai akhir bulan. Tidak dipakai untuk pertumbuhan majemuk & perkiraan.
          </span>
        </div>
      ) : null}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
        <Kpi label="Total akun Els App jemaat" value={nf(k.akun[last])} color="#F97316" sub={<>+{nf(k.akunBaru[last])} bulan {mLabel(k.months[last]!)}</>} />
        <Kpi
          label="Pertumbuhan majemuk akun / bulan"
          value={k.cmgr.akun12 != null ? `${k.cmgr.akun12.toLocaleString('id-ID')}%` : k.cmgr.akun6 != null ? `${k.cmgr.akun6.toLocaleString('id-ID')}%` : '—'}
          color="#10B981"
          sub={`${k.cmgr.akun12 != null ? '12' : '6'} bulan terakhir · 3 bln: ${k.cmgr.akun3 == null ? '—' : `${k.cmgr.akun3.toLocaleString('id-ID')}%`}`}
        />
        <Kpi label="Total jemaat terdaftar" value={nf(k.jemaat[last])} color="#8B5CF6" sub={`majemuk 12 bln: ${k.cmgr.jemaat12 == null ? '—' : `${k.cmgr.jemaat12.toLocaleString('id-ID')}%/bln`}`} />
        <Kpi label="Akun yang aktif bulan ini" value={pf(k.persenAktif[last])} color="#0EA5E9" sub={`jemaat aktif ÷ total akun · majemuk aktif 6 bln: ${k.cmgr.aktif6 == null ? '—' : `${k.cmgr.aktif6.toLocaleString('id-ID')}%`}`} />
      </div>
      <Lines
        labels={labels}
        series={[
          { label: 'Total jemaat terdaftar', color: '#8B5CF6', data: pad(k.jemaat), width: 2.5 },
          { label: 'Total akun Els App', color: '#F97316', data: pad(k.akun), width: 3 },
          { label: 'Perkiraan total akun', color: '#F97316', data: [...k.akun.map((v, i) => (i === last ? v : null)), ...k.prediksi.akun.slice(0, fcN)], dashed: true },
          ...(bj && bjOnChart
            ? [{ label: `Akun s/d ${sampaiLabel}`, color: '#B45309', data: [...k.akun.map((v, i) => (i === last ? v : null)), bj.akun, ...Array.from({ length: fcN - 1 }, () => null)], dashed: true, width: 2 }]
            : []),
          { label: 'Jemaat aktif bulan itu', color: '#0EA5E9', data: pad(k.aktif), width: 2.5 },
        ]}
        height={240}
      />
      <Legend
        items={[
          { label: 'Total jemaat terdaftar', color: '#8B5CF6', line: true },
          { label: 'Total akun Els App (kumulatif)', color: '#F97316', line: true },
          { label: 'Jemaat aktif bulan itu', color: '#0EA5E9', line: true },
          ...(bj && bjOnChart ? [{ label: `Total akun s/d ${sampaiLabel} (berjalan)`, color: '#B45309', line: true }] : []),
        ]}
      />
      {showTable ? (
        <div className="overflow-x-auto mt-3">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="text-[11px] uppercase text-neutral-500 bg-neutral-50">
              <tr>
                <th className="text-left px-3 py-2">Bulan</th>
                <th className="text-right px-3 py-2">Akun baru</th>
                <th className="text-right px-3 py-2">Total akun</th>
                <th className="text-right px-3 py-2">Tumbuh</th>
                <th className="text-right px-3 py-2">Jemaat aktif</th>
                <th className="text-right px-3 py-2">% aktif</th>
                <th className="text-right px-3 py-2">Total jemaat terdaftar</th>
              </tr>
            </thead>
            <tbody>
              {bj ? (
                <tr className="border-t border-amber-100 bg-amber-50/60">
                  <td className="px-3 py-1.5">
                    {mLabel(bj.month, true)} <span className="text-[10px] font-semibold text-amber-700">s/d {sampaiLabel} · berjalan</span>
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">+{nf(bj.akunBaru)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{nf(bj.akun)}</td>
                  <td className="px-3 py-1.5 text-right text-[11px] text-neutral-400">belum lengkap</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{nf(bj.aktif)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{pf(bj.persenAktif)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{nf(bj.jemaat)}</td>
                </tr>
              ) : null}
              {k.months
                .map((m, i) => ({ m, i }))
                .reverse()
                .slice(0, 24)
                .map(({ m, i }) => (
                  <tr key={m} className="border-t border-neutral-100">
                    <td className="px-3 py-1.5">{mLabel(m, true)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">+{nf(k.akunBaru[i])}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{nf(k.akun[i])}</td>
                    <td className="px-3 py-1.5 text-right">
                      <Up v={i > 0 && k.akun[i - 1] ? Math.round(((k.akun[i]! - k.akun[i - 1]!) / k.akun[i - 1]!) * 1000) / 10 : null} />
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{nf(k.aktif[i])}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{pf(k.persenAktif[i])}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{nf(k.jemaat[i])}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <p className="text-[11px] text-neutral-400 mt-2">
        Total akun = jemaat (bukan tamu) yang sudah membuat akun Els App sampai akhir bulan itu. Total jemaat terdaftar = data jemaat aktif menurut tanggal bergabung gereja (data impor lama tanpa tanggal tercatat di bulan impornya). Jemaat aktif bisa naik-turun; total selalu bertambah.
      </p>
    </Card>
  );
}

function Insight({ tone, judul, isi }: { tone: 'ok' | 'info' | 'warn' | 'bad'; judul: string; isi: string }) {
  const c = { ok: ['#F0FDF4', '#BBF7D0', '#22C55E', '#15803D'], info: ['#FFF7ED', '#FED7AA', '#F97316', '#C2410C'], warn: ['#FFFBEB', '#FDE68A', '#F59E0B', '#B45309'], bad: ['#FEF2F2', '#FECACA', '#EF4444', '#B91C1C'] }[tone];
  return (
    <div className="flex gap-2.5 rounded-xl border p-2.5 text-[12.5px]" style={{ background: c[0], borderColor: c[1] }}>
      <span className="w-5 h-5 rounded-md shrink-0 mt-0.5" style={{ background: `linear-gradient(135deg, ${c[2]}, ${c[3]})` }} />
      <div>
        <b>{judul}</b> — {isi}
      </div>
    </div>
  );
}

function BarList({ items, max, color }: { items: { label: string; value: number; right?: React.ReactNode }[]; max?: number; color: string }) {
  const m = max ?? Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="space-y-1.5">
      {items.map((i) => (
        <div key={i.label}>
          <div className="flex justify-between text-[12.5px] gap-2">
            <span className="text-neutral-700 truncate">{i.label}</span>
            <span className="tabular-nums shrink-0">
              {max ? null : <b className="mr-1.5">{nf(i.value)}</b>}
              {i.right}
            </span>
          </div>
          <div className="h-1.5 bg-neutral-100 rounded-full overflow-hidden mt-0.5">
            <div className={`h-full rounded-full bg-gradient-to-r ${color}`} style={{ width: `${(i.value / m) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ Per cabang

function Cabang({ d }: { d: ForecastData }) {
  return (
    <Card title="Pertumbuhan per cabang" sub="Jemaat dihitung di cabang terdaftarnya · urut berdasarkan jemaat aktif">
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[880px]">
          <thead className="text-[11px] uppercase text-neutral-500 bg-neutral-50">
            <tr>
              <th className="text-left px-3 py-2">Cabang</th>
              <th className="text-right px-3 py-2">Aktif</th>
              <th className="text-right px-3 py-2">vs bulan lalu</th>
              <th className="text-left px-3 py-2">Tren 12 bulan</th>
              <th className="text-right px-3 py-2">Baru</th>
              <th className="text-right px-3 py-2">Berhenti</th>
              <th className="text-left px-3 py-2">Platform</th>
              <th className="text-right px-3 py-2">Prediksi 12 bln</th>
            </tr>
          </thead>
          <tbody>
            {d.perCabang.map((c) => {
              const tot = Math.max(1, c.platform.android + c.platform.ios + c.platform.web);
              return (
                <tr key={c.id} className="border-t border-neutral-100">
                  <td className="px-3 py-2 font-semibold">{c.nama}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{nf(c.aktif)}</td>
                  <td className="px-3 py-2 text-right">
                    <Up v={c.tumbuhPersen} />
                  </td>
                  <td className="px-3 py-2">
                    <Spark data={c.tren} color={(c.tumbuhPersen ?? 0) >= 0 ? '#EA580C' : '#DC2626'} />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">+{nf(c.baru)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">−{nf(c.berhenti)}</td>
                  <td className="px-3 py-2">
                    <div className="flex h-2 w-28 rounded-full overflow-hidden bg-neutral-100" title={`Android ${c.platform.android} · iOS ${c.platform.ios} · Web ${c.platform.web}`}>
                      <div style={{ width: `${(c.platform.android / tot) * 100}%`, background: PCOL.android }} />
                      <div style={{ width: `${(c.platform.ios / tot) * 100}%`, background: PCOL.ios }} />
                      <div style={{ width: `${(c.platform.web / tot) * 100}%`, background: PCOL.web }} />
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <b>{nf(c.prediksi12)}</b> {c.kecil ? <Badge tone="warn">rentang lebar</Badge> : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-neutral-400 mt-2">Prediksi cabang kecil (&lt; {d.settings.cabangMinActive} jemaat aktif) diberi tanda karena rentangnya lebar.</p>
    </Card>
  );
}

// ------------------------------------------------------------------ Platform

function Platform({ d }: { d: ForecastData }) {
  const s = d.platform.series.slice(-12);
  return (
    <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
      <Card title="Jemaat aktif per platform per bulan" sub="Jemaat yang memakai 2 platform dihitung di keduanya">
        <Bars
          labels={s.map((x) => x.month)}
          tick={(k) => mLabel(k)}
          up={(['android', 'ios', 'web', 'lainnya'] as const).map((p) => ({ label: PLAB[p], color: PCOL[p], data: s.map((x) => x[p]) }))}
        />
        <Legend items={(['android', 'ios', 'web'] as const).map((p) => ({ label: PLAB[p], color: PCOL[p] }))} />
      </Card>
      <Card title="Ringkasan platform" sub="Bulan lengkap terakhir · tren 3 bulan · retensi bulan pertama">
        <table className="w-full text-sm">
          <thead className="text-[11px] uppercase text-neutral-500 bg-neutral-50">
            <tr>
              <th className="text-left px-3 py-2">Platform</th>
              <th className="text-right px-3 py-2">Aktif</th>
              <th className="text-right px-3 py-2">Tren</th>
              <th className="text-right px-3 py-2">Retensi bln-1</th>
            </tr>
          </thead>
          <tbody>
            {d.platform.ringkasan
              .filter((p) => p.platform !== 'lainnya' || p.aktif > 0)
              .map((p) => (
                <tr key={p.platform} className="border-t border-neutral-100">
                  <td className="px-3 py-2">
                    <span className="inline-block w-2.5 h-2.5 rounded-sm mr-1.5" style={{ background: PCOL[p.platform] }} />
                    {PLAB[p.platform]}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{nf(p.aktif)}</td>
                  <td className="px-3 py-2 text-right">
                    <Up v={p.tren3} />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{pf(p.retensi1)}</td>
                </tr>
              ))}
          </tbody>
        </table>
        <p className="text-[11px] text-neutral-400 mt-2">
          Platform dari perangkat yang dipakai saat membuka Els App. Data {d.maturity.liveSince ? `sejak ${mLabel(d.maturity.liveSince, true)}` : 'riwayat'} paling tepat; sebelumnya
          dibentuk dari riwayat login.
        </p>
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ Tamu

function Tamu({ d }: { d: ForecastData }) {
  const t = d.tamu;
  const st = t.perjalanan;
  const steps: [string, number, string][] = [
    ['Tamu pertama kali hadir', st.datang, '#8B5CF6'],
    ['Hadir lagi (≥ 2×)', st.datangLagi, '#7C3AED'],
    ['Di-follow-up / ikut homecell', st.dihubungi, '#0EA5E9'],
    ['Daftar Els App', st.daftar, '#F97316'],
    ['Jemaat aktif Els App', st.aktif, '#C2410C'],
  ];
  const labels = [...t.bulanan.map((b) => b.month), ...t.prediksiMonths];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi label="Tamu hadir (bulan lalu)" value={nf(t.bulanIni.tamu)} color="#8B5CF6" sub={<><Up v={t.bulanIni.vsBulanLalu} /> vs sebelumnya</>} />
        <Kpi label="New Comer" value={nf(t.bulanIni.newComer)} color="#10B981" sub="berpotensi berjemaat" />
        <Kpi label="Visitor" value={nf(t.bulanIni.visitor)} color="#0EA5E9" sub="berkunjung" />
        <Kpi label="Tamu → jemaat aktif" value={pf(t.konversi.total)} color="#F97316" sub={`90 hari · New Comer ${pf(t.konversi.newComer)} · Visitor ${pf(t.konversi.visitor)}`} />
        <Kpi label="Belum di-follow-up" value={nf(t.belumFollowUp)} color="#EF4444" sub="New Comer tanpa petugas follow-up" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <Card title="Tamu per bulan + prediksi" sub="Tamu unik yang hadir (ibadah, event, homecell) · garis putus = prediksi">
          <Bars
            labels={labels}
            tick={(k) => mLabel(k)}
            up={[
              { label: 'New Comer', color: '#10B981', data: t.bulanan.map((b) => b.newComer) },
              { label: 'Visitor', color: '#0EA5E9', data: t.bulanan.map((b) => b.visitor) },
            ]}
            line={t.prediksi.length ? { label: 'Prediksi tamu', color: '#8B5CF6', data: t.prediksi, dashed: true, offset: t.bulanan.length } : undefined}
          />
          <Legend items={[{ label: 'New Comer', color: '#10B981' }, { label: 'Visitor', color: '#0EA5E9' }, { label: 'Prediksi total tamu', color: '#8B5CF6', line: true }]} />
        </Card>
        <Card title="Perjalanan tamu (90 hari)" sub="Dari pertama kali hadir sampai jadi jemaat aktif Els App">
          <div className="space-y-2">
            {steps.map(([l, v, c], i) => (
              <div key={l}>
                <div className="flex justify-between text-[12.5px]">
                  <span>{l}</span>
                  <span>
                    <b>{nf(v)}</b> <span className="text-neutral-400">{i && steps[i - 1]![1] ? `${Math.round((v / steps[i - 1]![1]) * 100)}% dari sebelumnya` : ''}</span>
                  </span>
                </div>
                <div className="h-3 bg-neutral-100 rounded-md overflow-hidden mt-0.5">
                  <div className="h-full rounded-md" style={{ width: `${(v / Math.max(1, st.datang)) * 100}%`, background: `linear-gradient(90deg, ${c}, ${c}cc)` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <Card title="Tamu per cabang" sub="Bulan lengkap terakhir · konversi 90 hari">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="text-[11px] uppercase text-neutral-500 bg-neutral-50">
              <tr>
                <th className="text-left px-3 py-2">Cabang</th>
                <th className="text-right px-3 py-2">Tamu</th>
                <th className="text-right px-3 py-2">New Comer</th>
                <th className="text-right px-3 py-2">Visitor</th>
                <th className="text-right px-3 py-2">Jadi jemaat (90 hr)</th>
                <th className="text-right px-3 py-2">Belum di-follow-up</th>
                <th className="text-left px-3 py-2">Sumber</th>
              </tr>
            </thead>
            <tbody>
              {t.perCabang.map((c) => {
                const tot = Math.max(1, c.sumber.ibadah + c.sumber.event + c.sumber.homecell);
                return (
                  <tr key={c.nama} className="border-t border-neutral-100">
                    <td className="px-3 py-2 font-semibold">{c.nama}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{nf(c.tamu)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{nf(c.newComer)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{nf(c.visitor)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{pf(c.konversi)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${c.belumFu > 5 ? 'text-red-600 font-semibold' : ''}`}>{nf(c.belumFu)}</td>
                    <td className="px-3 py-2">
                      <div className="flex h-2 w-28 rounded-full overflow-hidden bg-neutral-100" title={`Ibadah ${c.sumber.ibadah} · Event ${c.sumber.event} · Homecell ${c.sumber.homecell}`}>
                        <div style={{ width: `${(c.sumber.ibadah / tot) * 100}%`, background: '#F97316' }} />
                        <div style={{ width: `${(c.sumber.event / tot) * 100}%`, background: '#8B5CF6' }} />
                        <div style={{ width: `${(c.sumber.homecell / tot) * 100}%`, background: '#0EA5E9' }} />
                      </div>
                      <div className="text-[10px] text-neutral-400 mt-0.5">ibadah · event · homecell</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ Homecell & Event

function HcEvent({ d }: { d: ForecastData }) {
  const h = d.homecell;
  const e = d.event;
  const early = d.maturity.dataMonths < d.settings.homecellMinMonths;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi label="Jemaat aktif ikut homecell" value={pf(h.persenAktif)} color="#F97316" />
        <Kpi label="Berhenti/bln — ikut homecell" value={pf(h.stopIn)} color="#10B981" sub={<>yang <b>tidak</b> ikut: {pf(h.stopOut)}</>} />
        <Kpi label="Homecell perlu dibuka" value={`+${nf(h.perluDibuka)}`} color="#F59E0B" sub={`sampai Des ${h.sampaiTahun} (±${h.ideal} anggota)`} />
        <Kpi label="Jemaat baru dari event" value={pf(e.persenDariEvent)} color="#8B5CF6" sub="dari pengguna baru 3 bulan terakhir" />
        <Kpi label="Event mendatang" value={nf(e.upcoming3)} color="#0EA5E9" sub={e.ready ? '3 bulan ke depan · masuk prediksi' : `efek event dipakai setelah ${d.settings.eventMinEvents} event`} />
      </div>
      <HomecellGrowth d={d} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Homecell menjaga jemaat tetap aktif" sub="% jemaat yang masih aktif N bulan setelah pertama memakai Els App" right={<EarlyTag show={early} />}>
          <Lines
            labels={h.curveIn.map((_, i) => `bln ${i}`)}
            series={[
              { label: 'Ikut homecell', color: '#F97316', data: h.curveIn, width: 3 },
              { label: 'Tidak ikut homecell', color: '#94A3B8', data: h.curveOut, width: 3 },
            ]}
            yMax={100}
            suffix="%"
          />
          <Legend items={[{ label: 'Ikut homecell', color: '#F97316', line: true }, { label: 'Tidak ikut homecell', color: '#94A3B8', line: true }]} />
        </Card>
        <Card title="Kapasitas homecell" sub={`Patokan ${h.ideal} anggota per homecell · lebih dari ${h.batas} orang disarankan dimultiplikasi`}>
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase text-neutral-500 bg-neutral-50">
              <tr>
                <th className="text-left px-3 py-2">Cabang</th>
                <th className="text-right px-3 py-2">Homecell</th>
                <th className="text-right px-3 py-2">Rata-rata</th>
                <th className="text-right px-3 py-2">&gt; {h.batas} org</th>
                <th className="text-right px-3 py-2">Perlu dibuka</th>
              </tr>
            </thead>
            <tbody>
              {h.perCabang.map((c) => (
                <tr key={c.cabangId} className="border-t border-neutral-100">
                  <td className="px-3 py-2 font-semibold">{c.nama}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{nf(c.homecell)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{c.rataAnggota.toLocaleString('id-ID')}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${c.lebihBatas ? 'text-red-600 font-semibold' : ''}`}>{nf(c.lebihBatas)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-bold">{c.perluDibuka ? `+${c.perluDibuka}` : '0'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Dampak event terhadap jemaat baru" sub="Batang = pengguna baru · ungu = daftar event ≤ 14 hari sebelum mulai aktif">
          <Bars
            labels={e.dariEvent.map((x) => x.month)}
            tick={(k) => mLabel(k)}
            up={[
              { label: 'Dari event', color: '#8B5CF6', data: e.dariEvent.map((x) => x.dariEvent) },
              { label: 'Lainnya', color: '#10B981', data: e.dariEvent.map((x) => Math.max(0, x.baru - x.dariEvent)) },
            ]}
          />
          <Legend items={[{ label: 'Dari event', color: '#8B5CF6' }, { label: 'Pengguna baru lainnya', color: '#10B981' }]} />
        </Card>
        <Card title="Event paling menumbuhkan" sub="12 bulan terakhir · jadi jemaat aktif ≤ 2 bulan setelah event · bertahan 2 bulan">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase text-neutral-500 bg-neutral-50">
              <tr>
                <th className="text-left px-3 py-2">Event</th>
                <th className="text-right px-3 py-2">Peserta</th>
                <th className="text-right px-3 py-2">Tamu</th>
                <th className="text-right px-3 py-2">Jadi jemaat</th>
                <th className="text-right px-3 py-2">Bertahan</th>
              </tr>
            </thead>
            <tbody>
              {e.perEvent.length ? (
                e.perEvent.map((x) => (
                  <tr key={x.id} className="border-t border-neutral-100">
                    <td className="px-3 py-2">
                      <div className="font-semibold">{x.judul}</div>
                      <div className="text-[11px] text-neutral-400">
                        {new Date(x.tanggal).toLocaleDateString('id-ID', { month: 'short', year: 'numeric' })} · {x.cabang}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{nf(x.peserta)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{nf(x.tamu)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{nf(x.jadiJemaat)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{x.bertahanPersen == null ? '—' : `${x.bertahanPersen}%`}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-neutral-400">
                    Belum ada event dalam 12 bulan terakhir.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <p className="text-[11px] text-neutral-400 mt-2">
            {e.ready
              ? `Event yang sudah dijadwalkan ikut diperhitungkan dalam prediksi (±${e.upliftPerEvent} jemaat baru per event besar).`
              : `Efek event masuk prediksi setelah ada ${d.settings.eventMinEvents} event (sekarang ${e.pastEvents}).`}
          </p>
        </Card>
      </div>
    </div>
  );
}


function HomecellGrowth({ d }: { d: ForecastData }) {
  const g = d.homecell.pertumbuhan;
  if (!g || !g.months.length) return null;
  const labels = [...g.months, ...g.prediksi.months].map((m) => mLabel(m));
  const last = g.anggota[g.anggota.length - 1] ?? 0;
  return (
    <Card title="Pertumbuhan homecell" sub="Homecell aktif & anggota aktif per bulan · garis putus = perkiraan anggota 12 bulan ke depan">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-3">
        <Kpi label="Homecell aktif" value={nf(g.sekarang.homecell)} color="#F97316" sub={<><Up v={g.tumbuh12.homecell} /> dalam 12 bulan</>} />
        <Kpi label="Anggota aktif" value={nf(g.sekarang.anggota)} color="#10B981" sub={<><Up v={g.tumbuh12.anggota} /> dalam 12 bulan</>} />
        <Kpi label="Homecell baru (12 bln)" value={`+${nf(g.baru12)}`} color="#8B5CF6" sub="dibuka / dimultiplikasi" />
        <Kpi label="Rata-rata anggota" value={g.sekarang.rataPerHomecell == null ? '—' : g.sekarang.rataPerHomecell.toLocaleString('id-ID')} color="#0EA5E9" sub={`per homecell · patokan ${d.homecell.ideal}`} />
        <Kpi
          label="Homecell dibutuhkan (12 bln)"
          value={g.butuh12 == null ? '—' : nf(g.butuh12)}
          color="#F59E0B"
          sub={g.tambahan12 == null ? 'data belum cukup' : g.tambahan12 > 0 ? `perlu +${nf(g.tambahan12)} homecell baru` : 'jumlah sekarang cukup'}
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <div className="text-xs font-semibold text-neutral-600 mb-1">Anggota aktif homecell</div>
          <Lines
            labels={labels}
            series={[
              { label: 'Anggota', color: '#10B981', data: [...g.anggota, ...g.prediksi.months.map(() => null)], width: 3 },
              { label: 'Perkiraan', color: '#8B5CF6', data: [...g.anggota.map((v, i) => (i === g.anggota.length - 1 ? last : null)), ...g.prediksi.anggota], dashed: true },
            ]}
          />
          <Legend items={[{ label: 'Anggota aktif', color: '#10B981', line: true }, { label: 'Perkiraan', color: '#8B5CF6', line: true }]} />
        </div>
        <div>
          <div className="text-xs font-semibold text-neutral-600 mb-1">Homecell aktif per bulan (oranye tua = baru dibuka)</div>
          <Bars
            labels={g.months}
            tick={(k) => mLabel(k)}
            up={[
              { label: 'Homecell lama', color: '#FDBA74', data: g.homecell.map((v, i) => Math.max(0, v - (g.baru[i] ?? 0))) },
              { label: 'Baru dibuka', color: '#C2410C', data: g.baru },
            ]}
          />
          <div className="text-xs font-semibold text-neutral-600 mt-3 mb-1">Rata-rata hadir per pertemuan (anggota + tamu)</div>
          <Lines labels={g.months.map((m) => mLabel(m))} series={[{ label: 'Rata-rata hadir', color: '#0EA5E9', data: g.hadirRata, width: 2.5 }]} height={150} />
        </div>
      </div>
      <p className="text-[11px] text-neutral-400 mt-2">Homecell nonaktif dihitung berhenti pada tanggal terakhir diubah (perkiraan). Data homecell lama hasil impor tercatat di bulan impornya.</p>
    </Card>
  );
}

// ------------------------------------------------------------------ Kapasitas

function Kapasitas({ d }: { d: ForecastData }) {
  const k = d.kapasitas;
  const [sel, setSel] = useState<string | null>(null);
  const it = k.list.find((x) => x.id === sel) ?? k.list.find((x) => x.kursi) ?? null;
  const st = (p: number | null) => (p == null ? ['bg-slate-100 text-slate-600', '—'] : p >= 90 ? ['bg-red-100 text-red-700', 'Penuh'] : p >= 75 ? ['bg-amber-100 text-amber-800', 'Mulai padat'] : ['bg-green-100 text-green-800', 'Aman']);
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-brand-200 bg-gradient-to-br from-brand-50 to-white px-4 py-2.5 text-[12.5px] text-brand-900">
        <b>Okupansi</b> = rata-rata hadir per pertemuan (jemaat + tamu) ÷ kursi, dari {d.settings.occMinMeetings} pertemuan terakhir. <b>Prediksi</b> mengikuti pertumbuhan jemaat aktif cabang itu.
        Status: <b className="text-green-700">Aman</b> &lt; 75% · <b className="text-amber-700">Mulai padat</b> 75–89% · <b className="text-red-600">Penuh</b> ≥ 90%. Okupansi hanya pendataan — check-in
        tidak pernah ditolak.
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi label="Okupansi rata-rata" value={pf(k.rataOkupansi)} color="#F97316" />
        <Kpi label="Pertemuan penuh (≥ 90%)" value={nf(k.pertemuanPenuh)} color="#EF4444" sub={`dari ${nf(k.pertemuanBulanIni)} pertemuan 31 hari terakhir`} />
        <Kpi label="Akan penuh ≤ 6 bulan" value={nf(k.akanPenuh6)} color="#F59E0B" sub="perlu disiapkan" />
        <Kpi label="Sisa kursi rata-rata" value={nf(k.sisaKursi)} color="#10B981" sub="per pertemuan, dijumlahkan" />
        <Kpi label="Kapasitas belum diisi" value={nf(k.tanpaKapasitas)} color="#64748B" sub="ibadah tanpa jumlah kursi" />
      </div>
      <Card title="Kesiapan kapasitas per ibadah" sub="Klik baris untuk melihat grafiknya">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[860px]">
            <thead className="text-[11px] uppercase text-neutral-500 bg-neutral-50">
              <tr>
                <th className="text-left px-3 py-2">Ibadah</th>
                <th className="text-right px-3 py-2">Kursi</th>
                <th className="text-right px-3 py-2">Rata-rata</th>
                <th className="text-right px-3 py-2">Puncak</th>
                <th className="text-left px-3 py-2">Okupansi sekarang → 6 bln → 12 bln</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="text-left px-3 py-2">Perkiraan penuh</th>
              </tr>
            </thead>
            <tbody>
              {k.list.map((x) => {
                const [cls, lab] = st(x.okupansi);
                return (
                  <tr key={x.id} onClick={() => setSel(x.id)} className={`border-t border-neutral-100 cursor-pointer ${it?.id === x.id ? 'bg-brand-50' : 'hover:bg-neutral-50'}`}>
                    <td className="px-3 py-2">
                      <div className="font-semibold">
                        {x.nama} <span className="text-neutral-400 font-normal">{x.jam}</span>
                      </div>
                      <div className="text-[11px] text-neutral-400">
                        {x.cabang}
                        {!x.cukupData ? ` · baru ${x.pertemuan} pertemuan` : ''}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{x.kursi ?? '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{nf(x.rataHadir)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{nf(x.puncak)}</td>
                    <td className="px-3 py-2">
                      {x.kursi ? (
                        <div className="flex items-center gap-1.5 w-56">
                          {[x.okupansi, x.okupansi6, x.okupansi12].map((p, i) => (
                            <div key={i} className="flex-1">
                              <div className="h-2 bg-neutral-100 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${(p ?? 0) >= 90 ? 'bg-red-500' : (p ?? 0) >= 75 ? 'bg-amber-500' : 'bg-green-500'}`} style={{ width: `${Math.min(100, p ?? 0)}%`, opacity: 1 - i * 0.2 }} />
                              </div>
                              <div className="text-[10.5px] font-semibold text-neutral-600 mt-0.5">{p ?? '—'}%</div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-neutral-400">kapasitas belum diisi</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${cls}`}>{lab}</span>
                    </td>
                    <td className={`px-3 py-2 text-[12.5px] font-semibold ${x.penuhMulai ? 'text-red-600' : 'text-neutral-400'}`}>{x.penuhMulai ? `± ${mLabel(x.penuhMulai, true)}` : x.kursi ? '—' : 'isi kapasitas'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-neutral-400 mt-2">Isi jumlah kursi di Ibadah → Edit ibadah.</p>
      </Card>
      {it ? (
        <Card title={`${it.nama} ${it.jam} — ${it.cabang}`} sub={`Hadir per pertemuan${it.kursi ? ` terhadap kapasitas ${it.kursi} kursi` : ''}`}>
          <Lines
            labels={it.riwayat.map((r) => new Date(`${r.tanggal}T00:00:00Z`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', timeZone: 'UTC' }))}
            series={[{ label: 'Hadir', color: '#F97316', data: it.riwayat.map((r) => r.hadir), width: 3 }]}
            refLines={it.kursi ? [{ value: it.kursi, label: `Kapasitas ${it.kursi}`, color: '#DC2626' }, { value: it.kursi * 0.9, label: '90%', color: '#F59E0B', dashed: true }] : []}
          />
        </Card>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------ Simulasi

function Slider({ label, value, set, min, max, stepV = 1, sub, fmt }: { label: string; value: number; set: (v: number) => void; min: number; max: number; stepV?: number; sub: string; fmt: (v: number) => string }) {
  return (
    <div className="my-3">
      <label className="flex justify-between text-[13px] font-semibold">
        {label} <span className="text-brand-700">{fmt(value)}</span>
      </label>
      <input type="range" min={min} max={max} step={stepV} value={value} onChange={(e) => set(Number(e.target.value))} className="w-full accent-brand-600" />
      <div className="text-[11.5px] text-neutral-500">{sub}</div>
    </div>
  );
}


function Simulasi({ d }: { d: ForecastData }) {
  const s = d.sim;
  const [baru, setBaru] = useState(s.baruPerBulan || 10);
  const [ret, setRet] = useState(Math.round(s.retensi1 ?? 70));
  const [stop, setStop] = useState(s.berhentiPersen ?? 5);
  const [hc, setHc] = useState(Math.round(s.homecellPersen ?? 50));
  const [ev, setEv] = useState(s.eventPerTahun);
  useEffect(() => {
    setBaru(s.baruPerBulan || 10);
    setRet(Math.round(s.retensi1 ?? 70));
    setStop(s.berhentiPersen ?? 5);
    setHc(Math.round(s.homecellPersen ?? 50));
    setEv(s.eventPerTahun);
  }, [s]);
  const H = 12;
  const run = (b: number, r: number, st: number, h: number, e: number) => {
    // Berhenti disesuaikan dengan porsi homecell (selisih tingkat berhenti ikut vs tidak ikut).
    const sIn = (s.berhentiHomecell ?? st) / 100;
    const sOut = (s.berhentiNonHomecell ?? st) / 100;
    const base = (s.homecellPersen ?? 50) / 100;
    const adj = sIn !== sOut ? (h / 100 - base) * (sOut - sIn) : 0;
    const stopR = Math.max(0, st / 100 - adj);
    const add = b + ((e - s.eventPerTahun) * s.upliftPerEvent) / 12;
    let a = s.aktif;
    const out: number[] = [];
    for (let i = 0; i < H; i++) {
      a = a * (1 - stopR) + Math.max(0, add) * (r / 100) + s.kembaliPerBulan;
      out.push(a);
    }
    return out;
  };
  const baseRun = run(s.baruPerBulan || 10, s.retensi1 ?? 70, s.berhentiPersen ?? 5, s.homecellPersen ?? 50, s.eventPerTahun);
  const simRun = run(baru, ret, stop, hc, ev);
  // Diskalakan ke prediksi resmi supaya titik awal sama.
  const target = d.forecast?.fc[H - 1] ?? baseRun[H - 1]!;
  const k = baseRun[H - 1] ? target / baseRun[H - 1]! : 1;
  const simV = simRun.map((v) => v * k);
  const baseV = baseRun.map((v) => v * k);
  const delta = Math.round(simV[H - 1]! - baseV[H - 1]!);
  const hist = d.series.slice(-12);
  const fcM = d.forecast?.months.slice(0, H) ?? [];
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Bagaimana jika…" sub="Geser untuk melihat dampaknya ke prediksi 12 bulan">
        <Slider label="Pengguna baru per bulan" value={baru} set={setBaru} min={0} max={Math.max(50, (s.baruPerBulan || 10) * 3)} sub={`Rata-rata 3 bulan terakhir: ${nf(s.baruPerBulan)}`} fmt={nf} />
        <Slider label="Retensi bulan pertama" value={ret} set={setRet} min={30} max={100} sub="% pengguna baru yang masih aktif di bulan kedua" fmt={(v) => `${v}%`} />
        <Slider label="Berhenti aktif per bulan" value={stop} set={setStop} min={0} max={20} stepV={0.1} sub="% jemaat aktif lama yang berhenti tiap bulan" fmt={(v) => `${v.toLocaleString('id-ID')}%`} />
        <Slider
          label="Jemaat aktif yang ikut homecell"
          value={hc}
          set={setHc}
          min={0}
          max={100}
          sub={s.berhentiHomecell != null && s.berhentiNonHomecell != null ? `Ikut homecell berhenti ${s.berhentiHomecell}%/bln, tidak ikut ${s.berhentiNonHomecell}%/bln` : 'Data efek homecell belum cukup'}
          fmt={(v) => `${v}%`}
        />
        <Slider label="Event besar per tahun" value={ev} set={setEv} min={0} max={24} sub={s.upliftPerEvent ? `Rata-rata satu event besar menambah ±${s.upliftPerEvent} jemaat baru` : 'Efek event belum terukur'} fmt={nf} />
        <div className="rounded-xl border border-violet-200 bg-violet-50 p-3 text-[13px]">
          Hasil: <b>{nf(simV[H - 1])}</b> jemaat aktif di {fcM[H - 1] ? mLabel(fcM[H - 1]!, true) : '12 bulan lagi'} (
          <span className={delta >= 0 ? 'text-green-700 font-semibold' : 'text-red-600 font-semibold'}>
            {delta >= 0 ? '+' : ''}
            {nf(delta)}
          </span>{' '}
          dibanding prediksi normal).
        </div>
      </Card>
      <Card title="Prediksi hasil simulasi" sub="Oranye = riwayat · ungu = simulasi · abu = prediksi normal">
        <Lines
          labels={[...d.months.slice(-12), ...fcM].map((m) => mLabel(m))}
          series={[
            { label: 'Riwayat', color: '#F97316', data: [...hist, ...fcM.map(() => null)], width: 3 },
            { label: 'Normal', color: '#A3A3A3', data: [...hist.map((_, i) => (i === hist.length - 1 ? hist[i]! : null)), ...baseV], dashed: true },
            { label: 'Simulasi', color: '#8B5CF6', data: [...hist.map((_, i) => (i === hist.length - 1 ? hist[i]! : null)), ...simV], width: 3 },
          ]}
        />
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ Keandalan

function Keandalan({ d }: { d: ForecastData }) {
  const canWrite = useMenuAccess('forecast', 'write');
  const qc = useQueryClient();
  const [form, setForm] = useState<ForecastSettings>(d.settings);
  useEffect(() => setForm(d.settings), [d.settings]);
  const save = useMutation({
    mutationFn: async () => apiClient.put('/admin/forecast/settings', form),
    onSuccess: () => {
      toast.success('Pengaturan disimpan');
      qc.invalidateQueries({ queryKey: ['forecast'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.error?.message ?? 'Gagal menyimpan'),
  });
  const bt = d.backtest;
  const field = (k: keyof ForecastSettings, label: string, unit: string) => (
    <label key={k} className="flex items-center justify-between gap-3 text-[13px]">
      <span className="text-neutral-700">{label}</span>
      <span className="flex items-center gap-1.5 shrink-0">
        <input
          type="number"
          min={0}
          value={form[k] as number}
          disabled={!canWrite}
          onChange={(e) => setForm((f) => ({ ...f, [k]: Number(e.target.value) }))}
          className="w-20 px-2 py-1 border border-neutral-300 rounded-md text-right disabled:bg-neutral-50"
        />
        <span className="text-neutral-500 w-16">{unit}</span>
      </span>
    </label>
  );
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Kesiapan data per bagian" sub="Bagian yang datanya belum cukup tetap ditampilkan dengan label 'perkiraan awal'">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase text-neutral-500 bg-neutral-50">
              <tr>
                <th className="text-left px-3 py-2">Bagian</th>
                <th className="text-right px-3 py-2">Data tersedia</th>
                <th className="text-right px-3 py-2">Minimal</th>
                <th className="text-left px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {d.readiness.map((r) => (
                <tr key={r.key} className="border-t border-neutral-100">
                  <td className="px-3 py-2">{r.label}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {nf(r.have)} {r.unit}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {nf(r.min)} {r.unit}
                    {r.extra ? <div className="text-[10.5px] text-neutral-400">{r.extra}</div> : null}
                  </td>
                  <td className="px-3 py-2">
                    {r.status === 'siap' ? <Badge tone="ok">Siap</Badge> : r.status === 'awal' ? <Badge tone="warn">Perkiraan awal</Badge> : <Badge tone="bad">{r.key === 'panjang' ? 'Gambaran arah saja' : 'Belum cukup'}</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card title="Pengaturan batas data minimal" sub={canWrite ? 'Berlaku untuk halaman & export PDF' : 'Hanya pemilik akses Ubah yang bisa mengubah'}>
          <div className="space-y-2">
            {field('trendMinMonths', 'Minimal data untuk prediksi tren', 'bulan')}
            {field('seasonMinMonths', 'Minimal data untuk pola musiman', 'bulan')}
            {field('cabangMinMonths', 'Minimal data prediksi per cabang', 'bulan')}
            {field('cabangMinActive', 'Minimal jemaat aktif per cabang', 'orang')}
            {field('platformMinMonths', 'Minimal data platform', 'bulan')}
            {field('tamuMinMonths', 'Minimal data tamu', 'bulan')}
            {field('occMinMeetings', 'Pertemuan untuk menghitung okupansi', 'pertemuan')}
            {field('homecellMinMonths', 'Minimal data efek homecell', 'bulan')}
            {field('eventMinEvents', 'Minimal event untuk efek event', 'event')}
            {field('homecellIdeal', 'Patokan anggota per homecell', 'orang')}
            {field('homecellMax', 'Batas homecell perlu dimultiplikasi', 'orang')}
            <label className="flex items-center justify-between gap-3 text-[13px]">
              <span className="text-neutral-700">Bila data di bawah minimal</span>
              <select
                value={form.belowMin}
                disabled={!canWrite}
                onChange={(e) => setForm((f) => ({ ...f, belowMin: e.target.value as 'label' | 'hide' }))}
                className="px-2 py-1 border border-neutral-300 rounded-md bg-white disabled:bg-neutral-50"
              >
                <option value="label">Tampilkan dengan label &quot;perkiraan awal&quot;</option>
                <option value="hide">Sembunyikan prediksi</option>
              </select>
            </label>
          </div>
          <p className="text-[11px] text-neutral-400 mt-2">Saran bawaan: 12 bulan untuk tren, 24 bulan untuk musiman. Menurunkan batas membuat prediksi muncul lebih cepat tetapi kurang tepat.</p>
          {canWrite ? (
            <div className="mt-3 text-right">
              <button onClick={() => save.mutate()} disabled={save.isPending} className="px-4 py-1.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold disabled:opacity-50">
                {save.isPending ? 'Menyimpan…' : 'Simpan'}
              </button>
            </div>
          ) : null}
        </Card>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Seberapa tepat prediksi sebelumnya?" sub="Prediksi yang dibuat 3 bulan sebelumnya dibandingkan kenyataan">
          {bt.points.length ? (
            <>
              <Lines
                labels={bt.points.map((p) => mLabel(p.month))}
                series={[
                  { label: 'Kenyataan', color: '#F97316', data: bt.points.map((p) => p.actual), width: 3 },
                  { label: 'Prediksi 3 bulan sebelumnya', color: '#8B5CF6', data: bt.points.map((p) => p.pred), dashed: true },
                ]}
              />
              <Legend items={[{ label: 'Kenyataan', color: '#F97316', line: true }, { label: 'Prediksi 3 bulan sebelumnya', color: '#8B5CF6', line: true }]} />
            </>
          ) : (
            <p className="text-sm text-neutral-500 py-6 text-center">Butuh minimal 8 bulan data untuk menguji ketepatan prediksi.</p>
          )}
          <p className="text-[11px] text-neutral-500 mt-2">
            Rata-rata meleset {bt.mape3 != null ? <b>±{bt.mape3.toLocaleString('id-ID')}%</b> : '—'} untuk 3 bulan ke depan
            {bt.mape12 != null ? <> · <b>±{bt.mape12.toLocaleString('id-ID')}%</b> untuk 12 bulan ke depan</> : ' · 12 bulan: butuh ≥ 18 bulan data'}.
            {d.forecast?.seasonal ? ' Pola musiman sudah dipakai.' : ` Pola musiman dipakai setelah data ≥ ${d.settings.seasonMinMonths} bulan.`}
          </p>
        </Card>
        <Card title="Sumber & batasan data">
          <ul className="list-disc pl-5 space-y-1 text-[13px] text-neutral-700 leading-6">
            <li>
              <b>Aktivitas Els App</b> dicatat server setiap kali jemaat yang login memakai app (tanpa update app)
              {d.maturity.liveSince ? `, sejak ${mLabel(d.maturity.liveSince, true)}` : ''}. Riwayat sebelumnya dibentuk dari catatan sesi login & aktivitas yang masih tersimpan (perkiraan).
            </li>
            <li>
              <b>Platform</b> dari perangkat yang dipakai (iOS / Android / Web).
            </li>
            <li>
              <b>Cabang & usia</b> dari data jemaat; tanpa tanggal lahir masuk &quot;Tidak diketahui&quot;.
            </li>
            <li>
              <b>Tamu</b> tidak dihitung sebagai jemaat aktif.
            </li>
            <li>
              <b>Event</b>: jemaat baru dihitung &quot;dari event&quot; bila mendaftar event ≤ 14 hari sebelum mulai aktif — perkiraan hubungan, bukan kepastian.
            </li>
            <li>Prediksi = model tren yang melambat bertahap + musiman per bulan (statistik, bukan AI kotak hitam); dihitung ulang setiap kali data berubah.</li>
          </ul>
        </Card>
      </div>
      <div className="text-[11px] text-neutral-400 flex items-center gap-1.5">
        <Lightbulb className="w-3.5 h-3.5" /> Diperbarui {new Date(d.generatedAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}.
      </div>
    </div>
  );
}

