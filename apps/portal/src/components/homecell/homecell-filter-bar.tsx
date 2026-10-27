'use client';

/**
 * Filter daftar Homecell: cabang, area, status, periode pertemuan
 * (preset minggu/bulan atau rentang tanggal), dan ada/tidak ada pertemuan.
 * State di-encode ke query param backend (lihat `toHomecellQueryParams`).
 */
import { useQuery } from '@tanstack/react-query';
import { Filter, X } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

export type PeriodePreset = '' | 'last_7d' | 'this_week' | 'last_week' | 'last_30d' | 'this_month' | 'last_month' | 'custom';

export interface HomecellFilterState {
  cabangId: string;
  areaId: string;
  status: '' | 'aktif' | 'nonaktif';
  kategori: '' | 'SINGLE' | 'COUPLE' | 'UMUM';
  periode: PeriodePreset;
  from: string; // YYYY-MM-DD (periode=custom)
  to: string;
  pertemuan: '' | 'ada' | 'tidak';
}

export const defaultHomecellFilter: HomecellFilterState = {
  cabangId: '',
  areaId: '',
  status: '',
  kategori: '',
  periode: '',
  from: '',
  to: '',
  pertemuan: '',
};

export const PERIODE_OPTIONS: { value: PeriodePreset; label: string }[] = [
  { value: '', label: 'Semua waktu' },
  { value: 'last_7d', label: '7 hari terakhir' },
  { value: 'this_week', label: 'Minggu ini' },
  { value: 'last_week', label: 'Minggu lalu' },
  { value: 'last_30d', label: '30 hari terakhir' },
  { value: 'this_month', label: 'Bulan ini' },
  { value: 'last_month', label: 'Bulan lalu' },
  { value: 'custom', label: 'Rentang tanggal…' },
];

export function toHomecellQueryParams(s: HomecellFilterState): Record<string, string | undefined> {
  const custom = s.periode === 'custom';
  return {
    cabangId: s.cabangId || undefined,
    areaId: s.areaId || undefined,
    status: s.status || undefined,
    kategori: s.kategori || undefined,
    periode: custom && !s.from && !s.to ? undefined : s.periode || undefined,
    from: custom ? s.from || undefined : undefined,
    to: custom ? s.to || undefined : undefined,
    pertemuan: s.pertemuan || undefined,
  };
}

export function isHomecellFilterActive(s: HomecellFilterState) {
  return Object.values(toHomecellQueryParams(s)).some(Boolean);
}

const asArray = (body: any) => (Array.isArray(body) ? body : (body?.data ?? []));

export function HomecellFilterBar({
  value,
  onChange,
}: {
  value: HomecellFilterState;
  onChange: (next: HomecellFilterState) => void;
}) {
  const cabangQ = useQuery({
    queryKey: ['cabang', 'options'],
    queryFn: async () => asArray((await apiClient.get('/auth/cabang', { params: { isActive: true } })).data),
    staleTime: 5 * 60_000,
  });
  const areaQ = useQuery({
    queryKey: ['homecell-area', 'options', value.cabangId],
    queryFn: async () =>
      asArray(
        (await apiClient.get('/admin/homecell-area', { params: { cabangId: value.cabangId || undefined, limit: 500 } }))
          .data,
      ),
    staleTime: 5 * 60_000,
  });
  const patch = (c: Partial<HomecellFilterState>) => onChange({ ...value, ...c });
  const pertemuanLabel = value.periode ? 'Pertemuan dalam periode' : 'Pertemuan';

  return (
    <div className="bg-white border border-neutral-200 rounded-lg p-3 mb-4">
      <div className="flex items-center gap-2 mb-2 text-xs text-neutral-500 font-medium uppercase tracking-wider">
        <Filter className="w-3.5 h-3.5" />
        Filter
        {isHomecellFilterActive(value) && (
          <button
            onClick={() => onChange(defaultHomecellFilter)}
            className="ml-auto inline-flex items-center gap-1 text-[11px] font-normal text-brand-600 hover:bg-brand-50 px-2 py-0.5 rounded normal-case tracking-normal"
          >
            <X className="w-3 h-3" />
            Reset filter
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 items-end">
        <Field label="Cabang">
          <select
            value={value.cabangId}
            onChange={(e) => patch({ cabangId: e.target.value, areaId: '' })}
            className={selectCls}
          >
            <option value="">Semua Cabang</option>
            {(cabangQ.data ?? []).map((c: { id: string; nama: string }) => (
              <option key={c.id} value={c.id}>
                {c.nama}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Homecell Area">
          <select value={value.areaId} onChange={(e) => patch({ areaId: e.target.value })} className={selectCls}>
            <option value="">Semua Area</option>
            {(areaQ.data ?? []).map((a: { id: string; nama: string }) => (
              <option key={a.id} value={a.id}>
                {a.nama}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Status">
          <select
            value={value.status}
            onChange={(e) => patch({ status: e.target.value as HomecellFilterState['status'] })}
            className={selectCls}
          >
            <option value="">Semua</option>
            <option value="aktif">Aktif</option>
            <option value="nonaktif">Nonaktif</option>
          </select>
        </Field>
        <Field label="Kategori">
          <select
            value={value.kategori}
            onChange={(e) => patch({ kategori: e.target.value as HomecellFilterState['kategori'] })}
            className={selectCls}
          >
            <option value="">Semua</option>
            <option value="SINGLE">Single</option>
            <option value="COUPLE">Couple</option>
            <option value="UMUM">Umum (tanpa kategori)</option>
          </select>
        </Field>
        <Field label="Periode pertemuan">
          <select
            value={value.periode}
            onChange={(e) => patch({ periode: e.target.value as PeriodePreset })}
            className={selectCls}
          >
            {PERIODE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        {value.periode === 'custom' ? (
          <Field label="Dari – Sampai">
            <div className="flex items-center gap-1">
              <input type="date" value={value.from} onChange={(e) => patch({ from: e.target.value })} className={`${inputCls} w-full`} />
              <span className="text-neutral-400 text-xs">–</span>
              <input type="date" value={value.to} onChange={(e) => patch({ to: e.target.value })} className={`${inputCls} w-full`} />
            </div>
          </Field>
        ) : null}
        <Field label={pertemuanLabel}>
          <select
            value={value.pertemuan}
            onChange={(e) => patch({ pertemuan: e.target.value as HomecellFilterState['pertemuan'] })}
            className={selectCls}
          >
            <option value="">Semua</option>
            <option value="ada">Ada pertemuan</option>
            <option value="tidak">{value.periode ? 'Tidak ada pertemuan' : 'Belum pernah pertemuan'}</option>
          </select>
        </Field>
      </div>
      {value.periode && !value.pertemuan ? (
        <p className="text-[11px] text-neutral-500 mt-2">
          Tip: pilih <strong>Ada / Tidak ada pertemuan</strong> untuk menyaring homecell berdasarkan periode ini. Kolom
          “Pertemuan periode” menampilkan jumlah pertemuan tiap homecell.
        </p>
      ) : null}
    </div>
  );
}

const selectCls =
  'w-full px-2 py-1.5 border border-neutral-300 rounded text-sm bg-white outline-none focus:ring-2 focus:ring-brand-500';
const inputCls =
  'px-2 py-1.5 border border-neutral-300 rounded text-sm bg-white outline-none focus:ring-2 focus:ring-brand-500';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] text-neutral-500 font-medium mb-0.5">{label}</span>
      {children}
    </label>
  );
}
