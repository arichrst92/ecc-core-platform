'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowDownAZ, ArrowDownZA, Filter, X } from 'lucide-react';
import { apiClient } from '@/lib/api-client';

/**
 * State filter & sort untuk halaman daftar Jemaat.
 *
 * Semua field optional / "" = "tidak difilter". State ini di-encode ke query
 * params backend (lihat `toQueryParams`).
 */
export interface JemaatFilterState {
  status: 'all' | 'true' | 'false';
  jenisKelamin: 'all' | 'L' | 'P';
  roleId: string; // '' = semua role
  umurMin: string; // '' = no min
  umurMax: string; // '' = no max
  sortBy: 'namaLengkap' | 'tanggalLahir' | 'tanggalBergabung' | 'cabang';
  sortOrder: 'asc' | 'desc';
}

export const defaultJemaatFilter: JemaatFilterState = {
  status: 'all',
  jenisKelamin: 'all',
  roleId: '',
  umurMin: '',
  umurMax: '',
  sortBy: 'namaLengkap',
  sortOrder: 'asc',
};

/**
 * Encode state → params siap kirim ke backend (gabung dengan extraParams).
 * Field bernilai default tidak diikutkan supaya URL bersih.
 */
export function toJemaatQueryParams(s: JemaatFilterState): Record<string, string | undefined> {
  return {
    isActive: s.status === 'all' ? undefined : s.status,
    jenisKelamin: s.jenisKelamin === 'all' ? undefined : s.jenisKelamin,
    roleId: s.roleId || undefined,
    umurMin: s.umurMin || undefined,
    umurMax: s.umurMax || undefined,
    sortBy: s.sortBy,
    sortOrder: s.sortOrder,
  };
}

export function isFilterActive(s: JemaatFilterState): boolean {
  return (
    s.status !== 'all' ||
    s.jenisKelamin !== 'all' ||
    !!s.roleId ||
    !!s.umurMin ||
    !!s.umurMax
  );
}

interface RoleOption {
  id: string;
  nama: string;
}

interface Props {
  value: JemaatFilterState;
  onChange: (next: JemaatFilterState) => void;
}

export function JemaatFilterBar({ value, onChange }: Props) {
  const rolesQ = useQuery({
    queryKey: ['role', 'options'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: RoleOption[] }>('/admin/role');
      return res.data.data;
    },
    staleTime: 5 * 60_000,
  });

  const patch = (changes: Partial<JemaatFilterState>) =>
    onChange({ ...value, ...changes });

  const SORT_OPTIONS: { value: JemaatFilterState['sortBy']; label: string }[] = [
    { value: 'namaLengkap', label: 'Nama Lengkap' },
    { value: 'tanggalLahir', label: 'Tanggal Lahir / Usia' },
    { value: 'tanggalBergabung', label: 'Tanggal Bergabung' },
    { value: 'cabang', label: 'Cabang' },
  ];

  return (
    <div className="bg-white border border-neutral-200 rounded-lg p-3 mb-4">
      <div className="flex items-center gap-2 mb-2 text-xs text-neutral-500 font-medium uppercase tracking-wider">
        <Filter className="w-3.5 h-3.5" />
        Filter & Sort
        {isFilterActive(value) && (
          <button
            onClick={() => onChange({ ...defaultJemaatFilter, sortBy: value.sortBy, sortOrder: value.sortOrder })}
            className="ml-auto inline-flex items-center gap-1 text-[11px] font-normal text-brand-600 hover:bg-brand-50 px-2 py-0.5 rounded normal-case tracking-normal"
          >
            <X className="w-3 h-3" />
            Reset filter
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 items-end">
        {/* Status */}
        <Field label="Status">
          <select
            value={value.status}
            onChange={(e) => patch({ status: e.target.value as JemaatFilterState['status'] })}
            className={selectCls}
          >
            <option value="all">Semua</option>
            <option value="true">Aktif</option>
            <option value="false">Nonaktif</option>
          </select>
        </Field>

        {/* Jenis Kelamin */}
        <Field label="Jenis Kelamin">
          <select
            value={value.jenisKelamin}
            onChange={(e) =>
              patch({ jenisKelamin: e.target.value as JemaatFilterState['jenisKelamin'] })
            }
            className={selectCls}
          >
            <option value="all">Semua</option>
            <option value="L">Laki-laki</option>
            <option value="P">Perempuan</option>
          </select>
        </Field>

        {/* Role */}
        <Field label="Role">
          <select
            value={value.roleId}
            onChange={(e) => patch({ roleId: e.target.value })}
            className={selectCls}
            disabled={rolesQ.isLoading}
          >
            <option value="">{rolesQ.isLoading ? 'Memuat...' : 'Semua'}</option>
            {(rolesQ.data ?? []).map((r) => (
              <option key={r.id} value={r.id}>
                {r.nama}
              </option>
            ))}
          </select>
        </Field>

        {/* Usia range */}
        <Field label="Usia">
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={0}
              max={120}
              inputMode="numeric"
              placeholder="min"
              value={value.umurMin}
              onChange={(e) => patch({ umurMin: e.target.value })}
              className={inputCls + ' w-full'}
            />
            <span className="text-neutral-400 text-xs">–</span>
            <input
              type="number"
              min={0}
              max={120}
              inputMode="numeric"
              placeholder="max"
              value={value.umurMax}
              onChange={(e) => patch({ umurMax: e.target.value })}
              className={inputCls + ' w-full'}
            />
          </div>
        </Field>

        {/* Sort by */}
        <Field label="Urutkan">
          <select
            value={value.sortBy}
            onChange={(e) => patch({ sortBy: e.target.value as JemaatFilterState['sortBy'] })}
            className={selectCls}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>

        {/* Sort order toggle */}
        <Field label="Arah">
          <button
            type="button"
            onClick={() => patch({ sortOrder: value.sortOrder === 'asc' ? 'desc' : 'asc' })}
            className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 border border-neutral-300 rounded text-sm hover:bg-neutral-50"
            title={value.sortOrder === 'asc' ? 'Naik (A→Z, kecil→besar)' : 'Turun (Z→A, besar→kecil)'}
          >
            {value.sortOrder === 'asc' ? (
              <ArrowDownAZ className="w-4 h-4 text-neutral-600" />
            ) : (
              <ArrowDownZA className="w-4 h-4 text-neutral-600" />
            )}
            <span className="text-xs text-neutral-700">
              {value.sortOrder === 'asc' ? 'Naik' : 'Turun'}
            </span>
          </button>
        </Field>
      </div>
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
