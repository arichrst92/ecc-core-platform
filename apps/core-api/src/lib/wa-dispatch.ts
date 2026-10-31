/**
 * Pengiriman WA terjadwal yang AMAN dari pesan ganda.
 *
 * Masalah lama (reminder diterima > 1x sehari):
 *  1. Cek "sudah SENT?" lalu upsert → bukan atomik. Dua proses (cron + tombol
 *     "Kirim sekarang" di Portal → Maintenance, atau restart PM2 di jam kirim)
 *     sama-sama lolos cek dan sama-sama mengirim.
 *  2. Semua kegagalan di-retry tiap jam. Bila Fonnte timeout / 5xx / respons
 *     rusak padahal pesan SUDAH terkirim, jemaat menerima lagi jam berikutnya
 *     (jendela 07–10 → bisa sampai 3x).
 *  3. Satu nomor HP dipakai beberapa data jemaat (anak/tamu memakai nomor
 *     orang tua, data impor ganda) → satu orang menerima beberapa reminder.
 *
 * Perbaikan:
 *  - Klaim atomik: INSERT baris (dedupKey unik) atau UPDATE bersyarat
 *    FAILED→PENDING. Hanya pemenang klaim yang mengirim.
 *  - Retry hanya untuk kegagalan PASTI (Fonnte menolak: status=false / HTTP 4xx
 *    / belum dikonfigurasi), maks. MAX_ATTEMPTS. Kegagalan tidak pasti ditandai
 *    "[tidak-pasti]" dan TIDAK dikirim ulang otomatis.
 *  - Baris PENDING (proses mati di tengah kirim) tidak dikirim ulang.
 *  - `phoneGroupPrefix`: bila nomor yang sama sudah menerima (SENT/PENDING)
 *    pesan dengan awalan dedupKey yang sama (mis. ibadah + tanggal yang sama),
 *    lewati.
 *  - `withJobLock`: satu jenis dispatch tidak bisa berjalan bersamaan.
 */
import { prisma, Prisma } from '@ecc/database';
import { sendWhatsAppText } from '@ecc/auth';
import { logger } from './logger.js';

export const MAX_ATTEMPTS = Number(process.env.WA_DISPATCH_MAX_ATTEMPTS ?? 3);
export const UNCERTAIN_PREFIX = '[tidak-pasti] ';

type NotifType = Prisma.NotificationLogCreateInput['type'];

/** Kegagalan pasti = pesan jelas TIDAK terkirim → aman dicoba lagi. */
export function isDefiniteFailure(message: string): boolean {
  return (
    message.startsWith('Fonnte error:') ||
    /^Fonnte send failed \(4\d\d\)/.test(message) ||
    message.startsWith('Fonnte not configured')
  );
}

export type SendOutcome = 'sent' | 'failed' | 'skipped';

export async function sendWaOnce(opts: {
  dedupKey: string;
  type: NotifType;
  jemaatId: string | null;
  noHp: string;
  message: string;
  /** Lewati bila nomor ini sudah menerima pesan berawalan ini (selain dedupKey sendiri). */
  phoneGroupPrefix?: string;
}): Promise<SendOutcome> {
  const { dedupKey, type, jemaatId, noHp, message, phoneGroupPrefix } = opts;

  if (phoneGroupPrefix) {
    const samePhone = await prisma.notificationLog.findFirst({
      where: {
        noHp,
        dedupKey: { startsWith: phoneGroupPrefix, not: dedupKey },
        status: { in: ['SENT', 'PENDING'] },
      },
      select: { id: true },
    });
    if (samePhone) return 'skipped';
  }

  // ---- Klaim atomik
  let logId: string | null = null;
  try {
    const row = await prisma.notificationLog.create({
      data: { jemaatId, noHp, type, dedupKey, status: 'PENDING', messageBody: message, attemptCount: 1 },
      select: { id: true },
    });
    logId = row.id;
  } catch (err) {
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
    const claimed = await prisma.notificationLog.updateMany({
      where: {
        dedupKey,
        status: 'FAILED',
        attemptCount: { lt: MAX_ATTEMPTS },
        NOT: { errorReason: { startsWith: UNCERTAIN_PREFIX } },
      },
      data: { status: 'PENDING', attemptCount: { increment: 1 }, messageBody: message },
    });
    if (claimed.count !== 1) return 'skipped'; // SENT / PENDING / tidak-pasti / batas percobaan
    const row = await prisma.notificationLog.findUnique({ where: { dedupKey }, select: { id: true } });
    logId = row?.id ?? null;
    if (!logId) return 'skipped';
  }

  // ---- Kirim (hanya pemenang klaim)
  let messageId: string;
  try {
    messageId = (await sendWhatsAppText(noHp, message)).messageId;
  } catch (err: any) {
    const raw = err?.message ? String(err.message) : 'Unknown error';
    const reason = (isDefiniteFailure(raw) ? raw : UNCERTAIN_PREFIX + raw).slice(0, 1000);
    await prisma.notificationLog
      .update({ where: { id: logId }, data: { status: 'FAILED', errorReason: reason } })
      .catch(() => undefined);
    logger.warn({ dedupKey, err: raw, retry: isDefiniteFailure(raw) }, 'WA dispatch gagal');
    return 'failed';
  }

  // Pesan SUDAH diterima Fonnte. Gagal mencatat di DB tidak boleh membuatnya
  // dianggap gagal (itu penyebab reminder terkirim ulang tiap jam). Baris tetap
  // PENDING bila update gagal — PENDING tidak pernah dikirim ulang.
  await prisma.notificationLog
    .update({
      where: { id: logId },
      data: { status: 'SENT', messageId: messageId || null, sentAt: new Date(), errorReason: null },
    })
    .catch((err) => logger.error({ dedupKey, err: err?.message }, 'WA terkirim tapi gagal dicatat SENT'));
  return 'sent';
}

const running = new Set<string>();

/** Satu jenis dispatch hanya boleh berjalan satu kali dalam satu waktu (cron + manual Portal). */
export async function withJobLock<T>(name: string, fn: () => Promise<T>): Promise<T | { sent: 0; failed: 0; skipped: 0; alreadyRunning: true }> {
  if (running.has(name)) return { sent: 0, failed: 0, skipped: 0, alreadyRunning: true };
  running.add(name);
  try {
    return await fn();
  } finally {
    running.delete(name);
  }
}
