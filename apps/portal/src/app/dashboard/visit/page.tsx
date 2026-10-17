'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Handshake,
  Loader2,
  Search,
  MapPin,
  Calendar,
  Trash2,
  X,
  User as UserIcon,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';
import { ConfirmDelete } from '@/components/crud/confirm-delete';
import { useDebounce } from '@/lib/use-debounce';
import {
  ExportButtons,
  Field,
  FilterCard,
  PeriodFields,
  StatCard,
  fmtTgl,
  periodParams,
  selectCls,
  useCabangOptions,
  type PeriodState,
} from '@/components/report/report-ui';

interface JemaatLite {
  id: string;
  namaLengkap: string;
  fotoUrl: string | null;
  noHp: string | null;
  cabang: { id: string; nama: string };
}

interface VisitItem {
  id: string;
  judul: string;
  lokasi: string | null;
  noteDariInitiator: string | null;
  noteDariTarget: string | null;
  tanggalVisit: string;
  createdAt: string;
  updatedAt: string;
  initiator: JemaatLite;
  target: JemaatLite;
}

function formatTanggalLong(iso: string) {
  return new Date(iso).toLocaleString('id-ID', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

type Side = 'any' | 'initiator' | 'target';

interface VisitFilters {
  cabangId: string;
  homecellAreaId: string;
  homecellId: string;
  roleId: string;
  subRoleId: string;
  subRoleStatusId: string;
  pelayananId: string;
  side: Side;
  catatan: '' | 'ada' | 'belum';
}

const EMPTY_FILTERS: VisitFilters = {
  cabangId: '',
  homecellAreaId: '',
  homecellId: '',
  roleId: '',
  subRoleId: '',
  subRoleStatusId: '',
  pelayananId: '',
  side: 'any',
  catatan: '',
};

interface RoleOpt {
  id: string;
  nama: string;
  subRoles: { id: string; nama: string; statuses: { id: string; nama: string }[] }[];
}

interface VisitSummary {
  total: number;
  pengunjungUnik: number;
  dikunjungiUnik: number;
  denganCatatan: number;
  top: { id: string; namaLengkap: string; cabang: string | null; sebagaiPengunjung: number; sebagaiDikunjungi: number; total: number }[];
}

const listOf = <T,>(r: unknown): T[] => {
  const d = (r as { data?: unknown })?.data;
  return (Array.isArray(d) ? d : Array.isArray((d as { data?: unknown })?.data) ? (d as { data: T[] }).data : []) as T[];
};

export default function VisitPage() {
  const qc = useQueryClient();
  const apiBase = process.env.NEXT_PUBLIC_CORE_API_URL ?? '';
  const [page, setPage] = useState(1);
  const [nama, setNama] = useState('');
  const [q, setQ] = useState('');
  const [f, setF] = useState<VisitFilters>(EMPTY_FILTERS);
  const [period, setPeriod] = useState<PeriodState>({ periode: '', from: '', to: '' });
  const [detailItem, setDetailItem] = useState<VisitItem | null>(null);
  const [deleting, setDeleting] = useState<VisitItem | null>(null);

  const debouncedNama = useDebounce(nama, 300);
  const debouncedQ = useDebounce(q, 300);

  /** Ubah filter → kembali ke halaman 1; filter turunan ikut direset. */
  const patch = (p: Partial<VisitFilters>) => {
    setF((cur) => ({ ...cur, ...p }));
    setPage(1);
  };

  // Parameter yang sama untuk daftar, ringkasan, dan export.
  const params: Record<string, string | undefined> = {
    cabangId: f.cabangId || undefined,
    homecellAreaId: f.homecellAreaId || undefined,
    homecellId: f.homecellId || undefined,
    roleId: f.roleId || undefined,
    subRoleId: f.subRoleId || undefined,
    subRoleStatusId: f.subRoleStatusId || undefined,
    pelayananId: f.pelayananId || undefined,
    side: f.side !== 'any' ? f.side : undefined,
    catatan: f.catatan || undefined,
    nama: debouncedNama || undefined,
    q: debouncedQ || undefined,
    ...periodParams(period),
  };
  const personFilterOn = !!(
    f.cabangId || f.homecellAreaId || f.homecellId || f.roleId || f.subRoleId || f.subRoleStatusId || f.pelayananId || debouncedNama
  );
  const anyFilter = personFilterOn || !!(f.catatan || debouncedQ || period.periode);

  const listQ = useQuery({
    queryKey: ['visit', page, params],
    queryFn: async () => {
      const res = await apiClient.get<{
        data: VisitItem[];
        meta: { page: number; limit: number; total: number; totalPages: number };
      }>('/admin/visit', { params: { ...params, page, limit: 25, sortBy: 'tanggalVisit', sortOrder: 'desc' } });
      return res.data;
    },
    placeholderData: (prev) => prev,
  });

  const summaryQ = useQuery({
    queryKey: ['visit', 'summary', params],
    queryFn: async () =>
      (await apiClient.get<{ data: { summary: VisitSummary; period: { from: string; to: string; label: string } | null } }>(
        '/admin/visit/summary',
        { params },
      )).data.data,
    placeholderData: (prev) => prev,
  });

  const cabangQ = useCabangOptions();
  const areaQ = useQuery({
    queryKey: ['homecell-area', 'options', f.cabangId],
    queryFn: async () =>
      listOf<{ id: string; nama: string }>(
        await apiClient.get('/admin/homecell-area', { params: { limit: 500, cabangId: f.cabangId || undefined } }),
      ),
    staleTime: 5 * 60_000,
  });
  const homecellQ = useQuery({
    queryKey: ['homecell', 'options', f.cabangId, f.homecellAreaId],
    queryFn: async () =>
      listOf<{ id: string; nama: string }>(
        await apiClient.get('/admin/homecell', {
          params: { limit: 500, cabangId: f.cabangId || undefined, areaId: f.homecellAreaId || undefined },
        }),
      ),
    staleTime: 5 * 60_000,
  });
  const roleQ = useQuery({
    queryKey: ['role', 'options'],
    queryFn: async () => listOf<RoleOpt>(await apiClient.get('/admin/role')),
    staleTime: 5 * 60_000,
  });
  const pelayananQ = useQuery({
    queryKey: ['pelayanan', 'options'],
    queryFn: async () => listOf<{ id: string; nama: string }>(await apiClient.get('/admin/pelayanan', { params: { limit: 500 } })),
    staleTime: 5 * 60_000,
  });
  const role = (roleQ.data ?? []).find((r) => r.id === f.roleId);
  const subRole = role?.subRoles.find((s) => s.id === f.subRoleId);

  const deleteMut = useMutation({
    mutationFn: async (id: string) => apiClient.delete(`/admin/visit/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['visit'] });
      toast.success('Visit dihapus');
      setDeleting(null);
      setDetailItem(null);
    },
    onError: (err: any) =>
      toast.error(err.response?.data?.error?.message ?? 'Gagal hapus visit'),
  });

  const items = listQ.data?.data ?? [];
  const meta = listQ.data?.meta;
  const sum = summaryQ.data?.summary;
  const per = summaryQ.data?.period;

  function resetFilter() {
    setNama('');
    setQ('');
    setF(EMPTY_FILTERS);
    setPeriod({ periode: '', from: '', to: '' });
    setPage(1);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
            <Handshake className="w-6 h-6" />
            Visit
          </h1>
          <p className="text-neutral-500 mt-1 text-sm">
            Pertemuan antar jemaat lewat scan QR di mobile.{' '}
            {per ? `${per.label ? `${per.label} · ` : ''}${fmtTgl(per.from)} – ${fmtTgl(per.to)}` : 'Semua waktu'}
          </p>
        </div>
        <ExportButtons endpoint="/admin/visit/export" params={params} filename={`visit-${new Date().toISOString().slice(0, 10)}`} />
      </div>

      {/* Filters */}
      <FilterCard>
        <Field label="Cabang">
          <select
            value={f.cabangId}
            onChange={(e) => patch({ cabangId: e.target.value, homecellAreaId: '', homecellId: '' })}
            className={selectCls}
          >
            <option value="">Semua cabang</option>
            {(cabangQ.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.nama}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Homecell area">
          <select
            value={f.homecellAreaId}
            onChange={(e) => patch({ homecellAreaId: e.target.value, homecellId: '' })}
            className={selectCls}
          >
            <option value="">Semua area</option>
            {(areaQ.data ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.nama}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Homecell">
          <select value={f.homecellId} onChange={(e) => patch({ homecellId: e.target.value })} className={selectCls}>
            <option value="">Semua homecell</option>
            {(homecellQ.data ?? []).map((h) => (
              <option key={h.id} value={h.id}>
                {h.nama}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Role">
          <select
            value={f.roleId}
            onChange={(e) => patch({ roleId: e.target.value, subRoleId: '', subRoleStatusId: '' })}
            className={selectCls}
          >
            <option value="">Semua role</option>
            {(roleQ.data ?? []).map((r) => (
              <option key={r.id} value={r.id}>
                {r.nama}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Sub role">
          <select
            value={f.subRoleId}
            disabled={!role}
            onChange={(e) => patch({ subRoleId: e.target.value, subRoleStatusId: '' })}
            className={selectCls}
          >
            <option value="">{role ? 'Semua sub role' : 'Pilih role dulu'}</option>
            {(role?.subRoles ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.nama}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Status">
          <select
            value={f.subRoleStatusId}
            disabled={!subRole}
            onChange={(e) => patch({ subRoleStatusId: e.target.value })}
            className={selectCls}
          >
            <option value="">{subRole ? 'Semua status' : 'Pilih sub role dulu'}</option>
            {(subRole?.statuses ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.nama}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Pelayanan">
          <select value={f.pelayananId} onChange={(e) => patch({ pelayananId: e.target.value })} className={selectCls}>
            <option value="">Semua pelayanan</option>
            {(pelayananQ.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.nama}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Nama jemaat">
          <div className="flex items-center gap-2 border border-neutral-300 rounded-lg px-3 bg-white focus-within:ring-2 focus-within:ring-brand-500">
            <Search className="w-3.5 h-3.5 text-neutral-400" />
            <input
              type="text"
              value={nama}
              onChange={(e) => {
                setNama(e.target.value);
                setPage(1);
              }}
              className="flex-1 py-1.5 outline-none text-sm min-w-0"
              placeholder="Nama pengunjung / dikunjungi"
            />
          </div>
        </Field>
        <Field label="Filter jemaat berlaku untuk">
          <select
            value={f.side}
            onChange={(e) => patch({ side: e.target.value as Side })}
            className={selectCls}
            title="Filter cabang/area/homecell/role/pelayanan/nama dicocokkan ke pihak ini"
          >
            <option value="any">Pengunjung atau yang dikunjungi</option>
            <option value="initiator">Pengunjung (yang scan QR)</option>
            <option value="target">Yang dikunjungi (yang di-scan)</option>
          </select>
        </Field>
        <Field label="Judul / lokasi">
          <input
            type="text"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            className={selectCls}
            placeholder="mis. kunjungan rumah"
          />
        </Field>
        <Field label="Catatan">
          <select value={f.catatan} onChange={(e) => patch({ catatan: e.target.value as VisitFilters['catatan'] })} className={selectCls}>
            <option value="">Semua</option>
            <option value="ada">Ada catatan</option>
            <option value="belum">Belum ada catatan</option>
          </select>
        </Field>
        <PeriodFields
          allowAll
          value={period}
          onChange={(v) => {
            setPeriod(v);
            setPage(1);
          }}
        />
        {anyFilter ? (
          <div className="flex items-end">
            <button onClick={resetFilter} className="text-xs text-neutral-500 hover:text-neutral-900 underline pb-2">
              Reset filter
            </button>
          </div>
        ) : null}
      </FilterCard>

      {/* Jumlah visit di filter ini */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Jumlah visit" value={sum?.total ?? '—'} hint={anyFilter ? 'Sesuai filter' : 'Semua visit'} />
        <StatCard label="Pengunjung (unik)" value={sum?.pengunjungUnik ?? '—'} hint="Jemaat yang scan QR" />
        <StatCard label="Dikunjungi (unik)" value={sum?.dikunjungiUnik ?? '—'} hint="Jemaat yang di-scan" />
        <StatCard
          label="Ada catatan"
          value={sum?.denganCatatan ?? '—'}
          hint={sum?.total ? `${Math.round((sum.denganCatatan / sum.total) * 100)}% dari visit` : undefined}
        />
      </div>

      {sum && sum.top.length > 0 ? (
        <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-neutral-100">
            <h2 className="font-semibold text-neutral-900">Jemaat paling aktif</h2>
            <p className="text-xs text-neutral-500 mt-0.5">Jumlah visit per jemaat pada filter ini.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 text-xs text-neutral-500 uppercase">
                <tr>
                  <th className="text-left px-4 py-2 font-medium w-10">#</th>
                  <th className="text-left px-4 py-2 font-medium">Nama</th>
                  <th className="text-left px-4 py-2 font-medium">Cabang</th>
                  <th className="text-right px-4 py-2 font-medium">Mengunjungi</th>
                  <th className="text-right px-4 py-2 font-medium">Dikunjungi</th>
                  <th className="text-right px-4 py-2 font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {sum.top.map((tp, i) => (
                  <tr key={tp.id}>
                    <td className="px-4 py-2 text-neutral-400">{i + 1}</td>
                    <td className="px-4 py-2">
                      <Link href={`/dashboard/jemaat/${tp.id}`} className="font-medium hover:text-brand-600 hover:underline">
                        {tp.namaLengkap}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-neutral-600">{tp.cabang ?? '—'}</td>
                    <td className="px-4 py-2 text-right">{tp.sebagaiPengunjung}</td>
                    <td className="px-4 py-2 text-right">{tp.sebagaiDikunjungi}</td>
                    <td className="px-4 py-2 text-right font-semibold">{tp.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* List */}
      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        {listQ.isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-16 text-sm text-neutral-400 italic">
            {anyFilter ? 'Tidak ada visit yang cocok dengan filter.' : 'Belum ada visit yang tercatat.'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-xs uppercase text-neutral-500">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Judul / Lokasi</th>
                <th className="px-4 py-3 text-left font-semibold">Peserta</th>
                <th className="px-4 py-3 text-left font-semibold w-44">Tanggal</th>
                <th className="px-4 py-3 text-right font-semibold w-20"> </th>
              </tr>
            </thead>
            <tbody>
              {items.map((v) => (
                <tr
                  key={v.id}
                  className="border-t border-neutral-100 hover:bg-neutral-50 cursor-pointer"
                  onClick={() => setDetailItem(v)}
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-neutral-900">{v.judul}</div>
                    {v.lokasi && (
                      <div className="text-xs text-neutral-500 mt-0.5 flex items-center gap-1">
                        <MapPin className="w-3 h-3 shrink-0" />
                        <span className="truncate">{v.lokasi}</span>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <ParticipantBadge jemaat={v.initiator} role="initiator" apiBase={apiBase} />
                      <span className="text-neutral-300">↔</span>
                      <ParticipantBadge jemaat={v.target} role="target" apiBase={apiBase} />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-neutral-700">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-neutral-400" />
                      {formatTanggalLong(v.tanggalVisit)}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleting(v);
                      }}
                      className="p-1.5 hover:bg-red-50 rounded text-neutral-400 hover:text-red-600"
                      title="Hapus (moderasi)"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {meta && meta.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-100 text-xs text-neutral-500">
            <div>
              Halaman {meta.page} dari {meta.totalPages} · {meta.total} total
            </div>
            <div className="flex gap-1">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1 border border-neutral-300 rounded disabled:opacity-50 hover:bg-neutral-50"
              >
                ←
              </button>
              <button
                disabled={page >= meta.totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1 border border-neutral-300 rounded disabled:opacity-50 hover:bg-neutral-50"
              >
                →
              </button>
            </div>
          </div>
        )}
      </div>

      {detailItem && (
        <DetailModal
          visit={detailItem}
          apiBase={apiBase}
          onClose={() => setDetailItem(null)}
          onDelete={() => {
            setDeleting(detailItem);
          }}
        />
      )}

      <ConfirmDelete
        open={!!deleting}
        loading={deleteMut.isPending}
        onClose={() => setDeleting(null)}
        title="Hapus visit (moderasi)?"
        itemName={
          deleting
            ? `${deleting.initiator.namaLengkap} ↔ ${deleting.target.namaLengkap}: ${deleting.judul}`
            : undefined
        }
        onConfirm={() => deleting && deleteMut.mutate(deleting.id)}
      />
    </div>
  );
}

function ParticipantBadge({
  jemaat,
  role,
  apiBase,
}: {
  jemaat: JemaatLite;
  role: 'initiator' | 'target';
  apiBase: string;
}) {
  return (
    <Link
      href={`/dashboard/jemaat/${jemaat.id}`}
      onClick={(e) => e.stopPropagation()}
      className="flex items-center gap-2 min-w-0 hover:bg-white rounded px-1 py-0.5"
      title={role === 'initiator' ? 'Yang scan QR' : 'Yang di-scan'}
    >
      {jemaat.fotoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`${apiBase}${jemaat.fotoUrl}`}
          alt={jemaat.namaLengkap}
          className="w-7 h-7 rounded-full object-cover shrink-0"
        />
      ) : (
        <div className="w-7 h-7 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center shrink-0">
          <UserIcon className="w-3.5 h-3.5" />
        </div>
      )}
      <div className="min-w-0">
        <div className="font-medium text-neutral-900 truncate text-xs leading-tight">
          {jemaat.namaLengkap}
        </div>
        <div className="text-[10px] text-neutral-500 truncate">{jemaat.cabang.nama}</div>
      </div>
    </Link>
  );
}

function DetailModal({
  visit,
  apiBase,
  onClose,
  onDelete,
}: {
  visit: VisitItem;
  apiBase: string;
  onClose: () => void;
  onDelete: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl pointer-events-auto max-h-[90vh] flex flex-col">
          <div className="flex items-start justify-between px-6 py-4 border-b border-neutral-100">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-neutral-900 truncate">
                {visit.judul}
              </h2>
              <div className="flex items-center gap-3 text-xs text-neutral-500 mt-1 flex-wrap">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {formatTanggalLong(visit.tanggalVisit)}
                </span>
                {visit.lokasi && (
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {visit.lokasi}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-neutral-100 rounded-lg shrink-0 ml-3"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="overflow-y-auto p-6 space-y-4">
            <SideCard
              title="Initiator (yang scan QR)"
              jemaat={visit.initiator}
              note={visit.noteDariInitiator}
              noteLabel={`Catatan ${visit.initiator.namaLengkap} untuk ${visit.target.namaLengkap}`}
              apiBase={apiBase}
            />
            <SideCard
              title="Target (yang di-scan)"
              jemaat={visit.target}
              note={visit.noteDariTarget}
              noteLabel={`Catatan ${visit.target.namaLengkap} untuk ${visit.initiator.namaLengkap}`}
              apiBase={apiBase}
            />
          </div>

          <div className="flex justify-between gap-2 px-6 py-4 border-t border-neutral-100 bg-neutral-50">
            <button
              onClick={onDelete}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg"
            >
              <Trash2 className="w-4 h-4" />
              Hapus (moderasi)
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 rounded-lg"
            >
              Tutup
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function SideCard({
  title,
  jemaat,
  note,
  noteLabel,
  apiBase,
}: {
  title: string;
  jemaat: JemaatLite;
  note: string | null;
  noteLabel: string;
  apiBase: string;
}) {
  return (
    <div className="border border-neutral-200 rounded-xl p-4">
      <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold mb-2">
        {title}
      </div>
      <Link
        href={`/dashboard/jemaat/${jemaat.id}`}
        className="flex items-center gap-3 hover:bg-neutral-50 rounded-lg p-1 -m-1 mb-3"
      >
        {jemaat.fotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`${apiBase}${jemaat.fotoUrl}`}
            alt={jemaat.namaLengkap}
            className="w-10 h-10 rounded-full object-cover shrink-0"
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center shrink-0">
            <UserIcon className="w-5 h-5" />
          </div>
        )}
        <div className="min-w-0">
          <div className="font-semibold text-neutral-900 truncate">{jemaat.namaLengkap}</div>
          <div className="text-xs text-neutral-500">{jemaat.cabang.nama}</div>
        </div>
      </Link>
      <div className="text-xs font-medium text-neutral-600 mb-1">{noteLabel}:</div>
      {note ? (
        <div className="text-sm text-neutral-700 whitespace-pre-wrap bg-neutral-50 p-3 rounded-lg border border-neutral-100">
          {note}
        </div>
      ) : (
        <div className="text-xs text-neutral-400 italic">Belum ada catatan.</div>
      )}
    </div>
  );
}
