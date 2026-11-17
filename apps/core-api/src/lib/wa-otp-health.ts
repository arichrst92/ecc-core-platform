/**
 * Deteksi gateway WhatsApp OTP yang "gagal diam-diam" — API menerima pesan
 * (status sukses) tetapi OTP tidak pernah sampai ke jemaat.
 *
 *   Lapis 1 — status device Fonnte dicek tiap 2 menit. Device terputus →
 *             Fonnte dilewati untuk OTP.
 *   Lapis 2 — bila N OTP berturut-turut dari satu provider tidak dipakai
 *             dalam 5 menit (N = Portal → Gateway & OTP, default 8), provider
 *             ditandai "diduga gagal" 15 menit dan dilewati untuk OTP.
 *             Pulih otomatis: ada OTP-nya yang ternyata dipakai, atau masa
 *             15 menit habis (provider dicoba lagi dengan hitungan baru).
 *
 * Provider yang dilewati diteruskan ke @ecc/auth (setWaOtpSkip). Bila semua
 * provider dilewati, /auth/otp/request langsung jatuh ke cadangan email.
 * Notifikasi non-OTP tidak terpengaruh (tetap lewat antrean wa-dispatch).
 */
import { prisma } from '@ecc/database';
import { getFonnteDevice, setWaOtpSkip, waProviderStatus, type WaProvider } from '@ecc/auth';
import { logger } from './logger.js';
import { sendEmail } from './sendgrid.js';
import { getBackupEmailConfig } from './backup-email.js';
import { waRuntimeSettings } from './wa-runtime.js';

export const OTP_UNUSED_AFTER_MS = 5 * 60_000;
export const SUSPECT_FOR_MS = 15 * 60_000;
const DEVICE_EVERY_MS = 2 * 60_000;
const TICK_MS = 60_000;
/** OTP yang lebih tua dari ini tidak dihitung (hindari menilai dari data basi). */
const LOOKBACK_MS = 3 * 60 * 60_000;
const OTP_PROVIDERS: WaProvider[] = ['resmi', 'fonnte'];

interface SuspectState {
  since: number;
  until: number;
  streak: number;
}
const suspect: Partial<Record<WaProvider, SuspectState>> = {};
/** OTP sebelum waktu ini diabaikan (di-reset setiap kali status diduga-gagal berakhir). */
const considerFrom: Partial<Record<WaProvider, number>> = {};
let device: { connected: boolean | null; number: string | null; checkedAt: number | null; error: string | null } = {
  connected: null,
  number: null,
  checkedAt: null,
  error: null,
};

/** Jumlah OTP tak terpakai berturut-turut dari yang terbaru (rows urut terbaru dulu). */
export function unusedStreak(rows: { usedAt: Date | null }[]): number {
  let n = 0;
  for (const r of rows) {
    if (r.usedAt) break;
    n++;
  }
  return n;
}

/** Keputusan murni (diuji di wa-otp-health.test.ts). */
export function decideSuspect(args: {
  current: SuspectState | undefined;
  streak: number;
  usedSinceSuspect: boolean;
  threshold: number;
  now: number;
}): { next: SuspectState | undefined; event: 'suspect' | 'recovered' | 'expired' | null } {
  const { current, streak, usedSinceSuspect, threshold, now } = args;
  if (current) {
    if (usedSinceSuspect) return { next: undefined, event: 'recovered' };
    if (now >= current.until) return { next: undefined, event: 'expired' };
    return { next: current, event: null };
  }
  if (threshold > 0 && streak >= threshold) {
    return { next: { since: now, until: now + SUSPECT_FOR_MS, streak }, event: 'suspect' };
  }
  return { next: undefined, event: null };
}

const NAME: Record<WaProvider, string> = { resmi: 'Resmi.ID', fonnte: 'Fonnte' };

async function alertAdmins(subject: string, body: string) {
  try {
    const env = (process.env.OPS_ALERT_EMAILS ?? '').split(',').map((x) => x.trim()).filter(Boolean);
    const to = env.length ? env : (await getBackupEmailConfig()).recipients;
    for (const addr of to) {
      await sendEmail({
        to: addr,
        subject,
        html: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937;max-width:560px">
<div style="background:#ea580c;color:#fff;padding:14px 18px;border-radius:10px 10px 0 0;font-weight:bold">${subject}</div>
<div style="border:1px solid #fed7aa;border-top:0;padding:16px 18px;border-radius:0 0 10px 10px">${body}
<p style="font-size:12px;color:#9ca3af">Dikirim otomatis oleh Els App. Lihat Portal → WhatsApp Config → Gateway &amp; OTP.</p></div></div>`,
      }).catch((err) => logger.warn({ err, to: addr }, '[wa-otp-health] email peringatan gagal'));
    }
  } catch (err) {
    logger.warn({ err }, '[wa-otp-health] tidak bisa mengirim peringatan');
  }
}

async function checkDevice(now: number) {
  const st = waProviderStatus();
  if (!st.fonnte.configured || !st.fonnte.enabled) {
    device = { connected: null, number: null, checkedAt: now, error: null };
    return;
  }
  const before = device.connected;
  try {
    const d = await getFonnteDevice();
    device = { connected: d.connected, number: d.device ? `+${d.device.replace(/^\+/, '')}` : null, checkedAt: now, error: null };
  } catch (err) {
    // API Fonnte tidak bisa dihubungi → status tidak diketahui (tidak dilewati).
    device = { ...device, connected: null, checkedAt: now, error: (err as Error).message.slice(0, 200) };
  }
  if (before !== null && device.connected !== null && before !== device.connected) {
    logger.warn({ connected: device.connected }, '[wa-otp-health] status device Fonnte berubah');
    void alertAdmins(
      device.connected ? 'Device Fonnte tersambung kembali' : 'Device Fonnte TERPUTUS — OTP dialihkan',
      device.connected
        ? '<p>Device WhatsApp Fonnte kembali tersambung. OTP kembali dikirim lewat Fonnte.</p>'
        : '<p>Device WhatsApp Fonnte terputus. OTP sementara <b>tidak</b> dikirim lewat Fonnte; jemaat yang punya email menerima OTP lewat email. Sambungkan ulang device di dashboard Fonnte.</p>',
    );
  }
}

async function evaluate(now: number) {
  const threshold = waRuntimeSettings().waSuspectThreshold;
  for (const p of OTP_PROVIDERS) {
    const from = Math.max(considerFrom[p] ?? 0, now - LOOKBACK_MS);
    const rows = await prisma.otpVerification.findMany({
      where: { provider: p, createdAt: { gte: new Date(from), lte: new Date(now - OTP_UNUSED_AFTER_MS) } },
      orderBy: { createdAt: 'desc' },
      take: Math.max(threshold, 1),
      select: { usedAt: true },
    });
    const cur = suspect[p];
    // OTP lama dari provider ini yang ternyata dipakai setelah ditandai (pesan terlambat sampai) → pulih.
    const usedSinceSuspect = cur
      ? (await prisma.otpVerification.count({ where: { provider: p, usedAt: { gte: new Date(cur.since) } } })) > 0
      : false;
    const { next, event } = decideSuspect({ current: cur, streak: unusedStreak(rows), usedSinceSuspect, threshold, now });
    if (next) suspect[p] = next;
    else delete suspect[p];
    if (event === 'expired' || event === 'recovered') considerFrom[p] = now;
    if (event) {
      logger.warn({ provider: p, event, streak: next?.streak }, '[wa-otp-health] status OTP provider berubah');
      if (event === 'suspect') {
        void alertAdmins(
          `OTP ${NAME[p]} diduga tidak sampai — dialihkan sementara`,
          `<p>${next!.streak} kode OTP berturut-turut yang dikirim lewat <b>${NAME[p]}</b> tidak pernah dipakai jemaat dalam 5 menit. Kemungkinan pesan tidak sampai (nomor pengirim terblokir / antre).</p>
<p>Selama 15 menit ${NAME[p]} dilewati untuk OTP; jemaat yang punya email menerima OTP lewat email. Setelah itu ${NAME[p]} dicoba lagi otomatis.</p>`,
        );
      } else if (event === 'recovered') {
        void alertAdmins(`OTP ${NAME[p]} kembali normal`, `<p>Ada OTP lewat ${NAME[p]} yang dipakai jemaat — provider dipakai lagi untuk OTP.</p>`);
      }
    }
  }
}

function applySkip() {
  const skip: Partial<Record<WaProvider, string>> = {};
  if (device.connected === false) skip.fonnte = 'device Fonnte terputus';
  for (const p of OTP_PROVIDERS) {
    const s = suspect[p];
    if (s) skip[p] = skip[p] ?? `diduga gagal (${s.streak} OTP tidak dipakai)`;
  }
  setWaOtpSkip(skip);
}

let lastDeviceAt = 0;
let running = false;
export async function tickWaOtpHealth(force = false): Promise<void> {
  if (running) return;
  running = true;
  const now = Date.now();
  try {
    if (force || now - lastDeviceAt >= DEVICE_EVERY_MS) {
      lastDeviceAt = now;
      await checkDevice(now);
    }
    await evaluate(now);
  } catch (err) {
    logger.warn({ err }, '[wa-otp-health] evaluasi gagal');
  } finally {
    applySkip();
    running = false;
  }
}

/** Status untuk Portal (Gateway & OTP). */
export function waOtpHealthState() {
  const iso = (n: number | null | undefined) => (n ? new Date(n).toISOString() : null);
  return {
    fonnteDevice: { connected: device.connected, device: device.number, checkedAt: iso(device.checkedAt), error: device.error },
    suspect: Object.fromEntries(
      OTP_PROVIDERS.map((p) => [p, suspect[p] ? { since: iso(suspect[p]!.since), until: iso(suspect[p]!.until), streak: suspect[p]!.streak } : null]),
    ) as Record<WaProvider, { since: string | null; until: string | null; streak: number } | null>,
  };
}

/** OTP terkirim & terpakai per saluran, 1 jam terakhir. */
export async function otpChannelStats(): Promise<Record<string, { sent: number; used: number }>> {
  const rows = await prisma.$queryRaw<{ provider: string | null; sent: bigint; used: bigint }[]>`
    SELECT provider, count(*) AS sent, count(used_at) AS used
    FROM otp_verification
    WHERE created_at > now() - interval '1 hour'
    GROUP BY provider`;
  const out: Record<string, { sent: number; used: number }> = {};
  for (const r of rows) out[r.provider ?? 'unknown'] = { sent: Number(r.sent), used: Number(r.used) };
  return out;
}

export function startWaOtpHealth(): void {
  void tickWaOtpHealth(true);
  setInterval(() => void tickWaOtpHealth(), TICK_MS).unref();
}
