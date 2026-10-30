/**
 * Kirim backup database terenkripsi tiap bulan via email (kepatuhan no. 12 —
 * salinan di luar server). Email berisi LINK unduh bertanda tangan (bukan
 * lampiran — ukuran backup bisa besar). File tetap terenkripsi AES-256-GCM;
 * hanya bisa dibuka dengan DATA_ENCRYPTION_KEY (restore lewat Portal →
 * Maintenance → Upload backup).
 *
 * Jadwal: dicek tiap jam. Kirim bila tanggal WIB ≥ dayOfMonth & jam WIB ≥ hour
 * dan bulan ini belum terkirim (menyusul otomatis bila server sempat mati).
 */
import crypto from 'node:crypto';
import { prisma } from '@ecc/database';
import { logger } from './logger.js';
import { sendEmail } from './sendgrid.js';
import { encryptionEnabled } from './crypto-at-rest.js';
import { getJob, isSafeBackupName, startBackup } from './db-backup.js';

const SECRET = process.env.BACKUP_LINK_SECRET ?? process.env.REPORT_LINK_SECRET ?? process.env.JWT_SECRET ?? 'dev-backup-secret';
const sign = (body: string) => crypto.createHmac('sha256', SECRET).update(`backup:${body}`).digest('base64url');

export function createBackupDownloadToken(file: string, validDays: number): string {
  const body = Buffer.from(JSON.stringify({ f: file, exp: Math.floor(Date.now() / 1000) + validDays * 86400 })).toString('base64url');
  return `${body}.${sign(body)}`;
}

export function verifyBackupDownloadToken(token: string): string | null {
  const [body, sig] = String(token).split('.');
  if (!body || !sig) return null;
  const a = Buffer.from(sign(body));
  const b = Buffer.from(sig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as { f: string; exp: number };
    if (!isSafeBackupName(p.f) || !Number.isFinite(p.exp) || p.exp < Date.now() / 1000) return null;
    return p.f;
  } catch {
    return null;
  }
}

export async function getBackupEmailConfig() {
  return prisma.backupEmailConfig.upsert({ where: { id: 'global' }, create: { id: 'global' }, update: {} });
}

/** Tanggal/jam WIB saat ini. */
function wibNow(now = new Date()) {
  const w = new Date(now.getTime() + 7 * 3600_000);
  return { day: w.getUTCDate(), hour: w.getUTCHours(), month: `${w.getUTCFullYear()}-${String(w.getUTCMonth() + 1).padStart(2, '0')}`, label: w.toLocaleDateString('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' }) };
}

async function waitForJob(id: string, timeoutMs = 45 * 60_000) {
  const start = Date.now();
  for (;;) {
    const j = getJob(id);
    if (!j) throw new Error('Job backup hilang.');
    if (j.status !== 'RUNNING') return j;
    if (Date.now() - start > timeoutMs) throw new Error('Backup terlalu lama (timeout).');
    await new Promise((r) => setTimeout(r, 2000));
  }
}

function emailHtml(opts: { url: string; file: string; validDays: number; monthLabel: string; manual: boolean }) {
  return `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937;max-width:560px">
  <div style="background:#ea580c;color:#fff;padding:16px 20px;border-radius:10px 10px 0 0">
    <div style="font-size:12px;opacity:.9">Els App · Compliance</div>
    <div style="font-size:18px;font-weight:bold">Backup database ${opts.manual ? '(kirim uji)' : `bulan ${opts.monthLabel}`}</div>
  </div>
  <div style="border:1px solid #fed7aa;border-top:0;padding:18px 20px;border-radius:0 0 10px 10px">
    <p>Salinan backup database Els App sudah siap. Simpan file ini di <b>luar server</b> (mis. Google Drive / harddisk gereja) sebagai cadangan bila server bermasalah.</p>
    <p style="text-align:center;margin:22px 0"><a href="${opts.url}" style="background:#ea580c;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold">Unduh backup</a></p>
    <ul style="font-size:13px;color:#4b5563;padding-left:18px">
      <li>File: <code>${opts.file}</code></li>
      <li>Link berlaku <b>${opts.validDays} hari</b>.</li>
      <li>File <b>terenkripsi (AES-256)</b> — hanya bisa dibuka dengan kunci DATA_ENCRYPTION_KEY yang disimpan pengurus. Pemulihan: Portal → Maintenance → Backup → Upload.</li>
      <li>Jangan meneruskan email ini ke orang lain.</li>
    </ul>
    <p style="font-size:12px;color:#9ca3af">Dikirim otomatis oleh Els App. Atur penerima & jadwal di Portal → Compliance → Kirim Backup Bulanan.</p>
  </div></div>`;
}

let running = false;

/** Buat backup baru lalu kirim link unduh ke semua penerima. */
export async function runBackupEmail(opts: { manual: boolean; apiBase: string; byUserId?: string | null }) {
  if (running) throw new Error('Pengiriman backup sedang berjalan.');
  running = true;
  const cfg = await getBackupEmailConfig();
  const now = wibNow();
  try {
    if (!cfg.recipients.length) throw new Error('Belum ada penerima email.');
    if (!encryptionEnabled()) throw new Error('DATA_ENCRYPTION_KEY belum di-set — backup tidak dikirim tanpa enkripsi.');
    const job = await waitForJob(startBackup(opts.byUserId ?? null).id);
    if (job.status !== 'SUCCESS' || !job.file) throw new Error(job.error ?? 'Backup gagal.');
    const url = `${opts.apiBase.replace(/\/$/, '')}/public/backup/${createBackupDownloadToken(job.file, cfg.linkValidDays)}`;
    const subject = opts.manual ? 'Backup Els App (kirim uji)' : `Backup bulanan Els App — ${now.label}`;
    const html = emailHtml({ url, file: job.file, validDays: cfg.linkValidDays, monthLabel: now.label, manual: opts.manual });
    const failed: string[] = [];
    for (const to of cfg.recipients) {
      await sendEmail({ to, subject, html, text: `Unduh backup (berlaku ${cfg.linkValidDays} hari): ${url}` }).catch((e) => {
        logger.warn({ to, err: (e as Error).message }, '[backup-email] gagal kirim');
        failed.push(to);
      });
    }
    if (failed.length === cfg.recipients.length) throw new Error(`Email gagal terkirim ke semua penerima (${failed.join(', ')}).`);
    await prisma.backupEmailConfig.update({
      where: { id: 'global' },
      data: {
        lastSentAt: new Date(),
        lastStatus: 'SUCCESS',
        lastError: failed.length ? `Gagal ke: ${failed.join(', ')}` : null,
        lastFile: job.file,
        ...(opts.manual ? {} : { lastScheduledMonth: now.month }),
      },
    });
    return { file: job.file, sent: cfg.recipients.length - failed.length, failed };
  } catch (e) {
    await prisma.backupEmailConfig.update({
      where: { id: 'global' },
      data: { lastStatus: 'FAILED', lastError: (e as Error).message.slice(0, 1000), lastSentAt: new Date() },
    });
    throw e;
  } finally {
    running = false;
  }
}

/** Dipanggil tiap jam oleh scheduled-jobs. */
export async function backupEmailTick(apiBase: string) {
  const cfg = await getBackupEmailConfig();
  if (!cfg.isEnabled) return { skipped: 'disabled' };
  const now = wibNow();
  if (cfg.lastScheduledMonth === now.month) return { skipped: 'sent-this-month' };
  if (now.day < cfg.dayOfMonth || (now.day === cfg.dayOfMonth && now.hour < cfg.hour)) return { skipped: 'not-yet' };
  // Gagal di bulan ini → coba lagi paling cepat 6 jam kemudian.
  if (cfg.lastStatus === 'FAILED' && cfg.lastSentAt && Date.now() - cfg.lastSentAt.getTime() < 6 * 3600_000) return { skipped: 'retry-later' };
  return runBackupEmail({ manual: false, apiBase });
}
