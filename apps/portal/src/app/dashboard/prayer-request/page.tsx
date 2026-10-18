'use client';

/**
 * Prayer Request (Doa) — pokok doa jemaat dari Els App (Home → Doa).
 * Admin menugaskan ke petugas doa (role diatur di Konfigurasi), petugas
 * menandai "Sudah Didoakan" (dari app atau portal), jemaat bisa menandai
 * "Sudah Mendapat Jawaban Doa".
 * API: /admin/prayer-request
 */
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  Circle,
  EyeOff,
  HandHeart,
  Inbox,
  Loader2,
  Search,
  Settings2,
  Sparkles,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  PRAYER_KATEGORI,
  PRAYER_KATEGORI_LABEL,
  PRAYER_STATUS_LABEL,
  PRAYER_TARGET_LABEL,
  type PrayerDisplayStatus,
  type PrayerKategori,
  type PrayerTarget,
} from '@ecc/shared-types';
import { apiClient } from '@/lib/api-client';
import { ConfirmDelete } from '@/components/crud/confirm-delete';

interface Person {
  id: string;
  namaLengkap: string;
  fotoUrl: string | null;
}
interface PrayerRow {
  id: string;
  kategori: string;
  untuk: PrayerTarget;
  untukNama: string | null;
  isi: string;
  isAnonim: boolean;
  status: 'BARU' | 'DITUGASKAN' | 'SUDAH_DIDOAKAN';
  displayStatus: PrayerDisplayStatus;
  assignedAt: string | null;
  didoakanAt: string | null;
  catatanPetugas: string | null;
  terjawabAt: string | null;
  kesaksian: string | null;
  createdAt: string;
  updatedAt: string;
  jemaat: Person & { kode: string | null; noHp: string | null };
  cabang: { id: string; nama: string } | null;
  petugas: Person | null;
  assignedBy: Person | null;
  didoakanBy: Person | null;
}
interface PetugasOption extends Person {
  cabang: { id: string; nama: string } | null;
  roles: string[];
  pending: number;
}
type Summary = Record<PrayerDisplayStatus, number>;

const STATUS_TABS: (PrayerDisplayStatus | '')[] = ['BARU', 'DITUGASKAN', 'SUDAH_DIDOAKAN', 'TERJAWAB', ''];
const STATUS_CLS: Record<PrayerDisplayStatus, string> = {
  BARU: 'bg-amber-100 text-amber-800',
  DITUGASKAN: 'bg-sky-100 text-sky-700',
  SUDAH_DIDOAKAN: 'bg-indigo-100 text-indigo-700',
  TERJAWAB: 'bg-green-100 text-green-700',
};
const katLabel = (k: string) => PRAYER_KATEGORI_LABEL[k as PrayerKategori]?.id ?? k;
const fmt = (d: string) => new Date(d).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
const ctrl = 'h-9 px-3 border border-neutral-300 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-brand-500';
const errMsg = (e: any, d: string) => e?.response?.data?.error?.message ?? d;

function untukText(r: Pick<PrayerRow, 'untuk' | 'untukNama'>) {
  const base = PRAYER_TARGET_LABEL[r.untuk]?.id ?? r.untuk;
  return r.untuk !== 'DIRI_SENDIRI' && r.untukNama ? `${base} (${r.untukNama})` : base;
}

export default function PrayerRequestPage() {
  const [status, setStatus] = useState<PrayerDisplayStatus | ''>('BARU');
  const [kategori, setKategori] = useState('');
  const [cabangId, setCabangId] = useState('');
  const [petugasId, setPetugasId] = useState('');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [configOpen, setConfigOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => setPage(1), [status, kategori, cabangId, petugasId, q]);

  const cabangQ = useQuery({
    queryKey: ['cabang', 'options'],
    queryFn: async () => {
      const body = (await apiClient.get('/auth/cabang', { params: { isActive: true } })).data as any;
      return (Array.isArray(body) ? body : (body?.data ?? [])) as { id: string; nama: string }[];
    },
    staleTime: 5 * 60_000,
  });
  const petugasQ = usePetugasOptions('');

  const listQ = useQuery({
    queryKey: ['prayer-request', 'list', status, kategori, cabangId, petugasId, q, page],
    queryFn: async () =>
      (
        await apiClient.get<{
          data: PrayerRow[];
          meta: { page: number; totalPages: number; total: number; summary: Summary };
        }>('/admin/prayer-request', {
          params: {
            status: status || undefined,
            kategori: kategori || undefined,
            cabangId: cabangId || undefined,
            petugasId: petugasId || undefined,
            search: q || undefined,
            page,
            limit: 20,
          },
        })
      ).data,
  });
  const rows = listQ.data?.data ?? [];
  const meta = listQ.data?.meta;
  const totalAll = meta ? Object.values(meta.summary).reduce((a, b) => a + b, 0) : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
            <HandHeart className="w-6 h-6 text-brand-500" /> Prayer Request
          </h1>
          <p className="text-sm text-neutral-500 mt-0.5">
            Pokok doa jemaat dari Els App. Tugaskan ke petugas doa; jemaat mendapat notifikasi saat sudah didoakan.
          </p>
        </div>
        <button
          onClick={() => setConfigOpen(true)}
          className="flex items-center gap-2 h-9 px-3 border border-neutral-300 rounded-lg text-sm font-medium text-neutral-700 bg-white hover:bg-neutral-50"
        >
          <Settings2 className="w-4 h-4" /> Konfigurasi Petugas
        </button>
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl p-3 space-y-3">
        <div className="flex flex-wrap gap-2">
          {STATUS_TABS.map((s) => (
            <button
              key={s || 'all'}
              onClick={() => setStatus(s)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium border ${
                status === s
                  ? 'bg-brand-500 text-white border-brand-500'
                  : 'bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-50'
              }`}
            >
              {s ? PRAYER_STATUS_LABEL[s].id : 'Semua'}
              {meta?.summary ? (
                <span className="ml-1.5 opacity-80">({s ? (meta.summary[s] ?? 0) : totalAll})</span>
              ) : null}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <select value={kategori} onChange={(e) => setKategori(e.target.value)} className={ctrl}>
            <option value="">Semua kategori</option>
            {PRAYER_KATEGORI.map((k) => (
              <option key={k} value={k}>
                {PRAYER_KATEGORI_LABEL[k].id}
              </option>
            ))}
          </select>
          <select value={cabangId} onChange={(e) => setCabangId(e.target.value)} className={ctrl}>
            <option value="">Semua cabang</option>
            {(cabangQ.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.nama}
              </option>
            ))}
          </select>
          <select value={petugasId} onChange={(e) => setPetugasId(e.target.value)} className={ctrl}>
            <option value="">Semua petugas</option>
            <option value="none">Belum ditugaskan</option>
            {(petugasQ.data?.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.namaLengkap}
              </option>
            ))}
          </select>
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-neutral-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari isi doa, nama pengirim, atau yang didoakan…"
              className={`${ctrl} w-full pl-8`}
            />
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-5 gap-4">
        <div className="lg:col-span-2 bg-white border border-neutral-200 rounded-xl overflow-hidden">
          {listQ.isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 text-sm text-neutral-400 py-12">
              <Inbox className="w-6 h-6" /> Tidak ada prayer request.
            </div>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {rows.map((r) => (
                <li key={r.id}>
                  <button
                    onClick={() => setSelected(r.id)}
                    className={`w-full text-left px-4 py-3 hover:bg-neutral-50 ${selected === r.id ? 'bg-brand-50' : ''}`}
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-600">
                        {katLabel(r.kategori)}
                      </span>
                      {r.isAnonim ? (
                        <span className="text-[11px] text-neutral-500 flex items-center gap-1">
                          <EyeOff className="w-3 h-3" /> Anonim
                        </span>
                      ) : null}
                      <span className={`ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_CLS[r.displayStatus]}`}>
                        {PRAYER_STATUS_LABEL[r.displayStatus].id}
                      </span>
                    </div>
                    <p className="text-sm text-neutral-800 mt-1 line-clamp-2">{r.isi}</p>
                    <p className="text-[11px] text-neutral-400 mt-1">
                      {[r.jemaat.namaLengkap, r.cabang?.nama, fmt(r.createdAt), r.petugas ? `→ ${r.petugas.namaLengkap}` : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {meta && meta.totalPages > 1 ? (
            <div className="flex items-center justify-between px-4 py-2 border-t border-neutral-100 text-sm">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="px-2 py-1 rounded hover:bg-neutral-100 disabled:opacity-40"
              >
                ‹ Sebelumnya
              </button>
              <span className="text-neutral-500">
                {page} / {meta.totalPages}
              </span>
              <button
                disabled={page >= meta.totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-2 py-1 rounded hover:bg-neutral-100 disabled:opacity-40"
              >
                Berikutnya ›
              </button>
            </div>
          ) : null}
        </div>

        <div className="lg:col-span-3">
          {selected ? (
            <PrayerDetail id={selected} onDeleted={() => setSelected(null)} />
          ) : (
            <div className="bg-white border border-dashed border-neutral-300 rounded-xl p-10 text-center text-sm text-neutral-400">
              Pilih salah satu prayer request untuk melihat detail dan menugaskan petugas.
            </div>
          )}
        </div>
      </div>

      {configOpen ? <ConfigModal onClose={() => setConfigOpen(false)} /> : null}
    </div>
  );
}

function usePetugasOptions(search: string, cabangId?: string) {
  return useQuery({
    queryKey: ['prayer-request', 'petugas-options', search, cabangId ?? ''],
    queryFn: async () =>
      (
        await apiClient.get<{ data: PetugasOption[]; meta: { configured: boolean } }>(
          '/admin/prayer-request/petugas-options',
          { params: { search: search || undefined, cabangId: cabangId || undefined } },
        )
      ).data,
    staleTime: 30_000,
  });
}

function PrayerDetail({ id, onDeleted }: { id: string; onDeleted: () => void }) {
  const qc = useQueryClient();
  const [catatan, setCatatan] = useState('');
  const [petugasSearch, setPetugasSearch] = useState('');
  const [onlyCabang, setOnlyCabang] = useState(true);
  const [confirmDel, setConfirmDel] = useState(false);

  const q = useQuery({
    queryKey: ['prayer-request', 'detail', id],
    queryFn: async () => (await apiClient.get<{ data: PrayerRow }>(`/admin/prayer-request/${id}`)).data.data,
  });
  const p = q.data;
  const optsQ = usePetugasOptions(petugasSearch.trim(), onlyCabang ? p?.cabang?.id : undefined);

  useEffect(() => {
    setCatatan('');
    setPetugasSearch('');
  }, [id]);
  useEffect(() => {
    if (p) setCatatan(p.catatanPetugas ?? '');
  }, [p?.id, p?.catatanPetugas]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = () => qc.invalidateQueries({ queryKey: ['prayer-request'] });
  const assignMut = useMutation({
    mutationFn: async (petugasId: string | null) => apiClient.patch(`/admin/prayer-request/${id}/assign`, { petugasId }),
    onSuccess: (_d, petugasId) => {
      toast.success(petugasId ? 'Ditugaskan — petugas mendapat notifikasi' : 'Penugasan dilepas');
      refresh();
    },
    onError: (e) => toast.error(errMsg(e, 'Gagal menugaskan')),
  });
  const prayedMut = useMutation({
    mutationFn: async () => apiClient.post(`/admin/prayer-request/${id}/prayed`, { catatan: catatan.trim() || null }),
    onSuccess: () => {
      toast.success(p?.status === 'SUDAH_DIDOAKAN' ? 'Catatan diperbarui' : 'Ditandai sudah didoakan — jemaat mendapat notifikasi');
      refresh();
    },
    onError: (e) => toast.error(errMsg(e, 'Gagal menyimpan')),
  });
  const delMut = useMutation({
    mutationFn: async () => apiClient.delete(`/admin/prayer-request/${id}`),
    onSuccess: () => {
      toast.success('Prayer request dihapus');
      setConfirmDel(false);
      onDeleted();
      refresh();
    },
    onError: (e) => toast.error(errMsg(e, 'Gagal menghapus')),
  });

  if (q.isLoading || !p) {
    return (
      <div className="bg-white border border-neutral-200 rounded-xl flex justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
      </div>
    );
  }

  const opts = optsQ.data?.data ?? [];
  const configured = optsQ.data?.meta.configured ?? true;
  const steps: { done: boolean; label: string; sub?: string | null }[] = [
    { done: true, label: 'Dikirim', sub: fmt(p.createdAt) },
    {
      done: !!p.petugas,
      label: p.petugas ? `Ditugaskan ke ${p.petugas.namaLengkap}` : 'Belum ditugaskan',
      sub: p.assignedAt ? `${fmt(p.assignedAt)}${p.assignedBy ? ` · oleh ${p.assignedBy.namaLengkap}` : ''}` : null,
    },
    {
      done: p.status === 'SUDAH_DIDOAKAN',
      label: 'Sudah didoakan',
      sub: p.didoakanAt ? `${fmt(p.didoakanAt)}${p.didoakanBy ? ` · ${p.didoakanBy.namaLengkap}` : ''}` : null,
    },
    { done: !!p.terjawabAt, label: 'Sudah mendapat jawaban doa', sub: p.terjawabAt ? fmt(p.terjawabAt) : null },
  ];

  return (
    <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-neutral-100 flex items-start gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-neutral-900 flex items-center gap-2">
            {p.jemaat.namaLengkap}
            {p.isAnonim ? (
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-600 flex items-center gap-1">
                <EyeOff className="w-3 h-3" /> Anonim — nama disembunyikan dari petugas
              </span>
            ) : null}
          </div>
          <div className="text-xs text-neutral-500">
            {[p.jemaat.kode, p.jemaat.noHp, p.cabang?.nama].filter(Boolean).join(' · ')}
          </div>
        </div>
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_CLS[p.displayStatus]}`}>
          {PRAYER_STATUS_LABEL[p.displayStatus].id}
        </span>
        <button
          onClick={() => setConfirmDel(true)}
          className="p-2 rounded-lg text-neutral-400 hover:text-red-600 hover:bg-red-50"
          title="Hapus"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <div className="p-5 space-y-4">
        <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4">
          <div className="flex items-center gap-2 flex-wrap mb-1.5 text-xs text-neutral-500">
            <span className="font-medium px-2 py-0.5 rounded-full bg-white border border-neutral-200 text-neutral-700">
              {katLabel(p.kategori)}
            </span>
            <span>Untuk: {untukText(p)}</span>
          </div>
          <p className="text-sm text-neutral-800 whitespace-pre-line">{p.isi}</p>
          {p.kesaksian ? (
            <div className="mt-3 rounded-lg bg-green-50 border border-green-200 p-3">
              <div className="text-xs font-semibold text-green-800 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5" /> Kesaksian jemaat
              </div>
              <p className="text-sm text-green-900 mt-1 whitespace-pre-line">{p.kesaksian}</p>
            </div>
          ) : null}
        </div>

        <ol className="space-y-2">
          {steps.map((s) => (
            <li key={s.label} className="flex items-start gap-2">
              {s.done ? (
                <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
              ) : (
                <Circle className="w-4 h-4 text-neutral-300 mt-0.5 shrink-0" />
              )}
              <div>
                <div className={`text-sm ${s.done ? 'text-neutral-800' : 'text-neutral-400'}`}>{s.label}</div>
                {s.sub ? <div className="text-[11px] text-neutral-400">{s.sub}</div> : null}
              </div>
            </li>
          ))}
        </ol>

        {/* Penugasan */}
        <div className="border border-neutral-200 rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="text-sm font-semibold text-neutral-900 flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-brand-500" /> Petugas doa
            </div>
            {p.petugas ? (
              <button
                onClick={() => assignMut.mutate(null)}
                disabled={assignMut.isPending}
                className="text-xs text-neutral-500 hover:text-red-600"
              >
                Lepas penugasan
              </button>
            ) : null}
          </div>
          {!configured ? (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
              Role petugas doa belum diatur. Klik <b>Konfigurasi Petugas</b> di atas.
            </p>
          ) : (
            <>
              <div className="flex gap-2 flex-wrap items-center">
                <div className="relative flex-1 min-w-[180px]">
                  <Search className="w-4 h-4 text-neutral-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    value={petugasSearch}
                    onChange={(e) => setPetugasSearch(e.target.value)}
                    placeholder="Cari nama petugas…"
                    className={`${ctrl} w-full pl-8`}
                  />
                </div>
                {p.cabang ? (
                  <label className="text-xs text-neutral-600 flex items-center gap-1.5">
                    <input type="checkbox" checked={onlyCabang} onChange={(e) => setOnlyCabang(e.target.checked)} />
                    Cabang {p.cabang.nama} saja
                  </label>
                ) : null}
              </div>
              <div className="max-h-56 overflow-y-auto divide-y divide-neutral-100 border border-neutral-100 rounded-lg">
                {optsQ.isLoading ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="w-4 h-4 animate-spin text-neutral-400" />
                  </div>
                ) : opts.length === 0 ? (
                  <p className="text-xs text-neutral-400 text-center py-4">Tidak ada petugas yang cocok.</p>
                ) : (
                  opts.map((o) => {
                    const active = p.petugas?.id === o.id;
                    return (
                      <button
                        key={o.id}
                        onClick={() => !active && assignMut.mutate(o.id)}
                        disabled={assignMut.isPending}
                        className={`w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-neutral-50 ${active ? 'bg-brand-50' : ''}`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-sm text-neutral-900 truncate">{o.namaLengkap}</div>
                          <div className="text-[11px] text-neutral-500 truncate">
                            {[o.cabang?.nama, o.roles.join(', ')].filter(Boolean).join(' · ')}
                          </div>
                        </div>
                        <span className="text-[11px] text-neutral-500 shrink-0">{o.pending} tugas aktif</span>
                        {active ? <CheckCircle2 className="w-4 h-4 text-brand-500 shrink-0" /> : null}
                      </button>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>

        {/* Tandai sudah didoakan */}
        <div className="border border-neutral-200 rounded-xl p-4 space-y-2">
          <div className="text-sm font-semibold text-neutral-900">Catatan untuk jemaat</div>
          <textarea
            value={catatan}
            onChange={(e) => setCatatan(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="Opsional — mis. ayat penguatan atau pesan singkat. Ditampilkan ke jemaat."
            className="w-full px-3 py-2 border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500 text-sm"
          />
          <div className="flex justify-end">
            <button
              onClick={() => prayedMut.mutate()}
              disabled={prayedMut.isPending}
              className="flex items-center gap-2 h-9 px-4 text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-lg disabled:opacity-50"
            >
              {prayedMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {p.status === 'SUDAH_DIDOAKAN' ? 'Simpan catatan' : 'Tandai sudah didoakan'}
            </button>
          </div>
        </div>
      </div>

      <ConfirmDelete
        open={confirmDel}
        onClose={() => setConfirmDel(false)}
        onConfirm={() => delMut.mutate()}
        loading={delMut.isPending}
        title="Hapus prayer request?"
        itemName={`Doa dari ${p.jemaat.namaLengkap}`}
      />
    </div>
  );
}

interface RoleOpt {
  id: string;
  nama: string;
  subRoles: { id: string; nama: string }[];
}
interface ConfigItem {
  roleId: string;
  subRoleId: string | null;
  roleNama?: string;
  subRoleNama?: string | null;
}

function ConfigModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const rolesQ = useQuery({
    queryKey: ['role', 'list'],
    queryFn: async () => (await apiClient.get<{ data: RoleOpt[] }>('/admin/role')).data.data,
  });
  const cfgQ = useQuery({
    queryKey: ['prayer-request', 'config'],
    queryFn: async () => (await apiClient.get<{ data: ConfigItem[] }>('/admin/prayer-request/config')).data.data,
  });
  const [items, setItems] = useState<ConfigItem[] | null>(null);
  const [roleId, setRoleId] = useState('');
  const [subRoleId, setSubRoleId] = useState('');
  useEffect(() => {
    if (cfgQ.data && items === null) setItems(cfgQ.data);
  }, [cfgQ.data, items]);

  const roles = rolesQ.data ?? [];
  const roleMap = useMemo(() => new Map(roles.map((r) => [r.id, r])), [roles]);
  const label = (it: ConfigItem) => {
    const r = roleMap.get(it.roleId);
    const rn = r?.nama ?? it.roleNama ?? '—';
    if (!it.subRoleId) return `${rn} (semua sub role)`;
    const sn = r?.subRoles.find((s) => s.id === it.subRoleId)?.nama ?? it.subRoleNama ?? '—';
    return `${rn} · ${sn}`;
  };

  const saveMut = useMutation({
    mutationFn: async () =>
      apiClient.put('/admin/prayer-request/config', {
        items: (items ?? []).map((i) => ({ roleId: i.roleId, subRoleId: i.subRoleId })),
      }),
    onSuccess: () => {
      toast.success('Role petugas doa disimpan');
      qc.invalidateQueries({ queryKey: ['prayer-request'] });
      onClose();
    },
    onError: (e) => toast.error(errMsg(e, 'Gagal menyimpan')),
  });

  const add = () => {
    if (!roleId) return;
    const it = { roleId, subRoleId: subRoleId || null };
    setItems((cur) =>
      (cur ?? []).some((c) => c.roleId === it.roleId && c.subRoleId === it.subRoleId) ? cur : [...(cur ?? []), it],
    );
    setSubRoleId('');
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-xl shadow-xl w-full max-w-lg pointer-events-auto">
          <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-100">
            <div>
              <h2 className="font-semibold text-neutral-900">Konfigurasi Petugas Doa</h2>
              <p className="text-xs text-neutral-500 mt-0.5">
                Jemaat dengan role aktif berikut bisa ditugaskan mendoakan prayer request.
              </p>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-neutral-100">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-5 space-y-3">
            {items === null ? (
              <div className="flex justify-center py-4">
                <Loader2 className="w-4 h-4 animate-spin text-neutral-400" />
              </div>
            ) : items.length === 0 ? (
              <p className="text-sm text-neutral-400 text-center py-3">Belum ada role petugas.</p>
            ) : (
              <ul className="divide-y divide-neutral-100 border border-neutral-200 rounded-lg">
                {items.map((it) => (
                  <li key={`${it.roleId}:${it.subRoleId ?? ''}`} className="flex items-center gap-2 px-3 py-2">
                    <span className="text-sm text-neutral-800 flex-1">{label(it)}</span>
                    <button
                      onClick={() => setItems((cur) => (cur ?? []).filter((c) => c !== it))}
                      className="p-1 rounded text-neutral-400 hover:text-red-600 hover:bg-red-50"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2 flex-wrap">
              <select
                value={roleId}
                onChange={(e) => {
                  setRoleId(e.target.value);
                  setSubRoleId('');
                }}
                className={`${ctrl} flex-1 min-w-[140px]`}
              >
                <option value="">Pilih role…</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nama}
                  </option>
                ))}
              </select>
              <select
                value={subRoleId}
                onChange={(e) => setSubRoleId(e.target.value)}
                disabled={!roleId}
                className={`${ctrl} flex-1 min-w-[140px]`}
              >
                <option value="">Semua sub role</option>
                {(roleMap.get(roleId)?.subRoles ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nama}
                  </option>
                ))}
              </select>
              <button
                onClick={add}
                disabled={!roleId}
                className="h-9 px-3 text-sm font-medium border border-brand-500 text-brand-600 rounded-lg hover:bg-brand-50 disabled:opacity-40"
              >
                Tambah
              </button>
            </div>
          </div>
          <div className="flex justify-end gap-2 px-5 py-4 border-t border-neutral-100">
            <button onClick={onClose} className="h-9 px-4 text-sm rounded-lg border border-neutral-300 hover:bg-neutral-50">
              Batal
            </button>
            <button
              onClick={() => saveMut.mutate()}
              disabled={saveMut.isPending || items === null}
              className="flex items-center gap-2 h-9 px-4 text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-lg disabled:opacity-50"
            >
              {saveMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Simpan
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
