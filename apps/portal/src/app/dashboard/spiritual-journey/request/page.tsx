'use client';

/**
 * Request update Spiritual Journey dari app (2.4.6).
 * Jemaat memilih tahap yang sudah dicapai + catatan → admin menyetujui (tahap
 * itu & semua tahap sebelumnya yang belum tercatat diberikan) atau menolak.
 * API: /admin/spiritual-journey-request
 */
import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, Footprints, Loader2, Search, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';
import { resolveMediaUrl } from '@/lib/media-url';
import { useDebounce } from '@/lib/use-debounce';
import { usePersistentState } from '@/lib/use-persistent-state';

type Status = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
interface Ref {
  id: string;
  nama: string;
}
interface RequestRow {
  id: string;
  status: Status;
  catatan: string | null;
  alasanTolak: string | null;
  reviewedAt: string | null;
  createdAt: string;
  step: { id: string; judul: string; ikon: string | null; nomor: number | null };
  jemaat: { id: string; namaLengkap: string; kode: string | null; fotoUrl: string | null; noHp: string | null; cabang: Ref };
  reviewedBy: { id: string; namaLengkap: string } | null;
}
interface PlanStep {
  id: string;
  judul: string;
  urutan: number;
  role: Ref;
  subRole: Ref | null;
  subRoleStatus: Ref | null;
  needsSubRole: boolean;
  subRoleOptions: Ref[];
}
interface RequestDetail extends RequestRow {
  plan: PlanStep[];
  tahapSekarang: { achievedCount: number; total: number; currentTitle: string | null } | null;
}

const STATUS_LABEL: Record<Status, { label: string; cls: string }> = {
  PENDING: { label: 'Menunggu', cls: 'bg-amber-100 text-amber-800' },
  APPROVED: { label: 'Disetujui', cls: 'bg-emerald-100 text-emerald-800' },
  REJECTED: { label: 'Ditolak', cls: 'bg-red-100 text-red-700' },
  CANCELLED: { label: 'Dibatalkan', cls: 'bg-neutral-100 text-neutral-600' },
};
const errMsg = (e: any, fb: string) => e?.response?.data?.error?.message ?? fb;
const fmt = (d: string) =>
  new Date(d).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function SpiritualJourneyRequestPage() {
  const [status, setStatus] = usePersistentState<Status | ''>('sj-request:status', 'PENDING');
  const [search, setSearch] = usePersistentState('sj-request:search', '');
  const [page, setPage] = usePersistentState('sj-request:page', 1);
  const [openId, setOpenId] = useState<string | null>(null);
  const dq = useDebounce(search, 300);

  const q = useQuery({
    queryKey: ['spiritual-journey-request', 'list', status, dq, page],
    queryFn: async () =>
      (
        await apiClient.get<{ data: RequestRow[]; meta: { total: number; totalPages: number } }>('/admin/spiritual-journey-request', {
          params: { status: status || undefined, search: dq || undefined, page, limit: 25 },
        })
      ).data,
  });
  const rows = q.data?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <Link href="/dashboard/spiritual-journey" className="p-2 rounded-lg hover:bg-neutral-100" aria-label="Kembali">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
            <Footprints className="w-6 h-6 text-brand-500" /> Request Spiritual Journey
          </h1>
          <p className="text-sm text-neutral-500 mt-0.5 max-w-2xl">
            Jemaat memilih tahap yang sudah dicapai dari app beserta catatan. Disetujui → tahap itu dan semua tahap
            sebelumnya yang belum tercatat diberikan (Role / Sub role / Status sesuai syarat tahap), jemaat menerima
            notifikasi.
          </p>
        </div>
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl p-3 flex flex-wrap items-center gap-2">
        {(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', ''] as const).map((s) => (
          <button
            key={s || 'all'}
            onClick={() => {
              setStatus(s);
              setPage(1);
            }}
            className={`px-3 py-1.5 rounded-full text-sm font-medium border ${status === s ? 'bg-brand-500 text-white border-brand-500' : 'border-neutral-300 text-neutral-700 hover:bg-neutral-50'}`}
          >
            {s ? STATUS_LABEL[s].label : 'Semua'}
          </button>
        ))}
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Cari nama jemaat…"
            className="w-full pl-9 pr-3 py-1.5 border border-neutral-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        {q.isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
          </div>
        ) : rows.length === 0 ? (
          <div className="py-12 text-center text-sm text-neutral-500">Tidak ada request.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-500 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Jemaat</th>
                <th className="px-4 py-2 font-medium">Tahap diminta</th>
                <th className="px-4 py-2 font-medium hidden md:table-cell">Catatan</th>
                <th className="px-4 py-2 font-medium w-40">Dikirim</th>
                <th className="px-4 py-2 font-medium w-28">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} onClick={() => setOpenId(r.id)} className="border-t border-neutral-100 hover:bg-neutral-50 cursor-pointer">
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-neutral-900">{r.jemaat.namaLengkap}</div>
                    <div className="text-xs text-neutral-500">
                      {r.jemaat.kode ? `${r.jemaat.kode} · ` : ''}
                      {r.jemaat.cabang.nama}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="text-neutral-400 mr-1">{r.step.nomor ? `${r.step.nomor}.` : ''}</span>
                    {r.step.ikon ? `${r.step.ikon} ` : ''}
                    {r.step.judul}
                  </td>
                  <td className="px-4 py-2.5 hidden md:table-cell text-neutral-600 max-w-xs truncate">{r.catatan ?? '—'}</td>
                  <td className="px-4 py-2.5 text-neutral-500 text-xs">{fmt(r.createdAt)}</td>
                  <td className="px-4 py-2.5">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_LABEL[r.status].cls}`}>
                      {STATUS_LABEL[r.status].label}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {(q.data?.meta.totalPages ?? 1) > 1 ? (
        <div className="flex items-center justify-end gap-2 text-sm">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-3 py-1.5 border rounded-lg disabled:opacity-40">
            Sebelumnya
          </button>
          <span className="text-neutral-500">
            {page} / {q.data?.meta.totalPages}
          </span>
          <button
            disabled={page >= (q.data?.meta.totalPages ?? 1)}
            onClick={() => setPage(page + 1)}
            className="px-3 py-1.5 border rounded-lg disabled:opacity-40"
          >
            Berikutnya
          </button>
        </div>
      ) : null}

      {openId ? <RequestModal id={openId} onClose={() => setOpenId(null)} /> : null}
    </div>
  );
}

function RequestModal({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [subRoleIds, setSubRoleIds] = useState<Record<string, string>>({});
  const [rejecting, setRejecting] = useState(false);
  const [alasan, setAlasan] = useState('');
  const q = useQuery({
    queryKey: ['spiritual-journey-request', 'detail', id],
    queryFn: async () => (await apiClient.get<{ data: RequestDetail }>(`/admin/spiritual-journey-request/${id}`)).data.data,
  });
  const done = (msg: string) => {
    toast.success(msg);
    qc.invalidateQueries({ queryKey: ['spiritual-journey-request'] });
    qc.invalidateQueries({ queryKey: ['spiritual-journey'] });
    onClose();
  };
  const approve = useMutation({
    mutationFn: async () => apiClient.post(`/admin/spiritual-journey-request/${id}/approve`, { subRoleIds }),
    onSuccess: () => done('Request disetujui, tahap jemaat diperbarui'),
    onError: (e) => toast.error(errMsg(e, 'Gagal menyetujui')),
  });
  const reject = useMutation({
    mutationFn: async () => apiClient.post(`/admin/spiritual-journey-request/${id}/reject`, { alasan }),
    onSuccess: () => done('Request ditolak'),
    onError: (e) => toast.error(errMsg(e, 'Gagal menolak')),
  });
  const d = q.data;
  const needPick = (d?.plan ?? []).filter((p) => p.needsSubRole && !subRoleIds[p.id]);
  const foto = d?.jemaat.fotoUrl ? resolveMediaUrl(d.jemaat.fotoUrl) : null;
  const busy = approve.isPending || reject.isPending;

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={busy ? undefined : onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[90vh] overflow-y-auto pointer-events-auto">
          <div className="flex items-center justify-between px-5 py-3 border-b border-neutral-100">
            <h2 className="font-semibold text-neutral-900">Request Spiritual Journey</h2>
            <button onClick={onClose} disabled={busy} className="p-1.5 rounded-lg hover:bg-neutral-100">
              <X className="w-4 h-4" />
            </button>
          </div>
          {!d ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
            </div>
          ) : (
            <div className="p-5 space-y-4 text-sm">
              <div className="flex items-center gap-3">
                {foto ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={foto} alt="" className="w-12 h-12 rounded-full object-cover" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-brand-50 text-brand-700 font-bold flex items-center justify-center">
                    {d.jemaat.namaLengkap.slice(0, 1)}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <Link href={`/dashboard/jemaat/${d.jemaat.id}`} className="font-semibold text-neutral-900 hover:underline">
                    {d.jemaat.namaLengkap}
                  </Link>
                  <div className="text-xs text-neutral-500">
                    {d.jemaat.kode ? `${d.jemaat.kode} · ` : ''}
                    {d.jemaat.cabang.nama}
                    {d.jemaat.noHp ? ` · ${d.jemaat.noHp}` : ''}
                  </div>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_LABEL[d.status].cls}`}>
                  {STATUS_LABEL[d.status].label}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-neutral-50 rounded-lg p-3">
                  <div className="text-xs text-neutral-500">Tahap diminta</div>
                  <div className="font-semibold text-neutral-900">
                    {d.step.nomor ? `${d.step.nomor}. ` : ''}
                    {d.step.ikon ? `${d.step.ikon} ` : ''}
                    {d.step.judul}
                  </div>
                </div>
                <div className="bg-neutral-50 rounded-lg p-3">
                  <div className="text-xs text-neutral-500">Tercatat saat ini</div>
                  <div className="font-semibold text-neutral-900">
                    {d.tahapSekarang
                      ? d.tahapSekarang.achievedCount === 0
                        ? `Belum mulai (0/${d.tahapSekarang.total})`
                        : `Tahap ${d.tahapSekarang.achievedCount}/${d.tahapSekarang.total} · ${d.tahapSekarang.currentTitle ?? ''}`
                      : '—'}
                  </div>
                </div>
              </div>

              <div>
                <div className="text-xs text-neutral-500 mb-1">Catatan jemaat</div>
                <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 whitespace-pre-wrap text-neutral-800">{d.catatan || '—'}</div>
              </div>
              <div className="text-xs text-neutral-500">Dikirim {fmt(d.createdAt)}</div>

              {d.status === 'PENDING' ? (
                <>
                  <div>
                    <div className="text-xs font-semibold text-neutral-700 mb-1.5">Akan diberikan bila disetujui</div>
                    {d.plan.length === 0 ? (
                      <div className="text-neutral-500 text-xs">Semua tahap sampai tahap ini sudah tercatat — menyetujui tidak mengubah apa pun.</div>
                    ) : (
                      <ul className="space-y-2">
                        {d.plan.map((p) => (
                          <li key={p.id} className="border border-neutral-200 rounded-lg p-2.5">
                            <div className="font-medium text-neutral-900">
                              {p.urutan}. {p.judul}
                            </div>
                            <div className="text-xs text-neutral-500">
                              {p.role.nama}
                              {p.subRole ? ` › ${p.subRole.nama}` : ''}
                              {p.subRoleStatus ? ` › ${p.subRoleStatus.nama}` : ''}
                            </div>
                            {p.needsSubRole ? (
                              <select
                                value={subRoleIds[p.id] ?? ''}
                                onChange={(e) => setSubRoleIds((m) => ({ ...m, [p.id]: e.target.value }))}
                                className="mt-1.5 w-full px-2 py-1.5 border border-neutral-300 rounded text-sm bg-white"
                              >
                                <option value="">— pilih sub role {p.role.nama} —</option>
                                {p.subRoleOptions.map((o) => (
                                  <option key={o.id} value={o.id}>
                                    {o.nama}
                                  </option>
                                ))}
                              </select>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {rejecting ? (
                    <div className="space-y-2">
                      <textarea
                        value={alasan}
                        onChange={(e) => setAlasan(e.target.value)}
                        rows={3}
                        placeholder="Alasan penolakan (dikirim ke jemaat)…"
                        className="w-full px-3 py-2 border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-red-400"
                      />
                      <div className="flex justify-end gap-2">
                        <button onClick={() => setRejecting(false)} disabled={busy} className="px-3 py-1.5 rounded-lg hover:bg-neutral-100">
                          Batal
                        </button>
                        <button
                          onClick={() => reject.mutate()}
                          disabled={busy || alasan.trim().length < 3}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 text-white font-semibold disabled:opacity-50"
                        >
                          {reject.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />} Tolak
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        onClick={() => setRejecting(true)}
                        disabled={busy}
                        className="px-4 py-2 rounded-lg border border-red-200 text-red-700 font-semibold hover:bg-red-50"
                      >
                        Tolak
                      </button>
                      <button
                        onClick={() => approve.mutate()}
                        disabled={busy || needPick.length > 0}
                        title={needPick.length ? 'Pilih sub role untuk tahap yang belum menentukan sub role' : undefined}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 text-white font-semibold disabled:opacity-50"
                      >
                        {approve.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Setujui
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-xs text-neutral-600 bg-neutral-50 rounded-lg p-3">
                  {d.status === 'REJECTED' ? (
                    <div className="mb-1">
                      <b>Alasan:</b> {d.alasanTolak}
                    </div>
                  ) : null}
                  {d.reviewedAt ? `Diproses ${fmt(d.reviewedAt)}${d.reviewedBy ? ` oleh ${d.reviewedBy.namaLengkap}` : ''}` : null}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
