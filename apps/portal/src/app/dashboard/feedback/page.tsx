'use client';

/**
 * Kritik & Saran dari jemaat (dikirim lewat menu Profil di Els App).
 * Admin membaca, membalas (jemaat dapat notifikasi), dan mengubah status.
 * API: /admin/feedback
 */
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Inbox, Loader2, MessageSquareText, Search, Send, Smartphone } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';

type Status = 'BARU' | 'DIPROSES' | 'SELESAI';
type Tipe = 'KRITIK' | 'SARAN';

interface FeedbackRow {
  id: string;
  tipe: Tipe;
  kategori: string;
  isi: string;
  status: Status;
  appInfo: string | null;
  createdAt: string;
  lastActivityAt: string;
  replyCount: number;
  jemaat: { id: string; namaLengkap: string; kode: string | null; noHp: string | null; fotoUrl: string | null };
  cabang: { id: string; nama: string } | null;
}
interface Reply {
  id: string;
  isi: string;
  fromAdmin: boolean;
  createdAt: string;
  author: { id: string; namaLengkap: string } | null;
}

const STATUS_LABEL: Record<Status, string> = { BARU: 'Baru', DIPROSES: 'Diproses', SELESAI: 'Selesai' };
const STATUS_CLS: Record<Status, string> = {
  BARU: 'bg-red-100 text-red-700',
  DIPROSES: 'bg-amber-100 text-amber-800',
  SELESAI: 'bg-green-100 text-green-700',
};
const KATEGORI: Record<string, string> = {
  APLIKASI: 'Aplikasi',
  IBADAH: 'Ibadah',
  PELAYANAN: 'Pelayanan',
  EVENT: 'Event',
  HOMECELL: 'Homecell',
  LAINNYA: 'Lainnya',
};
const fmt = (d: string) => new Date(d).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
const selectCls = 'px-2 py-1.5 border border-neutral-300 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-brand-500';

export default function FeedbackPage() {
  const [status, setStatus] = useState<Status | ''>('BARU');
  const [tipe, setTipe] = useState<Tipe | ''>('');
  const [kategori, setKategori] = useState('');
  const [cabangId, setCabangId] = useState('');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => setPage(1), [status, tipe, kategori, cabangId, q]);

  const cabangQ = useQuery({
    queryKey: ['cabang', 'options'],
    queryFn: async () => {
      const body = (await apiClient.get('/auth/cabang', { params: { isActive: true } })).data as any;
      return (Array.isArray(body) ? body : (body?.data ?? [])) as { id: string; nama: string }[];
    },
    staleTime: 5 * 60_000,
  });

  const listQ = useQuery({
    queryKey: ['feedback', 'list', status, tipe, kategori, cabangId, q, page],
    queryFn: async () =>
      (
        await apiClient.get<{
          data: FeedbackRow[];
          meta: { page: number; totalPages: number; total: number; summary: Record<Status, number> };
        }>('/admin/feedback', {
          params: {
            status: status || undefined,
            tipe: tipe || undefined,
            kategori: kategori || undefined,
            cabangId: cabangId || undefined,
            search: q || undefined,
            page,
            limit: 20,
          },
        })
      ).data,
  });
  const rows = listQ.data?.data ?? [];
  const meta = listQ.data?.meta;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
          <MessageSquareText className="w-6 h-6 text-brand-500" /> Kritik &amp; Saran
        </h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          Masukan jemaat dari menu Profil di Els App. Balasan Anda dikirim sebagai notifikasi ke pengirim.
        </p>
      </div>

      {/* Tab status + filter */}
      <div className="bg-white border border-neutral-200 rounded-xl p-3 space-y-3">
        <div className="flex flex-wrap gap-2">
          {(['BARU', 'DIPROSES', 'SELESAI', ''] as const).map((s) => (
            <button
              key={s || 'all'}
              onClick={() => setStatus(s)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium border ${
                status === s ? 'bg-brand-500 text-white border-brand-500' : 'bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-50'
              }`}
            >
              {s ? STATUS_LABEL[s] : 'Semua'}
              {s && meta?.summary ? <span className="ml-1.5 opacity-80">({meta.summary[s] ?? 0})</span> : null}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <select value={tipe} onChange={(e) => setTipe(e.target.value as Tipe | '')} className={selectCls}>
            <option value="">Kritik &amp; Saran</option>
            <option value="KRITIK">Kritik</option>
            <option value="SARAN">Saran</option>
          </select>
          <select value={kategori} onChange={(e) => setKategori(e.target.value)} className={selectCls}>
            <option value="">Semua topik</option>
            {Object.entries(KATEGORI).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <select value={cabangId} onChange={(e) => setCabangId(e.target.value)} className={selectCls}>
            <option value="">Semua cabang</option>
            {(cabangQ.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.nama}
              </option>
            ))}
          </select>
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-neutral-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari isi atau nama pengirim…"
              className="w-full pl-8 pr-3 py-1.5 border border-neutral-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-5 gap-4">
        {/* Daftar */}
        <div className="lg:col-span-2 bg-white border border-neutral-200 rounded-xl overflow-hidden">
          {listQ.isLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 text-sm text-neutral-400 py-12">
              <Inbox className="w-6 h-6" /> Tidak ada kritik/saran.
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
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          r.tipe === 'KRITIK' ? 'bg-rose-100 text-rose-700' : 'bg-sky-100 text-sky-700'
                        }`}
                      >
                        {r.tipe === 'KRITIK' ? 'KRITIK' : 'SARAN'}
                      </span>
                      <span className="text-[11px] text-neutral-500">{KATEGORI[r.kategori] ?? r.kategori}</span>
                      <span className={`ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_CLS[r.status]}`}>
                        {STATUS_LABEL[r.status]}
                      </span>
                    </div>
                    <p className="text-sm text-neutral-800 mt-1 line-clamp-2">{r.isi}</p>
                    <p className="text-[11px] text-neutral-400 mt-1">
                      {[r.jemaat.namaLengkap, r.cabang?.nama, fmt(r.lastActivityAt), r.replyCount ? `${r.replyCount} balasan` : null]
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
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-2 py-1 rounded hover:bg-neutral-100 disabled:opacity-40">
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

        {/* Detail */}
        <div className="lg:col-span-3">
          {selected ? (
            <FeedbackDetail id={selected} />
          ) : (
            <div className="bg-white border border-dashed border-neutral-300 rounded-xl p-10 text-center text-sm text-neutral-400">
              Pilih salah satu kritik/saran untuk membaca dan membalas.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FeedbackDetail({ id }: { id: string }) {
  const qc = useQueryClient();
  const [isi, setIsi] = useState('');
  const [nextStatus, setNextStatus] = useState<Status | ''>('');
  const q = useQuery({
    queryKey: ['feedback', 'detail', id],
    queryFn: async () => (await apiClient.get<{ data: FeedbackRow & { replies: Reply[] } }>(`/admin/feedback/${id}`)).data.data,
  });
  useEffect(() => {
    setIsi('');
    setNextStatus('');
  }, [id]);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['feedback'] });
  };
  const replyMut = useMutation({
    mutationFn: async () =>
      apiClient.post(`/admin/feedback/${id}/replies`, { isi: isi.trim(), status: nextStatus || undefined }),
    onSuccess: () => {
      toast.success('Balasan terkirim — pengirim mendapat notifikasi');
      setIsi('');
      setNextStatus('');
      refresh();
    },
    onError: (e: any) => toast.error(e.response?.data?.error?.message ?? 'Gagal mengirim balasan'),
  });
  const statusMut = useMutation({
    mutationFn: async (status: Status) => apiClient.patch(`/admin/feedback/${id}`, { status }),
    onSuccess: () => {
      toast.success('Status diperbarui');
      refresh();
    },
    onError: (e: any) => toast.error(e.response?.data?.error?.message ?? 'Gagal'),
  });

  if (q.isLoading || !q.data) {
    return (
      <div className="bg-white border border-neutral-200 rounded-xl flex justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
      </div>
    );
  }
  const f = q.data;
  return (
    <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-neutral-100 flex items-start gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-neutral-900">{f.jemaat.namaLengkap}</div>
          <div className="text-xs text-neutral-500">
            {[f.jemaat.kode, f.jemaat.noHp, f.cabang?.nama].filter(Boolean).join(' · ')}
          </div>
        </div>
        <select
          value={f.status}
          onChange={(e) => statusMut.mutate(e.target.value as Status)}
          className={selectCls}
          disabled={statusMut.isPending}
        >
          {(['BARU', 'DIPROSES', 'SELESAI'] as Status[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </div>

      <div className="p-5 space-y-3 max-h-[55vh] overflow-y-auto bg-neutral-50">
        {/* Pesan awal */}
        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1.5">
            <span
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                f.tipe === 'KRITIK' ? 'bg-rose-100 text-rose-700' : 'bg-sky-100 text-sky-700'
              }`}
            >
              {f.tipe}
            </span>
            <span className="text-xs text-neutral-500">{KATEGORI[f.kategori] ?? f.kategori}</span>
            <span className="ml-auto text-[11px] text-neutral-400">{fmt(f.createdAt)}</span>
          </div>
          <p className="text-sm text-neutral-800 whitespace-pre-line">{f.isi}</p>
          {f.appInfo ? (
            <p className="text-[11px] text-neutral-400 mt-2 flex items-center gap-1">
              <Smartphone className="w-3 h-3" /> {f.appInfo}
            </p>
          ) : null}
        </div>
        {f.replies.map((r) => (
          <div key={r.id} className={`flex ${r.fromAdmin ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-xl px-3.5 py-2.5 ${
                r.fromAdmin ? 'bg-brand-500 text-white' : 'bg-white border border-neutral-200 text-neutral-800'
              }`}
            >
              <p className="text-sm whitespace-pre-line">{r.isi}</p>
              <p className={`text-[10px] mt-1 ${r.fromAdmin ? 'text-white/75' : 'text-neutral-400'}`}>
                {r.fromAdmin ? (r.author?.namaLengkap ?? 'Admin') : f.jemaat.namaLengkap} · {fmt(r.createdAt)}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="p-4 border-t border-neutral-100 space-y-2">
        <textarea
          value={isi}
          onChange={(e) => setIsi(e.target.value)}
          rows={3}
          maxLength={3000}
          placeholder="Tulis balasan untuk jemaat…"
          className="w-full px-3 py-2 border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500 text-sm"
        />
        <div className="flex items-center gap-2 justify-end flex-wrap">
          <label className="text-xs text-neutral-500">Setelah dibalas:</label>
          <select value={nextStatus} onChange={(e) => setNextStatus(e.target.value as Status | '')} className={selectCls}>
            <option value="">{f.status === 'BARU' ? 'Diproses (otomatis)' : `Tetap ${STATUS_LABEL[f.status]}`}</option>
            <option value="DIPROSES">Diproses</option>
            <option value="SELESAI">Selesai</option>
          </select>
          <button
            onClick={() => replyMut.mutate()}
            disabled={!isi.trim() || replyMut.isPending}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-lg disabled:opacity-50"
          >
            {replyMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Kirim balasan
          </button>
        </div>
      </div>
    </div>
  );
}
