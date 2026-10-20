'use client';

/**
 * ECC Worship — editor lagu: info, audio vokal/karaoke, lirik,
 * Sinkron lirik (manual / .lrc / Elsa) dan Uji Putar.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, FileAudio, Loader2, Trash2, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import { WORSHIP_AUDIO_MAX_BYTES, WORSHIP_DURATION_TOLERANCE_SEC } from '@ecc/shared-types';
import { apiClient } from '@/lib/api-client';
import { ConfirmDelete } from '@/components/crud/confirm-delete';
import { CoverPicker } from '@/components/worship/cover-cropper';
import { SyncTool, type EditLine } from '@/components/worship/sync-tool';
import { TestPlayer } from '@/components/worship/test-player';
import { fmtDur, fmtSize, lyricLines, type WorshipSongDetail } from '@/lib/worship';

const errMsg = (e: any, d: string) => e?.response?.data?.error?.message ?? d;
const ctrl = 'w-full h-9 px-3 border border-neutral-300 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-brand-500';

/** Pasangkan baris lirik dengan waktu tersimpan (urut, berdasarkan teks). */
function buildLines(lirik: string | null, synced: { t: number; line: string }[] | null): EditLine[] {
  const ls = lyricLines(lirik);
  if (!synced?.length) return ls.map((line) => ({ line, t: null }));
  if (!ls.length) return synced.map((s) => ({ line: s.line, t: s.t }));
  let p = 0;
  return ls.map((line) => {
    for (let k = p; k < synced.length; k++) {
      if (synced[k]!.line.trim() === line) {
        p = k + 1;
        return { line, t: synced[k]!.t };
      }
    }
    return { line, t: null };
  });
}

export default function WorshipSongPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const key = ['worship', 'song', id];
  const q = useQuery({
    queryKey: key,
    queryFn: async () => (await apiClient.get<{ data: WorshipSongDetail }>(`/admin/worship/songs/${id}`)).data.data,
  });
  const s = q.data;
  const [form, setForm] = useState({ judul: '', ciptaan: '', tahun: '', lirik: '' });
  const [lines, setLinesState] = useState<EditLine[]>([]);
  const [dirty, setDirty] = useState(false);
  const [pointer, setPointer] = useState(0);
  const [tab, setTab] = useState<'sync' | 'test'>('sync');
  const [del, setDel] = useState(false);
  const loadedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!s || loadedFor.current === s.id) return;
    loadedFor.current = s.id;
    setForm({ judul: s.judul, ciptaan: s.ciptaan ?? '', tahun: s.tahun ? String(s.tahun) : '', lirik: s.lirik ?? '' });
    const ls = buildLines(s.lirik, s.lirikSinkron);
    setLinesState(ls);
    setPointer(Math.max(0, ls.findIndex((l) => l.t === null)));
  }, [s]);

  const setLines = (fn: (prev: EditLine[]) => EditLine[]) => {
    setLinesState(fn);
    setDirty(true);
  };
  const refresh = () => qc.invalidateQueries({ queryKey: ['worship'] });

  const saveInfo = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => apiClient.patch(`/admin/worship/songs/${id}`, patch),
    onSuccess: (_d, patch) => {
      toast.success('Tersimpan');
      if ('lirik' in patch) {
        // Lirik berubah → susun ulang baris, pertahankan waktu yang teksnya sama.
        setLinesState((prev) => {
          const map = prev.filter((l) => l.t !== null).map((l) => ({ line: l.line, t: l.t! }));
          return buildLines(String(patch.lirik ?? ''), map);
        });
        setDirty(true);
      }
      refresh();
    },
    onError: (e) => toast.error(errMsg(e, 'Gagal menyimpan')),
  });
  const saveSync = useMutation({
    mutationFn: async () =>
      apiClient.put(`/admin/worship/songs/${id}/sync`, {
        lines: lines.filter((l) => l.t !== null).map((l) => ({ t: l.t!, line: l.line })),
      }),
    onSuccess: () => {
      toast.success('Sinkron lirik disimpan');
      setDirty(false);
      setLinesState((prev) => prev.map((l) => ({ line: l.line, t: l.t })));
      refresh();
    },
    onError: (e) => toast.error(errMsg(e, 'Gagal menyimpan sinkron')),
  });
  const publish = useMutation({
    mutationFn: async () => {
      await apiClient.patch(`/admin/worship/songs/${id}`, { isPublished: true });
      if (!s!.album.isPublished) await apiClient.patch(`/admin/worship/albums/${s!.album.id}`, { isPublished: true });
    },
    onSuccess: () => {
      toast.success('Dipublikasikan — jemaat sudah bisa mendengarkan');
      refresh();
    },
    onError: (e) => toast.error(errMsg(e, 'Gagal mempublikasikan')),
  });
  const delMut = useMutation({
    mutationFn: async () =>
      s!.album.tipe === 'SINGLE' ? apiClient.delete(`/admin/worship/albums/${s!.album.id}`) : apiClient.delete(`/admin/worship/songs/${id}`),
    onSuccess: () => {
      toast.success('Dihapus');
      refresh();
      router.push(s!.album.tipe === 'SINGLE' ? '/dashboard/worship' : `/dashboard/worship/album/${s!.album.id}`);
    },
  });

  const durWarn = useMemo(
    () => !!(s?.durasi && s.karaokeDurasi && Math.abs(s.durasi - s.karaokeDurasi) > WORSHIP_DURATION_TOLERANCE_SEC),
    [s],
  );

  if (q.isLoading || !s)
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />
      </div>
    );
  const single = s.album.tipe === 'SINGLE';
  const published = s.isPublished && s.album.isPublished;

  return (
    <div className="space-y-5">
      <Link
        href={single ? '/dashboard/worship' : `/dashboard/worship/album/${s.album.id}`}
        className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-800"
      >
        <ArrowLeft className="w-4 h-4" /> {single ? 'ECC Worship' : s.album.judul}
      </Link>

      <div className="grid lg:grid-cols-2 gap-5">
        {/* Info */}
        <div className="bg-white border border-neutral-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-neutral-900 flex-1 truncate">{s.judul}</h1>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${published ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-800'}`}>
              {published ? 'Publik' : 'Draft'}
            </span>
          </div>
          {single ? (
            <CoverPicker
              coverUrl={s.album.coverUrl}
              onUpload={async (blob) => {
                const fd = new FormData();
                fd.append('cover', blob, 'cover.jpg');
                try {
                  await apiClient.post(`/admin/worship/albums/${s.album.id}/cover`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
                  toast.success('Cover disimpan');
                  refresh();
                } catch (e) {
                  toast.error(errMsg(e, 'Gagal mengunggah cover'));
                  throw e;
                }
              }}
            />
          ) : null}
          <label className="block text-sm">
            <span className="font-medium text-neutral-700">Judul</span>
            <input value={form.judul} onChange={(e) => setForm({ ...form, judul: e.target.value })} className={`${ctrl} mt-1`} />
          </label>
          <div className="grid grid-cols-[1fr_110px] gap-3">
            <label className="text-sm">
              <span className="font-medium text-neutral-700">Ciptaan</span>
              <input value={form.ciptaan} onChange={(e) => setForm({ ...form, ciptaan: e.target.value })} className={`${ctrl} mt-1`} />
            </label>
            <label className="text-sm">
              <span className="font-medium text-neutral-700">Tahun</span>
              <input value={form.tahun} onChange={(e) => setForm({ ...form, tahun: e.target.value.replace(/\D/g, '').slice(0, 4) })} className={`${ctrl} mt-1`} />
            </label>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => saveInfo.mutate({ judul: form.judul, ciptaan: form.ciptaan || null, tahun: form.tahun ? Number(form.tahun) : null })}
              className="h-9 px-4 text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-lg"
            >
              Simpan info
            </button>
            {!single ? (
              <button
                onClick={() => saveInfo.mutate({ isPublished: !s.isPublished })}
                className="h-9 px-3 text-sm rounded-lg border border-neutral-300 hover:bg-neutral-50"
              >
                {s.isPublished ? 'Sembunyikan lagu ini' : 'Tampilkan lagu ini'}
              </button>
            ) : published ? (
              <button
                onClick={() => apiClient.patch(`/admin/worship/albums/${s.album.id}`, { isPublished: false }).then(refresh)}
                className="h-9 px-3 text-sm rounded-lg border border-neutral-300 hover:bg-neutral-50"
              >
                Jadikan draft
              </button>
            ) : null}
            <button onClick={() => setDel(true)} className="ml-auto text-sm text-red-600 hover:underline flex items-center gap-1">
              <Trash2 className="w-4 h-4" /> Hapus {single ? 'single' : 'lagu'}
            </button>
          </div>
        </div>

        {/* Audio */}
        <div className="bg-white border border-neutral-200 rounded-xl p-5 space-y-4">
          <AudioSlot
            label="Audio vokal (wajib)"
            songId={s.id}
            mode="VOKAL"
            has={s.hasAudio}
            size={s.audioSize}
            durasi={s.durasi}
            onChanged={refresh}
          />
          <AudioSlot
            label="Audio karaoke — musik tanpa vokal (opsional)"
            songId={s.id}
            mode="KARAOKE"
            has={s.hasKaraoke}
            size={s.karaokeSize}
            durasi={s.karaokeDurasi}
            onChanged={refresh}
          />
          {durWarn ? (
            <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 rounded-lg p-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              Durasi karaoke ({fmtDur(s.karaokeDurasi)}) berbeda lebih dari {WORSHIP_DURATION_TOLERANCE_SEC} detik dari vokal ({fmtDur(s.durasi)}). Pindah
              mode di tengah lagu & lirik tersinkron bisa meleset.
            </div>
          ) : null}
          <p className="text-xs text-neutral-500">MP3/M4A, maks {WORSHIP_AUDIO_MAX_BYTES / 1024 / 1024} MB. Disarankan MP3 192 kbps. Durasi terbaca otomatis.</p>
        </div>
      </div>

      {/* Lirik */}
      <div className="bg-white border border-neutral-200 rounded-xl p-5 space-y-2">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-neutral-900 flex-1">Lirik</h2>
          <span className="text-xs text-neutral-500">{lyricLines(form.lirik).length} baris</span>
        </div>
        <textarea
          value={form.lirik}
          onChange={(e) => setForm({ ...form, lirik: e.target.value })}
          rows={10}
          placeholder={'Satu baris lirik per baris.\nBaris kosong memisahkan bait. Label bagian (mis. "Reff:") boleh ditulis.'}
          className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm font-mono leading-relaxed"
        />
        <div className="flex justify-end">
          <button
            onClick={() => saveInfo.mutate({ lirik: form.lirik })}
            disabled={form.lirik === (s.lirik ?? '')}
            className="h-9 px-4 text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-lg disabled:opacity-40"
          >
            Simpan lirik
          </button>
        </div>
      </div>

      {/* Sinkron & Uji Putar */}
      <div>
        <div className="flex gap-1 border-b border-neutral-200 mb-4">
          {(
            [
              ['sync', 'Sinkron lirik'],
              ['test', 'Uji Putar'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === k ? 'border-brand-500 text-brand-600' : 'border-transparent text-neutral-500 hover:text-neutral-800'}`}
            >
              {label}
              {k === 'sync' && dirty ? <span className="ml-1.5 text-[10px] text-amber-700">belum disimpan</span> : null}
            </button>
          ))}
        </div>
        {tab === 'sync' ? (
          <SyncTool
            songId={s.id}
            hasAudio={s.hasAudio}
            durasi={s.durasi}
            lines={lines}
            setLines={setLines}
            pointer={pointer}
            setPointer={setPointer}
            onSave={() => saveSync.mutate()}
            saving={saveSync.isPending}
            dirty={dirty}
          />
        ) : (
          <TestPlayer
            song={s}
            lines={lines}
            onFix={(i) => {
              setPointer(i);
              setTab('sync');
            }}
            onPublish={() => publish.mutate()}
            publishing={publish.isPending}
          />
        )}
      </div>

      <ConfirmDelete
        open={del}
        onClose={() => setDel(false)}
        onConfirm={() => delMut.mutate()}
        loading={delMut.isPending}
        title={single ? 'Hapus single?' : 'Hapus lagu?'}
        itemName={s.judul}
      />
    </div>
  );
}

function AudioSlot({
  label,
  songId,
  mode,
  has,
  size,
  durasi,
  onChanged,
}: {
  label: string;
  songId: string;
  mode: 'VOKAL' | 'KARAOKE';
  has: boolean;
  size: number | null;
  durasi: number | null;
  onChanged: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const [pct, setPct] = useState<number | null>(null);
  const upload = async (f: File) => {
    if (f.size > WORSHIP_AUDIO_MAX_BYTES) {
      toast.error(`File audio maksimal ${WORSHIP_AUDIO_MAX_BYTES / 1024 / 1024} MB.`);
      return;
    }
    const fd = new FormData();
    fd.append('audio', f);
    setPct(0);
    try {
      await apiClient.post(`/admin/worship/songs/${songId}/audio/${mode}`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 300_000,
        onUploadProgress: (e) => setPct(e.total ? Math.round((e.loaded / e.total) * 100) : null),
      });
      toast.success('Audio diunggah');
      qc.removeQueries({ queryKey: ['worship', 'play-url', songId, mode] });
      onChanged();
    } catch (e) {
      toast.error(errMsg(e, 'Gagal mengunggah audio'));
    } finally {
      setPct(null);
    }
  };
  return (
    <div>
      <div className="text-sm font-medium text-neutral-700 mb-1.5">{label}</div>
      <div className="flex items-center gap-3 border border-neutral-200 rounded-lg px-3 py-2.5">
        <FileAudio className={`w-5 h-5 ${has ? 'text-brand-500' : 'text-neutral-300'}`} />
        <div className="flex-1 text-sm">
          {pct !== null ? (
            <div className="space-y-1">
              <div className="text-neutral-600">Mengunggah… {pct}%</div>
              <div className="h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                <div className="h-1.5 bg-brand-500" style={{ width: `${pct}%` }} />
              </div>
            </div>
          ) : has ? (
            <span className="text-neutral-800">
              {fmtSize(size)} · {fmtDur(durasi)}
            </span>
          ) : (
            <span className="text-neutral-400">Belum ada</span>
          )}
        </div>
        <button onClick={() => ref.current?.click()} disabled={pct !== null} className="flex items-center gap-1.5 h-8 px-3 text-xs rounded-lg border border-neutral-300 hover:bg-neutral-50">
          <Upload className="w-3.5 h-3.5" /> {has ? 'Ganti' : 'Unggah'}
        </button>
        {has && mode === 'KARAOKE' ? (
          <button
            onClick={async () => {
              if (!confirm('Hapus audio karaoke?')) return;
              await apiClient.delete(`/admin/worship/songs/${songId}/audio/KARAOKE`);
              onChanged();
            }}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-red-600 hover:bg-red-50"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        ) : null}
        <input
          ref={ref}
          type="file"
          accept=".mp3,.m4a,audio/mpeg,audio/mp4,audio/x-m4a"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void upload(f);
          }}
        />
      </div>
    </div>
  );
}
