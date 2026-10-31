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
import { calendarDateOf, jamWithZone, tzOr } from './tz.js';
import { runDataRetention } from './data-purge.js';
import { encryptLegacyCredentials } from './credential-crypto.js';
import { encryptLegacyBackups } from './db-backup.js';
import { backupEmailTick } from './backup-email.js';
import { prisma } from '@ecc/database';
import { sendWaOnce, withJobLock } from './wa-dispatch.js';
import { getConfig, renderTemplate } from './wa-notif.js';
import { waAllowedForJemaat } from './comm-prefs.js';
import { logger } from './logger.js';
import { flushApiMetrics } from './api-metrics.js';
import { samplePresence } from './telemetry.js';

// ===== Intervals =====
const REFRESH_TOKEN_INTERVAL_MS = 6 * 60 * 60 * 1000;       // 6 jam
const AUDIT_LOG_INTERVAL_MS = 24 * 60 * 60 * 1000;          // 24 jam
const REMINDER_DISPATCH_INTERVAL_MS = 60 * 60 * 1000;       // 1 jam
const STARTUP_DELAY_MS = 30 * 1000;

// ===== Configurable retention =====
const AUDIT_LOG_RETENTION_DAYS = Number(process.env.AUDIT_LOG_RETENTION_DAYS ?? 365);
// Diagnostics tables — pendek karena volume bisa tinggi.
const FACE_TELEMETRY_RETENTION_DAYS = Number(process.env.FACE_TELEMETRY_RETENTION_DAYS ?? 90);
const DIAGNOSTICS_ERROR_RETENTION_DAYS = Number(process.env.DIAGNOSTICS_ERROR_RETENTION_DAYS ?? 30);

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
// Job 5: Cleanup old face telemetry events (retention 90 hari)
// ===============================================================
export async function cleanupOldFaceTelemetry(): Promise<number> {
  const cutoff = new Date(Date.now() - FACE_TELEMETRY_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const result = await prisma.faceTelemetryEvent.deleteMany({
    where: { receivedAt: { lt: cutoff } },
  });
  return result.count;
}

// ===============================================================
// Job 6: Cleanup old diagnostics error events (retention 30 hari)
// ===============================================================
export async function cleanupOldDiagnosticsErrors(): Promise<number> {
  const cutoff = new Date(Date.now() - DIAGNOSTICS_ERROR_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const result = await prisma.diagnosticsErrorEvent.deleteMany({
    where: { receivedAt: { lt: cutoff } },
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
export function dispatchIbadahReminders() {
  return withJobLock('ibadah-reminder', dispatchIbadahRemindersInner);
}

async function dispatchIbadahRemindersInner(): Promise<{ sent: number; failed: number; skipped: number }> {
  const tomorrow = tomorrowAsUtcMidnight();
  const tomorrowIso = tomorrow.toISOString().slice(0, 10);

  const cfg = await getConfig('IBADAH_REMINDER_H1');
  if (!cfg || !cfg.isEnabled) return { sent: 0, failed: 0, skipped: 0 };

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
          cabang: { select: { nama: true, timezone: true } },
        },
      },
    },
    // Urutan stabil: reservasi paling awal (biasanya pemilik akun) menang
    // bila beberapa jemaat memakai nomor HP yang sama.
    orderBy: { createdAt: 'asc' },
  });

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const r of reservasis) {
    if (!r.jemaat.isActive || !r.jemaat.noHp || !(await waAllowedForJemaat(r.jemaatId, 'IBADAH_REMINDER_H1'))) {
      skipped++;
      continue;
    }
    const message = renderTemplate(cfg.template, {
      nama: r.jemaat.namaLengkap,
      ibadah_nama: `${r.ibadah.nama} (${r.ibadah.cabang.nama})`,
      tanggal: new Date(r.tanggalIbadah).toLocaleDateString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC', // kolom @db.Date (tengah malam UTC) — jangan geser ke zona server
      }),
      // Jam dinding cabang + label zona (jemaat bisa di negara lain).
      jam: jamWithZone(r.ibadah.jamMulai, r.ibadah.jamSelesai, r.ibadah.cabang.timezone),
      lokasi: r.ibadah.isOnline ? 'Online' : (r.ibadah.lokasi ?? '-'),
    });
    const groupPrefix = `IBADAH_REMINDER:${r.ibadahId}:${tomorrowIso}:`;
    const outcome = await sendWaOnce({
      dedupKey: `${groupPrefix}${r.jemaatId}`,
      type: 'IBADAH_REMINDER',
      jemaatId: r.jemaatId,
      noHp: r.jemaat.noHp,
      message,
      phoneGroupPrefix: groupPrefix,
    });
    if (outcome === 'sent') sent++;
    else if (outcome === 'failed') failed++;
    else skipped++;
  }

  return { sent, failed, skipped };
}

// ===============================================================
// Job 4: Dispatch Event H-1 reminder
// ===============================================================
export function dispatchEventReminders() {
  return withJobLock('event-reminder', dispatchEventRemindersInner);
}

async function dispatchEventRemindersInner(): Promise<{ sent: number; failed: number; skipped: number }> {
  const tomorrow = tomorrowAsUtcMidnight();
  const tomorrowIso = tomorrow.toISOString().slice(0, 10);
  const dayAfter = new Date(tomorrow.getTime() + 24 * 60 * 60 * 1000);

  const cfg = await getConfig('EVENT_REMINDER_H1');
  if (!cfg || !cfg.isEnabled) return { sent: 0, failed: 0, skipped: 0 };

  // Event punya tanggalMulai DateTime. Ambil jendela ±1 hari lalu saring
  // berdasarkan TANGGAL KALENDER di zona cabang event (event lama bisa
  // tersimpan sebagai timestamp, bukan tengah malam UTC).
  const participationsRaw = await prisma.eventParticipation.findMany({
    where: {
      event: {
        tanggalMulai: { gte: new Date(tomorrow.getTime() - 24 * 60 * 60 * 1000), lt: new Date(dayAfter.getTime() + 24 * 60 * 60 * 1000) },
        isPublished: true,
      },
      status: { in: ['DAFTAR', 'BAYAR', 'MENUNGGU_VERIFIKASI'] },
    },
    orderBy: { registeredAt: 'asc' },
    include: {
      jemaat: { select: { id: true, namaLengkap: true, noHp: true, isActive: true } },
      event: {
        select: {
          id: true,
          judul: true,
          tanggalMulai: true,
          jamMulai: true,
          jamSelesai: true,
          lokasi: true,
          cabang: { select: { timezone: true } },
        },
      },
    },
  });
  const participations = participationsRaw.filter(
    (p) => calendarDateOf(p.event.tanggalMulai, tzOr(p.event.cabang?.timezone)).toISOString().slice(0, 10) === tomorrowIso,
  );

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const p of participations) {
    if (!p.jemaat.isActive || !p.jemaat.noHp || !(await waAllowedForJemaat(p.jemaatId, 'EVENT_REMINDER_H1'))) {
      skipped++;
      continue;
    }
    // Tanggal kalender + jam dinding cabang + label zona (bukan jam server).
    const eventTime = `${tomorrow.toLocaleDateString('id-ID', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    })}, ${jamWithZone(p.event.jamMulai, p.event.jamSelesai, p.event.cabang?.timezone)}`;
    const message = renderTemplate(cfg.template, {
      nama: p.jemaat.namaLengkap,
      event_judul: p.event.judul,
      tanggal: eventTime,
      lokasi: p.event.lokasi ?? '-',
    });
    const groupPrefix = `EVENT_REMINDER:${p.eventId}:${tomorrowIso}:`;
    const outcome = await sendWaOnce({
      dedupKey: `${groupPrefix}${p.jemaatId}`,
      type: 'EVENT_REMINDER',
      jemaatId: p.jemaatId,
      noHp: p.jemaat.noHp,
      message,
      phoneGroupPrefix: groupPrefix,
    });
    if (outcome === 'sent') sent++;
    else if (outcome === 'failed') failed++;
    else skipped++;
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
// ============================================================
// Birthday greeting dispatch — sekali per jemaat per tahun
// ============================================================
export function dispatchBirthdayGreetings() {
  return withJobLock('birthday-greeting', dispatchBirthdayGreetingsInner);
}

async function dispatchBirthdayGreetingsInner(): Promise<{
  sent: number;
  failed: number;
  skipped: number;
}> {
  const cfg = await getConfig('BIRTHDAY_GREETING');
  if (!cfg || !cfg.isEnabled) return { sent: 0, failed: 0, skipped: 0 };

  const today = new Date();
  const month = today.getMonth() + 1; // JS 0-indexed
  const day = today.getDate();

  // Query jemaat whose birthday falls today (compare month-of-year + day-of-month)
  // Prisma tidak support EXTRACT native, pakai raw query.
  type Row = { id: string; nama_lengkap: string; no_hp: string | null; tanggal_lahir: Date | null };
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT id, nama_lengkap, no_hp, tanggal_lahir
    FROM jemaat
    WHERE is_active = true
      AND tanggal_lahir IS NOT NULL
      AND no_hp IS NOT NULL
      AND EXTRACT(MONTH FROM tanggal_lahir) = ${month}
      AND EXTRACT(DAY FROM tanggal_lahir) = ${day}
  `;

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  for (const r of rows) {
    if (!r.no_hp || !r.tanggal_lahir) {
      skipped++;
      continue;
    }
    if (!(await waAllowedForJemaat(r.id, 'BIRTHDAY_GREETING'))) {
      skipped++;
      continue;
    }
    const usia = today.getFullYear() - new Date(r.tanggal_lahir).getFullYear();
    const message = renderTemplate(cfg.template, {
      nama: r.nama_lengkap,
      usia: String(usia),
    });
    const outcome = await sendWaOnce({
      dedupKey: `BIRTHDAY_${r.id}_${today.getFullYear()}`,
      type: 'BIRTHDAY_GREETING',
      jemaatId: r.id,
      noHp: r.no_hp,
      message,
    });
    if (outcome === 'sent') sent++;
    else if (outcome === 'failed') failed++;
    else skipped++;
  }
  return { sent, failed, skipped };
}

// ===============================================================
// Analitik: retensi data (metrik API 90 hari, kunjungan halaman 400 hari)
// ===============================================================
const API_METRIC_RETENTION_DAYS = Number(process.env.API_METRIC_RETENTION_DAYS ?? 90);
const PAGE_VIEW_RETENTION_DAYS = Number(process.env.PAGE_VIEW_RETENTION_DAYS ?? 400);

export async function cleanupAnalytics() {
  const day = 24 * 60 * 60 * 1000;
  const a = await prisma.apiMetric.deleteMany({ where: { bucket: { lt: new Date(Date.now() - API_METRIC_RETENTION_DAYS * day) } } });
  const p = await prisma.pageViewDaily.deleteMany({ where: { date: { lt: new Date(Date.now() - PAGE_VIEW_RETENTION_DAYS * day) } } });
  return { apiMetric: a.count, pageViewDaily: p.count };
}

const intervalHandles: NodeJS.Timeout[] = [];
const DATA_RETENTION_ENABLED = process.env.DATA_RETENTION_ENABLED !== 'false';

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

  const faceTelemetryJob = wrap('cleanup-face-telemetry', async () => {
    const deleted = await cleanupOldFaceTelemetry();
    return { deleted };
  });
  const diagnosticsErrorJob = wrap('cleanup-diagnostics-error', async () => {
    const deleted = await cleanupOldDiagnosticsErrors();
    return { deleted };
  });
  const birthdayJob = wrap('dispatch-birthday-greeting', async () => {
    if (!inReminderWindow()) return { skipped: true, reason: 'outside-window' };
    return dispatchBirthdayGreetings();
  });

  const analyticsCleanupJob = wrap('cleanup-analytics', cleanupAnalytics);
  // Kepatuhan no. 5 & 14 — retensi data pribadi (akun nonaktif 3 th, tamu 3 th,
  // bukti transfer 1 th setelah event). Matikan dengan DATA_RETENTION_ENABLED=false.
  const dataRetentionJob = wrap('data-retention', async () =>
    DATA_RETENTION_ENABLED ? runDataRetention() : { skipped: true, reason: 'disabled' });

  // Initial run (delayed) untuk semua job.
  setTimeout(() => {
    void refreshTokenJob();
    void auditLogJob();
    void ibadahReminderJob();
    void eventReminderJob();
    void faceTelemetryJob();
    void diagnosticsErrorJob();
    void birthdayJob();
    void analyticsCleanupJob();
    void dataRetentionJob();
    void wrap('encrypt-legacy-credentials', async () => ({ encrypted: await encryptLegacyCredentials() }))();
    void wrap('encrypt-legacy-backups', async () => ({ encrypted: await encryptLegacyBackups() }))();
  }, STARTUP_DELAY_MS);

  const h1 = setInterval(() => void refreshTokenJob(), REFRESH_TOKEN_INTERVAL_MS);
  const h2 = setInterval(() => void auditLogJob(), AUDIT_LOG_INTERVAL_MS);
  const h3 = setInterval(() => void ibadahReminderJob(), REMINDER_DISPATCH_INTERVAL_MS);
  const h4 = setInterval(() => void eventReminderJob(), REMINDER_DISPATCH_INTERVAL_MS);
  // Diagnostics retention — daily interval cukup, volume tinggi tapi delete
  // operation murah dengan index on received_at.
  const h5 = setInterval(() => void faceTelemetryJob(), AUDIT_LOG_INTERVAL_MS);
  const h6 = setInterval(() => void diagnosticsErrorJob(), AUDIT_LOG_INTERVAL_MS);
  // Birthday — tiap 1 jam cek, hanya kirim di window 7-10 AM supaya 1 hari sekali
  const h7 = setInterval(() => void birthdayJob(), REMINDER_DISPATCH_INTERVAL_MS);
  // Analitik: tulis metrik API tiap menit (tanpa log — terlalu sering) + catat jumlah aktif.
  const h8 = setInterval(() => {
    samplePresence();
    flushApiMetrics().catch((err) => logger.warn({ err }, 'flush-api-metrics failed'));
  }, 60_000);
  const h9 = setInterval(() => void analyticsCleanupJob(), AUDIT_LOG_INTERVAL_MS);
  const h10 = setInterval(() => void dataRetentionJob(), AUDIT_LOG_INTERVAL_MS);
  // Kirim backup terenkripsi bulanan via email (Portal → Compliance). Cek tiap jam.
  const backupEmailJob = wrap('backup-email-monthly', () =>
    backupEmailTick(process.env.PUBLIC_API_URL ?? 'https://api.eccchurch.global'),
  );
  const h11 = setInterval(() => void backupEmailJob(), 60 * 60_000);
  for (const h of [h1, h2, h3, h4, h5, h6, h7, h8, h9, h10, h11]) {
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
      'face-telemetry-retention-days': FACE_TELEMETRY_RETENTION_DAYS,
      'diagnostics-error-retention-days': DIAGNOSTICS_ERROR_RETENTION_DAYS,
    },
    '⏰ Scheduled jobs started: cleanup-refresh-token, cleanup-audit-log, dispatch-ibadah-reminder, dispatch-event-reminder, cleanup-face-telemetry, cleanup-diagnostics-error',
  );
}

export function stopScheduledJobs() {
  for (const h of intervalHandles) clearInterval(h);
  intervalHandles.length = 0;
  started = false;
}
