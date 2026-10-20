'use client';

/**
 * Uji Putar (ECC Worship) — meniru pemutar Els App sebelum publikasi:
 * Vokal/Karaoke (lanjut dari detik yang sama), lirik tersinkron menyala,
 * ketuk baris untuk lompat, + cek otomatis.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Pause, Play, RotateCcw, RotateCw, Smartphone } from 'lucide-react';
import { fmtDur, songChecks, type WorshipSongDetail } from '@/lib/worship';
import { usePlayUrl, type EditLine } from './sync-tool';

export function TestPlayer({
  song,
  lines,
  onFix,
  onPublish,
  publishing,
}: {
  song: WorshipSongDetail;
  lines: EditLine[];
  onFix: (line: number) => void;
  onPublish: () => void;
  publishing: boolean;
}) {
  const [mode, setMode] = useState<'VOKAL' | 'KARAOKE'>('VOKAL');
  const vokal = usePlayUrl(song.id, 'VOKAL', song.hasAudio);
  const karaoke = usePlayUrl(song.id, 'KARAOKE', song.hasKaraoke);
  const src = mode === 'VOKAL' ? vokal.data : karaoke.data;
  const audio = useRef<HTMLAudioElement>(null);
  const resume = useRef<{ t: number; play: boolean } | null>(null);
  const [cur, setCur] = useState(0);
  const [playing, setPlaying] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const switchMode = (m: 'VOKAL' | 'KARAOKE') => {
    if (m === mode) return;
    const a = audio.current;
    resume.current = a ? { t: a.currentTime, play: !a.paused } : null;
    setMode(m);
  };

  const timed = lines.some((l) => l.t !== null);
  const active = useMemo(() => {
    if (!timed) return -1;
    let idx = -1;
    lines.forEach((l, i) => {
      if (l.t !== null && l.t <= cur + 0.05) idx = i;
    });
    return idx;
  }, [lines, cur, timed]);

  useEffect(() => {
    if (active < 0) return;
    const el = listRef.current?.querySelector(`[data-i="${active}"]`) as HTMLElement | null;
    if (el && listRef.current) listRef.current.scrollTo({ top: el.offsetTop - listRef.current.clientHeight / 2 + 20, behavior: 'smooth' });
  }, [active]);

  const checks = songChecks(song, lines, song.album.coverUrl);
  const dark = mode === 'KARAOKE';
  const dur = (mode === 'VOKAL' ? song.durasi : song.karaokeDurasi) ?? song.durasi ?? 0;
  const published = song.isPublished && song.album.isPublished;

  return (
    <div className="grid lg:grid-cols-[280px_minmax(0,1fr)] gap-6">
      <div
        className={`rounded-[30px] border-4 border-neutral-700 p-3 flex flex-col gap-3 h-[560px] ${dark ? 'bg-[#1c1410] text-white' : 'bg-white text-neutral-900'}`}
      >
        <div className={`text-[11px] text-center ${dark ? 'opacity-70' : 'text-neutral-500'}`}>Pratinjau tampilan Els App</div>
        {!dark ? (
          <div className="rounded-xl aspect-square w-32 mx-auto bg-neutral-200 bg-cover bg-center" style={{ backgroundImage: song.album.coverUrl ? `url(${song.album.coverUrl})` : undefined }} />
        ) : null}
        <div className="flex rounded-full overflow-hidden border text-xs" style={{ borderColor: dark ? 'rgba(255,255,255,.3)' : '#d4d4d4' }}>
          {(['VOKAL', 'KARAOKE'] as const).map((m) => (
            <button
              key={m}
              onClick={() => switchMode(m)}
              disabled={m === 'KARAOKE' && !song.hasKaraoke}
              className={`flex-1 py-1.5 disabled:opacity-40 ${mode === m ? 'bg-orange-500 text-white' : ''}`}
            >
              {m === 'VOKAL' ? 'Vokal' : 'Karaoke'}
            </button>
          ))}
        </div>
        {!dark ? (
          <div>
            <div className="font-semibold text-sm truncate">{song.judul}</div>
            <div className="text-[11px] text-neutral-500 truncate">{[song.ciptaan && `Cipt. ${song.ciptaan}`, song.tahun].filter(Boolean).join(' · ')}</div>
          </div>
        ) : null}
        <div ref={listRef} className="flex-1 overflow-y-auto relative text-center px-1" style={{ lineHeight: dark ? 1.9 : 1.7 }}>
          {lines.length === 0 ? (
            <div className="text-xs opacity-60 mt-6">Belum ada lirik</div>
          ) : (
            lines.map((l, i) => (
              <div
                key={i}
                data-i={i}
                onClick={() => {
                  if (l.t !== null && audio.current) {
                    audio.current.currentTime = l.t;
                    void audio.current.play();
                  }
                }}
                className={`cursor-pointer transition-all ${dark ? 'text-[15px]' : 'text-sm'} ${
                  !timed ? '' : i === active ? `font-semibold ${dark ? 'text-orange-300 text-[17px]' : 'text-orange-600'}` : 'opacity-50'
                }`}
              >
                {l.line}
              </div>
            ))
          )}
        </div>
        <div className="h-1 rounded-full overflow-hidden" style={{ background: dark ? 'rgba(255,255,255,.25)' : '#e5e5e5' }}>
          <div className="h-1 bg-orange-500" style={{ width: dur ? `${Math.min(100, (cur / dur) * 100)}%` : '0%' }} />
        </div>
        <div className="flex justify-between text-[11px] opacity-70">
          <span>{fmtDur(cur)}</span>
          <span>{fmtDur(dur)}</span>
        </div>
        <div className="flex items-center justify-around">
          <button onClick={() => audio.current && (audio.current.currentTime = Math.max(0, audio.current.currentTime - 10))} aria-label="Mundur 10 detik">
            <RotateCcw className="w-5 h-5" />
          </button>
          <button
            onClick={() => {
              const a = audio.current;
              if (!a) return;
              if (a.paused) void a.play();
              else a.pause();
            }}
            disabled={!src}
            className="w-11 h-11 rounded-full bg-orange-500 text-white flex items-center justify-center disabled:opacity-40"
          >
            {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
          </button>
          <button onClick={() => audio.current && (audio.current.currentTime = audio.current.currentTime + 10)} aria-label="Maju 10 detik">
            <RotateCw className="w-5 h-5" />
          </button>
        </div>
        {src ? (
          <audio
            ref={audio}
            src={src}
            preload="auto"
            onTimeUpdate={(e) => setCur(e.currentTarget.currentTime)}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onLoadedMetadata={(e) => {
              const r = resume.current;
              if (r) {
                e.currentTarget.currentTime = r.t;
                if (r.play) void e.currentTarget.play();
                resume.current = null;
              }
            }}
          />
        ) : null}
      </div>

      <div className="space-y-3">
        <div className="font-semibold text-neutral-900">Cek otomatis</div>
        {checks.map((c, i) => (
          <div key={i} className="flex items-start gap-2">
            {c.ok ? <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" /> : <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />}
            <div className="flex-1">
              <div className="text-sm text-neutral-900">{c.label}</div>
              {c.detail ? <div className="text-xs text-neutral-500">{c.detail}</div> : null}
            </div>
            {c.line !== undefined ? (
              <button onClick={() => onFix(c.line!)} className="text-xs text-brand-600 hover:underline shrink-0">
                Perbaiki sinkron
              </button>
            ) : null}
          </div>
        ))}
        <div className="text-xs text-neutral-500 border-t border-neutral-100 pt-3">
          Ketuk baris lirik di pratinjau untuk lompat ke detik itu. Uji Putar memakai sinkron di editor (termasuk yang belum disimpan).
        </div>
        <div className="flex items-start gap-2 bg-neutral-50 rounded-lg p-3 text-xs text-neutral-600">
          <Smartphone className="w-4 h-4 shrink-0" />
          <div>
            <b className="font-semibold">Pratinjau di HP</b> — selama masih draft, lagu ini juga muncul di Els App untuk akun dengan akses menu ECC Worship (berlabel
            Draft). Jemaat lain belum bisa melihatnya.
          </div>
        </div>
        {!published ? (
          <button
            onClick={onPublish}
            disabled={publishing || !song.hasAudio}
            className="h-9 px-4 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 rounded-lg disabled:opacity-40"
          >
            Publikasikan {song.album.tipe === 'SINGLE' ? 'single' : 'lagu & album'}
          </button>
        ) : (
          <div className="text-sm text-green-700 font-medium">Sudah dipublikasikan — terlihat oleh jemaat.</div>
        )}
      </div>
    </div>
  );
}
