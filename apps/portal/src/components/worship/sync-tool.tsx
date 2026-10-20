'use client';

/**
 * Alat sinkron lirik (ECC Worship):
 *  - Manual: putar lagu, tekan Spasi / "Tandai baris" di awal tiap baris.
 *  - Unggah .lrc.
 *  - "Sinkronkan dengan Elsa" (otomatis; mesin whisper.cpp di server) + progress.
 */
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Circle, FileUp, Loader2, Pause, Play, RotateCcw, Sparkles, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';
import { ELSA_QUALITY_LABEL, ELSA_STAGE_LABEL, fmtDur, fmtTime, type ElsaJob } from '@/lib/worship';

export interface EditLine {
  line: string;
  t: number | null;
  /** keyakinan rendah dari Elsa — perlu dicek */
  flag?: boolean;
}

const errMsg = (e: any, d: string) => e?.response?.data?.error?.message ?? d;

export function usePlayUrl(songId: string, mode: 'VOKAL' | 'KARAOKE', enabled = true) {
  return useQuery({
    queryKey: ['worship', 'play-url', songId, mode],
    queryFn: async () =>
      (await apiClient.get<{ data: { url: string } }>(`/admin/worship/songs/${songId}/play-url`, { params: { mode } })).data.data.url,
    enabled,
    staleTime: 5 * 60 * 60 * 1000,
  });
}

export function SyncTool({
  songId,
  hasAudio,
  durasi,
  lines,
  setLines,
  pointer,
  setPointer,
  onSave,
  saving,
  dirty,
}: {
  songId: string;
  hasAudio: boolean;
  durasi: number | null;
  lines: EditLine[];
  setLines: (fn: (prev: EditLine[]) => EditLine[]) => void;
  pointer: number;
  setPointer: (n: number) => void;
  onSave: () => void;
  saving: boolean;
  dirty: boolean;
}) {
  const url = usePlayUrl(songId, 'VOKAL', hasAudio);
  const audio = useRef<HTMLAudioElement>(null);
  const [cur, setCur] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(1);
  const lrcRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (audio.current) audio.current.playbackRate = rate;
  }, [rate]);

  const mark = () => {
    const a = audio.current;
    if (!a || pointer >= lines.length) return;
    const t = Math.round(a.currentTime * 10) / 10;
    setLines((prev) => prev.map((l, i) => (i === pointer ? { line: l.line, t } : l)));
    setPointer(Math.min(lines.length, pointer + 1));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (e.code !== 'Space' || tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT') return;
      e.preventDefault();
      mark();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    listRef.current?.querySelector(`[data-i="${pointer}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [pointer]);

  const toggle = () => {
    const a = audio.current;
    if (!a) return;
    if (a.paused) void a.play();
    else a.pause();
  };
  const redo = () => {
    const p = Math.max(0, pointer - 1);
    setPointer(p);
    const prevT = p > 0 ? lines[p - 1]?.t : 0;
    if (audio.current) audio.current.currentTime = Math.max(0, (prevT ?? lines[p]?.t ?? 0) - 1);
  };
  const nudge = (i: number, d: number) =>
    setLines((prev) => prev.map((l, k) => (k === i && l.t !== null ? { line: l.line, t: Math.max(0, Math.round((l.t + d) * 10) / 10) } : l)));

  const lrcMut = useMutation({
    mutationFn: async (text: string) =>
      (await apiClient.post<{ data: { lines: { t: number; line: string }[] } }>(`/admin/worship/songs/${songId}/sync/lrc`, { text })).data.data.lines,
    onSuccess: (ls) => {
      setLines(() => ls.map((l) => ({ line: l.line, t: l.t })));
      toast.success(`${ls.length} baris dari .lrc dimuat — periksa lalu Simpan`);
    },
    onError: (e) => toast.error(errMsg(e, 'File .lrc tidak bisa dibaca')),
  });

  const done = lines.filter((l) => l.t !== null).length;
  const dur = durasi ?? 0;

  return (
    <div className="space-y-4">
      <ElsaPanel songId={songId} hasLines={lines.length > 0} hasAudio={hasAudio} hasSync={done > 0} onApply={(res) => setLines(() => res)} />

      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-neutral-100 flex-wrap">
          <span className="font-semibold text-neutral-900">Sinkron manual</span>
          <span className="text-xs text-neutral-500">
            {done} / {lines.length} baris ditandai
          </span>
          <button onClick={() => lrcRef.current?.click()} className="ml-auto flex items-center gap-1.5 text-xs text-neutral-600 hover:text-brand-600">
            <FileUp className="w-4 h-4" /> Unggah .lrc
          </button>
          <input
            ref={lrcRef}
            type="file"
            accept=".lrc,text/plain"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) lrcMut.mutate(await f.text());
            }}
          />
        </div>
        {!hasAudio ? (
          <p className="text-sm text-amber-700 bg-amber-50 p-4">Unggah audio vokal dulu untuk menyinkronkan lirik.</p>
        ) : lines.length === 0 ? (
          <p className="text-sm text-amber-700 bg-amber-50 p-4">Ketik lirik dulu (satu baris per baris) di bagian Lirik.</p>
        ) : (
          <>
            <div className="flex items-center gap-3 px-4 py-3 bg-neutral-50">
              <button onClick={toggle} className="w-9 h-9 rounded-full bg-brand-500 text-white flex items-center justify-center shrink-0" disabled={!url.data}>
                {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </button>
              <span className="text-xs tabular-nums w-10">{fmtDur(cur)}</span>
              <input
                type="range"
                min={0}
                max={dur || 1}
                step={0.1}
                value={cur}
                onChange={(e) => audio.current && (audio.current.currentTime = Number(e.target.value))}
                className="flex-1 accent-brand-500"
                aria-label="Posisi"
              />
              <span className="text-xs tabular-nums w-10">{fmtDur(dur)}</span>
              <select value={rate} onChange={(e) => setRate(Number(e.target.value))} className="h-8 px-2 border border-neutral-300 rounded-lg text-xs bg-white" aria-label="Kecepatan">
                <option value={1}>1×</option>
                <option value={0.75}>0,75×</option>
                <option value={0.5}>0,5×</option>
              </select>
              {url.data ? (
                <audio
                  ref={audio}
                  src={url.data}
                  preload="auto"
                  onTimeUpdate={(e) => setCur(e.currentTarget.currentTime)}
                  onPlay={() => setPlaying(true)}
                  onPause={() => setPlaying(false)}
                />
              ) : null}
            </div>
            <div ref={listRef} className="max-h-[420px] overflow-y-auto px-4 py-2">
              {lines.map((l, i) => {
                const isNext = i === pointer;
                return (
                  <div
                    key={i}
                    data-i={i}
                    onClick={() => setPointer(i)}
                    className={`flex items-center gap-3 py-1.5 px-2 -mx-2 rounded-lg cursor-pointer ${isNext ? 'bg-brand-50' : 'hover:bg-neutral-50'}`}
                  >
                    <span className={`w-14 font-mono text-xs ${l.t === null ? 'text-neutral-400' : l.flag ? 'text-amber-600' : 'text-green-700'}`}>
                      {l.t === null ? '—' : fmtTime(l.t)}
                    </span>
                    <span className={`flex-1 text-sm ${isNext ? 'text-brand-800 font-medium' : l.flag ? 'text-amber-800' : 'text-neutral-800'}`}>
                      {l.line}
                      {l.flag ? <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">cek</span> : null}
                    </span>
                    {isNext ? <span className="text-[11px] text-brand-600">berikutnya</span> : null}
                    {l.t !== null ? (
                      <span className="flex gap-1 text-xs text-neutral-500" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => nudge(i, -0.1)} className="px-1.5 rounded hover:bg-neutral-100">−0,1</button>
                        <button onClick={() => nudge(i, 0.1)} className="px-1.5 rounded hover:bg-neutral-100">+0,1</button>
                        <button
                          onClick={() => audio.current && ((audio.current.currentTime = Math.max(0, l.t! - 0.5)), void audio.current.play())}
                          className="px-1.5 rounded hover:bg-neutral-100"
                          title="Putar dari baris ini"
                        >
                          <Play className="w-3 h-3" />
                        </button>
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-t border-neutral-100">
              <button onClick={mark} className="h-9 px-4 text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-lg" disabled={pointer >= lines.length}>
                Tandai baris <span className="opacity-75 font-normal">(Spasi)</span>
              </button>
              <button onClick={redo} className="h-9 px-3 text-sm rounded-lg border border-neutral-300 hover:bg-neutral-50 flex items-center gap-1.5">
                <RotateCcw className="w-4 h-4" /> Ulangi baris
              </button>
              <button
                onClick={() => {
                  if (confirm('Hapus semua waktu yang sudah ditandai?')) {
                    setLines((prev) => prev.map((l) => ({ line: l.line, t: null })));
                    setPointer(0);
                  }
                }}
                className="h-9 px-3 text-sm rounded-lg border border-neutral-300 hover:bg-neutral-50"
              >
                Kosongkan
              </button>
              <button
                onClick={onSave}
                disabled={saving || !dirty}
                className="ml-auto flex items-center gap-2 h-9 px-4 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 rounded-lg disabled:opacity-40"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Simpan sinkron
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ElsaPanel({
  songId,
  hasLines,
  hasAudio,
  hasSync,
  onApply,
}: {
  songId: string;
  hasLines: boolean;
  hasAudio: boolean;
  hasSync: boolean;
  onApply: (lines: EditLine[]) => void;
}) {
  const qc = useQueryClient();
  const [quality, setQuality] = useState<'CEPAT' | 'TELITI'>('CEPAT');
  const [applied, setApplied] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ['worship', 'elsa', songId],
    queryFn: async () => (await apiClient.get<{ data: ElsaJob | null }>(`/admin/worship/songs/${songId}/elsa`)).data.data,
    refetchInterval: (query) => (query.state.data && ['QUEUED', 'RUNNING'].includes(query.state.data.status) ? 3000 : false),
  });
  const job = q.data;
  const active = job && (job.status === 'QUEUED' || job.status === 'RUNNING');
  const startMut = useMutation({
    mutationFn: async () => apiClient.post(`/admin/worship/songs/${songId}/elsa`, { quality }),
    onSuccess: () => {
      setApplied(null);
      qc.invalidateQueries({ queryKey: ['worship', 'elsa', songId] });
    },
    onError: (e) => toast.error(errMsg(e, 'Gagal memulai Elsa')),
  });
  const cancelMut = useMutation({
    mutationFn: async () => apiClient.post(`/admin/worship/elsa/${job!.id}/cancel`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['worship', 'elsa', songId] }),
  });

  const steps = ['QUEUED', 'PREPARE', 'TRANSCRIBE', 'ALIGN'] as const;
  const stepIdx = !job ? -1 : job.status === 'QUEUED' ? 0 : job.status === 'DONE' ? 4 : steps.indexOf((job.stage ?? 'PREPARE') as never);
  const low = job?.result?.filter((r) => r.confidence < 0.5).length ?? 0;

  return (
    <div className="bg-white border border-neutral-200 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="w-8 h-8 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center">
          <Sparkles className="w-4 h-4" />
        </span>
        <div className="flex-1 min-w-[200px]">
          <div className="font-semibold text-neutral-900">Sinkronkan dengan Elsa</div>
          <div className="text-xs text-neutral-500">Elsa mendengarkan lagu lalu mencocokkan waktu tiap baris lirik. Hasilnya bisa dicek dan dirapikan.</div>
        </div>
        {!active ? (
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-neutral-300 overflow-hidden text-xs">
              {(['CEPAT', 'TELITI'] as const).map((k) => (
                <button key={k} onClick={() => setQuality(k)} className={`px-3 py-1.5 ${quality === k ? 'bg-brand-500 text-white' : 'bg-white text-neutral-600'}`}>
                  {ELSA_QUALITY_LABEL[k]}
                  {k === 'TELITI' ? ' · malam' : ''}
                </button>
              ))}
            </div>
            <button
              onClick={() => startMut.mutate()}
              disabled={!hasAudio || !hasLines || startMut.isPending}
              className="flex items-center gap-1.5 h-9 px-4 text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-lg disabled:opacity-40"
            >
              <Sparkles className="w-4 h-4" /> Sinkronkan dengan Elsa
            </button>
          </div>
        ) : null}
      </div>

      {job ? (
        <>
          {active || job.status === 'DONE' ? (
            <div className="flex items-center gap-2 text-[11px] text-neutral-500 flex-wrap">
              {['Antri', 'Menyiapkan audio', 'Mendengarkan lagu', 'Mencocokkan lirik'].map((label, i) => (
                <span key={label} className={`flex items-center gap-1 ${i < stepIdx ? 'text-green-700' : i === stepIdx ? 'text-brand-700 font-semibold' : ''}`}>
                  {i < stepIdx ? <CheckCircle2 className="w-3.5 h-3.5" /> : i === stepIdx ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Circle className="w-3.5 h-3.5" />}
                  {label}
                  {i < 3 ? <span className="w-6 h-px bg-neutral-200 ml-1" /> : null}
                </span>
              ))}
            </div>
          ) : null}

          {job.status === 'QUEUED' ? (
            <div className="flex items-center gap-3 text-sm">
              <span className="text-neutral-700">
                {job.waitingForNight
                  ? `Mode Teliti — Elsa akan memproses malam ini (00:00–05:00), antrian #${job.queuePosition}.`
                  : `Antri untuk Elsa #${job.queuePosition}.`}
              </span>
              <button onClick={() => cancelMut.mutate()} className="ml-auto text-xs text-neutral-500 hover:text-red-600 flex items-center gap-1">
                <X className="w-3.5 h-3.5" /> Batalkan
              </button>
            </div>
          ) : null}

          {job.status === 'RUNNING' ? (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>{ELSA_STAGE_LABEL[job.stage ?? 'PREPARE']}</span>
                <span className="font-semibold">{job.progress}%</span>
              </div>
              <div className="h-2.5 bg-neutral-100 rounded-full overflow-hidden border border-neutral-200">
                <div className="h-full bg-brand-500 rounded-full transition-all" style={{ width: `${job.progress}%` }} />
              </div>
              <div className="flex justify-between text-xs text-neutral-500 flex-wrap gap-2">
                <span>
                  {job.processedSec ? `Audio ${fmtDur(job.processedSec)} diproses` : 'Memulai…'} · {ELSA_QUALITY_LABEL[job.quality]} ·{' '}
                  {job.threads === 2 ? 'mode malam' : 'mode siang'}
                </span>
                <span>{job.etaSec ? `Sisa ± ${Math.max(1, Math.round(job.etaSec / 60))} menit` : ''}</span>
              </div>
              {job.preview ? (
                <div className="text-xs bg-neutral-50 rounded-lg p-2 text-neutral-600">
                  Terdengar sejauh ini: <span className="text-neutral-900">“…{job.preview}”</span>
                </div>
              ) : null}
              <div className="flex items-center gap-2">
                <button onClick={() => cancelMut.mutate()} className="h-8 px-3 text-xs rounded-lg border border-neutral-300 hover:bg-neutral-50">
                  Batalkan
                </button>
                <span className="text-xs text-neutral-500">Halaman boleh ditutup — proses tetap berjalan di server.</span>
              </div>
            </div>
          ) : null}

          {job.status === 'DONE' && job.result ? (
            <div className="flex items-center gap-3 flex-wrap bg-green-50 border border-green-100 rounded-lg p-3">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              <div className="flex-1 text-sm">
                <div className="font-semibold text-green-900">Elsa menyinkronkan {job.result.length} baris</div>
                <div className={low ? 'text-amber-700 text-xs' : 'text-green-800 text-xs'}>
                  {low ? `${low} baris perlu dicek (ditandai kuning)` : 'Semua baris cocok dengan baik'}
                  {applied === job.id ? ' · sudah diterapkan ke editor, jangan lupa Simpan' : ''}
                </div>
              </div>
              <button
                onClick={() => {
                  if (hasSync && !confirm('Ganti waktu yang sudah ada dengan hasil Elsa?')) return;
                  onApply(job.result!.map((r) => ({ line: r.line, t: r.t, flag: r.confidence < 0.5 })));
                  setApplied(job.id);
                }}
                className="h-9 px-4 text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-lg"
              >
                Terapkan ke editor
              </button>
            </div>
          ) : null}

          {job.status === 'FAILED' ? <div className="text-sm text-red-700 bg-red-50 rounded-lg p-3">Elsa gagal: {job.error}</div> : null}
          {job.status === 'CANCELLED' ? <div className="text-xs text-neutral-500">Proses Elsa terakhir dibatalkan.</div> : null}
        </>
      ) : null}
    </div>
  );
}
