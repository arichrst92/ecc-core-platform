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
  /** Anggota (default) / Tamu (non-anggota yang dibawa / walk-in) / Semua. */
  jenis: 'jemaat' | 'tamu' | 'semua';
  status: 'all' | 'true' | 'false';
  jenisKelamin: 'all' | 'L' | 'P';
  roleId: string; // '' = semua role
  umurMin: string; // '' = no min
  umurMax: string; // '' = no max
  // Per request 2026-10-03 — filter struktur gereja + ministry
  cabangId: string;
  homecellAreaId: string;
  homecellId: string;
  pelayananId: string;
  /** '' = semua, '__kosong' = belum diisi */
  statusPekerjaan: string;
  statusPernikahan: string;
  sortBy: 'namaLengkap' | 'tanggalLahir' | 'tanggalBergabung' | 'cabang';
  sortOrder: 'asc' | 'desc';
}

export const defaultJemaatFilter: JemaatFilterState = {
  jenis: 'jemaat',
  status: 'all',
  jenisKelamin: 'all',
  roleId: '',
  umurMin: '',
  umurMax: '',
  cabangId: '',
  homecellAreaId: '',
  homecellId: '',
  pelayananId: '',
  statusPekerjaan: '',
  statusPernikahan: '',
  sortBy: 'namaLengkap',
  sortOrder: 'asc',
};

/**
 * Encode state → params siap kirim ke backend (gabung dengan extraParams).
 * Field bernilai default tidak diikutkan supaya URL bersih.
 */
export function toJemaatQueryParams(s: JemaatFilterState): Record<string, string | undefined> {
  return {
    jenis: s.jenis === 'jemaat' ? undefined : s.jenis,
    isActive: s.status === 'all' ? undefined : s.status,
    jenisKelamin: s.jenisKelamin === 'all' ? undefined : s.jenisKelamin,
    roleId: s.roleId || undefined,
    umurMin: s.umurMin || undefined,
    umurMax: s.umurMax || undefined,
    cabangId: s.cabangId || undefined,
    homecellAreaId: s.homecellAreaId || undefined,
    homecellId: s.homecellId || undefined,
    pelayananId: s.pelayananId || undefined,
    statusPekerjaan: s.statusPekerjaan || undefined,
    statusPernikahan: s.statusPernikahan || undefined,
    sortBy: s.sortBy,
    sortOrder: s.sortOrder,
  };
}

export function isFilterActive(s: JemaatFilterState): boolean {
  return (
    s.jenis !== 'jemaat' ||
    s.status !== 'all' ||
    s.jenisKelamin !== 'all' ||
    !!s.roleId ||
    !!s.umurMin ||
    !!s.umurMax ||
    !!s.cabangId ||
    !!s.homecellAreaId ||
    !!s.homecellId ||
    !!s.pelayananId ||
    !!s.statusPekerjaan ||
    !!s.statusPernikahan
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
      const body = res.data as any;
      return Array.isArray(body) ? body : (body?.data ?? []);
    },
    staleTime: 5 * 60_000,
  });

  const cabangQ = useQuery({
    queryKey: ['cabang', 'options'],
    queryFn: async () => {
      const res = await apiClient.get<{ success: boolean; data: { id: string; nama: string }[] } | { id: string; nama: string }[]>('/auth/cabang', {
        params: { isActive: true },
      });
      // /auth/cabang bisa return envelope { success, data } atau array langsung
      // (tergantung versi). Normalize ke array supaya .map() safe.
      const body = res.data as any;
      return Array.isArray(body) ? body : (body?.data ?? []);
    },
    staleTime: 5 * 60_000,
  });

  const homecellAreaQ = useQuery({
    queryKey: ['homecell-area', 'options', value.cabangId],
    queryFn: async () => {
      const res = await apiClient.get<{ data: { id: string; nama: string }[] }>(
        '/admin/homecell-area',
        { params: { cabangId: value.cabangId || undefined, limit: 500 } },
      );
      const body = res.data as any;
      return Array.isArray(body) ? body : (body?.data ?? []);
    },
    staleTime: 5 * 60_000,
  });

  const homecellQ = useQuery({
    queryKey: ['homecell', 'options', value.cabangId, value.homecellAreaId],
    queryFn: async () => {
      const res = await apiClient.get<{ data: { id: string; nama: string }[] }>(
        '/admin/homecell',
        {
          params: {
            cabangId: value.cabangId || undefined,
            homecellAreaId: value.homecellAreaId || undefined,
            limit: 500,
          },
        },
      );
      const body = res.data as any;
      return Array.isArray(body) ? body : (body?.data ?? []);
    },
    staleTime: 5 * 60_000,
  });

  const pelayananQ = useQuery({
    queryKey: ['pelayanan', 'options'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: { id: string; nama: string }[] }>(
        '/admin/pelayanan',
        { params: { limit: 500 } },
      );
      const body = res.data as any;
      return Array.isArray(body) ? body : (body?.data ?? []);
    },
    staleTime: 5 * 60_000,
  });

  // Nilai pekerjaan & pernikahan yang ada di data (termasuk nilai lama) + jumlahnya.
  const profileOptQ = useQuery({
    queryKey: ['jemaat', 'profile-options'],
    queryFn: async () =>
      (
        await apiClient.get<{
          data: { statusPekerjaan: { value: string; count: number }[]; statusPernikahan: { value: string; count: number }[] };
        }>('/admin/jemaat/profile-options')
      ).data.data,
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
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 items-end">
        {/* Jenis: anggota / tamu */}
        <Field label="Jenis">
          <select
            value={value.jenis}
            onChange={(e) => patch({ jenis: e.target.value as JemaatFilterState['jenis'] })}
            className={selectCls}
          >
            <option value="jemaat">Jemaat (anggota)</option>
            <option value="tamu">Tamu (non-anggota)</option>
            <option value="semua">Semua</option>
          </select>
        </Field>

        {/* Cabang */}
        <Field label="Cabang">
          <select
            value={value.cabangId}
            onChange={(e) => patch({ cabangId: e.target.value, homecellAreaId: '', homecellId: '' })}
            className={selectCls}
            disabled={cabangQ.isLoading}
          >
            <option value="">{cabangQ.isLoading ? 'Memuat...' : 'Semua Cabang'}</option>
            {(cabangQ.data ?? []).map((c: { id: string; nama: string }) => (
              <option key={c.id} value={c.id}>
                {c.nama}
              </option>
            ))}
          </select>
        </Field>

        {/* Homecell Area */}
        <Field label="Homecell Area">
          <select
            value={value.homecellAreaId}
            onChange={(e) => patch({ homecellAreaId: e.target.value, homecellId: '' })}
            className={selectCls}
            disabled={homecellAreaQ.isLoading}
          >
            <option value="">{homecellAreaQ.isLoading ? 'Memuat...' : 'Semua Area'}</option>
            {(homecellAreaQ.data ?? []).map((a: { id: string; nama: string }) => (
              <option key={a.id} value={a.id}>
                {a.nama}
              </option>
            ))}
          </select>
        </Field>

        {/* Homecell */}
        <Field label="Homecell">
          <select
            value={value.homecellId}
            onChange={(e) => patch({ homecellId: e.target.value })}
            className={selectCls}
            disabled={homecellQ.isLoading}
          >
            <option value="">{homecellQ.isLoading ? 'Memuat...' : 'Semua Homecell'}</option>
            {(homecellQ.data ?? []).map((h: { id: string; nama: string }) => (
              <option key={h.id} value={h.id}>
                {h.nama}
              </option>
            ))}
          </select>
        </Field>

        {/* Ministry (Pelayanan) */}
        <Field label="Ministry">
          <select
            value={value.pelayananId}
            onChange={(e) => patch({ pelayananId: e.target.value })}
            className={selectCls}
            disabled={pelayananQ.isLoading}
          >
            <option value="">{pelayananQ.isLoading ? 'Memuat...' : 'Semua Ministry'}</option>
            {(pelayananQ.data ?? []).map((p: { id: string; nama: string }) => (
              <option key={p.id} value={p.id}>
                {p.nama}
              </option>
            ))}
          </select>
        </Field>

        {/* Pekerjaan */}
        <Field label="Pekerjaan">
          <select
            value={value.statusPekerjaan}
            onChange={(e) => patch({ statusPekerjaan: e.target.value })}
            className={selectCls}
            disabled={profileOptQ.isLoading}
          >
            <option value="">{profileOptQ.isLoading ? 'Memuat...' : 'Semua'}</option>
            <option value="__kosong">— Belum diisi —</option>
            {(profileOptQ.data?.statusPekerjaan ?? []).map((o) => (
              <option key={o.value} value={o.value}>
                {o.value} ({o.count.toLocaleString('id-ID')})
              </option>
            ))}
          </select>
        </Field>

        {/* Status pernikahan */}
        <Field label="Status Pernikahan">
          <select
            value={value.statusPernikahan}
            onChange={(e) => patch({ statusPernikahan: e.target.value })}
            className={selectCls}
            disabled={profileOptQ.isLoading}
          >
            <option value="">{profileOptQ.isLoading ? 'Memuat...' : 'Semua'}</option>
            <option value="__kosong">— Belum diisi —</option>
            {(profileOptQ.data?.statusPernikahan ?? []).map((o) => (
              <option key={o.value} value={o.value}>
                {o.value} ({o.count.toLocaleString('id-ID')})
              </option>
            ))}
          </select>
        </Field>

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
            {(rolesQ.data ?? []).map((r: RoleOption) => (
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
