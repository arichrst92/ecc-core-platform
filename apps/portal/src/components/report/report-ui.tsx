'use client';

/** Komponen bersama halaman Laporan Ibadah & Laporan Event. */
import { useQuery } from '@tanstack/react-query';
import { FileSpreadsheet, FileText, Filter } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { PERIODE_OPTIONS, type PeriodePreset } from '@/components/homecell/homecell-filter-bar';

export const METHOD_KEYS = ['SCAN', 'SELF', 'WALK_IN', 'MANUAL', 'UNKNOWN'] as const;
export type MethodKey = (typeof METHOD_KEYS)[number];
export type MethodCount = Record<MethodKey, number>;
export const METHOD_META: Record<MethodKey, { label: string; cls: string }> = {
  SCAN: { label: 'Scan usher', cls: 'bg-sky-500' },
  SELF: { label: 'Self check-in', cls: 'bg-emerald-500' },
  WALK_IN: { label: 'Walk-in (tamu)', cls: 'bg-violet-500' },
  MANUAL: { label: 'Manual admin', cls: 'bg-amber-500' },
  UNKNOWN: { label: 'Tidak tercatat', cls: 'bg-neutral-300' },
};

export const selectCls =
  'w-full px-2 py-1.5 border border-neutral-300 rounded text-sm bg-white outline-none focus:ring-2 focus:ring-brand-500';
export const fmtTgl = (ymd: string) =>
  new Date(`${ymd}T00:00:00`).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

const asArray = (body: any) => (Array.isArray(body) ? body : (body?.data ?? []));

export function useCabangOptions() {
  return useQuery({
    queryKey: ['cabang', 'options'],
    queryFn: async () => asArray((await apiClient.get('/auth/cabang', { params: { isActive: true } })).data) as { id: string; nama: string }[],
    staleTime: 5 * 60_000,
  });
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] text-neutral-500 font-medium mb-0.5">{label}</span>
      {children}
    </label>
  );
}

export interface PeriodState {
  periode: Exclude<PeriodePreset, ''>;
  from: string;
  to: string;
}

export function PeriodFields({ value, onChange }: { value: PeriodState; onChange: (v: PeriodState) => void }) {
  return (
    <>
      <Field label="Periode">
        <select
          value={value.periode}
          onChange={(e) => onChange({ ...value, periode: e.target.value as PeriodState['periode'] })}
          className={selectCls}
        >
          {PERIODE_OPTIONS.filter((o) => o.value).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>
      {value.periode === 'custom' ? (
        <Field label="Dari – Sampai">
          <div className="flex items-center gap-1">
            <input type="date" value={value.from} onChange={(e) => onChange({ ...value, from: e.target.value })} className={selectCls} />
            <span className="text-neutral-400 text-xs">–</span>
            <input type="date" value={value.to} onChange={(e) => onChange({ ...value, to: e.target.value })} className={selectCls} />
          </div>
        </Field>
      ) : null}
    </>
  );
}

export function FilterCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white border border-neutral-200 rounded-xl p-3">
      <div className="flex items-center gap-2 mb-2 text-xs text-neutral-500 font-medium uppercase tracking-wider">
        <Filter className="w-3.5 h-3.5" /> Filter
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">{children}</div>
    </div>
  );
}

export function StatCard({ label, value, hint, accent }: { label: string; value: string | number; hint?: string; accent?: 'tamu' }) {
  return (
    <div className={`rounded-xl border p-4 ${accent === 'tamu' ? 'bg-violet-50 border-violet-100' : 'bg-white border-neutral-200'}`}>
      <div className={`text-2xl font-bold ${accent === 'tamu' ? 'text-violet-700' : 'text-neutral-900'}`}>{value}</div>
      <div className="text-xs text-neutral-500 mt-0.5">{label}</div>
      {hint ? <div className="text-[11px] text-neutral-400 mt-1">{hint}</div> : null}
    </div>
  );
}

/** Bar horizontal komposisi cara check-in + legend. */
export function MethodBar({ methods }: { methods: MethodCount }) {
  const total = METHOD_KEYS.reduce((n, k) => n + methods[k], 0);
  if (!total) return <p className="text-sm text-neutral-400">Belum ada kehadiran.</p>;
  return (
    <div>
      <div className="flex h-3 rounded-full overflow-hidden bg-neutral-100">
        {METHOD_KEYS.filter((k) => methods[k] > 0).map((k) => (
          <div key={k} className={METHOD_META[k].cls} style={{ width: `${(methods[k] / total) * 100}%` }} title={`${METHOD_META[k].label}: ${methods[k]}`} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
        {METHOD_KEYS.filter((k) => methods[k] > 0).map((k) => (
          <span key={k} className="flex items-center gap-1.5 text-xs text-neutral-600">
            <span className={`w-2.5 h-2.5 rounded-sm ${METHOD_META[k].cls}`} />
            {METHOD_META[k].label} <b className="text-neutral-800">{methods[k]}</b>
            <span className="text-neutral-400">({Math.round((methods[k] / total) * 100)}%)</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function MethodInline({ methods }: { methods: MethodCount }) {
  return (
    <div className="flex flex-wrap gap-1">
      {METHOD_KEYS.filter((k) => methods[k] > 0).map((k) => (
        <span key={k} className="inline-flex items-center gap-1 text-[11px] text-neutral-600" title={METHOD_META[k].label}>
          <span className={`w-2 h-2 rounded-sm ${METHOD_META[k].cls}`} />
          {methods[k]}
        </span>
      ))}
    </div>
  );
}

/** Tombol export PDF (print view) & Excel (CSV). */
export function ExportButtons({ endpoint, params, filename }: { endpoint: string; params: Record<string, string | undefined>; filename: string }) {
  async function run(format: 'pdf' | 'csv') {
    const qs = new URLSearchParams({ format });
    Object.entries(params).forEach(([k, v]) => v && qs.set(k, v));
    const win = format === 'pdf' ? window.open('', '_blank') : null;
    try {
      const res = await apiClient.get(`${endpoint}?${qs}`, { responseType: 'blob', timeout: 120_000 });
      const url = URL.createObjectURL(res.data as Blob);
      if (format === 'pdf') {
        if (win) win.location.href = url;
        else window.location.href = url;
      } else {
        const a = document.createElement('a');
        a.href = url;
        a.download = `${filename}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      setTimeout(() => URL.revokeObjectURL(url), 20_000);
    } catch (e) {
      if (win) win.close();
      // eslint-disable-next-line no-console
      console.error('[report export]', e);
      alert('Gagal export. Cek console untuk detail.');
    }
  }
  return (
    <div className="flex gap-2">
      <button
        onClick={() => run('csv')}
        className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50 rounded-lg border border-emerald-200"
      >
        <FileSpreadsheet className="w-4 h-4" /> Export Excel
      </button>
      <button
        onClick={() => run('pdf')}
        className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-50 rounded-lg border border-rose-200"
      >
        <FileText className="w-4 h-4" /> Export PDF
      </button>
    </div>
  );
}

export function periodParams(p: PeriodState) {
  return {
    periode: p.periode === 'custom' && !p.from && !p.to ? 'last_30d' : p.periode,
    from: p.periode === 'custom' ? p.from || undefined : undefined,
    to: p.periode === 'custom' ? p.to || undefined : undefined,
  };
}
