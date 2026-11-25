/**
 * Pengirim email (SendGrid) — diatur dari Portal → WhatsApp & Email Config.
 * Nilai NULL di app_config = ikuti .env (EMAIL_FROM / EMAIL_FROM_NAME).
 * Di-cache di memori (dimuat saat dipakai, tiap 30 detik, & langsung setelah disimpan).
 *
 * Juga: status koneksi SendGrid (kunci API, pengirim terverifikasi, kredit, statistik)
 * dan catatan kirim terakhir (sejak server start).
 */
import { prisma } from '@ecc/database';
import { logger } from './logger.js';

export interface EmailSenderSettings {
  emailFromAddress: string | null;
  emailFromName: string | null;
  emailReplyTo: string | null;
}

const DEF_FROM = 'noreply@eccchurch.global';
const DEF_NAME = 'Elshaddai Creative Community';

let current: EmailSenderSettings = { emailFromAddress: null, emailFromName: null, emailReplyTo: null };
let loadedAt = 0;
const TTL_MS = 30_000;

export async function loadEmailRuntime(force = false): Promise<EmailSenderSettings> {
  if (!force && loadedAt && Date.now() - loadedAt < TTL_MS) return current;
  try {
    const row = await prisma.appConfig.findUnique({
      where: { id: 'global' },
      select: { emailFromAddress: true, emailFromName: true, emailReplyTo: true },
    });
    current = row ?? { emailFromAddress: null, emailFromName: null, emailReplyTo: null };
    loadedAt = Date.now();
  } catch (err) {
    logger.warn({ err }, '[email-runtime] gagal memuat pengaturan — pakai nilai terakhir');
  }
  return current;
}

export async function saveEmailRuntime(patch: Partial<EmailSenderSettings>, userId: string | null) {
  const data = { ...patch, updatedByUserId: userId };
  await prisma.appConfig.upsert({ where: { id: 'global' }, create: { id: 'global', ...data }, update: data });
  return loadEmailRuntime(true);
}

/** Pengirim efektif (Portal → .env → bawaan). */
export function effectiveSender() {
  return {
    email: current.emailFromAddress || process.env.EMAIL_FROM || DEF_FROM,
    name: current.emailFromName || process.env.EMAIL_FROM_NAME || DEF_NAME,
    replyTo: current.emailReplyTo || null,
    source: {
      email: current.emailFromAddress ? 'portal' : process.env.EMAIL_FROM ? 'env' : 'default',
      name: current.emailFromName ? 'portal' : process.env.EMAIL_FROM_NAME ? 'env' : 'default',
    },
  };
}

// ------------------------------------------------------------------ catatan kirim
type SendLog = { at: string; to: string; subject: string; error?: string };
const health = { sent: 0, failed: 0, lastOk: null as SendLog | null, lastFail: null as SendLog | null, since: new Date().toISOString() };

const mask = (e: string) => e.replace(/^(.{2}).*(@.*)$/, '$1***$2');

export function markEmailSent(to: string, subject: string) {
  health.sent++;
  health.lastOk = { at: new Date().toISOString(), to: mask(to), subject };
}
export function markEmailFailed(to: string, subject: string, error: string) {
  health.failed++;
  health.lastFail = { at: new Date().toISOString(), to: mask(to), subject, error: error.slice(0, 300) };
}
export const emailHealth = () => ({ ...health });

// ------------------------------------------------------------------ status SendGrid
const SG = 'https://api.sendgrid.com/v3';

async function sg<T>(path: string): Promise<{ ok: true; data: T } | { ok: false; status: number; message: string }> {
  const key = process.env.SENDGRID_API_KEY;
  if (!key) return { ok: false, status: 0, message: 'SENDGRID_API_KEY belum diisi' };
  try {
    const res = await fetch(`${SG}${path}`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(8000) });
    const body = (await res.json().catch(() => null)) as { errors?: { message?: string }[] } | null;
    if (!res.ok) return { ok: false, status: res.status, message: body?.errors?.[0]?.message ?? res.statusText };
    return { ok: true, data: body as T };
  } catch (err) {
    return { ok: false, status: 0, message: (err as Error).message };
  }
}

/** Alamat pengirim terverifikasi? (Single Sender terverifikasi ATAU domain ter-autentikasi). null = tidak bisa dicek. */
export async function senderVerified(email: string): Promise<{ verified: boolean | null; via: string | null; note?: string }> {
  const domain = email.split('@')[1]?.toLowerCase() ?? '';
  const [doms, senders] = await Promise.all([
    sg<{ domain: string; valid: boolean }[]>('/whitelabel/domains?limit=50'),
    sg<{ results?: { from_email: string; verified: boolean }[] }>('/verified_senders?limit=100'),
  ]);
  if (doms.ok && doms.data.some((d) => d.valid && (domain === d.domain.toLowerCase() || domain.endsWith(`.${d.domain.toLowerCase()}`)))) {
    return { verified: true, via: `domain ${domain} ter-autentikasi` };
  }
  if (senders.ok && (senders.data.results ?? []).some((x) => x.verified && x.from_email.toLowerCase() === email.toLowerCase())) {
    return { verified: true, via: 'Single Sender terverifikasi' };
  }
  if (!doms.ok && !senders.ok) return { verified: null, via: null, note: 'Kunci API tidak punya izin membaca pengirim/domain — tidak bisa dicek.' };
  return { verified: false, via: null };
}

export async function sendgridStatus() {
  const configured = !!process.env.SENDGRID_API_KEY;
  if (!configured) return { configured, keyValid: false as const, error: 'SENDGRID_API_KEY belum diisi di .env VPS.' };
  const scopes = await sg<{ scopes: string[] }>('/scopes');
  if (!scopes.ok) {
    return {
      configured,
      keyValid: false as const,
      error: scopes.status === 401 || scopes.status === 403 ? 'Kunci API SendGrid ditolak (salah / dicabut).' : `Tidak bisa menghubungi SendGrid: ${scopes.message}`,
    };
  }
  const sc = new Set(scopes.data.scopes);
  const sender = effectiveSender();
  const start = new Date(Date.now() - 6 * 86_400_000).toISOString().slice(0, 10);
  const [verify, credits, stats] = await Promise.all([
    senderVerified(sender.email),
    sc.has('user.credits.read') ? sg<{ remain: number; total: number; used: number; next_reset?: string; reset_frequency?: string }>('/user/credits') : null,
    sc.has('stats.read') ? sg<{ date: string; stats: { metrics: Record<string, number> }[] }[]>(`/stats?start_date=${start}`) : null,
  ]);
  let stats7: Record<string, number> | null = null;
  if (stats?.ok) {
    stats7 = {};
    for (const day of stats.data)
      for (const st of day.stats ?? [])
        for (const [k, v] of Object.entries(st.metrics ?? {})) stats7[k] = (stats7[k] ?? 0) + (Number(v) || 0);
  }
  return {
    configured,
    keyValid: true as const,
    canSend: sc.has('mail.send'),
    sender,
    senderCheck: verify,
    credits: credits?.ok ? credits.data : null,
    stats7: stats7
      ? {
          requests: stats7.requests ?? 0,
          delivered: stats7.delivered ?? 0,
          bounces: stats7.bounces ?? 0,
          blocks: stats7.blocks ?? 0,
          spamReports: stats7.spam_reports ?? 0,
          invalidEmails: stats7.invalid_emails ?? 0,
          deferred: stats7.deferred ?? 0,
        }
      : null,
  };
}
