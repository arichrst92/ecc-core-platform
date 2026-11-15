'use client';

/**
 * Penugasan pelayanan → ibadah & event (Portal → Pelayanan → "Lihat penugasan").
 * Tampilkan di ibadah/event mana pelayanan ini bertugas, lalu pilih banyak
 * (atau pilih semua) untuk ditugaskan / dilepas tugaskan sekaligus.
 * API: GET/POST /admin/pelayanan/:id/penugasan
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CalendarDays, Church, Link2, Link2Off, Loader2, Search, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';
import { PelayananIcon } from '@/components/pelayanan/pelayanan-icon';

interface IbadahRow {
  id: string;
  nama: string;
  tipeJadwal: string;
  hari: string | null;
  jamMulai: string;
  jamSelesai: string;
  isKidsIbadah: boolean;
  cabang: { id: string; nama: string };
  kategoriIbadah: { nama: string } | null;
  linked: boolean;
  petugasCount: number;
}
interface EventRow {
  id: string;
  judul: string;
  tanggalMulai: string;
  tanggalSelesai: string | null;
  jamMulai: string | null;
  isPublished: boolean;
  cabang: { id: string; nama: string } | null;
  linked: boolean;
  petugasCount: number;
}
interface PenugasanData {
  pelayanan: { id: string; nama: string; ikon: string | null; warna: string | null };
  ibadah: IbadahRow[];
  events: EventRow[];
}
type Tab = 'ibadah' | 'event';
type Status = 'all' | 'linked' | 'unlinked';

const HARI: Record<string, string> = {
  SENIN: 'Senin',
  SELASA: 'Selasa',
  RABU: 'Rabu',
  KAMIS: 'Kamis',
  JUMAT: 'Jumat',
  SABTU: 'Sabtu',
  MINGGU: 'Minggu',
};
const JADWAL: Record<string, string> = { WEEKLY: 'Setiap', BIWEEKLY: 'Dua minggu sekali', MONTHLY: 'Bulanan', ONCE: 'Sekali' };
const tgl = (iso: string) => new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

export function PenugasanModal({ pelayananId, onClose }: { pelayananId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('ibadah');
  const [q, setQ] = useState('');
  const [cabang, setCabang] = useState('');
  const [status, setStatus] = useState<Status>('all');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [confirmUnassign, setConfirmUnassign] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['pelayanan-penugasan', pelayananId],
    queryFn: async () => (await apiClient.get<{ data: PenugasanData }>(`/admin/pelayanan/${pelayananId}/penugasan`)).data.data,
  });

  const rows = useMemo(() => {
    if (!data) return [];
    const list =
      tab === 'ibadah'
        ? data.ibadah.map((i) => ({
            id: i.id,
            title: i.nama,
            cabangId: i.cabang.id,
            cabangNama: i.cabang.nama,
            sub: [
              i.kategoriIbadah?.nama,
              i.hari ? `${i.tipeJadwal === 'WEEKLY' ? '' : `${JADWAL[i.tipeJadwal] ?? i.tipeJadwal} · `}${HARI[i.hari] ?? i.hari}` : JADWAL[i.tipeJadwal] ?? i.tipeJadwal,
              `${i.jamMulai}–${i.jamSelesai}`,
              i.isKidsIbadah ? 'Ibadah anak' : null,
            ]
              .filter(Boolean)
              .join(' · '),
            linked: i.linked,
            petugasCount: i.petugasCount,
            draft: false,
          }))
        : data.events.map((e) => ({
            id: e.id,
            title: e.judul,
            cabangId: e.cabang?.id ?? '',
            cabangNama: e.cabang?.nama ?? 'Semua cabang',
            sub: [
              e.tanggalSelesai && e.tanggalSelesai.slice(0, 10) !== e.tanggalMulai.slice(0, 10)
                ? `${tgl(e.tanggalMulai)} – ${tgl(e.tanggalSelesai)}`
                : tgl(e.tanggalMulai),
              e.jamMulai,
            ]
              .filter(Boolean)
              .join(' · '),
            linked: e.linked,
            petugasCount: e.petugasCount,
            draft: !e.isPublished,
          }));
    const k = q.trim().toLowerCase();
    return list.filter(
      (r) =>
        (!k || r.title.toLowerCase().includes(k) || r.cabangNama.toLowerCase().includes(k)) &&
        (!cabang || r.cabangId === cabang) &&
        (status === 'all' || (status === 'linked' ? r.linked : !r.linked)),
    );
  }, [data, tab, q, cabang, status]);

  const cabangOpts = useMemo(() => {
    const m = new Map<string, string>();
    for (const i of data?.ibadah ?? []) m.set(i.cabang.id, i.cabang.nama);
    for (const e of data?.events ?? []) if (e.cabang) m.set(e.cabang.id, e.cabang.nama);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [data]);

  const switchTab = (t: Tab) => {
    setTab(t);
    setSel(new Set());
    setConfirmUnassign(false);
  };
  const toggle = (id: string) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const allOn = rows.length > 0 && rows.every((r) => sel.has(r.id));
  const toggleAll = () => setSel(allOn ? new Set() : new Set(rows.map((r) => r.id)));

  const chosen = rows.filter((r) => sel.has(r.id));
  const toAssign = chosen.filter((r) => !r.linked);
  const toUnassign = chosen.filter((r) => r.linked);
  const petugasLost = toUnassign.reduce((n, r) => n + r.petugasCount, 0);

  const save = useMutation({
    mutationFn: async (action: 'assign' | 'unassign') => {
      const ids = (action === 'assign' ? toAssign : toUnassign).map((r) => r.id);
      const body = tab === 'ibadah' ? { action, ibadahIds: ids, eventIds: [] } : { action, ibadahIds: [], eventIds: ids };
      return (await apiClient.post<{ data: { ibadah: number; event: number } }>(`/admin/pelayanan/${pelayananId}/penugasan`, body)).data.data;
    },
    onSuccess: (r, action) => {
      const n = r.ibadah + r.event;
      toast.success(`${n} ${tab === 'ibadah' ? 'ibadah' : 'event'} ${action === 'assign' ? 'ditugaskan' : 'dilepas tugaskan'}`);
      setSel(new Set());
      setConfirmUnassign(false);
      qc.invalidateQueries({ queryKey: ['pelayanan-penugasan', pelayananId] });
      qc.invalidateQueries({ queryKey: ['pelayanan'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message ?? 'Gagal menyimpan penugasan'),
  });

  const linkedCount = (t: Tab) => (t === 'ibadah' ? data?.ibadah : data?.events)?.filter((x) => x.linked).length ?? 0;
  const totalCount = (t: Tab) => (t === 'ibadah' ? data?.ibadah : data?.events)?.length ?? 0;

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl h-[88vh] flex flex-col pointer-events-auto">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-100">
            <h2 className="font-semibold text-neutral-900 inline-flex items-center gap-2 min-w-0">
              {data ? <PelayananIcon ikon={data.pelayanan.ikon} warna={data.pelayanan.warna} size={28} /> : null}
              <span className="truncate">Penugasan {data?.pelayanan.nama ?? ''}</span>
            </h2>
            <button onClick={onClose} className="p-1.5 hover:bg-neutral-100 rounded" aria-label="Tutup">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Tab + filter */}
          <div className="px-6 pt-4 space-y-3 border-b border-neutral-100 pb-3">
            <div className="flex gap-1 bg-neutral-100 rounded-xl p-1 w-fit">
              {(['ibadah', 'event'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => switchTab(t)}
                  className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold ${
                    tab === t ? 'bg-white text-brand-700 shadow-sm' : 'text-neutral-600 hover:text-neutral-900'
                  }`}
                >
                  {t === 'ibadah' ? <Church className="w-4 h-4" /> : <CalendarDays className="w-4 h-4" />}
                  {t === 'ibadah' ? 'Ibadah' : 'Event mendatang'}
                  {data ? (
                    <span className="text-xs font-medium text-neutral-500">
                      {linkedCount(t)}/{totalCount(t)}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <label className="flex items-center gap-2 flex-1 min-w-[200px] px-3 py-2 border border-neutral-300 rounded-lg focus-within:ring-2 focus-within:ring-brand-500">
                <Search className="w-4 h-4 text-neutral-400" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={tab === 'ibadah' ? 'Cari ibadah / cabang' : 'Cari event / cabang'}
                  className="w-full text-sm outline-none"
                />
              </label>
              <select value={cabang} onChange={(e) => setCabang(e.target.value)} className="px-3 py-2 border border-neutral-300 rounded-lg text-sm">
                <option value="">Semua cabang</option>
                {cabangOpts.map(([id, nama]) => (
                  <option key={id} value={id}>
                    {nama}
                  </option>
                ))}
              </select>
              <select value={status} onChange={(e) => setStatus(e.target.value as Status)} className="px-3 py-2 border border-neutral-300 rounded-lg text-sm">
                <option value="all">Semua status</option>
                <option value="linked">Sudah ditugaskan</option>
                <option value="unlinked">Belum ditugaskan</option>
              </select>
            </div>
          </div>

          {/* Daftar */}
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="py-16 text-center">
                <Loader2 className="w-5 h-5 mx-auto animate-spin text-neutral-400" />
              </div>
            ) : isError ? (
              <div className="py-16 text-center text-sm text-red-600">Gagal memuat penugasan.</div>
            ) : rows.length === 0 ? (
              <div className="py-16 text-center text-sm text-neutral-500">
                {tab === 'ibadah' ? 'Tidak ada ibadah yang cocok.' : 'Tidak ada event mendatang yang cocok.'}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-neutral-50 text-xs uppercase text-neutral-500">
                  <tr>
                    <th className="w-10 px-4 py-2 text-left">
                      <input type="checkbox" checked={allOn} onChange={toggleAll} aria-label="Pilih semua" className="w-4 h-4 accent-brand-600" />
                    </th>
                    <th className="py-2 text-left font-medium">
                      {tab === 'ibadah' ? 'Ibadah' : 'Event'} <span className="normal-case text-neutral-400">({rows.length})</span>
                    </th>
                    <th className="py-2 text-left font-medium">Cabang</th>
                    <th className="px-4 py-2 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {rows.map((r) => (
                    <tr key={r.id} onClick={() => toggle(r.id)} className={`cursor-pointer hover:bg-brand-50/40 ${sel.has(r.id) ? 'bg-brand-50/60' : ''}`}>
                      <td className="px-4 py-2.5">
                        <input
                          type="checkbox"
                          checked={sel.has(r.id)}
                          onChange={() => toggle(r.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="w-4 h-4 accent-brand-600"
                        />
                      </td>
                      <td className="py-2.5 pr-3">
                        <div className="font-medium text-neutral-900 flex items-center gap-2">
                          {r.title}
                          {r.draft ? <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-600">Draft</span> : null}
                        </div>
                        <div className="text-xs text-neutral-500">{r.sub}</div>
                      </td>
                      <td className="py-2.5 pr-3 text-neutral-700">{r.cabangNama}</td>
                      <td className="px-4 py-2.5">
                        {r.linked ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                            <Link2 className="w-3 h-3" /> Ditugaskan
                            {r.petugasCount ? <span className="font-normal">· {r.petugasCount} petugas</span> : null}
                          </span>
                        ) : (
                          <span className="text-xs text-neutral-400">Belum</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Aksi */}
          <div className="border-t border-neutral-100 px-6 py-3">
            {confirmUnassign ? (
              <div className="flex flex-wrap items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                <p className="flex-1 text-sm text-neutral-700 min-w-[240px]">
                  Lepas tugaskan dari <b>{toUnassign.length}</b> {tab === 'ibadah' ? 'ibadah' : 'event'}?
                  {petugasLost ? (
                    <>
                      {' '}
                      Susunan <b>{petugasLost} petugas</b> pelayanan ini di sana ikut terhapus.
                    </>
                  ) : null}
                </p>
                <button onClick={() => setConfirmUnassign(false)} className="px-3 py-2 text-sm rounded-lg hover:bg-neutral-100">
                  Batal
                </button>
                <button
                  onClick={() => save.mutate('unassign')}
                  disabled={save.isPending}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2Off className="w-4 h-4" />}
                  Ya, lepas tugaskan
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex-1 text-sm text-neutral-600">
                  {chosen.length ? (
                    <>
                      <b>{chosen.length}</b> dipilih · {toAssign.length} belum · {toUnassign.length} sudah ditugaskan
                    </>
                  ) : (
                    'Centang ibadah/event, atau pilih semua lewat kotak di judul kolom.'
                  )}
                </span>
                <button
                  onClick={() => setConfirmUnassign(true)}
                  disabled={!toUnassign.length || save.isPending}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-40"
                >
                  <Link2Off className="w-4 h-4" />
                  Lepas tugaskan{toUnassign.length ? ` (${toUnassign.length})` : ''}
                </button>
                <button
                  onClick={() => save.mutate('assign')}
                  disabled={!toAssign.length || save.isPending}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-40"
                >
                  {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                  Tugaskan{toAssign.length ? ` (${toAssign.length})` : ''}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
