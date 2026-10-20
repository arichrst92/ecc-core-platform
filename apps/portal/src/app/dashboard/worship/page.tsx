'use client';

/**
 * ECC Worship — daftar Album & Single + statistik.
 * Album → /dashboard/worship/album/[id]; Single & lagu → /dashboard/worship/song/[id].
 * API: /admin/worship
 */
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BarChart3, Disc3, Loader2, Music, Plus, Sparkles, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';
import { fmtDur, type WorshipAlbum } from '@/lib/worship';

type Tab = 'ALBUM' | 'SINGLE' | 'STATS';
const errMsg = (e: any, d: string) => e?.response?.data?.error?.message ?? d;
const ctrl = 'w-full h-9 px-3 border border-neutral-300 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-brand-500';

export default function WorshipPage() {
  const [tab, setTab] = useState<Tab>('ALBUM');
  const [creating, setCreating] = useState<'ALBUM' | 'SINGLE' | null>(null);
  const albumsQ = useQuery({
    queryKey: ['worship', 'albums'],
    queryFn: async () => (await apiClient.get<{ data: WorshipAlbum[] }>('/admin/worship/albums')).data.data,
  });
  const albums = (albumsQ.data ?? []).filter((a) => a.tipe === 'ALBUM');
  const singles = (albumsQ.data ?? []).filter((a) => a.tipe === 'SINGLE');
  const activeQ = useQuery({
    queryKey: ['worship', 'elsa-active'],
    queryFn: async () => (await apiClient.get<{ data: { id: string; status: string }[] }>('/admin/worship/elsa/active')).data.data,
    refetchInterval: 5000,
  });
  const active = activeQ.data?.length ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
            <Music className="w-6 h-6 text-brand-500" /> ECC Worship
          </h1>
          <p className="text-sm text-neutral-500 mt-0.5">
            Album & lagu original ECC untuk didengarkan jemaat di Els App. Lagu draft hanya terlihat oleh pengelola.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setCreating('SINGLE')}
            className="flex items-center gap-2 h-9 px-3 border border-neutral-300 rounded-lg text-sm font-medium bg-white hover:bg-neutral-50"
          >
            <Plus className="w-4 h-4" /> Single
          </button>
          <button
            onClick={() => setCreating('ALBUM')}
            className="flex items-center gap-2 h-9 px-3 rounded-lg text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600"
          >
            <Plus className="w-4 h-4" /> Album
          </button>
        </div>
      </div>

      {active > 0 ? (
        <div className="flex items-center gap-2 text-sm bg-brand-50 border border-brand-100 text-brand-800 rounded-lg px-3 py-2">
          <Sparkles className="w-4 h-4" /> Elsa sedang memproses / mengantri {active} lagu.
        </div>
      ) : null}

      <div className="flex gap-1 border-b border-neutral-200">
        {(
          [
            ['ALBUM', `Album (${albums.length})`, Disc3],
            ['SINGLE', `Single (${singles.length})`, Music],
            ['STATS', 'Statistik', BarChart3],
          ] as const
        ).map(([k, label, Icon]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              tab === k ? 'border-brand-500 text-brand-600' : 'border-transparent text-neutral-500 hover:text-neutral-800'
            }`}
          >
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {albumsQ.isLoading && tab !== 'STATS' ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
        </div>
      ) : tab === 'ALBUM' ? (
        <AlbumGrid items={albums} hrefOf={(a) => `/dashboard/worship/album/${a.id}`} empty="Belum ada album." />
      ) : tab === 'SINGLE' ? (
        <AlbumGrid
          items={singles}
          hrefOf={(a) => (a.songs[0] ? `/dashboard/worship/song/${a.songs[0].id}` : `/dashboard/worship/album/${a.id}`)}
          empty="Belum ada single."
        />
      ) : (
        <StatsTable />
      )}

      {creating ? <CreateModal tipe={creating} onClose={() => setCreating(null)} /> : null}
    </div>
  );
}

function AlbumGrid({ items, hrefOf, empty }: { items: WorshipAlbum[]; hrefOf: (a: WorshipAlbum) => string; empty: string }) {
  if (items.length === 0) return <p className="text-sm text-neutral-400 text-center py-12">{empty}</p>;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
      {items.map((a) => {
        const dur = a.songs.reduce((s, x) => s + (x.durasi ?? 0), 0);
        const elsa = a.songs.some((s) => s.lastJob && (s.lastJob.status === 'QUEUED' || s.lastJob.status === 'RUNNING'));
        return (
          <Link key={a.id} href={hrefOf(a)} className="group">
            <div
              className="aspect-square rounded-xl bg-neutral-100 bg-cover bg-center border border-neutral-200 relative overflow-hidden group-hover:border-brand-400"
              style={{ backgroundImage: a.coverUrl ? `url(${a.coverUrl})` : undefined }}
            >
              {!a.coverUrl ? <Disc3 className="w-10 h-10 text-neutral-300 absolute inset-0 m-auto" /> : null}
              <span
                className={`absolute top-2 left-2 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                  a.isPublished ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-800'
                }`}
              >
                {a.isPublished ? 'Publik' : 'Draft'}
              </span>
              {elsa ? (
                <span className="absolute top-2 right-2 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-brand-500 text-white flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> Elsa
                </span>
              ) : null}
            </div>
            <div className="mt-1.5 text-sm font-medium text-neutral-900 truncate">{a.judul}</div>
            <div className="text-xs text-neutral-500">
              {[a.tahun, a.tipe === 'ALBUM' ? `${a.songs.length} lagu` : null, dur ? fmtDur(dur) : null].filter(Boolean).join(' · ')}
            </div>
          </Link>
        );
      })}
    </div>
  );
}

interface StatRow {
  songId: string;
  judul: string;
  album: string;
  tipe: string;
  plays: { vokal: number; karaoke: number; total: number };
  plays30: { vokal: number; karaoke: number; total: number };
  likes: number;
  downloads: number;
  downloads30: number;
}

function StatsTable() {
  const q = useQuery({
    queryKey: ['worship', 'stats'],
    queryFn: async () => (await apiClient.get<{ data: StatRow[] }>('/admin/worship/stats')).data.data,
  });
  if (q.isLoading)
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
      </div>
    );
  const rows = q.data ?? [];
  return (
    <div className="bg-white border border-neutral-200 rounded-xl overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 text-neutral-600 text-xs uppercase">
          <tr>
            <th className="px-3 py-2 text-left">Lagu</th>
            <th className="px-3 py-2 text-right">Putar 30 hari</th>
            <th className="px-3 py-2 text-right">Vokal / Karaoke (30 hr)</th>
            <th className="px-3 py-2 text-right">Total putar</th>
            <th className="px-3 py-2 text-right">Disukai</th>
            <th className="px-3 py-2 text-right">Unduh (30 hr / total)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-3 py-8 text-center text-neutral-400">
                Belum ada data.
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.songId}>
                <td className="px-3 py-2">
                  <Link href={`/dashboard/worship/song/${r.songId}`} className="font-medium text-neutral-900 hover:text-brand-600">
                    {r.judul}
                  </Link>
                  <div className="text-xs text-neutral-500">{r.tipe === 'SINGLE' ? 'Single' : r.album}</div>
                </td>
                <td className="px-3 py-2 text-right font-semibold">{r.plays30.total.toLocaleString('id-ID')}</td>
                <td className="px-3 py-2 text-right text-neutral-600">
                  {r.plays30.vokal.toLocaleString('id-ID')} / {r.plays30.karaoke.toLocaleString('id-ID')}
                </td>
                <td className="px-3 py-2 text-right">{r.plays.total.toLocaleString('id-ID')}</td>
                <td className="px-3 py-2 text-right">{r.likes.toLocaleString('id-ID')}</td>
                <td className="px-3 py-2 text-right">
                  {r.downloads30.toLocaleString('id-ID')} / {r.downloads.toLocaleString('id-ID')}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      <p className="text-xs text-neutral-500 p-3 border-t border-neutral-100">Putaran dihitung setelah lagu diputar minimal 30 detik.</p>
    </div>
  );
}

function CreateModal({ tipe, onClose }: { tipe: 'ALBUM' | 'SINGLE'; onClose: () => void }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [judul, setJudul] = useState('');
  const [tahun, setTahun] = useState(String(new Date().getFullYear()));
  const [ciptaan, setCiptaan] = useState('');
  const [deskripsi, setDeskripsi] = useState('');
  const mut = useMutation({
    mutationFn: async () => {
      const th = tahun ? Number(tahun) : null;
      const album = (
        await apiClient.post<{ data: WorshipAlbum }>('/admin/worship/albums', {
          tipe,
          judul: judul.trim(),
          tahun: th,
          deskripsi: tipe === 'ALBUM' ? deskripsi : null,
        })
      ).data.data;
      if (tipe === 'SINGLE') {
        const song = (
          await apiClient.post<{ data: { id: string } }>(`/admin/worship/albums/${album.id}/songs`, {
            judul: judul.trim(),
            ciptaan: ciptaan || null,
            tahun: th,
          })
        ).data.data;
        return `/dashboard/worship/song/${song.id}`;
      }
      return `/dashboard/worship/album/${album.id}`;
    },
    onSuccess: (href) => {
      qc.invalidateQueries({ queryKey: ['worship'] });
      router.push(href);
    },
    onError: (e) => toast.error(errMsg(e, 'Gagal membuat')),
  });
  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-xl shadow-xl w-full max-w-md pointer-events-auto">
          <div className="flex items-center justify-between px-5 py-3 border-b border-neutral-100">
            <h2 className="font-semibold">{tipe === 'ALBUM' ? 'Album baru' : 'Single baru'}</h2>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-neutral-100">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-5 space-y-3">
            <label className="block text-sm">
              <span className="text-neutral-700 font-medium">{tipe === 'ALBUM' ? 'Judul album' : 'Judul lagu'}</span>
              <input value={judul} onChange={(e) => setJudul(e.target.value)} className={`${ctrl} mt-1`} maxLength={200} />
            </label>
            {tipe === 'SINGLE' ? (
              <label className="block text-sm">
                <span className="text-neutral-700 font-medium">Ciptaan</span>
                <input value={ciptaan} onChange={(e) => setCiptaan(e.target.value)} className={`${ctrl} mt-1`} maxLength={200} />
              </label>
            ) : null}
            <label className="block text-sm">
              <span className="text-neutral-700 font-medium">Tahun</span>
              <input value={tahun} onChange={(e) => setTahun(e.target.value.replace(/\D/g, '').slice(0, 4))} className={`${ctrl} mt-1`} />
            </label>
            {tipe === 'ALBUM' ? (
              <label className="block text-sm">
                <span className="text-neutral-700 font-medium">Deskripsi (opsional)</span>
                <textarea value={deskripsi} onChange={(e) => setDeskripsi(e.target.value)} rows={3} className="w-full mt-1 px-3 py-2 border border-neutral-300 rounded-lg text-sm" />
              </label>
            ) : null}
            <p className="text-xs text-neutral-500">Dibuat sebagai draft. Cover, audio, dan lirik diatur di halaman berikutnya.</p>
          </div>
          <div className="flex justify-end gap-2 px-5 py-3 border-t border-neutral-100">
            <button onClick={onClose} className="h-9 px-4 text-sm rounded-lg border border-neutral-300">
              Batal
            </button>
            <button
              onClick={() => mut.mutate()}
              disabled={!judul.trim() || mut.isPending}
              className="flex items-center gap-2 h-9 px-4 text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-lg disabled:opacity-50"
            >
              {mut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Buat
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
