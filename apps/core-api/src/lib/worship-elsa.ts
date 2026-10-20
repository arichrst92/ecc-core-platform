/**
 * "Sinkronkan dengan Elsa" — worker sinkron lirik otomatis (ECC Worship).
 *
 * Mesin: whisper.cpp self-hosted (CLI `whisper-cli`) di VPS yang sama.
 * Nama "Elsa" dipakai di UI; nama whisper hanya di kode & log.
 *
 * Aturan beban (VPS 2 vCPU):
 *   - 1 job per kali, prioritas terendah (nice -n 19).
 *   - Siang 1 thread; malam 00:00–05:00 WIB 2 thread.
 *   - Kualitas TELITI (model medium) hanya diproses di jendela malam.
 *
 * Env:
 *   WHISPER_BIN        default "whisper-cli"
 *   WHISPER_MODEL_DIR  default "/opt/whisper/models" (ggml-small.bin, ggml-medium.bin)
 *   FFMPEG_BIN         default "ffmpeg"
 *   WORSHIP_ELSA_DISABLED=1 → worker tidak jalan
 */
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { prisma } from '@ecc/database';
import { logger } from './logger.js';
import { alignLyrics, parseWhisperProgress, parseWhisperSegmentLine, wordsFromWhisperJson } from './worship-align.js';
import { worshipFilePath } from './worship-media.js';

const TICK_MS = 10_000;
const UPDATE_MS = 2_000;
const WHISPER_BIN = process.env.WHISPER_BIN ?? 'whisper-cli';
const FFMPEG_BIN = process.env.FFMPEG_BIN ?? 'ffmpeg';
const MODEL_DIR = process.env.WHISPER_MODEL_DIR ?? '/opt/whisper/models';
const MODEL = { CEPAT: 'ggml-small.bin', TELITI: 'ggml-medium.bin' } as const;

let running: { jobId: string; child: ChildProcess | null } | null = null;

/** Jam WIB sekarang (0–23). */
function jakartaHour(d = new Date()): number {
  return Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Asia/Jakarta' }).format(d)) % 24;
}
export function isNightWindow(d = new Date()): boolean {
  const h = jakartaHour(d);
  return h >= 0 && h < 5;
}

class ElsaError extends Error {}

function run(cmd: string, args: string[], onStdout?: (s: string) => void, onStderr?: (s: string) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('nice', ['-n', '19', cmd, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    if (running) running.child = child;
    child.stdout.on('data', (b: Buffer) => onStdout?.(b.toString()));
    child.stderr.on('data', (b: Buffer) => onStderr?.(b.toString()));
    child.on('error', (e: NodeJS.ErrnoException) =>
      reject(e.code === 'ENOENT' ? new ElsaError(`Elsa belum siap di server (${cmd} belum terpasang).`) : e),
    );
    child.on('close', (code, signal) => {
      if (running) running.child = null;
      if (signal === 'SIGKILL' || signal === 'SIGTERM') return reject(new ElsaError('Dibatalkan.'));
      if (code === 0) resolve();
      else reject(new ElsaError(`${path.basename(cmd)} gagal (kode ${code}).`));
    });
  });
}

async function processJob(jobId: string) {
  const job = await prisma.worshipSyncJob.findUnique({
    where: { id: jobId },
    select: { id: true, quality: true, threads: true, song: { select: { audioFile: true, durasi: true, lirik: true } } },
  });
  if (!job) return;
  if (!job.song.audioFile) throw new ElsaError('Lagu belum punya audio vokal.');
  if (!job.song.lirik?.trim()) throw new ElsaError('Lirik lagu masih kosong — ketik lirik dulu.');
  const model = path.join(MODEL_DIR, MODEL[job.quality]);
  await fs.access(model).catch(() => {
    throw new ElsaError(`Elsa belum siap di server (model ${MODEL[job.quality]} belum diunduh).`);
  });

  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'elsa-'));
  const started = Date.now();
  let lastWrite = 0;
  let progress = 0;
  let processedSec = 0;
  const preview: string[] = [];
  const duration = job.song.durasi ?? 0;

  const write = async (force = false) => {
    if (!force && Date.now() - lastWrite < UPDATE_MS) return;
    lastWrite = Date.now();
    const elapsed = (Date.now() - started) / 1000;
    const frac = progress / 100;
    const eta = frac > 0.05 ? Math.round((elapsed / frac) * (1 - frac)) : null;
    const cur = await prisma.worshipSyncJob.update({
      where: { id: jobId },
      data: { progress, processedSec, etaSec: eta, preview: preview.slice(-24).join(' ') },
      select: { status: true },
    });
    if (cur.status === 'CANCELLED') running?.child?.kill('SIGKILL');
  };

  try {
    // 1) Siapkan audio: 16 kHz mono WAV.
    await prisma.worshipSyncJob.update({ where: { id: jobId }, data: { stage: 'PREPARE', progress: 2 } });
    const wav = path.join(tmp, 'in.wav');
    await run(FFMPEG_BIN, ['-y', '-loglevel', 'error', '-i', worshipFilePath(job.song.audioFile), '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', wav]);

    // 2) Elsa mendengarkan (whisper.cpp, kata per kata).
    await prisma.worshipSyncJob.update({ where: { id: jobId }, data: { stage: 'TRANSCRIBE', progress: 5 } });
    progress = 5;
    const outBase = path.join(tmp, 'out');
    let lineBuf = '';
    await run(
      WHISPER_BIN,
      ['-m', model, '-f', wav, '-l', 'id', '-t', String(job.threads ?? 1), '-ml', '1', '-sow', '-oj', '-of', outBase, '-pp'],
      (s) => {
        lineBuf += s;
        const lines = lineBuf.split('\n');
        lineBuf = lines.pop() ?? '';
        for (const l of lines) {
          const seg = parseWhisperSegmentLine(l);
          if (!seg) continue;
          processedSec = seg.end;
          if (seg.text) preview.push(seg.text);
          if (duration > 0) progress = Math.max(progress, Math.min(94, 5 + Math.round((seg.end / duration) * 90)));
        }
        void write();
      },
      (s) => {
        const p = parseWhisperProgress(s);
        if (p !== null) progress = Math.max(progress, Math.min(94, 5 + Math.round(p * 0.9)));
        void write();
      },
    );
    await write(true);

    // 3) Cocokkan ke lirik.
    await prisma.worshipSyncJob.update({ where: { id: jobId }, data: { stage: 'ALIGN', progress: 96 } });
    const json = JSON.parse(await fs.readFile(`${outBase}.json`, 'utf8'));
    const words = wordsFromWhisperJson(json);
    if (words.length === 0) throw new ElsaError('Elsa tidak menemukan vokal di lagu ini.');
    const result = alignLyrics(job.song.lirik.split(/\r?\n/), words, duration || undefined);
    await prisma.worshipSyncJob.updateMany({
      where: { id: jobId, status: 'RUNNING' },
      data: { status: 'DONE', stage: 'ALIGN', progress: 100, etaSec: 0, result: result as never, finishedAt: new Date() },
    });
    logger.info({ jobId, lines: result.length, sec: Math.round((Date.now() - started) / 1000) }, '[elsa-worship] selesai');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}

async function tick() {
  if (running) return;
  const night = isNightWindow();
  const next = await prisma.worshipSyncJob.findFirst({
    where: { status: 'QUEUED', ...(night ? {} : { quality: 'CEPAT' }) },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  if (!next) return;
  const threads = night ? Math.max(1, Math.min(2, os.cpus().length)) : 1;
  const claimed = await prisma.worshipSyncJob.updateMany({
    where: { id: next.id, status: 'QUEUED' },
    data: { status: 'RUNNING', startedAt: new Date(), threads, stage: 'PREPARE', progress: 0, error: null },
  });
  if (claimed.count === 0) return;
  running = { jobId: next.id, child: null };
  try {
    await processJob(next.id);
  } catch (e) {
    const msg = e instanceof ElsaError ? e.message : 'Terjadi kesalahan saat Elsa memproses lagu.';
    if (!(e instanceof ElsaError)) logger.error({ err: (e as Error).message, jobId: next.id }, '[elsa-worship] gagal');
    const cur = await prisma.worshipSyncJob.findUnique({ where: { id: next.id }, select: { status: true } });
    if (cur && cur.status !== 'CANCELLED') {
      await prisma.worshipSyncJob.update({
        where: { id: next.id },
        data: { status: 'FAILED', error: msg, finishedAt: new Date() },
      });
    }
  } finally {
    running = null;
  }
}

/** Batalkan job yang sedang berjalan di proses ini (dipanggil route cancel). */
export function killRunningElsaJob(jobId: string) {
  if (running?.jobId === jobId) running.child?.kill('SIGKILL');
}

export function startWorshipElsaWorker() {
  if (process.env.WORSHIP_ELSA_DISABLED === '1') return;
  // Job yang tertinggal RUNNING (server restart) → antri ulang.
  void prisma.worshipSyncJob
    .updateMany({ where: { status: 'RUNNING' }, data: { status: 'QUEUED', stage: null, progress: 0 } })
    .catch(() => {});
  const timer = setInterval(() => {
    tick().catch((e) => logger.error({ err: (e as Error).message }, '[elsa-worship] tick error'));
  }, TICK_MS);
  timer.unref();
}

/** Cari binary di PATH (atau path absolut). */
async function binExists(bin: string): Promise<boolean> {
  const candidates = bin.includes('/') ? [bin] : (process.env.PATH ?? '').split(':').filter(Boolean).map((d) => path.join(d, bin));
  for (const c of candidates) {
    try {
      await fs.access(c, fs.constants.X_OK);
      return true;
    } catch {
      /* lanjut */
    }
  }
  return false;
}

/** Kesiapan Elsa (untuk Server Health). */
export async function elsaReadiness() {
  const [ffmpeg, whisper, small, medium] = await Promise.all([
    binExists(FFMPEG_BIN),
    binExists(WHISPER_BIN),
    fs.access(path.join(MODEL_DIR, MODEL.CEPAT)).then(() => true, () => false),
    fs.access(path.join(MODEL_DIR, MODEL.TELITI)).then(() => true, () => false),
  ]);
  return {
    enabled: process.env.WORSHIP_ELSA_DISABLED !== '1',
    ffmpeg,
    whisper,
    modelCepat: small,
    modelTeliti: medium,
    runningJobId: running?.jobId ?? null,
    nightWindow: isNightWindow(),
  };
}
