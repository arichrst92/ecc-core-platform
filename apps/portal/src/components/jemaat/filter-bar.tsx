'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownAZ, ArrowDownZA, Check, ChevronDown, Filter, X } from 'lucide-react';
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
  /** '' = semua, '0' = belum mulai, 'N' = tahap saat ini N */
  journeyStage: string;
  /** '' = semua, SHIFTSOFT / KELUARGA / APP_PORTAL */
  sumber: string;
  /** '' = semua, '1' = hanya potensial junk */
  junk: string;
  /** Kode alasan junk tertentu ('' = semua alasan). */
  junkAlasan: string;
  // 2026-11 — multi-select struktur (menggantikan cabangId/homecellAreaId/homecellId tunggal)
  cabangIds?: string[];
  homecellAreaIds?: string[];
  homecellIds?: string[];
  pelayananIds?: string[];
  /** '' = semua, 'ya' / 'tidak' (pelayanan & role aktif) */
  terlibatPelayanan?: '' | 'ya' | 'tidak';
  /** Level role pelayanan minimal (≥) bila terlibat = ya; '' = semua level */
  pelayananMinLevel?: string;
  homecellLeader?: '' | 'ya' | 'tidak';
  zoneLeader?: '' | 'ya' | 'tidak';
  /** '' = semua, 'sudah' / 'belum' memakai Els App */
  elsApp?: '' | 'sudah' | 'belum';
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
  journeyStage: '',
  sumber: '',
  junk: '',
  junkAlasan: '',
  cabangIds: [],
  homecellAreaIds: [],
  homecellIds: [],
  pelayananIds: [],
  terlibatPelayanan: '',
  pelayananMinLevel: '',
  homecellLeader: '',
  zoneLeader: '',
  elsApp: '',
  sortBy: 'namaLengkap',
  sortOrder: 'asc',
};

/**
 * Encode state → params siap kirim ke backend (gabung dengan extraParams).
 * Field bernilai default tidak diikutkan supaya URL bersih.
 */
/** Pilihan multi-select (+ nilai tunggal lama dari filter tersimpan). */
const ids = (multi: string[] | undefined, single: string) => [...new Set([...(multi ?? []), ...(single ? [single] : [])])];

export function toJemaatQueryParams(s: JemaatFilterState): Record<string, string | undefined> {
  const cab = ids(s.cabangIds, s.cabangId);
  const zona = ids(s.homecellAreaIds, s.homecellAreaId);
  const hc = ids(s.homecellIds, s.homecellId);
  const pel = ids(s.pelayananIds, s.pelayananId);
  return {
    jenis: s.jenis === 'jemaat' ? undefined : s.jenis,
    isActive: s.status === 'all' ? undefined : s.status,
    jenisKelamin: s.jenisKelamin === 'all' ? undefined : s.jenisKelamin,
    roleId: s.roleId || undefined,
    umurMin: s.umurMin || undefined,
    umurMax: s.umurMax || undefined,
    cabangIds: cab.length ? cab.join(',') : undefined,
    homecellAreaIds: zona.length ? zona.join(',') : undefined,
    homecellIds: hc.length ? hc.join(',') : undefined,
    pelayananIds: pel.length ? pel.join(',') : undefined,
    terlibatPelayanan: s.terlibatPelayanan || undefined,
    pelayananMinLevel: s.terlibatPelayanan === 'ya' && s.pelayananMinLevel ? s.pelayananMinLevel : undefined,
    homecellLeader: s.homecellLeader || undefined,
    zoneLeader: s.zoneLeader || undefined,
    elsApp: s.elsApp || undefined,
    statusPekerjaan: s.statusPekerjaan || undefined,
    statusPernikahan: s.statusPernikahan || undefined,
    journeyStage: s.journeyStage || undefined,
    sumber: s.sumber || undefined,
    junk: s.junk || undefined,
    junkAlasan: s.junk && s.junkAlasan ? s.junkAlasan : undefined,
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
    !!s.cabangIds?.length ||
    !!s.homecellAreaIds?.length ||
    !!s.homecellIds?.length ||
    !!s.pelayananIds?.length ||
    !!s.terlibatPelayanan ||
    !!s.homecellLeader ||
    !!s.zoneLeader ||
    !!s.elsApp ||
    !!s.pelayananId ||
    !!s.statusPekerjaan ||
    !!s.statusPernikahan ||
    !!s.journeyStage ||
    !!s.sumber ||
    !!s.junk
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
  // Ringkasan potensial junk (jumlah per alasan) untuk opsi filter.
  const junkQ = useQuery({
    queryKey: ['jemaat', 'junk-summary'],
    queryFn: async () =>
      (
        await apiClient.get<{ data: { total: number; perAlasan: Record<string, number>; label: Record<string, string> } }>(
          '/admin/jemaat/junk-summary',
        )
      ).data.data,
    staleTime: 5 * 60_000,
  });
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

  // Semua zona & homecell (beberapa halaman), disaring di sini sesuai cabang/zona terpilih.
  const homecellAreaQ = useQuery({
    queryKey: ['homecell-area', 'options-all'],
    queryFn: () => fetchAllPages<{ id: string; nama: string; cabang?: { id: string; nama: string } | null; cabangId?: string }>('/admin/homecell-area'),
    staleTime: 5 * 60_000,
  });

  const homecellQ = useQuery({
    queryKey: ['homecell', 'options-all'],
    queryFn: () =>
      fetchAllPages<{ id: string; nama: string; areaId?: string; area?: { id: string; nama: string; cabang?: { id: string; nama: string } | null } | null }>(
        '/admin/homecell',
      ),
    staleTime: 5 * 60_000,
  });

  const selCabang = ids(value.cabangIds, value.cabangId);
  const selZona = ids(value.homecellAreaIds, value.homecellAreaId);
  const selHc = ids(value.homecellIds, value.homecellId);
  const selPel = ids(value.pelayananIds, value.pelayananId);
  const zonaOptions = (homecellAreaQ.data ?? [])
    .filter((a) => !selCabang.length || selCabang.includes(a.cabang?.id ?? a.cabangId ?? ''))
    .map((a) => ({ id: a.id, label: a.nama, sub: selCabang.length === 1 ? undefined : a.cabang?.nama }));
  const hcOptions = (homecellQ.data ?? [])
    .filter((h) => (!selZona.length || selZona.includes(h.area?.id ?? h.areaId ?? '')) && (!selCabang.length || selCabang.includes(h.area?.cabang?.id ?? '')))
    .map((h) => ({ id: h.id, label: h.nama, sub: h.area?.nama }));

  const pelayananQ = useQuery({
    queryKey: ['pelayanan', 'options'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: { id: string; nama: string }[] }>(
        '/admin/pelayanan',
        { params: { limit: 500, isActive: true } },
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
          data: {
            journeyStages: { stage: number; label: string; count: number }[];
            statusPekerjaan: { value: string; count: number }[];
            statusPernikahan: { value: string; count: number }[];
          };
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

        {/* Cabang (multi) */}
        <FieldBox label="Cabang">
          <MultiSelect
            options={(cabangQ.data ?? []).map((c: { id: string; nama: string }) => ({ id: c.id, label: c.nama }))}
            value={selCabang}
            onChange={(v) => patch({ cabangIds: v, cabangId: '', homecellAreaIds: [], homecellAreaId: '', homecellIds: [], homecellId: '' })}
            allLabel="Semua Cabang"
            loading={cabangQ.isLoading}
          />
        </FieldBox>

        {/* Zona (multi) */}
        <FieldBox label="Zona">
          <MultiSelect
            options={zonaOptions}
            value={selZona}
            onChange={(v) => patch({ homecellAreaIds: v, homecellAreaId: '', homecellIds: [], homecellId: '' })}
            allLabel="Semua Zona"
            loading={homecellAreaQ.isLoading}
          />
        </FieldBox>

        {/* Homecell (multi) */}
        <FieldBox label="Homecell">
          <MultiSelect
            options={hcOptions}
            value={selHc}
            onChange={(v) => patch({ homecellIds: v, homecellId: '' })}
            allLabel="Semua Homecell"
            loading={homecellQ.isLoading}
          />
        </FieldBox>

        {/* Terlibat pelayanan (+ level minimal) */}
        <Field label="Terlibat Pelayanan">
          <div className="flex gap-1.5">
            <select
              value={value.terlibatPelayanan ?? ''}
              onChange={(e) => patch({ terlibatPelayanan: e.target.value as JemaatFilterState['terlibatPelayanan'], pelayananMinLevel: '' })}
              className={selectCls}
            >
              <option value="">Semua</option>
              <option value="ya">Ya</option>
              <option value="tidak">Tidak</option>
            </select>
            {value.terlibatPelayanan === 'ya' ? (
              <input
                type="number"
                min={0}
                inputMode="numeric"
                placeholder="Lv ≥"
                title="Level role pelayanan minimal (mis. 5 = level 5 ke atas). Kosong = semua level."
                value={value.pelayananMinLevel ?? ''}
                onChange={(e) => patch({ pelayananMinLevel: e.target.value })}
                className={inputCls + ' w-20'}
              />
            ) : null}
          </div>
        </Field>

        <Field label="Homecell Leader">
          <select value={value.homecellLeader ?? ''} onChange={(e) => patch({ homecellLeader: e.target.value as JemaatFilterState['homecellLeader'] })} className={selectCls}>
            <option value="">Semua</option>
            <option value="ya">Ya</option>
            <option value="tidak">Tidak</option>
          </select>
        </Field>

        <Field label="Zone Leader">
          <select value={value.zoneLeader ?? ''} onChange={(e) => patch({ zoneLeader: e.target.value as JemaatFilterState['zoneLeader'] })} className={selectCls}>
            <option value="">Semua</option>
            <option value="ya">Ya</option>
            <option value="tidak">Tidak</option>
          </select>
        </Field>

        <Field label="Pakai Els App">
          <select value={value.elsApp ?? ''} onChange={(e) => patch({ elsApp: e.target.value as JemaatFilterState['elsApp'] })} className={selectCls}>
            <option value="">Semua</option>
            <option value="sudah">Sudah</option>
            <option value="belum">Belum</option>
          </select>
        </Field>

        {/* Pelayanan (multi) */}
        <FieldBox label="Pelayanan">
          <MultiSelect
            options={(pelayananQ.data ?? []).map((p: { id: string; nama: string }) => ({ id: p.id, label: p.nama }))}
            value={selPel}
            onChange={(v) => patch({ pelayananIds: v, pelayananId: '' })}
            allLabel="Semua Pelayanan"
            loading={pelayananQ.isLoading}
          />
        </FieldBox>

        {/* Spiritual Journey — tahap saat ini */}
        <Field label="Spiritual Journey">
          <select
            value={value.journeyStage}
            onChange={(e) => patch({ journeyStage: e.target.value })}
            className={selectCls}
            disabled={profileOptQ.isLoading}
          >
            <option value="">{profileOptQ.isLoading ? 'Memuat...' : 'Semua tahap'}</option>
            {(profileOptQ.data?.journeyStages ?? []).map((o) => (
              <option key={o.stage} value={String(o.stage)}>
                {o.label} ({o.count.toLocaleString('id-ID')})
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
        <Field label="Sumber data">
          <select value={value.sumber ?? ''} onChange={(e) => patch({ sumber: e.target.value })} className={selectCls}>
            <option value="">Semua sumber</option>
            <option value="APP_PORTAL">App / Portal</option>
            <option value="SHIFTSOFT">Shiftsoft (impor)</option>
            <option value="KELUARGA">Didaftarkan keluarga</option>
          </select>
        </Field>

        <Field label="Potensial junk">
          <select
            value={value.junk ? value.junkAlasan || 'ALL' : ''}
            onChange={(e) => {
              const v = e.target.value;
              patch({ junk: v ? '1' : '', junkAlasan: v && v !== 'ALL' ? v : '' });
            }}
            className={selectCls}
            disabled={junkQ.isLoading}
          >
            <option value="">Semua data</option>
            <option value="ALL">
              Hanya potensial junk{junkQ.data ? ` (${junkQ.data.total.toLocaleString('id-ID')})` : ''}
            </option>
            {Object.entries(junkQ.data?.perAlasan ?? {})
              .sort((a, b) => b[1] - a[1])
              .map(([k, n]) => (
                <option key={k} value={k}>
                  — {junkQ.data?.label[k] ?? k} ({n.toLocaleString('id-ID')})
                </option>
              ))}
          </select>
        </Field>

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
          <div className="flex items-center gap-1.5">
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
            className={`w-full flex items-center justify-center gap-1.5 hover:bg-neutral-50 ${controlCls}`}
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

// Semua kontrol filter: tinggi, sudut, border & fokus sama (h-9).
const controlCls =
  'h-9 px-3 border border-neutral-300 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500';
const selectCls = `w-full ${controlCls}`;
const inputCls = controlCls;

/** Seperti Field tapi bukan <label> — untuk kontrol berisi banyak tombol (multi-select). */
function FieldBox({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="block">
      <span className="block text-[11px] text-neutral-500 font-medium mb-1">{label}</span>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] text-neutral-500 font-medium mb-1">{label}</span>
      {children}
    </label>
  );
}

/** Ambil semua halaman daftar (limit 500 per halaman, maks 20 halaman). */
async function fetchAllPages<T>(url: string): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; page <= 20; page++) {
    const res = await apiClient.get(url, { params: { limit: 500, page } });
    const body = res.data as any;
    const rows: T[] = Array.isArray(body) ? body : (body?.data ?? []);
    out.push(...rows);
    const totalPages = body?.meta?.totalPages ?? 1;
    if (Array.isArray(body) || page >= totalPages || rows.length < 500) break;
  }
  return out;
}

/** Multi-select ringkas: tombol + daftar centang dengan pencarian. */
function MultiSelect({
  options,
  value,
  onChange,
  allLabel,
  loading,
}: {
  options: { id: string; label: string; sub?: string }[];
  value: string[];
  onChange: (v: string[]) => void;
  allLabel: string;
  loading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n ? options.filter((o) => o.label.toLowerCase().includes(n) || o.sub?.toLowerCase().includes(n)) : options;
  }, [options, q]);
  const names = value.map((id) => options.find((o) => o.id === id)?.label).filter(Boolean) as string[];
  const text = loading ? 'Memuat...' : value.length === 0 ? allLabel : value.length === 1 ? names[0] ?? '1 dipilih' : `${value.length} dipilih`;
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center justify-between gap-1 text-left ${controlCls} ${value.length ? 'text-brand-700 font-medium' : ''}`}
      >
        <span className="truncate">{text}</span>
        <ChevronDown className="w-3.5 h-3.5 shrink-0 text-neutral-500" />
      </button>
      {open ? (
        <div className="absolute z-30 mt-1 w-72 max-w-[80vw] bg-white border border-neutral-200 rounded-lg shadow-lg">
          <div className="p-2 border-b border-neutral-100 flex gap-1.5">
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari…"
              className="flex-1 h-8 px-2 border border-neutral-300 rounded-md text-sm outline-none focus:ring-2 focus:ring-brand-500"
            />
            {value.length ? (
              <button type="button" onClick={() => onChange([])} className="px-2 text-xs text-brand-600 hover:bg-brand-50 rounded">
                Kosongkan
              </button>
            ) : null}
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {shown.length === 0 ? (
              <div className="px-3 py-2 text-xs text-neutral-400">Tidak ada pilihan.</div>
            ) : (
              shown.slice(0, 300).map((o) => {
                const on = value.includes(o.id);
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => onChange(on ? value.filter((x) => x !== o.id) : [...value, o.id])}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-neutral-50"
                  >
                    <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${on ? 'bg-brand-500 border-brand-500' : 'border-neutral-300'}`}>
                      {on ? <Check className="w-3 h-3 text-white" /> : null}
                    </span>
                    <span className="flex-1 min-w-0 truncate">{o.label}</span>
                    {o.sub ? <span className="text-[11px] text-neutral-400 truncate max-w-[45%]">{o.sub}</span> : null}
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
