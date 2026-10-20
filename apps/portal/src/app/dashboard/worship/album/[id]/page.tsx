'use client';

/** ECC Worship — detail album: info, cover (crop 1:1), publikasi, daftar lagu. */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowLeft, ArrowUp, CheckCircle2, Circle, Loader2, Pencil, Plus, Sparkles, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';
import { ConfirmDelete } from '@/components/crud/confirm-delete';
import { CoverPicker } from '@/components/worship/cover-cropper';
import { fmtDur, lyricLines, type WorshipAlbum, type WorshipSong } from '@/lib/worship';

const errMsg = (e: any, d: string) => e?.response?.data?.error?.message ?? d;
const ctrl = 'w-full h-9 px-3 border border-neutral-300 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-brand-500';

export default function WorshipAlbumPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const key = ['worship', 'album', id];
  const q = useQuery({
    queryKey: key,
    queryFn: async () => (await apiClient.get<{ data: WorshipAlbum }>(`/admin/worship/albums/${id}`)).data.data,
    refetchInterval: (query) =>
      query.state.data?.songs.some((s) => s.lastJob && (s.lastJob.status === 'QUEUED' || s.lastJob.status === 'RUNNING')) ? 4000 : false,
  });
  const a = q.data;
  const [form, setForm] = useState({ judul: '', tahun: '', deskripsi: '' });
  const [adding, setAdding] = useState(false);
  const [del, setDel] = useState<WorshipSong | 'album' | null>(null);
  useEffect(() => {
    if (a) setForm({ judul: a.judul, tahun: a.tahun ? String(a.tahun) : '', deskripsi: a.deskripsi ?? '' });
  }, [a?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = () => qc.invalidateQueries({ queryKey: ['worship'] });
  const saveMut = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => apiClient.patch(`/admin/worship/albums/${id}`, patch),
    onSuccess: () => {
      toast.success('Tersimpan');
      refresh();
    },
    onError: (e) => toast.error(errMsg(e, 'Gagal menyimpan')),
  });
  const reorderMut = useMutation({
    mutationFn: async (ids: string[]) => apiClient.post(`/admin/worship/albums/${id}/songs/reorder`, { ids }),
    onSuccess: refresh,
  });
  const delMut = useMutation({
    mutationFn: async () =>
      del === 'album' ? apiClient.delete(`/admin/worship/albums/${id}`) : apiClient.delete(`/admin/worship/songs/${(del as WorshipSong).id}`),
    onSuccess: () => {
      toast.success('Dihapus');
      if (del === 'album') router.push('/dashboard/worship');
      setDel(null);
      refresh();
    },
    onError: (e) => toast.error(errMsg(e, 'Gagal menghapus')),
  });

  if (q.isLoading || !a)
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
      </div>
    );

  const move = (i: number, d: -1 | 1) => {
    const ids = a.songs.map((s) => s.id);
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    reorderMut.mutate(ids);
  };
  const total = a.songs.reduce((s, x) => s + (x.durasi ?? 0), 0);

  return (
    <div className="space-y-5">
      <Link href="/dashboard/worship" className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-800">
        <ArrowLeft className="w-4 h-4" /> ECC Worship
      </Link>

      <div className="bg-white border border-neutral-200 rounded-xl p-5 flex flex-wrap gap-6">
        <CoverPicker
          coverUrl={a.coverUrl}
          size={150}
          onUpload={async (blob) => {
            const fd = new FormData();
            fd.append('cover', blob, 'cover.jpg');
            try {
              await apiClient.post(`/admin/worship/albums/${id}/cover`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
              toast.success('Cover disimpan');
              refresh();
            } catch (e) {
              toast.error(errMsg(e, 'Gagal mengunggah cover'));
              throw e;
            }
          }}
        />
        <div className="flex-1 min-w-[260px] space-y-3">
          <div className="grid sm:grid-cols-[1fr_120px] gap-3">
            <label className="text-sm">
              <span className="font-medium text-neutral-700">Judul album</span>
              <input value={form.judul} onChange={(e) => setForm({ ...form, judul: e.target.value })} className={`${ctrl} mt-1`} />
            </label>
            <label className="text-sm">
              <span className="font-medium text-neutral-700">Tahun</span>
              <input value={form.tahun} onChange={(e) => setForm({ ...form, tahun: e.target.value.replace(/\D/g, '').slice(0, 4) })} className={`${ctrl} mt-1`} />
            </label>
          </div>
          <label className="block text-sm">
            <span className="font-medium text-neutral-700">Deskripsi</span>
            <textarea value={form.deskripsi} onChange={(e) => setForm({ ...form, deskripsi: e.target.value })} rows={2} className="w-full mt-1 px-3 py-2 border border-neutral-300 rounded-lg text-sm" />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => saveMut.mutate({ judul: form.judul, tahun: form.tahun ? Number(form.tahun) : null, deskripsi: form.deskripsi })}
              disabled={saveMut.isPending}
              className="h-9 px-4 text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-lg disabled:opacity-50"
            >
              Simpan
            </button>
            <button
              onClick={() => saveMut.mutate({ isPublished: !a.isPublished })}
              className={`h-9 px-4 text-sm font-semibold rounded-lg border ${
                a.isPublished ? 'border-neutral-300 text-neutral-700 hover:bg-neutral-50' : 'border-green-600 text-green-700 hover:bg-green-50'
              }`}
            >
              {a.isPublished ? 'Jadikan draft' : 'Publikasikan album'}
            </button>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${a.isPublished ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-800'}`}>
              {a.isPublished ? 'Publik' : 'Draft — hanya terlihat pengelola'}
            </span>
            <button onClick={() => setDel('album')} className="ml-auto text-sm text-red-600 hover:underline">
              Hapus album
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-neutral-100">
          <div>
            <h2 className="font-semibold text-neutral-900">Lagu</h2>
            <p className="text-xs text-neutral-500">
              {a.songs.length} lagu · {fmtDur(total)}
            </p>
          </div>
          <button onClick={() => setAdding(true)} className="flex items-center gap-1.5 h-9 px-3 text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-lg">
            <Plus className="w-4 h-4" /> Tambah lagu
          </button>
        </div>
        {a.songs.length === 0 ? (
          <p className="text-sm text-neutral-400 text-center py-10">Belum ada lagu.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-neutral-500 text-xs uppercase">
              <tr>
                <th className="px-3 py-2 text-left w-10">#</th>
                <th className="px-3 py-2 text-left">Judul</th>
                <th className="px-3 py-2 text-left">Durasi</th>
                <th className="px-3 py-2 text-center">Vokal</th>
                <th className="px-3 py-2 text-center">Karaoke</th>
                <th className="px-3 py-2 text-left">Lirik</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {a.songs.map((s, i) => {
                const lines = lyricLines(s.lirik).length;
                const job = s.lastJob;
                const busy = job && (job.status === 'QUEUED' || job.status === 'RUNNING');
                return (
                  <tr key={s.id} className="align-middle">
                    <td className="px-3 py-2 text-neutral-400">{i + 1}</td>
                    <td className="px-3 py-2">
                      <Link href={`/dashboard/worship/song/${s.id}`} className="font-medium text-neutral-900 hover:text-brand-600">
                        {s.judul}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-neutral-600">{fmtDur(s.durasi)}</td>
                    <td className="px-3 py-2 text-center">{s.hasAudio ? <CheckCircle2 className="w-4 h-4 text-green-600 mx-auto" /> : <Circle className="w-4 h-4 text-neutral-300 mx-auto" />}</td>
                    <td className="px-3 py-2 text-center">{s.hasKaraoke ? <CheckCircle2 className="w-4 h-4 text-green-600 mx-auto" /> : <Circle className="w-4 h-4 text-neutral-300 mx-auto" />}</td>
                    <td className="px-3 py-2 text-xs">
                      {busy ? (
                        <span className="inline-flex items-center gap-1.5 text-brand-700">
                          <Sparkles className="w-3.5 h-3.5" />
                          {job.status === 'QUEUED' ? 'Antri untuk Elsa' : `Elsa: ${job.progress}%`}
                          {job.status === 'RUNNING' ? (
                            <span className="w-16 h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                              <span className="block h-1.5 bg-brand-500" style={{ width: `${job.progress}%` }} />
                            </span>
                          ) : null}
                        </span>
                      ) : lines === 0 ? (
                        <span className="text-neutral-400">Belum ada</span>
                      ) : s.syncedLines ? (
                        <span className="text-green-700">Tersinkron · {s.syncedLines} baris</span>
                      ) : (
                        <span className="text-neutral-600">{lines} baris · statis</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${s.isPublished && a.isPublished ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-800'}`}>
                        {s.isPublished && a.isPublished ? 'Publik' : 'Draft'}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1 text-neutral-500">
                        <button onClick={() => move(i, -1)} disabled={i === 0} className="p-1 rounded hover:bg-neutral-100 disabled:opacity-30">
                          <ArrowUp className="w-4 h-4" />
                        </button>
                        <button onClick={() => move(i, 1)} disabled={i === a.songs.length - 1} className="p-1 rounded hover:bg-neutral-100 disabled:opacity-30">
                          <ArrowDown className="w-4 h-4" />
                        </button>
                        <Link href={`/dashboard/worship/song/${s.id}`} className="p-1 rounded hover:bg-neutral-100">
                          <Pencil className="w-4 h-4" />
                        </Link>
                        <button onClick={() => setDel(s)} className="p-1 rounded hover:bg-red-50 hover:text-red-600">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {adding ? <AddSongModal albumId={a.id} tahun={a.tahun} onClose={() => setAdding(false)} /> : null}
      <ConfirmDelete
        open={!!del}
        onClose={() => setDel(null)}
        onConfirm={() => delMut.mutate()}
        loading={delMut.isPending}
        title={del === 'album' ? 'Hapus album beserta semua lagunya?' : 'Hapus lagu?'}
        itemName={del === 'album' ? a.judul : del ? del.judul : ''}
      />
    </div>
  );
}

function AddSongModal({ albumId, tahun, onClose }: { albumId: string; tahun: number | null; onClose: () => void }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [f, setF] = useState({ judul: '', ciptaan: '', tahun: tahun ? String(tahun) : '' });
  const mut = useMutation({
    mutationFn: async () =>
      (
        await apiClient.post<{ data: { id: string } }>(`/admin/worship/albums/${albumId}/songs`, {
          judul: f.judul.trim(),
          ciptaan: f.ciptaan || null,
          tahun: f.tahun ? Number(f.tahun) : null,
        })
      ).data.data,
    onSuccess: (s) => {
      qc.invalidateQueries({ queryKey: ['worship'] });
      router.push(`/dashboard/worship/song/${s.id}`);
    },
    onError: (e) => toast.error(errMsg(e, 'Gagal menambah lagu')),
  });
  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-xl shadow-xl w-full max-w-md pointer-events-auto">
          <div className="flex items-center justify-between px-5 py-3 border-b border-neutral-100">
            <h2 className="font-semibold">Tambah lagu</h2>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-neutral-100">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-5 space-y-3">
            <label className="block text-sm">
              <span className="font-medium text-neutral-700">Judul</span>
              <input value={f.judul} onChange={(e) => setF({ ...f, judul: e.target.value })} className={`${ctrl} mt-1`} />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-neutral-700">Ciptaan</span>
              <input value={f.ciptaan} onChange={(e) => setF({ ...f, ciptaan: e.target.value })} className={`${ctrl} mt-1`} />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-neutral-700">Tahun</span>
              <input value={f.tahun} onChange={(e) => setF({ ...f, tahun: e.target.value.replace(/\D/g, '').slice(0, 4) })} className={`${ctrl} mt-1`} />
            </label>
          </div>
          <div className="flex justify-end gap-2 px-5 py-3 border-t border-neutral-100">
            <button onClick={onClose} className="h-9 px-4 text-sm rounded-lg border border-neutral-300">
              Batal
            </button>
            <button
              onClick={() => mut.mutate()}
              disabled={!f.judul.trim() || mut.isPending}
              className="h-9 px-4 text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-lg disabled:opacity-50"
            >
              Tambah & lanjut unggah audio
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
