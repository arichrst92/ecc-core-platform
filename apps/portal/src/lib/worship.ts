/** ECC Worship (portal) — tipe & helper. */
import { WORSHIP_DURATION_TOLERANCE_SEC } from '@ecc/shared-types';

export interface ElsaJobLite {
  id: string;
  status: 'QUEUED' | 'RUNNING' | 'DONE' | 'FAILED' | 'CANCELLED';
  quality: 'CEPAT' | 'TELITI';
  stage: 'PREPARE' | 'TRANSCRIBE' | 'ALIGN' | null;
  progress: number;
  etaSec: number | null;
  createdAt: string;
}
export interface ElsaJob extends ElsaJobLite {
  songId: string;
  processedSec: number | null;
  threads: number | null;
  preview: string | null;
  result: { t: number; line: string; confidence: number }[] | null;
  error: string | null;
  queuePosition: number | null;
  waitingForNight: boolean;
}
export interface SyncLine {
  t: number;
  line: string;
}
export interface WorshipSong {
  id: string;
  albumId: string;
  judul: string;
  ciptaan: string | null;
  tahun: number | null;
  lirik: string | null;
  lirikSinkron: SyncLine[] | null;
  urutan: number;
  isPublished: boolean;
  hasAudio: boolean;
  audioSize: number | null;
  durasi: number | null;
  hasKaraoke: boolean;
  karaokeSize: number | null;
  karaokeDurasi: number | null;
  playsVokal: number;
  playsKaraoke: number;
  syncedLines: number;
  lastJob: ElsaJobLite | null;
  updatedAt: string;
}
export interface WorshipAlbum {
  id: string;
  tipe: 'ALBUM' | 'SINGLE';
  judul: string;
  tahun: number | null;
  deskripsi: string | null;
  coverUrl: string | null;
  urutan: number;
  isPublished: boolean;
  songs: WorshipSong[];
}
export interface WorshipSongDetail extends WorshipSong {
  album: { id: string; tipe: 'ALBUM' | 'SINGLE'; judul: string; coverUrl: string | null; isPublished: boolean };
}

export const fmtDur = (sec: number | null | undefined) => {
  if (sec === null || sec === undefined || !Number.isFinite(sec)) return '—';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
};
export const fmtTime = (sec: number) => {
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
};
export const fmtSize = (b: number | null | undefined) => (b ? `${(b / 1024 / 1024).toFixed(1)} MB` : '—');

/** Baris lirik yang dinyanyikan (non-kosong). */
export const lyricLines = (lirik: string | null | undefined) =>
  (lirik ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

export const ELSA_STAGE_LABEL: Record<string, string> = {
  PREPARE: 'Menyiapkan audio',
  TRANSCRIBE: 'Elsa sedang mendengarkan lagu…',
  ALIGN: 'Elsa sedang mencocokkan lirik…',
};
export const ELSA_QUALITY_LABEL = { CEPAT: 'Cepat', TELITI: 'Teliti' } as const;

export interface CheckItem {
  ok: boolean;
  label: string;
  detail?: string;
  /** index baris untuk "Perbaiki" */
  line?: number;
}

/** Cek otomatis sebelum publikasi (Uji Putar). */
export function songChecks(
  song: WorshipSongDetail,
  lines: { line: string; t: number | null }[],
  albumCover: string | null,
): CheckItem[] {
  const out: CheckItem[] = [];
  out.push(song.hasAudio ? { ok: true, label: `Audio vokal ${fmtDur(song.durasi)}` } : { ok: false, label: 'Audio vokal belum diunggah' });
  if (song.hasKaraoke && song.durasi && song.karaokeDurasi) {
    const diff = Math.abs(song.durasi - song.karaokeDurasi);
    out.push({
      ok: diff <= WORSHIP_DURATION_TOLERANCE_SEC,
      label: `Durasi vokal ${fmtDur(song.durasi)} · karaoke ${fmtDur(song.karaokeDurasi)}`,
      detail:
        diff <= WORSHIP_DURATION_TOLERANCE_SEC
          ? `Selisih ${diff.toFixed(1)} detik — aman untuk pindah mode`
          : `Selisih ${diff.toFixed(1)} detik — lirik tersinkron bisa meleset di mode karaoke`,
    });
  }
  const missing = lines.map((l, i) => (l.t === null ? i : -1)).filter((i) => i >= 0);
  if (lines.length === 0) out.push({ ok: false, label: 'Lirik masih kosong' });
  else if (missing.length === lines.length) out.push({ ok: false, label: 'Lirik belum disinkron', detail: 'Tampil sebagai lirik statis di app' });
  else if (missing.length)
    out.push({
      ok: false,
      label: `${missing.length} baris lirik belum ditandai waktunya`,
      detail: `Baris ${missing.map((i) => i + 1).slice(0, 6).join(', ')}${missing.length > 6 ? '…' : ''}`,
      line: missing[0],
    });
  for (let i = 1; i < lines.length; i++) {
    const a = lines[i - 1]!.t;
    const b = lines[i]!.t;
    if (a !== null && b !== null && b < a) {
      out.push({ ok: false, label: `Urutan waktu mundur di baris ${i + 1}`, detail: `${fmtTime(b)} lebih awal dari baris ${i} (${fmtTime(a)})`, line: i });
      break;
    }
  }
  const last = [...lines].reverse().find((l) => l.t !== null);
  if (last && song.durasi && last.t! > song.durasi) out.push({ ok: false, label: 'Waktu baris terakhir melewati durasi lagu', line: lines.indexOf(last) });
  const meta = [albumCover ? null : 'cover', song.ciptaan ? null : 'ciptaan', song.tahun ? null : 'tahun'].filter(Boolean);
  out.push(meta.length ? { ok: false, label: `Belum diisi: ${meta.join(', ')}` } : { ok: true, label: 'Cover, ciptaan & tahun terisi' });
  return out;
}
