/**
 * WA Notification Config router.
 * GET  /admin/wa-config          → list semua config (grouped by category)
 * PATCH /admin/wa-config/:type    → update isEnabled + template
 * POST /admin/wa-config/:type/test → kirim test ke noHp requester
 */
import { Router } from 'express';
import { prisma } from '@ecc/database';
import { BadRequest, NotFound, Unauthorized } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import {
  invalidateWaConfigCache,
  renderTemplate,
  type WaNotifType,
} from '../../lib/wa-notif.js';
import {
  getFonnteDevice,
  isWhatsAppRegistered,
  sendWhatsAppText,
  testWaProvider,
  waOtpSkip,
  waProviderHealth,
  waProviderStatus,
} from '@ecc/auth';
import { z } from 'zod';
import {
  OTP_EMAIL_MODES,
  WA_USAGES,
  loadWaRuntime,
  otpEmailMode,
  saveWaRuntime,
  skipNoHpOtp,
  waRuntimeSettings,
} from '../../lib/wa-runtime.js';
import { describeInvalidPhone, normalizePhoneNumber } from '@ecc/shared-types';
import { otpChannelStats, tickWaOtpHealth, waOtpHealthState } from '../../lib/wa-otp-health.js';
import { appVersionStats } from '../../lib/app-version-stats.js';
import { catalogByKey, listNotifChannels, saveNotifChannel } from '../../lib/notif-channels.js';
import { notifEmailQueueSize } from '../../lib/notif-email.js';
import { effectiveSender, emailHealth, loadEmailRuntime, saveEmailRuntime, senderVerified, sendgridStatus } from '../../lib/email-runtime.js';
import { sendEmail } from '../../lib/sendgrid.js';

export const waConfigRouter = Router();

waConfigRouter.get('/', async (_req, res) => {
  const rows = await prisma.waNotificationConfig.findMany({
    orderBy: [{ category: 'asc' }, { label: 'asc' }],
  });
  res.json({ success: true, data: rows });
});

/**
 * GET /admin/wa-config/device — status perangkat WhatsApp pengirim (Fonnte):
 * nomor, tersambung/terputus, kuota, masa aktif. Didaftarkan sebelum /:type.
 */
waConfigRouter.get('/device', async (_req, res) => {
  // Fonnte tidak dipasang / dimatikan di Gateway → bukan kondisi darurat.
  if (!waProviderStatus().fonnte.configured) return res.json({ success: true, data: { notConfigured: true } });
  const disabled = waRuntimeSettings().waFonnteEnabled === false;
  try {
    const d = await getFonnteDevice();
    res.json({ success: true, data: { ...d, device: d.device ? `+${d.device.replace(/^\+/, '')}` : null, disabled } });
  } catch (err) {
    res.json({ success: true, data: { error: (err as Error).message, disabled } });
  }
});

/**
 * GET /admin/wa-config/gateway — saklar provider WhatsApp & OTP (Portal).
 * Kredensial tetap di .env; respons hanya menyebut ada/tidaknya (tanpa nilai).
 */
async function gatewayView() {
  const settings = await loadWaRuntime(true);
  const st = waProviderStatus();
  // Status perangkat Fonnte langsung dari API-nya (connect / disconnect).
  let fonnteDevice: { connected: boolean; device: string | null; error?: string } | null = null;
  if (st.fonnte.configured) {
    try {
      const dev = await getFonnteDevice();
      fonnteDevice = { connected: dev.connected, device: dev.device ? `+${dev.device.replace(/^\+/, '')}` : null };
    } catch (err) {
      fonnteDevice = { connected: false, device: null, error: (err as Error).message };
    }
  }
  return {
    settings,
    providers: st,
    // Hasil kirim terakhir per provider (sejak server terakhir start).
    health: waProviderHealth(),
    fonnteDevice,
    // Deteksi gagal diam-diam: provider yang sedang dilewati untuk OTP + statistik 1 jam.
    otpHealth: waOtpHealthState(),
    otpSkip: waOtpSkip(),
    otpStats: await otpChannelStats().catch(() => ({})),
    // Versi Els App yang memanggil API (sejak server start) — app lama = tanpa header.
    appVersions: appVersionStats(),
    effective: {
      otpEmailCopy: otpEmailMode(),
      onboardingSkipNoHpOtp: skipNoHpOtp(),
    },
    env: {
      otpEmailCopy: process.env.OTP_EMAIL_COPY || null,
      onboardingSkipNoHpOtp: process.env.ONBOARDING_SKIP_NOHP_OTP || null,
    },
  };
}

waConfigRouter.get('/gateway', async (_req, res) => {
  res.json({ success: true, data: await gatewayView() });
});

const gatewaySchema = z
  .object({
    waFonnteEnabled: z.boolean(),
    waResmiOtpEnabled: z.boolean(),
    waFonnteUsage: z.enum(WA_USAGES as [string, ...string[]]),
    otpEmailCopy: z.enum(OTP_EMAIL_MODES as [string, ...string[]]).nullable(),
    onboardingSkipNoHpOtp: z.boolean().nullable(),
    otpEnrollEmailLegacy: z.boolean(),
    emailSignupEnabled: z.boolean(),
    waSuspectThreshold: z.number().int().min(0).max(50),
  })
  .partial();

/** PATCH /admin/wa-config/gateway — simpan & terapkan langsung (tanpa restart). */
waConfigRouter.patch('/gateway', async (req, res) => {
  if (!req.user) throw Unauthorized();
  const patch = gatewaySchema.parse(req.body ?? {});
  const before = { ...waRuntimeSettings() };
  const after = await saveWaRuntime(patch as Parameters<typeof saveWaRuntime>[0], req.user.sub ?? null);
  // Saklar provider / ambang berubah → evaluasi ulang status OTP sekarang juga.
  await tickWaOtpHealth(true);
  audit(req, {
    action: 'UPDATE',
    resource: 'wa_gateway_config',
    resourceId: 'global',
    resourceLabel: 'WhatsApp gateway & OTP',
    before,
    after,
    metadata: { kind: 'wa-gateway-update', fields: Object.keys(patch) },
  });
  res.json({ success: true, data: await gatewayView() });
});

/**
 * POST /admin/wa-config/gateway/test { provider, noHp? } — kirim pesan tes
 * lewat SATU provider (default ke nomor admin) untuk cek koneksinya.
 */
waConfigRouter.post('/gateway/test', async (req, res) => {
  if (!req.user) throw Unauthorized();
  const provider = z.enum(['resmi', 'fonnte']).parse(req.body?.provider);
  let noHp: string | null = null;
  if (typeof req.body?.noHp === 'string' && req.body.noHp.trim()) {
    noHp = normalizePhoneNumber(req.body.noHp);
    if (!noHp) throw BadRequest(describeInvalidPhone(req.body.noHp));
  } else {
    const self = await prisma.jemaat.findUnique({ where: { id: req.user.jemaatId }, select: { noHp: true } });
    noHp = self?.noHp ?? null;
  }
  if (!noHp) throw BadRequest('Akun Anda belum punya nomor HP — isi nomor tujuan tes.');
  try {
    const r = await testWaProvider(provider, noHp);
    res.json({ success: true, data: { ok: true, provider, to: `+${r.to}`, messageId: r.messageId, gateway: await gatewayView() } });
  } catch (err) {
    res.json({ success: true, data: { ok: false, provider, error: (err as Error).message, gateway: await gatewayView() } });
  }
});

/**
 * Email (SendGrid):
 *   GET   /admin/wa-config/email        status koneksi, pengirim, kredit, statistik 7 hari, kirim terakhir
 *   PATCH /admin/wa-config/email        { emailFromAddress?, emailFromName?, emailReplyTo? } (null = ikuti .env)
 *   POST  /admin/wa-config/email/test   { to? } → kirim email tes (default email akun Anda)
 */
async function emailView() {
  const settings = await loadEmailRuntime(true);
  return {
    settings,
    env: { emailFrom: process.env.EMAIL_FROM || null, emailFromName: process.env.EMAIL_FROM_NAME || null },
    status: await sendgridStatus(),
    health: emailHealth(),
    queue: notifEmailQueueSize(),
  };
}

waConfigRouter.get('/email', async (_req, res) => {
  res.json({ success: true, data: await emailView() });
});

const emailSettingsSchema = z
  .object({
    emailFromAddress: z.string().trim().toLowerCase().email('Alamat pengirim tidak valid.').max(255).nullable(),
    emailFromName: z.string().trim().min(2).max(150).nullable(),
    emailReplyTo: z.string().trim().toLowerCase().email('Alamat balasan tidak valid.').max(255).nullable(),
  })
  .partial();

waConfigRouter.patch('/email', async (req, res) => {
  if (!req.user) throw Unauthorized();
  const raw = (req.body ?? {}) as Record<string, unknown>;
  // String kosong = kembali ke .env
  for (const k of ['emailFromAddress', 'emailFromName', 'emailReplyTo']) if (raw[k] === '') raw[k] = null;
  const patch = emailSettingsSchema.parse(raw);
  // Pengirim yang belum terverifikasi di SendGrid → semua email gagal. Tolak bila pasti belum.
  if (patch.emailFromAddress) {
    const v = await senderVerified(patch.emailFromAddress);
    if (v.verified === false) {
      throw BadRequest(
        `${patch.emailFromAddress} belum terverifikasi di SendGrid (Single Sender / domain). Verifikasi dulu di dashboard SendGrid, lalu simpan lagi.`,
      );
    }
  }
  const before = await loadEmailRuntime(true);
  const after = await saveEmailRuntime(patch, req.user.sub ?? null);
  audit(req, {
    action: 'UPDATE',
    resource: 'email_sender_config',
    resourceId: 'global',
    resourceLabel: 'Pengirim email (SendGrid)',
    before,
    after,
  });
  res.json({ success: true, data: await emailView() });
});

waConfigRouter.post('/email/test', async (req, res) => {
  if (!req.user) throw Unauthorized();
  let to = typeof req.body?.to === 'string' ? req.body.to.trim().toLowerCase() : '';
  if (to && !z.string().email().safeParse(to).success) throw BadRequest('Alamat email tujuan tidak valid.');
  if (!to) {
    const self = await prisma.jemaat.findUnique({ where: { id: req.user.jemaatId }, select: { email: true } });
    to = self?.email ?? '';
  }
  if (!to) throw BadRequest('Akun Anda belum punya email — isi alamat tujuan tes.');
  await loadEmailRuntime(true);
  const snd = effectiveSender();
  const now = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' });
  try {
    await sendEmail({
      to,
      subject: 'Tes email Els App',
      html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:24px auto;padding:24px;border:1px solid #eee;border-radius:12px">
<h2 style="margin:0 0 8px;color:#C2410C">Tes email berhasil</h2>
<p style="margin:0 0 12px;color:#374151">Email ini dikirim dari Portal → WhatsApp &amp; Email Config untuk memastikan pengiriman lewat SendGrid berjalan.</p>
<p style="margin:0;color:#6b7280;font-size:13px">Pengirim: ${snd.name} &lt;${snd.email}&gt;${snd.replyTo ? `<br>Balasan ke: ${snd.replyTo}` : ''}<br>Waktu: ${now} WIB</p></div>`,
    });
    audit(req, {
      action: 'UPDATE',
      resource: 'email_sender_config',
      resourceId: 'global',
      resourceLabel: `TEST email → ${to}`,
      metadata: { kind: 'email-test', to },
    });
    res.json({ success: true, data: { ok: true, to, from: snd.email, view: await emailView() } });
  } catch (err) {
    res.json({ success: true, data: { ok: false, to, error: (err as Error).message, view: await emailView() } });
  }
});

/**
 * Saluran notifikasi per jenis (In-app / WhatsApp / Email).
 *   GET   /admin/wa-config/channels
 *   PATCH /admin/wa-config/channels/:key { inApp?, email?, waFallbackEmail?, whatsapp? }
 * WhatsApp = wa_notification_config.is_enabled (butuh template terisi).
 */
waConfigRouter.get('/channels', async (_req, res) => {
  res.json({ success: true, data: await listNotifChannels(), meta: { emailQueue: notifEmailQueueSize() } });
});

waConfigRouter.patch('/channels/:key', async (req, res) => {
  if (!req.user) throw Unauthorized();
  const key = String(req.params.key);
  const item = catalogByKey(key);
  if (!item) throw NotFound('Jenis notifikasi tidak dikenal');
  const patch = z
    .object({ inApp: z.boolean(), email: z.boolean(), waFallbackEmail: z.boolean(), whatsapp: z.boolean() })
    .partial()
    .parse(req.body ?? {});
  const before = (await listNotifChannels()).find((r) => r.key === key);
  if (patch.inApp !== undefined && !item.inAppType) throw BadRequest('Jenis ini tidak punya notifikasi in-app.');
  if ((patch.email || patch.waFallbackEmail) && !item.inAppType) throw BadRequest('Jenis ini belum mendukung email.');
  if (patch.inApp !== undefined || patch.email !== undefined || patch.waFallbackEmail !== undefined) {
    const { whatsapp: _w, ...ch } = patch;
    await saveNotifChannel(key, ch, req.user.sub ?? null);
  }
  if (patch.whatsapp !== undefined) {
    if (!item.waType) throw BadRequest('Jenis ini tidak punya pesan WhatsApp.');
    const row = await prisma.waNotificationConfig.findUnique({ where: { type: item.waType } });
    if (!row) throw BadRequest('Template WhatsApp untuk jenis ini belum ada.');
    if (patch.whatsapp && !row.template.trim()) throw BadRequest('Isi template WhatsApp dulu sebelum menyalakan.');
    await prisma.waNotificationConfig.update({ where: { type: item.waType }, data: { isEnabled: patch.whatsapp, updatedById: req.user.sub ?? null } });
    invalidateWaConfigCache(item.waType);
  }
  const after = (await listNotifChannels()).find((r) => r.key === key);
  audit(req, {
    action: 'UPDATE',
    resource: 'notification_channel',
    resourceId: key,
    resourceLabel: `Saluran notifikasi: ${item.label}`,
    before,
    after,
  });
  res.json({ success: true, data: after });
});

waConfigRouter.get('/:type', async (req, res) => {
  const row = await prisma.waNotificationConfig.findUnique({
    where: { type: req.params.type },
  });
  if (!row) throw NotFound('Config tidak ditemukan');
  res.json({ success: true, data: row });
});

waConfigRouter.patch('/:type', async (req, res) => {
  const body = req.body ?? {};
  const before = await prisma.waNotificationConfig.findUnique({
    where: { type: req.params.type },
  });
  if (!before) throw NotFound('Config tidak ditemukan');

  const data: Record<string, unknown> = {};
  if (typeof body.isEnabled === 'boolean') data.isEnabled = body.isEnabled;
  if (typeof body.template === 'string') {
    // Dulu template kosong diabaikan diam-diam padahal Portal menulis "Template disimpan".
    if (!body.template.trim()) throw BadRequest('Template tidak boleh kosong.');
    data.template = body.template.trim();
  }
  if (data.isEnabled === true && !String(data.template ?? before.template ?? '').trim()) {
    throw BadRequest('Isi template WhatsApp dulu sebelum menyalakan.');
  }
  if (!req.user) throw Unauthorized();
  data.updatedById = req.user.jemaatId;

  const updated = await prisma.waNotificationConfig.update({
    where: { type: req.params.type },
    data,
  });

  invalidateWaConfigCache(req.params.type as WaNotifType);

  audit(req, {
    action: 'UPDATE',
    resource: 'wa_notification_config',
    resourceId: updated.id,
    resourceLabel: updated.label,
    before,
    after: updated,
    metadata: { kind: 'wa-config-update' },
  });

  res.json({ success: true, data: updated });
});

/**
 * POST /admin/wa-config/:type/test
 * Body: { noHp?, placeholders? }
 * Kirim test message dgn template current ke noHp (default: user current).
 */
waConfigRouter.post('/:type/test', async (req, res) => {
  if (!req.user) throw Unauthorized();
  const row = await prisma.waNotificationConfig.findUnique({
    where: { type: req.params.type },
  });
  if (!row) throw NotFound('Config tidak ditemukan');

  const body = req.body ?? {};
  let noHp: string | null = null;
  if (typeof body.noHp === 'string' && body.noHp.trim()) {
    // Boleh 08… / +65 … — kirim ke format internasional yang dipakai Fonnte.
    noHp = normalizePhoneNumber(body.noHp);
    if (!noHp) throw BadRequest(describeInvalidPhone(body.noHp));
  }
  if (!noHp) {
    const self = await prisma.jemaat.findUnique({
      where: { id: req.user.jemaatId },
      select: { noHp: true },
    });
    noHp = self?.noHp ?? null;
  }
  if (!noHp) throw BadRequest('noHp wajib (atau user current harus punya noHp).');

  // Dummy placeholders — gabung default + user-provided
  const defaults: Record<string, string> = {
    // Universal Form (FORM_REMINDER)
    form: 'Formulir Peserta Camp',
    peserta: 'Jemaat Test',
    konten: 'Youth Camp 2026',
    aksi: 'diisi',
    batas: '12 Des 2026 17.00 WIB',
    link: 'https://elsapp.eccchurch.global',
    catatan: '',
    nama: 'Jemaat Test',
    event_judul: 'Event Sample',
    event_tanggal: '12 Oktober 2026',
    tanggal: '12 Oktober 2026',
    jam: '09:00',
    lokasi: 'Sanctuary',
    ibadah_nama: 'Ibadah Umum',
    group_nama: 'Group Sample',
    by_nama: 'Admin',
    tipe_relasi: 'Suami',
    ministry_nama: 'Worship Team',
    posisi: 'Vocalist',
    notes: '',
    status: 'MENUNGGU_VERIFIKASI',
    usia: '30',
    // Placeholder utk type HOMECELL_ATTENDED / EVENT_CHECKED_IN / BRANCH_CHANGE_* / GROUP_DISMISSED
    homecellNama: 'Homecell Sample',
    judul: 'Event Sample',
    cabangBaru: 'ECC Bandung',
    alasan: 'Data belum lengkap',
    groupNama: 'Group Sample',
    pemohon: 'Dewi',
  };
  // Placeholder tanpa contoh → "[contoh nama_placeholder]" supaya tidak terkirim mentah {..}.
  const fallback = Object.fromEntries((row.placeholders ?? []).map((p) => [p, `[contoh ${p}]`]));
  const placeholders = { ...fallback, ...defaults, ...(body.placeholders ?? {}) };
  // Tes memakai isi editor yang belum disimpan bila dikirim (tidak disimpan ke database).
  const template = typeof body.template === 'string' && body.template.trim() ? body.template : row.template;
  const message = renderTemplate(template, placeholders);

  // Diagnosa sebelum kirim: Fonnte menjawab "terkirim" begitu pesan masuk antrean,
  // padahal pesan bisa tidak sampai (HP pengirim terputus, nomor tujuan tidak
  // ber-WhatsApp, atau tujuan = nomor pengirim sendiri).
  const peringatan: string[] = [];
  let device: Awaited<ReturnType<typeof getFonnteDevice>> | null = null;
  // Cek perangkat hanya bila Fonnte dipakai (saklar di Gateway) — provider lain tidak butuh perangkat.
  if (waRuntimeSettings().waFonnteEnabled !== false) {
    try {
      device = await getFonnteDevice();
    } catch {
      device = null;
    }
  }
  if (device && !device.connected) {
    return res.status(503).json({
      success: false,
      error: {
        code: 'WA_DEVICE_DISCONNECTED',
        message: `Perangkat WhatsApp pengirim${device.device ? ` (+${device.device})` : ''} sedang TERPUTUS di Fonnte. Sambungkan ulang (scan QR di dashboard Fonnte), lalu coba lagi.`,
      },
    });
  }
  const tujuan = noHp.replace(/^\+/, '');
  if (device?.device && device.device.replace(/^\+/, '') === tujuan) {
    peringatan.push(
      'Nomor tujuan sama dengan nomor pengirim. Pesan masuk ke chat "Anda / Message yourself" di WhatsApp tanpa notifikasi — tes dengan nomor lain.',
    );
  }
  const terdaftar = await isWhatsAppRegistered(noHp);
  if (terdaftar === false) {
    return res.status(400).json({
      success: false,
      error: { code: 'WA_NOT_REGISTERED', message: `Nomor ${noHp} tidak terdaftar di WhatsApp.` },
    });
  }
  if (device?.quota !== null && device?.quota !== undefined && Number(device.quota) <= 0) {
    peringatan.push('Kuota pesan Fonnte habis — pesan bisa tertahan sampai kuota diisi ulang.');
  }

  try {
    const result = await sendWhatsAppText(noHp, message);
    audit(req, {
      action: 'UPDATE',
      resource: 'wa_notification_config',
      resourceId: row.id,
      resourceLabel: `TEST send ${row.label} → ${noHp}`,
      metadata: { kind: 'wa-config-test', noHp, messageId: result.messageId },
    });
    res.json({
      success: true,
      data: {
        sent: true,
        noHp,
        preview: message,
        messageId: result.messageId,
        pengirim: device?.device ? `+${device.device.replace(/^\+/, '')}` : null,
        peringatan,
      },
    });
  } catch (err) {
    audit(req, {
      action: 'UPDATE',
      resource: 'wa_notification_config',
      resourceId: row.id,
      resourceLabel: `TEST send FAILED → ${noHp}`,
      metadata: { kind: 'wa-config-test-failed', noHp, err: (err as Error).message },
    });
    return res
      .status(502)
      .json({ success: false, error: { code: 'WA_SEND_FAILED', message: (err as Error).message } });
  }
});
