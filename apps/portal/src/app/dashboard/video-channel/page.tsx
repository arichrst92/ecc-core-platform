'use client';

/**
 * Broadcast → Video Channel (2026-12). Video YouTube per kategori, universal
 * (semua cabang) — tampil di app 2.5.1 (Beranda → Media → Video Channel) dan
 * website (/video). Hanya video YouTube biasa (bukan Shorts / live / playlist).
 */
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { AlertTriangle, ArrowDown, ArrowUp, CheckCircle2, ExternalLink, Loader2, MonitorPlay, Pencil, Plus, RefreshCw, Search, Star, Trash2, X } from 'lucide-react';
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
  sumber: 'MANUAL' | 'YOUTUBE';
  ytUnavailableAt: string | null;
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
  const [tab, setTab] = useState<'video' | 'kategori' | 'youtube'>('video');
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
            ['youtube', 'Sinkron YouTube'],
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
      {tab === 'video' ? <VideoTab /> : tab === 'kategori' ? <KategoriTab /> : <YoutubeTab />}
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
  const [sumber, setSumber] = useState('');
  const [limit, setLimit] = useState(60);
  useEffect(() => setLimit(60), [dq, kat, status, sumber]);
  const [edit, setEdit] = useState<Video | 'new' | null>(null);
  const kq = useKategori();
  const list = useQuery({
    queryKey: ['video-channel', 'list', dq, kat, status, sumber],
    queryFn: async () =>
      (await apiClient.get<{ data: Video[] }>('/admin/video-channel', { params: { q: dq || undefined, kategoriId: kat || undefined, status: status || undefined, sumber: sumber || undefined } })).data
        .data,
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
        <select value={sumber} onChange={(e) => setSumber(e.target.value)} className="h-9 px-2 border border-neutral-300 rounded-lg text-sm bg-white">
          <option value="">Semua sumber</option>
          <option value="YOUTUBE">Sinkron YouTube</option>
          <option value="MANUAL">Ditambah manual</option>
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
          {rows.slice(0, limit).map((v) => (
            <div key={v.id} className="bg-white border border-neutral-200 rounded-xl overflow-hidden flex flex-col">
              <div className="relative aspect-video bg-neutral-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={v.thumbnailUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                <span className={`absolute top-2 left-2 px-2 py-0.5 rounded-full text-[11px] font-semibold ${STATUS[v.status].cls}`}>{STATUS[v.status].label}</span>
                {v.sumber === 'YOUTUBE' ? (
                  <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-black/70 text-white">Sinkron YouTube</span>
                ) : null}
                {v.ytUnavailableAt ? (
                  <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-600 text-white">Tidak tersedia di YouTube</span>
                ) : null}
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
                        if (
                          confirm(
                            v.sumber === 'YOUTUBE'
                              ? `Hapus video "${v.judul}"? Video ini tidak akan diimpor ulang saat sinkron. (Untuk sekadar menyembunyikan, ubah ke Draft.)`
                              : `Hapus video "${v.judul}"?`,
                          )
                        )
                          del.mutate(v.id);
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
      {rows.length > limit ? (
        <div className="text-center">
          <button onClick={() => setLimit((n) => n + 60)} className="px-4 py-2 rounded-lg border border-neutral-300 text-sm font-semibold hover:bg-neutral-50">
            Tampilkan lebih banyak ({rows.length - limit})
          </button>
        </div>
      ) : null}
      {rows.length ? <p className="text-xs text-neutral-400 text-center">{rows.length} video</p> : null}
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
    if (video && durl === video.url) {
      setResolveErr(null);
      setInfo(null);
      return;
    }
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

// ---------------------------------------------------------------- Sinkron YouTube

type Source = {
  id: string;
  channelKey: string;
  playlistId: string;
  judul: string;
  thumbnailUrl: string | null;
  itemCount: number;
  isUploads: boolean;
  isEnabled: boolean;
  kategoriId: string | null;
  urutan: number;
  lastSyncedAt: string | null;
  missingAt: string | null;
  imported: number;
};
type Run = { id: string; trigger: string; status: 'RUNNING' | 'OK' | 'ERROR'; startedAt: string; finishedAt: string | null; added: number; skipped: number; hidden: number; playlists: number; message: string | null };
type YtState = { configured: boolean; running: boolean; channels: { key: string; nama: string; handle: string }[]; sources: Source[]; lastRun: Run | null; runs: Run[]; ignoredCount: number };

function YoutubeTab() {
  const canWrite = useMenuAccess(MENU, 'write');
  const qc = useQueryClient();
  const kq = useKategori();
  const [showIgnored, setShowIgnored] = useState(false);
  const st = useQuery({
    queryKey: ['video-channel', 'youtube'],
    queryFn: async () => (await apiClient.get<{ data: YtState }>('/admin/video-channel/youtube')).data.data,
    refetchInterval: (q) => (q.state.data?.running || q.state.data?.lastRun?.status === 'RUNNING' ? 4000 : false),
  });
  const inv = () => qc.invalidateQueries({ queryKey: ['video-channel'] });
  const loadPl = useMutation({
    mutationFn: async () => (await apiClient.post<{ data: { total: number; baru: number } }>('/admin/video-channel/youtube/playlists')).data.data,
    onSuccess: (r) => {
      toast.success(`${r.total} playlist dimuat${r.baru ? `, ${r.baru} baru` : ''}`);
      inv();
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const sync = useMutation({
    mutationFn: async () => apiClient.post('/admin/video-channel/youtube/sync'),
    onSuccess: () => {
      toast.success('Sinkron dimulai — berjalan di latar');
      setTimeout(inv, 800);
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const patch = useMutation({
    mutationFn: async (b: { id: string; isEnabled?: boolean; kategoriId?: string | null }) =>
      (await apiClient.patch<{ data: { moved: number } }>(`/admin/video-channel/youtube/sources/${b.id}`, { isEnabled: b.isEnabled, kategoriId: b.kategoriId })).data.data,
    onSuccess: (r) => {
      if (r.moved) toast.success(`${r.moved} video ikut pindah kategori`);
      inv();
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const order = useMutation({
    mutationFn: async (ids: string[]) => apiClient.put('/admin/video-channel/youtube/sources/order', { ids }),
    onSuccess: inv,
    onError: (e) => toast.error(errMsg(e)),
  });

  const d = st.data;
  if (st.isLoading || !d)
    return (
      <div className="py-16 text-center">
        <Loader2 className="w-5 h-5 animate-spin mx-auto text-neutral-400" />
      </div>
    );
  const running = d.running || d.lastRun?.status === 'RUNNING';
  const pls = d.sources.filter((s) => !s.isUploads);
  const ups = d.sources.filter((s) => s.isUploads);
  const move = (i: number, dir: -1 | 1) => {
    const ids = pls.map((p) => p.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    order.mutate(ids);
  };
  const run = d.lastRun;

  const Row = ({ s, i }: { s: Source; i?: number }) => (
    <div className={`flex items-center gap-3 px-3 py-2 ${s.missingAt ? 'opacity-50' : ''}`}>
      {canWrite && i !== undefined ? (
        <div className="flex flex-col">
          <button disabled={i === 0 || order.isPending} onClick={() => move(i, -1)} className="p-0.5 text-neutral-400 hover:text-neutral-800 disabled:opacity-30">
            <ArrowUp className="w-3.5 h-3.5" />
          </button>
          <button disabled={i === pls.length - 1 || order.isPending} onClick={() => move(i, 1)} className="p-0.5 text-neutral-400 hover:text-neutral-800 disabled:opacity-30">
            <ArrowDown className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <div className="w-4" />
      )}
      <input
        type="checkbox"
        checked={s.isEnabled}
        disabled={!canWrite || !!s.missingAt}
        onChange={(e) => patch.mutate({ id: s.id, isEnabled: e.target.checked, ...(e.target.checked && !s.kategoriId ? { kategoriId: '__new__' } : {}) })}
        className="accent-brand-500 w-4 h-4"
        title="Impor playlist ini"
      />
      {s.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={s.thumbnailUrl} alt="" className="w-16 aspect-video object-cover rounded bg-neutral-100 shrink-0" loading="lazy" />
      ) : (
        <div className="w-16 aspect-video rounded bg-neutral-100 shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-neutral-900 truncate">{s.judul}</div>
        <div className="text-[11px] text-neutral-500">
          {[
            `${s.itemCount} video di YouTube`,
            s.imported ? `${s.imported} diimpor` : null,
            s.lastSyncedAt ? `sinkron ${fmtWib(s.lastSyncedAt)}` : null,
            s.missingAt ? 'playlist sudah tidak ada di channel' : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </div>
      </div>
      <select
        value={s.kategoriId ?? ''}
        disabled={!canWrite}
        onChange={(e) => patch.mutate({ id: s.id, kategoriId: e.target.value || null })}
        className="h-8 px-2 border border-neutral-300 rounded-lg text-xs bg-white w-44 shrink-0"
      >
        <option value="">Tanpa kategori</option>
        {(kq.data ?? []).map((k) => (
          <option key={k.id} value={k.id}>
            {k.nama}
          </option>
        ))}
        <option value="__new__">＋ Kategori baru: nama playlist</option>
      </select>
    </div>
  );

  return (
    <div className="space-y-4 max-w-4xl">
      {!d.configured ? (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900 flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            <b>YOUTUBE_API_KEY</b> belum diisi di server. Isi di <code>.env</code> VPS (Google Cloud → YouTube Data API v3 → API key), lalu restart core-api.
          </span>
        </div>
      ) : null}

      <div className="bg-white border border-neutral-200 rounded-xl p-4 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[240px]">
          <div className="font-semibold text-neutral-900">Sinkron otomatis tiap 6 jam</div>
          <div className="text-xs text-neutral-500 mt-0.5">
            Dari {d.channels.map((c) => c.handle).join(' & ')}. Video baru dari playlist yang dicentang langsung <b>Tayang</b>. Shorts, siaran yang belum selesai, video privat, dan video yang pernah dihapus di sini dilewati. Judul/kategori yang diubah admin tidak ditimpa.
          </div>
          {run ? (
            <div className={`text-xs mt-2 flex items-center gap-1.5 ${run.status === 'ERROR' ? 'text-red-600' : run.status === 'RUNNING' ? 'text-sky-700' : 'text-emerald-700'}`}>
              {run.status === 'RUNNING' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : run.status === 'ERROR' ? <AlertTriangle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              {run.status === 'RUNNING'
                ? `Sedang sinkron… (mulai ${fmtWib(run.startedAt)})`
                : run.status === 'ERROR'
                  ? `Gagal ${fmtWib(run.finishedAt ?? run.startedAt)}: ${run.message ?? ''}`
                  : `Terakhir ${fmtWib(run.finishedAt)} (${run.trigger === 'AUTO' ? 'otomatis' : 'manual'}): ${run.added} video baru, ${run.skipped} dilewati${run.hidden ? `, ${run.hidden} disembunyikan` : ''} dari ${run.playlists} playlist${run.message ? ` · ${run.message}` : ''}`}
            </div>
          ) : (
            <div className="text-xs mt-2 text-neutral-400">Belum pernah sinkron.</div>
          )}
        </div>
        {canWrite ? (
          <div className="flex gap-2">
            <button
              disabled={!d.configured || loadPl.isPending}
              onClick={() => loadPl.mutate()}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-neutral-300 text-sm font-semibold disabled:opacity-50"
            >
              {loadPl.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Muat playlist
            </button>
            <button
              disabled={!d.configured || running || sync.isPending || !d.sources.some((s) => s.isEnabled)}
              onClick={() => sync.mutate()}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-brand-500 text-white text-sm font-semibold disabled:opacity-50"
            >
              {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Sinkronkan sekarang
            </button>
          </div>
        ) : null}
      </div>

      {d.sources.length === 0 ? (
        <div className="bg-white border border-neutral-200 rounded-xl py-10 text-center text-sm text-neutral-500">
          Belum ada daftar playlist. {d.configured ? 'Tekan "Muat playlist".' : ''}
        </div>
      ) : (
        <>
          <p className="text-xs text-neutral-500">
            Centang playlist yang diimpor dan pilih kategorinya (mencentang playlist tanpa kategori otomatis membuat kategori bernama playlist). Urutan = prioritas: video yang ada di beberapa playlist masuk kategori playlist yang paling atas. Mengganti kategori playlist ikut memindahkan video yang sudah diimpor dari playlist itu.
          </p>
          {d.channels.map((c) => {
            const list = pls.filter((p) => p.channelKey === c.key);
            if (!list.length) return null;
            return (
              <div key={c.key}>
                <div className="text-xs font-bold text-neutral-500 uppercase tracking-wide mb-1.5">
                  {c.nama} · {c.handle}
                </div>
                <div className="bg-white border border-neutral-200 rounded-xl divide-y divide-neutral-100">
                  {list.map((s) => (
                    <Row key={s.id} s={s} i={pls.indexOf(s)} />
                  ))}
                </div>
              </div>
            );
          })}
          {ups.length ? (
            <div>
              <div className="text-xs font-bold text-neutral-500 uppercase tracking-wide mb-1.5">Video di luar playlist (prioritas terakhir)</div>
              <div className="bg-white border border-neutral-200 rounded-xl divide-y divide-neutral-100">
                {ups.map((s) => (
                  <Row key={s.id} s={s} />
                ))}
              </div>
            </div>
          ) : null}
        </>
      )}

      {d.ignoredCount ? (
        <div>
          <button onClick={() => setShowIgnored((x) => !x)} className="text-xs font-semibold text-neutral-600 hover:underline">
            {showIgnored ? 'Sembunyikan' : 'Lihat'} {d.ignoredCount} video yang dihapus (tidak diimpor ulang)
          </button>
          {showIgnored ? <IgnoredList canWrite={canWrite} /> : null}
        </div>
      ) : null}
    </div>
  );
}

function IgnoredList({ canWrite }: { canWrite: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['video-channel', 'youtube', 'ignored'],
    queryFn: async () => (await apiClient.get<{ data: { youtubeId: string; judul: string | null; createdAt: string }[] }>('/admin/video-channel/youtube/ignored')).data.data,
  });
  const restore = useMutation({
    mutationFn: async (id: string) => apiClient.delete(`/admin/video-channel/youtube/ignored/${id}`),
    onSuccess: () => {
      toast.success('Akan diimpor lagi pada sinkron berikutnya');
      qc.invalidateQueries({ queryKey: ['video-channel'] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  return (
    <div className="mt-2 bg-white border border-neutral-200 rounded-xl divide-y divide-neutral-100">
      {(q.data ?? []).map((r) => (
        <div key={r.youtubeId} className="flex items-center gap-2 px-3 py-2 text-sm">
          <span className="flex-1 truncate">{r.judul ?? r.youtubeId}</span>
          <span className="text-[11px] text-neutral-400">{fmtWib(r.createdAt)}</span>
          {canWrite ? (
            <button onClick={() => restore.mutate(r.youtubeId)} className="text-xs font-semibold text-brand-600 hover:underline">
              Impor lagi
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
