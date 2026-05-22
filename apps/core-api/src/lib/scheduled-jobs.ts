/**
 * In-process scheduled jobs untuk maintenance + outbound notifikasi.
 *
 * Jobs:
 *   1. cleanup-refresh-token      → DELETE expired RefreshToken (interval 6 jam)
 *   2. cleanup-audit-log          → DELETE AuditLog > AUDIT_LOG_RETENTION_DAYS (interval 24 jam)
 *   3. dispatch-ibadah-reminder   → kirim WA reminder H-1 ke jemaat dengan reservasi (interval 1 jam)
 *   4. dispatch-event-reminder    → sama untuk EventParticipation (interval 1 jam)
 *
 * Strategy: setInterval dengan startup delay supaya tidak compete dgn boot.
 * Multi-pod note: kalau scale >1 pod, semua pod jalan job ini. DELETE +
 * dedup-by-unique-key membuat aman idempotent — hanya boros query.
 * Untuk skala lebih besar, pindah ke external cron (k8s CronJob).
 */
import { prisma } from '@ecc/database';
import { sendWhatsAppText } from '@ecc/auth';
import { logger } from './logger.js';

// ===== Intervals =====
const REFRESH_TOKEN_INTERVAL_MS = 6 * 60 * 60 * 1000;       // 6 jam
const AUDIT_LOG_INTERVAL_MS = 24 * 60 * 60 * 1000;          // 24 jam
const REMINDER_DISPATCH_INTERVAL_MS = 60 * 60 * 1000;       // 1 jam
const STARTUP_DELAY_MS = 30 * 1000;

// ===== Configurable retention =====
const AUDIT_LOG_RETENTION_DAYS = Number(process.env.AUDIT_LOG_RETENTION_DAYS ?? 365);

// ===============================================================
// Job 1: Cleanup expired RefreshToken
// ===============================================================
export async function cleanupExpiredRefreshTokens(): Promise<number> {
  const now = new Date();
  const result = await prisma.refreshToken.deleteMany({
    where: { expiresAt: { lt: now } },
  });
  return result.count;
}

// ===============================================================
// Job 2: Cleanup old AuditLog (retention >= AUDIT_LOG_RETENTION_DAYS)
// ===============================================================
export async function cleanupOldAuditLogs(): Promise<number> {
  const cutoff = new Date(Date.now() - AUDIT_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const result = await prisma.auditLog.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  return result.count;
}

// ===============================================================
// Helper: tomorrow's calendar date di UTC midnight (consistent dgn @db.Date).
// ===============================================================
function tomorrowAsUtcMidnight(): Date {
  const now = new Date();
  // Pakai server local components (server expected WIB), build UTC midnight
  // of next day. Konsisten dgn ibadah-occurrences.ts logic.
  return new Date(
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() + 1),
  );
}

// ===============================================================
// Job 3: Dispatch Ibadah H-1 reminder
// ===============================================================
//
// Logic:
//   1. Target tanggal = tomorrow (UTC midnight)
//   2. Query reservasi RESERVE or JOIN untuk tanggal itu, include jemaat noHp
//   3. Skip kalau jemaat tidak punya noHp (anak dependent)
//   4. Skip kalau jemaat inactive (self-deactivated)
//   5. Compose pesan + dedup key
//   6. INSERT NotificationLog (gagal kalau dedupKey collision → sudah pernah send)
//   7. Send via Fonnte. Update status SENT/FAILED.
//
// ===============================================================
export async function dispatchIbadahReminders(): Promise<{ sent: number; failed: number; skipped: number }> {
  const tomorrow = tomorrowAsUtcMidnight();
  const tomorrowIso = tomorrow.toISOString().slice(0, 10);

  const reservasis = await prisma.reservasi.findMany({
    where: {
      tanggalIbadah: tomorrow,
      status: { in: ['RESERVE', 'JOIN'] },
    },
    include: {
      jemaat: { select: { id: true, namaLengkap: true, noHp: true, isActive: true } },
      ibadah: {
        select: {
          id: true,
          nama: true,
          jamMulai: true,
          jamSelesai: true,
          lokasi: true,
          isOnline: true,
          cabang: { select: { nama: true } },
        },
      },
    },
  });

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const r of reservasis) {
    if (!r.jemaat.isActive || !r.jemaat.noHp) {
      skipped++;
      continue;
    }
    const dedupKey = `IBADAH_REMINDER:${r.ibadahId}:${tomorrowIso}:${r.jemaatId}`;

    // Idempotent insert. Pakai upsert supaya kalau row sudah ada (status apapun),
    // tidak duplicate. Cek status: kalau SENT, skip. Kalau FAILED/PENDING bisa retry.
    const existing = await prisma.notificationLog.findUnique({
      where: { dedupKey },
      select: { status: true },
    });
    if (existing?.status === 'SENT') {
      skipped++;
      continue;
    }

    const message =
      `🙏 *Reminder Ibadah*\n\n` +
      `Halo ${r.jemaat.namaLengkap},\n\n` +
      `Besok ada ibadah:\n` +
      `*${r.ibadah.nama}* (${r.ibadah.cabang.nama})\n` +
      `🕐 ${r.ibadah.jamMulai} – ${r.ibadah.jamSelesai}\n` +
      `${r.ibadah.isOnline ? '🌐 Online' : `📍 ${r.ibadah.lokasi ?? '-'}`}\n\n` +
      `Status reservasi: *${r.status}*\n` +
      `Kode: \`${r.kode}\`\n\n` +
      `Sampai jumpa di ibadah! 🙏`;

    const log = await prisma.notificationLog.upsert({
      where: { dedupKey },
      create: {
        jemaatId: r.jemaatId,
        noHp: r.jemaat.noHp,
        type: 'IBADAH_REMINDER',
        dedupKey,
        status: 'PENDING',
        messageBody: message,
        attemptCount: 1,
      },
      update: {
        attemptCount: { increment: 1 },
        // Reset status ke PENDING saat retry — biar dispatch coba kirim lagi.
        status: 'PENDING',
      },
    });

    try {
      const result = await sendWhatsAppText(r.jemaat.noHp, message);
      await prisma.notificationLog.update({
        where: { id: log.id },
        data: {
          status: 'SENT',
          messageId: result.messageId,
          sentAt: new Date(),
          errorReason: null,
        },
      });
      sent++;
    } catch (err: any) {
      await prisma.notificationLog.update({
        where: { id: log.id },
        data: {
          status: 'FAILED',
          errorReason: err?.message ? String(err.message).slice(0, 1000) : 'Unknown error',
        },
      });
      failed++;
      logger.warn(
        { dedupKey, err: err?.message },
        'Ibadah reminder dispatch failed — will retry di interval berikutnya kalau eligible.',
      );
    }
  }

  return { sent, failed, skipped };
}

// ===============================================================
// Job 4: Dispatch Event H-1 reminder
// ===============================================================
export async function dispatchEventReminders(): Promise<{ sent: number; failed: number; skipped: number }> {
  const tomorrow = tomorrowAsUtcMidnight();
  const tomorrowIso = tomorrow.toISOString().slice(0, 10);
  const dayAfter = new Date(tomorrow.getTime() + 24 * 60 * 60 * 1000);

  // Event punya tanggalMulai DateTime (full timestamp), bukan @db.Date.
  // Window: tanggalMulai >= tomorrow 00:00 UTC AND < day-after 00:00 UTC.
  const participations = await prisma.eventParticipation.findMany({
    where: {
      event: {
        tanggalMulai: { gte: tomorrow, lt: dayAfter },
        isPublished: true,
      },
      status: { in: ['DAFTAR', 'BAYAR', 'MENUNGGU_VERIFIKASI'] },
    },
    include: {
      jemaat: { select: { id: true, namaLengkap: true, noHp: true, isActive: true } },
      event: {
        select: {
          id: true,
          judul: true,
          tanggalMulai: true,
          lokasi: true,
        },
      },
    },
  });

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const p of participations) {
    if (!p.jemaat.isActive || !p.jemaat.noHp) {
      skipped++;
      continue;
    }
    const dedupKey = `EVENT_REMINDER:${p.eventId}:${tomorrowIso}:${p.jemaatId}`;
    const existing = await prisma.notificationLog.findUnique({
      where: { dedupKey },
      select: { status: true },
    });
    if (existing?.status === 'SENT') {
      skipped++;
      continue;
    }

    const eventTime = new Date(p.event.tanggalMulai).toLocaleString('id-ID', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    });
    const message =
      `🎉 *Reminder Event*\n\n` +
      `Halo ${p.jemaat.namaLengkap},\n\n` +
      `Besok ada event:\n` +
      `*${p.event.judul}*\n` +
      `🕐 ${eventTime}\n` +
      `${p.event.lokasi ? `📍 ${p.event.lokasi}\n` : ''}\n` +
      `Status pendaftaran: *${p.status}*\n\n` +
      `Sampai jumpa! 🙏`;

    const log = await prisma.notificationLog.upsert({
      where: { dedupKey },
      create: {
        jemaatId: p.jemaatId,
        noHp: p.jemaat.noHp,
        type: 'EVENT_REMINDER',
        dedupKey,
        status: 'PENDING',
        messageBody: message,
        attemptCount: 1,
      },
      update: { attemptCount: { increment: 1 }, status: 'PENDING' },
    });

    try {
      const result = await sendWhatsAppText(p.jemaat.noHp, message);
      await prisma.notificationLog.update({
        where: { id: log.id },
        data: {
          status: 'SENT',
          messageId: result.messageId,
          sentAt: new Date(),
          errorReason: null,
        },
      });
      sent++;
    } catch (err: any) {
      await prisma.notificationLog.update({
        where: { id: log.id },
        data: {
          status: 'FAILED',
          errorReason: err?.message ? String(err.message).slice(0, 1000) : 'Unknown error',
        },
      });
      failed++;
      logger.warn({ dedupKey, err: err?.message }, 'Event reminder dispatch failed.');
    }
  }

  return { sent, failed, skipped };
}

// ===============================================================
// Reminder send window
// ===============================================================
// Reminder hanya di-kirim antara REMINDER_SEND_HOUR_START–END (server local
// time, expected WIB). Default 07:00–10:00. Tujuan: hindari WA pop notif
// tengah malam karena cron tick di jam aneh.
const REMINDER_HOUR_START = Number(process.env.REMINDER_SEND_HOUR_START ?? 7);
const REMINDER_HOUR_END = Number(process.env.REMINDER_SEND_HOUR_END ?? 10);

function inReminderWindow(): boolean {
  const h = new Date().getHours();
  return h >= REMINDER_HOUR_START && h < REMINDER_HOUR_END;
}

// ===============================================================
// Scheduler bootstrap
// ===============================================================
let started = false;
const intervalHandles: NodeJS.Timeout[] = [];

export function startScheduledJobs() {
  if (started) {
    logger.warn('startScheduledJobs() dipanggil lebih dari sekali — skip.');
    return;
  }
  started = true;

  const wrap = <T>(name: string, fn: () => Promise<T>) => async () => {
    const startMs = Date.now();
    try {
      const result = await fn();
      const tookMs = Date.now() - startMs;
      logger.info({ job: name, tookMs, result }, `🧹 ${name} done`);
    } catch (err) {
      logger.error({ job: name, err }, `${name} failed — retry di interval berikutnya.`);
    }
  };

  const refreshTokenJob = wrap('cleanup-refresh-token', async () => ({
    deleted: await cleanupExpiredRefreshTokens(),
  }));
  const auditLogJob = wrap('cleanup-audit-log', async () => ({
    deleted: await cleanupOldAuditLogs(),
    retentionDays: AUDIT_LOG_RETENTION_DAYS,
  }));
  const ibadahReminderJob = wrap('dispatch-ibadah-reminder', async () => {
    if (!inReminderWindow()) return { skipped: true, reason: 'outside-window' };
    return dispatchIbadahReminders();
  });
  const eventReminderJob = wrap('dispatch-event-reminder', async () => {
    if (!inReminderWindow()) return { skipped: true, reason: 'outside-window' };
    return dispatchEventReminders();
  });

  // Initial run (delayed) untuk semua job.
  setTimeout(() => {
    void refreshTokenJob();
    void auditLogJob();
    void ibadahReminderJob();
    void eventReminderJob();
  }, STARTUP_DELAY_MS);

  const h1 = setInterval(() => void refreshTokenJob(), REFRESH_TOKEN_INTERVAL_MS);
  const h2 = setInterval(() => void auditLogJob(), AUDIT_LOG_INTERVAL_MS);
  const h3 = setInterval(() => void ibadahReminderJob(), REMINDER_DISPATCH_INTERVAL_MS);
  const h4 = setInterval(() => void eventReminderJob(), REMINDER_DISPATCH_INTERVAL_MS);
  for (const h of [h1, h2, h3, h4]) {
    h.unref?.();
    intervalHandles.push(h);
  }

  logger.info(
    {
      'refresh-token-interval': REFRESH_TOKEN_INTERVAL_MS,
      'audit-log-interval': AUDIT_LOG_INTERVAL_MS,
      'reminder-interval': REMINDER_DISPATCH_INTERVAL_MS,
      'reminder-window': `${REMINDER_HOUR_START}:00-${REMINDER_HOUR_END}:00 (server local)`,
      'audit-retention-days': AUDIT_LOG_RETENTION_DAYS,
    },
    '⏰ Scheduled jobs started: cleanup-refresh-token, cleanup-audit-log, dispatch-ibadah-reminder, dispatch-event-reminder',
  );
}

export function stopScheduledJobs() {
  for (const h of intervalHandles) clearInterval(h);
  intervalHandles.length = 0;
  started = false;
}
