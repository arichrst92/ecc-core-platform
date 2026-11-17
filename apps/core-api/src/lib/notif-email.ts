/**
 * Notifikasi lewat email — antrean bertahap di memori supaya kuota & reputasi
 * pengirim aman (1 email tiap NOTIF_EMAIL_DELAY_MS, default 1,5 detik).
 * Dipakai lib/notification (fan-out dari notifikasi in-app) dan job terjadwal
 * (pengingat H-1, ulang tahun). Gagal kirim hanya dicatat di log.
 */
import { prisma } from '@ecc/database';
import { logger } from './logger.js';
import { sendEmail } from './sendgrid.js';
import { categoryOf, getCommPrefs } from './comm-prefs.js';
import { mdToPlain } from '@ecc/shared-types';

interface Job {
  to: string;
  nama: string;
  title: string;
  body: string;
  actionUrl?: string | null;
}

const queue: Job[] = [];
const MAX_QUEUE = Number(process.env.NOTIF_EMAIL_MAX_QUEUE ?? 5000);
const DELAY_MS = Number(process.env.NOTIF_EMAIL_DELAY_MS ?? 1500);
let running = false;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function appUrl(actionUrl?: string | null): string | null {
  if (!actionUrl) return null;
  if (/^https?:\/\//i.test(actionUrl)) return actionUrl;
  const base = (process.env.ELSAPP_WEB_URL || 'https://elsapp.eccchurch.global').replace(/\/$/, '');
  return `${base}${actionUrl.startsWith('/') ? '' : '/'}${actionUrl}`;
}

function html(j: Job): string {
  const brand = process.env.EMAIL_FROM_NAME || 'Elshaddai Creative Community';
  const url = appUrl(j.actionUrl);
  const body = esc(j.body).replace(/\n/g, '<br>');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111827;">
<div style="max-width:560px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.06);">
  <div style="background:linear-gradient(135deg,#F26522,#F5A623);padding:22px 28px;color:#fff;">
    <div style="font-size:13px;opacity:.9;">${esc(brand)} · Els App</div>
    <div style="font-size:20px;font-weight:700;margin-top:4px;">${esc(j.title)}</div>
  </div>
  <div style="padding:24px 28px;font-size:15px;line-height:1.6;color:#374151;">
    <p style="margin:0 0 12px;">Halo <b>${esc(j.nama)}</b>,</p>
    <p style="margin:0 0 20px;">${body}</p>
    ${url ? `<p style="margin:0 0 8px;"><a href="${esc(url)}" style="display:inline-block;padding:11px 22px;background:#F26522;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">Buka di Els App</a></p>` : ''}
  </div>
  <div style="padding:14px 28px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;line-height:1.6;">
    Email otomatis, jangan dibalas. Atur jenis pesan yang Anda terima di Els App → Profil → Privasi.
  </div>
</div></body></html>`;
}

async function drain() {
  if (running) return;
  running = true;
  try {
    while (queue.length) {
      const j = queue.shift()!;
      try {
        await sendEmail({ to: j.to, subject: j.title, html: html(j) });
      } catch (err) {
        logger.warn({ err: (err as Error).message, to: j.to, title: j.title }, '[notif-email] gagal kirim');
      }
      if (queue.length) await new Promise((r) => setTimeout(r, DELAY_MS));
    }
  } finally {
    running = false;
  }
}

export function enqueueNotifEmail(job: Job): void {
  if (queue.length >= MAX_QUEUE) {
    logger.warn({ to: job.to }, '[notif-email] antrean penuh — email dilewati');
    return;
  }
  // Isi in-app / WA bisa mengandung markdown (*tebal*) → teks biasa.
  queue.push({ ...job, body: mdToPlain(job.body) });
  void drain();
}

/**
 * Kirim notifikasi email ke jemaat bila saluran mengizinkan.
 *   always = saluran Email aktif; waFallback = hanya bila jemaat tanpa nomor WhatsApp.
 * Menghormati preferensi pesan jemaat (Profil → Privasi), kategori sama dengan WhatsApp.
 */
export async function notifyByEmail(args: {
  jemaatIds: string[];
  key: string;
  always: boolean;
  waFallback: boolean;
  title: string;
  body: string;
  actionUrl?: string | null;
}): Promise<number> {
  if (!args.always && !args.waFallback) return 0;
  if (!args.jemaatIds.length) return 0;
  const people = await prisma.jemaat.findMany({
    where: { id: { in: args.jemaatIds }, isActive: true, email: { not: null }, dataPurgedAt: null },
    select: { id: true, namaLengkap: true, email: true, noHp: true },
  });
  const field = { reminders: 'waReminders', greetings: 'waGreetings', updates: 'waUpdates' } as const;
  let n = 0;
  for (const p of people) {
    if (!args.always && p.noHp) continue; // waFallback: hanya yang tidak punya WhatsApp
    const prefs = await getCommPrefs(p.id);
    if (!prefs[field[categoryOf(args.key)]]) continue;
    enqueueNotifEmail({ to: p.email!, nama: p.namaLengkap, title: args.title, body: args.body, actionUrl: args.actionUrl });
    n++;
  }
  return n;
}

export function notifEmailQueueSize(): number {
  return queue.length;
}
