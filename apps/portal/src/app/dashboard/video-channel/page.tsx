'use client';

/**
 * Broadcast → Video Channel (2026-12). Video YouTube per kategori, universal
 * (semua cabang) — tampil di app 2.5.1 (Beranda → Media → Video Channel) dan
 * website (/video). Hanya video YouTube biasa (bukan Shorts / live / playlist).
 */
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ArrowDown, ArrowUp, ExternalLink, Loader2, MonitorPlay, Pencil, Plus, Search, Star, Trash2, X } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useDebounce } from '@/lib/use-debounce';
import { useMenuAccess } from '@/lib/use-menu-access';
import { fmtWib, isoToWibInput, wibInputToIso } from '@/components/universal-form/types';

type Kategori = { id: string; nama: string; urutan: number; isActive: boolean; jumlahVideo: number };
type Video = {
  id: string;
  youtubeId: string;
  url: string;
  thumbnailUrl: string;
  judul: string;
  deskripsi: string | null;
  kategoriId: string | null;
  kategori: { id: string; nama: string; isActive: boolean } | null;
  channelNama: string | null;
  isFeatured: boolean;
  isPublished: boolean;
  tayangAt: string | null;
  createdAt: string;
  status: 'DRAFT' | 'SCHEDULED' | 'PUBLISHED';
};
const MENU = 'video-channel';
const STATUS: Record<Video['status'], { label: string; cls: string }> = {
  PUBLISHED: { label: 'Tayang', cls: 'bg-emerald-50 text-emerald-700' },
  SCHEDULED: { label: 'Terjadwal', cls: 'bg-violet-50 text-violet-700' },
  DRAFT: { label: 'Draft', cls: 'bg-neutral-100 text-neutral-600' },
};
const inputCls = 'w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-200';
const errMsg = (e: unknown) => (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Gagal';

export default function VideoChannelPage() {
  const [tab, setTab] = useState<'video' | 'kategori'>('video');
  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl sm:text-2xl font-bold text-neutral-900 flex items-center gap-2">
          <MonitorPlay className="w-6 h-6 text-brand-500" /> Video Channel
        </h1>
        <p className="text-neutral-500 mt-1 text-sm">
          Video YouTube untuk semua cabang — tampil di Els App (Beranda → Media → Video Channel, app 2.5.1) dan website. Hanya video biasa (bukan Shorts, live, atau playlist).
        </p>
      </div>
      <div className="flex gap-1 border-b border-neutral-200 mb-4">
        {(
          [
            ['video', 'Video'],
            ['kategori', 'Kategori'],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${tab === k ? 'border-brand-500 text-brand-700' : 'border-transparent text-neutral-500 hover:text-neutral-800'}`}
          >
            {l}
          </button>
        ))}
      </div>
      {tab === 'video' ? <VideoTab /> : <KategoriTab />}
    </div>
  );
}

function useKategori() {
  return useQuery({ queryKey: ['video-channel', 'kategori'], queryFn: async () => (await apiClient.get<{ data: Kategori[] }>('/admin/video-channel/kategori')).data.data });
}

// ---------------------------------------------------------------- Video

function VideoTab() {
  const canWrite = useMenuAccess(MENU, 'write');
  const canDelete = useMenuAccess(MENU, 'delete');
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const dq = useDebounce(q, 300);
  const [kat, setKat] = useState('');
  const [status, setStatus] = useState('');
  const [edit, setEdit] = useState<Video | 'new' | null>(null);
  const kq = useKategori();
  const list = useQuery({
    queryKey: ['video-channel', 'list', dq, kat, status],
    queryFn: async () => (await apiClient.get<{ data: Video[] }>('/admin/video-channel', { params: { q: dq || undefined, kategoriId: kat || undefined, status: status || undefined } })).data.data,
  });
  const del = useMutation({
    mutationFn: async (id: string) => apiClient.delete(`/admin/video-channel/${id}`),
    onSuccess: () => {
      toast.success('Video dihapus');
      qc.invalidateQueries({ queryKey: ['video-channel'] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const rows = list.data ?? [];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <label className="flex items-center gap-2 px-3 h-9 border border-neutral-300 rounded-lg bg-white flex-1 min-w-[180px]">
          <Search className="w-4 h-4 text-neutral-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari judul" className="text-sm outline-none flex-1" />
        </label>
        <select value={kat} onChange={(e) => setKat(e.target.value)} className="h-9 px-2 border border-neutral-300 rounded-lg text-sm bg-white">
          <option value="">Semua kategori</option>
          <option value="none">Tanpa kategori</option>
          {(kq.data ?? []).map((k) => (
            <option key={k.id} value={k.id}>
              {k.nama}
            </option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 px-2 border border-neutral-300 rounded-lg text-sm bg-white">
          <option value="">Semua status</option>
          <option value="published">Tayang</option>
          <option value="scheduled">Terjadwal</option>
          <option value="draft">Draft</option>
        </select>
        {canWrite ? (
          <button onClick={() => setEdit('new')} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-brand-500 text-white text-sm font-semibold">
            <Plus className="w-4 h-4" /> Tambah video
          </button>
        ) : null}
      </div>

      {list.isLoading ? (
        <div className="py-16 text-center">
          <Loader2 className="w-5 h-5 animate-spin mx-auto text-neutral-400" />
        </div>
      ) : rows.length === 0 ? (
        <div className="py-16 text-center text-sm text-neutral-500 bg-white border border-neutral-200 rounded-xl">Belum ada video.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {rows.map((v) => (
            <div key={v.id} className="bg-white border border-neutral-200 rounded-xl overflow-hidden flex flex-col">
              <div className="relative aspect-video bg-neutral-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={v.thumbnailUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                <span className={`absolute top-2 left-2 px-2 py-0.5 rounded-full text-[11px] font-semibold ${STATUS[v.status].cls}`}>{STATUS[v.status].label}</span>
                {v.isFeatured ? (
                  <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-400 text-white inline-flex items-center gap-1">
                    <Star className="w-3 h-3" /> Unggulan
                  </span>
                ) : null}
              </div>
              <div className="p-3 flex-1 flex flex-col gap-1">
                <div className="font-semibold text-sm text-neutral-900 line-clamp-2">{v.judul}</div>
                <div className="text-[11px] text-neutral-500">
                  {[v.kategori ? v.kategori.nama + (v.kategori.isActive ? '' : ' (nonaktif)') : 'Tanpa kategori', v.channelNama].filter(Boolean).join(' · ')}
                </div>
                <div className="text-[11px] text-neutral-400">{v.status === 'SCHEDULED' ? `Tayang ${fmtWib(v.tayangAt)}` : `Ditambahkan ${fmtWib(v.createdAt)}`}</div>
                <div className="flex gap-1 mt-auto pt-2">
                  <a href={v.url} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded hover:bg-neutral-100 text-neutral-500" title="Buka di YouTube">
                    <ExternalLink className="w-4 h-4" />
                  </a>
                  <div className="flex-1" />
                  {canWrite ? (
                    <button onClick={() => setEdit(v)} className="p-1.5 rounded hover:bg-neutral-100 text-neutral-600" title="Ubah">
                      <Pencil className="w-4 h-4" />
                    </button>
                  ) : null}
                  {canDelete ? (
                    <button
                      onClick={() => {
                        if (confirm(`Hapus video "${v.judul}"?`)) del.mutate(v.id);
                      }}
                      className="p-1.5 rounded hover:bg-red-50 text-red-600"
                      title="Hapus"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {edit ? <VideoModal video={edit === 'new' ? null : edit} kategori={kq.data ?? []} onClose={() => setEdit(null)} /> : null}
    </div>
  );
}

type Resolved = { youtubeId: string; judul: string | null; channelNama: string | null; thumbnailUrl: string; embeddable: boolean; existingId: string | null };

function VideoModal({ video, kategori, onClose }: { video: Video | null; kategori: Kategori[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [url, setUrl] = useState(video?.url ?? '');
  const [judul, setJudul] = useState(video?.judul ?? '');
  const [deskripsi, setDeskripsi] = useState(video?.deskripsi ?? '');
  const [kategoriId, setKategoriId] = useState(video?.kategoriId ?? '');
  const [isFeatured, setFeatured] = useState(video?.isFeatured ?? false);
  const [isPublished, setPublished] = useState(video?.isPublished ?? true);
  const [tayangAt, setTayangAt] = useState(isoToWibInput(video?.tayangAt));
  const [info, setInfo] = useState<Resolved | null>(null);
  const [resolveErr, setResolveErr] = useState<string | null>(null);
  const durl = useDebounce(url, 500);

  const resolve = useMutation({
    mutationFn: async (u: string) => (await apiClient.post<{ data: Resolved }>('/admin/video-channel/resolve', { url: u })).data.data,
    onSuccess: (r) => {
      setInfo(r);
      setResolveErr(null);
      if (r.judul && (!judul.trim() || (info && judul === info.judul))) setJudul(r.judul);
    },
    onError: (e) => {
      setInfo(null);
      setResolveErr(errMsg(e));
    },
  });
  useEffect(() => {
    if (durl.trim().length < 8) return;
    if (video && durl === video.url) return;
    resolve.mutate(durl.trim());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [durl]);

  const save = useMutation({
    mutationFn: async () => {
      const body = { url, judul, deskripsi: deskripsi || null, kategoriId: kategoriId || null, isFeatured, isPublished, tayangAt: wibInputToIso(tayangAt) };
      return video ? apiClient.patch(`/admin/video-channel/${video.id}`, body) : apiClient.post('/admin/video-channel', body);
    },
    onSuccess: () => {
      toast.success(video ? 'Video disimpan' : 'Video ditambahkan');
      qc.invalidateQueries({ queryKey: ['video-channel'] });
      onClose();
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const thumb = info?.thumbnailUrl ?? video?.thumbnailUrl ?? null;
  const dup = info?.existingId && info.existingId !== video?.id;
  const activeKat = kategori.filter((k) => k.isActive || k.id === kategoriId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-xl max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center px-5 py-3 border-b border-neutral-100 sticky top-0 bg-white">
          <h2 className="font-semibold text-neutral-900 flex-1">{video ? 'Ubah video' : 'Tambah video'}</h2>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-neutral-100">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-3 text-sm">
          <label className="block">
            <span className="text-xs font-semibold text-neutral-600">Link YouTube *</span>
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=…" className={inputCls} autoFocus={!video} />
            {resolve.isPending ? <span className="text-[11px] text-neutral-400">Membaca video…</span> : null}
            {resolveErr ? <span className="text-[11px] text-red-600">{resolveErr}</span> : null}
            {dup ? <span className="text-[11px] text-red-600">Video ini sudah ada di Video Channel.</span> : null}
            {info && !info.embeddable ? (
              <span className="text-[11px] text-amber-700">Judul tidak bisa dibaca — pastikan video bersifat publik/tidak publik (unlisted) dan boleh disematkan.</span>
            ) : null}
          </label>
          {thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumb} alt="" className="w-full aspect-video object-cover rounded-xl bg-neutral-100" />
          ) : null}
          <label className="block">
            <span className="text-xs font-semibold text-neutral-600">Judul *</span>
            <input value={judul} onChange={(e) => setJudul(e.target.value)} maxLength={200} className={inputCls} />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-neutral-600">Kategori</span>
            <select value={kategoriId} onChange={(e) => setKategoriId(e.target.value)} className={inputCls + ' bg-white'}>
              <option value="">Tanpa kategori</option>
              {activeKat.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.nama}
                  {k.isActive ? '' : ' (nonaktif)'}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-neutral-600">Deskripsi</span>
            <textarea value={deskripsi} onChange={(e) => setDeskripsi(e.target.value)} rows={4} maxLength={5000} className={inputCls} />
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={isPublished} onChange={(e) => setPublished(e.target.checked)} className="accent-brand-500" />
              <span>Terbitkan</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={isFeatured} onChange={(e) => setFeatured(e.target.checked)} className="accent-brand-500" />
              <span>Unggulan (tampil di atas)</span>
            </label>
          </div>
          <label className="block">
            <span className="text-xs font-semibold text-neutral-600">Jadwal tayang (WIB, opsional)</span>
            <input type="datetime-local" value={tayangAt} onChange={(e) => setTayangAt(e.target.value)} className={inputCls} />
            <span className="text-[11px] text-neutral-400">Kosong = tampil begitu diterbitkan. Juga dipakai untuk urutan terbaru.</span>
          </label>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-neutral-100">
          <button onClick={onClose} className="px-3 py-2 rounded-lg text-sm hover:bg-neutral-100">
            Batal
          </button>
          <button
            disabled={save.isPending || !url.trim() || judul.trim().length < 2 || !!dup || !!resolveErr}
            onClick={() => save.mutate()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-500 text-white text-sm font-semibold disabled:opacity-50"
          >
            {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Simpan
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Kategori

function KategoriTab() {
  const canWrite = useMenuAccess(MENU, 'write');
  const canDelete = useMenuAccess(MENU, 'delete');
  const qc = useQueryClient();
  const kq = useKategori();
  const [nama, setNama] = useState('');
  const [editing, setEditing] = useState<{ id: string; nama: string } | null>(null);
  const rows = useMemo(() => kq.data ?? [], [kq.data]);
  const inv = () => qc.invalidateQueries({ queryKey: ['video-channel'] });
  const add = useMutation({
    mutationFn: async () => apiClient.post('/admin/video-channel/kategori', { nama, isActive: true }),
    onSuccess: () => {
      setNama('');
      inv();
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const patch = useMutation({
    mutationFn: async (k: { id: string; nama: string; isActive: boolean }) => apiClient.patch(`/admin/video-channel/kategori/${k.id}`, { nama: k.nama, isActive: k.isActive }),
    onSuccess: () => {
      setEditing(null);
      inv();
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const order = useMutation({
    mutationFn: async (ids: string[]) => apiClient.put('/admin/video-channel/kategori/order', { ids }),
    onSuccess: inv,
    onError: (e) => toast.error(errMsg(e)),
  });
  const del = useMutation({
    mutationFn: async (id: string) => apiClient.delete(`/admin/video-channel/kategori/${id}`),
    onSuccess: () => {
      toast.success('Kategori dihapus');
      inv();
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const move = (i: number, d: -1 | 1) => {
    const ids = rows.map((r) => r.id);
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    order.mutate(ids);
  };

  return (
    <div className="max-w-2xl space-y-3">
      <p className="text-sm text-neutral-500">Urutan kategori = urutan pilihan di app & website. Kategori nonaktif beserta videonya tidak ditampilkan.</p>
      {canWrite ? (
        <div className="flex gap-2">
          <input value={nama} onChange={(e) => setNama(e.target.value)} placeholder="Nama kategori baru (mis. Khotbah)" maxLength={100} className={inputCls} />
          <button
            disabled={nama.trim().length < 2 || add.isPending}
            onClick={() => add.mutate()}
            className="inline-flex items-center gap-1 px-3 rounded-lg bg-brand-500 text-white text-sm font-semibold disabled:opacity-50 shrink-0"
          >
            <Plus className="w-4 h-4" /> Tambah
          </button>
        </div>
      ) : null}
      <div className="bg-white border border-neutral-200 rounded-xl divide-y divide-neutral-100">
        {kq.isLoading ? (
          <div className="py-10 text-center">
            <Loader2 className="w-5 h-5 animate-spin mx-auto text-neutral-400" />
          </div>
        ) : rows.length === 0 ? (
          <div className="py-10 text-center text-sm text-neutral-500">Belum ada kategori.</div>
        ) : (
          rows.map((k, i) => (
            <div key={k.id} className="flex items-center gap-2 px-3 py-2">
              {canWrite ? (
                <div className="flex flex-col">
                  <button disabled={i === 0 || order.isPending} onClick={() => move(i, -1)} className="p-0.5 text-neutral-400 hover:text-neutral-800 disabled:opacity-30">
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button disabled={i === rows.length - 1 || order.isPending} onClick={() => move(i, 1)} className="p-0.5 text-neutral-400 hover:text-neutral-800 disabled:opacity-30">
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : null}
              {editing?.id === k.id ? (
                <input
                  value={editing.nama}
                  onChange={(e) => setEditing({ id: k.id, nama: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && patch.mutate({ id: k.id, nama: editing.nama, isActive: k.isActive })}
                  className={inputCls}
                  autoFocus
                />
              ) : (
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-medium ${k.isActive ? 'text-neutral-900' : 'text-neutral-400 line-through'}`}>{k.nama}</div>
                  <div className="text-[11px] text-neutral-500">{k.jumlahVideo} video</div>
                </div>
              )}
              {canWrite ? (
                editing?.id === k.id ? (
                  <>
                    <button onClick={() => patch.mutate({ id: k.id, nama: editing.nama, isActive: k.isActive })} className="px-2 py-1 text-xs font-semibold rounded bg-brand-500 text-white">
                      Simpan
                    </button>
                    <button onClick={() => setEditing(null)} className="p-1 text-neutral-400">
                      <X className="w-4 h-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <label className="flex items-center gap-1 text-xs text-neutral-600">
                      <input type="checkbox" checked={k.isActive} onChange={(e) => patch.mutate({ id: k.id, nama: k.nama, isActive: e.target.checked })} className="accent-brand-500" /> Aktif
                    </label>
                    <button onClick={() => setEditing({ id: k.id, nama: k.nama })} className="p-1.5 rounded hover:bg-neutral-100 text-neutral-600">
                      <Pencil className="w-4 h-4" />
                    </button>
                  </>
                )
              ) : null}
              {canDelete && editing?.id !== k.id ? (
                <button
                  onClick={() => {
                    if (confirm(`Hapus kategori "${k.nama}"? ${k.jumlahVideo ? `${k.jumlahVideo} video di dalamnya menjadi tanpa kategori.` : ''}`)) del.mutate(k.id);
                  }}
                  className="p-1.5 rounded hover:bg-red-50 text-red-600"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
