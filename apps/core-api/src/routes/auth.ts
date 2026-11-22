import { assertAgeAllowed, recordConsent } from '../lib/consent.js';
import { Router, type Request } from 'express';
import { prisma, Prisma } from '@ecc/database';
import {
  generateOtp,
  hashOtp,
  getOtpExpiry,
  verifyOtpHash,
  sendOtpViaWhatsApp,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
  getJwtTtlSeconds,
  getRefreshTtlSeconds,
  matchFace,
  isValidDescriptor,
  extractBearerToken,
  verifyAccessToken,
} from '@ecc/auth';
import {
  normalizePhoneNumber,
  requestOtpSchema,
  verifyOtpSchema,
  faceLoginSchema,
  faceEnrollmentSchema,
  refreshTokenSchema,
  registerJemaatSchema,
  requestLivenessNonceSchema,
  requestMagicLinkSchema,
  verifyMagicLinkSchema,
  requestEmailOtpSchema,
  verifyEmailOtpSchema,
  registerMatchSchema,
  completeOnboardingSchema,
  isDisposableEmail,
} from '@ecc/shared-types';
import { randomBytes } from 'node:crypto';
import { sendMagicLinkEmail, sendOtpEmail } from '../lib/sendgrid.js';
import { emailSignupEnabled, enrollEmailLegacy, loadWaRuntime, otpEmailMode, skipNoHpOtp } from '../lib/wa-runtime.js';
import {
  ENROLL_WINDOW_MS,
  assertOtpCooldown,
  consumeOtp,
  createOtp,
  findJemaatByEmail,
  findVerifiedEnrollment,
  otpTtlSeconds,
  maskEmail,
  maskName,
  setOtpProvider,
  type OtpTarget,
} from '../lib/otp-store.js';
import { findOldRecords, pickOffer, recordDuplicateCandidates } from '../lib/duplicate-candidate.js';
import { noteWaOtpFailure } from '../lib/wa-otp-health.js';
import {
  issueLivenessNonce,
  consumeLivenessNonce,
  LivenessNonceError,
} from '../lib/liveness-nonce.js';
import { ApiError, BadRequest, Conflict, Forbidden, NotFound, ServiceUnavailable, Unauthorized } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { requireAuth } from '../middleware/require-auth.js';
import { resolveJemaatAccess } from '../lib/menu-access.js';
import {
  otpRequestLimiter,
  authVerifyLimiter,
  refreshLimiter,
  registerLimiter,
  registerMatchLimiter,
  cabangListLimiter,
  magicLinkLimiter,
  onboardingLimiter,
} from '../middleware/rate-limit.js';
import { grantOnboardingRoles, grantRegisterRoles } from '../lib/onboarding-roles.js';
import { audit } from '../lib/audit.js';
import { generateUniqueKode } from '../lib/kode-reservasi.js';
import { saveProfilePhoto } from '../lib/storage.js';
import { faceTelemetryRouter } from './face-telemetry.js';
import { isWithinRotationGrace } from '../lib/refresh-rotation.js';
import { ensureNewMemberPrivacy } from '../lib/privacy.js';

export const authRouter = Router();

// Mount face telemetry sub-router di /auth/face/* (no auth, fire-and-forget).
// Lihat docs/backend-request-face-confidence-threshold-and-telemetry.md.
// Kepatuhan no. 13 — login wajah DIHENTIKAN. Semua endpoint /auth/face/*
// (termasuk telemetri) menjawab 410 Gone dan data wajah sudah dihapus lewat
// migrasi 20261029180000_consent_purge_face. Handler lama di bawah tidak
// lagi terjangkau dan bisa dibuang di pembersihan berikutnya.
authRouter.use('/face', (_req, res) => {
  res.status(410).json({
    success: false,
    error: { code: 'GONE', message: 'Login wajah sudah dihentikan. Silakan masuk dengan OTP WhatsApp atau tautan email.' },
  });
});
authRouter.use('/face', faceTelemetryRouter);

// ============================================================
// APP REVIEW BYPASS (App Store / Play Store reviewer accounts)
// ============================================================
// Alasan: Apple/Google reviewer test dari perangkat mereka (US/EU) tanpa
// WhatsApp Indonesia — tidak bisa terima OTP real. Custom scheme `ecc://`
// magic link juga di-blok iPadOS beta. Solusi: allowlist nomor demo dgn
// OTP statik. Cuma affect nomor spesifik di list, nomor lain tetap normal.
//
// Config via ENV (bisa rotate tanpa deploy code):
//   APP_REVIEW_BYPASS_NUMBERS=+6281805807807[,+62xxx...]
//   APP_REVIEW_BYPASS_OTP=123456
// Kalau ENV kosong → bypass disabled (behavior default).
// ============================================================
function getAppReviewBypass(): { numbers: Set<string>; otp: string } | null {
  const raw = (process.env.APP_REVIEW_BYPASS_NUMBERS ?? '').trim();
  const otp = (process.env.APP_REVIEW_BYPASS_OTP ?? '').trim();
  if (!raw || !otp) return null;
  const numbers = new Set(
    raw
      .split(',')
      // Normalisasi supaya "+62 818-…" / "0818…" di ENV tetap cocok dgn E.164.
      .map((n) => normalizePhoneNumber(n) ?? n.trim())
      .filter(Boolean),
  );
  if (numbers.size === 0) return null;
  return { numbers, otp };
}

function isBypassNumber(noHp: string): boolean {
  const b = getAppReviewBypass();
  return !!b && b.numbers.has(noHp);
}

/**
 * POST /auth/otp/request — kirim OTP via WhatsApp.
 *
 * Untuk purpose=ENROLLMENT (self-registration mobile), skip lookup jemaat
 * — kita izinkan request OTP dari nomor belum terdaftar supaya bisa
 * complete flow register (POST /auth/register).
 *
 * Saluran pengirim dicatat di otp_verification.provider (resmi | fonnte |
 * email) — dipakai lib/wa-otp-health untuk mendeteksi gateway yang gagal
 * diam-diam. Salinan email untuk ENROLLMENT hanya bila saklar Portal
 * "OTP daftar lewat email (app versi lama)" menyala.
 */
authRouter.post('/otp/request', otpRequestLimiter, async (req, res) => {
  const { noHp, purpose, email: enrollEmail } = requestOtpSchema.parse(req.body);

  // APP REVIEW BYPASS — skip WA send + OtpVerification row (tidak perlu
  // karena verify handler juga skip DB lookup untuk nomor ini). Log audit.
  if (isBypassNumber(noHp) && purpose === 'LOGIN') {
    logger.info(
      { noHp, purpose, ip: req.ip },
      '[auth-otp] app-review bypass request (no WA send)',
    );
    return res.json({
      success: true,
      message: 'OTP telah dikirim via WhatsApp',
      data: { expiresIn: 300 },
    });
  }

  await loadWaRuntime(); // pengaturan Portal (cache 30 dtk)

  // Penerima OTP cadangan lewat email: jemaat pemilik nomor (LOGIN) atau
  // email yang diisi pendaftar (ENROLLMENT, hanya app lama + saklar nyala).
  let emailCopy: { namaLengkap: string; email: string | null } | null = null;
  if (purpose === 'ENROLLMENT') {
    // Cek jangan sampai noHp sudah terdaftar (cegah duplicate enrollment).
    const existing = await prisma.jemaat.findUnique({ where: { noHp } });
    // Tamu (pernah dibawa ke event/ibadah, tanpa akun) boleh mendaftar —
    // record tamunya di-upgrade jadi anggota di /auth/register.
    if (existing && !existing.isTamu) throw Conflict('Nomor HP sudah terdaftar — gunakan login OTP.');
    if (enrollEmail) {
      const owner = await findJemaatByEmail(enrollEmail);
      if (owner && !owner.isTamu && owner.id !== existing?.id) {
        throw Conflict('Email sudah terdaftar — gunakan "Masuk dengan email" di halaman login.');
      }
      if (enrollEmailLegacy()) emailCopy = { namaLengkap: 'Calon jemaat', email: enrollEmail };
    }
  } else if (purpose === 'ONBOARDING_ADD_NOHP') {
    // Onboarding — existing jemaat (via magic link) mau set noHp baru.
    // Cek noHp belum dipakai jemaat lain (unique constraint akan enforce juga).
    const existing = await prisma.jemaat.findUnique({ where: { noHp } });
    if (existing) {
      throw Conflict(
        'Nomor HP sudah dipakai jemaat lain. Kalau ini nomor Anda, coba login OTP langsung.',
      );
    }
  } else {
    const jemaat = await prisma.jemaat.findUnique({ where: { noHp } });
    // Tamu belum punya akun → arahkan ke pendaftaran.
    if (!jemaat || jemaat.isTamu) {
      throw NotFound('Nomor HP belum terdaftar sebagai jemaat. Kalau Anda mendaftar dengan email, pilih "Masuk dengan email".');
    }
    emailCopy = jemaat;
    // Ada kode masuk dari admin cabang yang masih aktif → tidak perlu kirim OTP
    // (app versi lama pun bisa lanjut ke layar input kode).
    const adminCode = await prisma.otpVerification.findFirst({
      where: { jemaatId: jemaat.id, purpose: 'ADMIN_CODE', usedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true },
    });
    if (adminCode) {
      return res.json({
        success: true,
        message: 'Masukkan kode masuk dari admin cabang.',
        data: { channel: 'admin' },
      });
    }
  }

  await assertOtpCooldown({ noHp }, purpose);
  const { row: otpRow, otp } = await createOtp({ noHp }, purpose, { ttlSeconds: otpTtlSeconds('wa'), req });

  // OTP cadangan lewat email (login, jemaat punya email). OTP_EMAIL_COPY:
  //   "fallback" (default) — hanya bila semua gateway WhatsApp gagal / dilewati
  //   "always"            — selalu dikirim juga ke email (gateway antre/terblokir diam-diam)
  //   "off"               — nonaktif
  const emailMode = otpEmailMode();
  const emailTo =
    (purpose === 'LOGIN' || purpose === 'ENROLLMENT') && emailMode !== 'off' ? emailCopy?.email ?? null : null;
  const EMAIL_NOTE =
    'Pengiriman OTP lewat WhatsApp sedang terganggu. Untuk mempercepat proses, kode OTP juga kami kirim ke email Anda — cek juga folder Spam / Promosi.';
  const sendEmailCopy = async (): Promise<boolean> => {
    if (!emailTo || !emailCopy) return false;
    try {
      await sendOtpEmail({
        to: emailTo,
        namaLengkap: emailCopy.namaLengkap,
        otp,
        expiresInMinutes: Math.max(1, Math.round(otpTtlSeconds('wa') / 60)),
      });
      logger.info({ noHp, purpose, mode: emailMode }, '[auth-otp] OTP dikirim juga lewat email');
      return true;
    } catch (err) {
      logger.error({ err, noHp }, '[auth-otp] gagal kirim OTP lewat email');
      return false;
    }
  };

  // Mode "always": email dikirim bersamaan, tidak menunggu WhatsApp.
  const emailAlways = emailMode === 'always' ? sendEmailCopy() : null;

  let waProvider: string | undefined;
  try {
    const sent = await sendOtpViaWhatsApp(noHp, otp);
    waProvider = sent.provider;
    if (waProvider) await setOtpProvider(otpRow.id, waProvider);
  } catch (e) {
    logger.error({ err: e, noHp, purpose }, '[auth-otp] gagal kirim OTP via WhatsApp');
    // Semua gateway WhatsApp gagal / dilewati → kode tetap berlaku bila terkirim ke email.
    const viaEmail = emailAlways ? await emailAlways : await sendEmailCopy();
    noteWaOtpFailure((e as Error).message, viaEmail ? 'email' : 'none');
    if (viaEmail) {
      await setOtpProvider(otpRow.id, 'email');
      return res.json({ success: true, message: EMAIL_NOTE, data: { channel: 'email' } });
    }
    // Gagal kirim: hapus OTP yang tidak pernah terkirim supaya user tidak
    // tertahan cooldown, dan beri pesan yang jelas (bukan 500).
    await prisma.otpVerification.delete({ where: { id: otpRow.id } }).catch(() => undefined);
    throw ServiceUnavailable(
      purpose === 'LOGIN'
        ? 'Kode OTP belum bisa dikirim lewat WhatsApp saat ini. Coba lagi beberapa menit lagi, masuk dengan email, atau minta kode masuk ke admin cabang.'
        : purpose === 'ENROLLMENT'
          ? enrollEmailLegacy()
            ? 'Kode OTP belum bisa dikirim lewat WhatsApp saat ini. Isi email Anda agar kode dikirim ke email, atau coba lagi beberapa menit lagi.'
            : 'Kode OTP belum bisa dikirim lewat WhatsApp saat ini. Coba lagi beberapa menit lagi.'
          : 'Kode OTP belum bisa dikirim lewat WhatsApp saat ini. Coba lagi beberapa menit lagi.',
      'WHATSAPP_UNAVAILABLE',
    );
  }

  if (emailAlways && (await emailAlways)) {
    // Kode juga terkirim ke email → pemakaian kode tidak membuktikan WhatsApp
    // sampai (dikecualikan dari deteksi "diduga gagal").
    if (waProvider) await setOtpProvider(otpRow.id, `${waProvider}+email`);
    return res.json({ success: true, message: `OTP telah dikirim via WhatsApp. ${EMAIL_NOTE}`, data: { channel: 'whatsapp+email' } });
  }
  res.json({ success: true, message: 'OTP telah dikirim via WhatsApp' });
});

/**
 * POST /auth/otp/verify — verifikasi OTP.
 *
 * Behavior per purpose:
 *   - LOGIN       → verify + langsung issue JWT (jemaat harus exist).
 *                   Kode masuk dari admin cabang (ADMIN_CODE) juga diterima.
 *   - RESET_FACE  → verify + langsung issue JWT (jemaat harus exist, dia mau reset wajah).
 *   - ENROLLMENT  → verify saja (jemaat BELUM ada). Response cuma marker
 *                   `pendingRegistration=true` + masa berlaku 60 menit untuk
 *                   panggil /auth/register.
 */
authRouter.post('/otp/verify', authVerifyLimiter, async (req, res) => {
  const { noHp, kode, purpose } = verifyOtpSchema.parse(req.body);

  // APP REVIEW BYPASS — validate static OTP + issue JWT langsung.
  // Jemaat harus sudah di-register di DB (satu kali setup). Kalau belum,
  // return 404 dgn pesan clear supaya reviewer / BE tahu action needed.
  const bypass = getAppReviewBypass();
  if (bypass && bypass.numbers.has(noHp) && purpose === 'LOGIN') {
    if (kode !== bypass.otp) {
      logger.warn({ noHp, ip: req.ip }, '[auth-otp] app-review bypass wrong OTP');
      throw Unauthorized('OTP salah');
    }
    const jemaat = await prisma.jemaat.findUnique({ where: { noHp } });
    if (!jemaat) {
      throw NotFound(
        'Reviewer account belum terdaftar di DB. Hubungi tim backend untuk register jemaat.',
      );
    }
    logger.info(
      { noHp, jemaatId: jemaat.id, ip: req.ip },
      '[auth-otp] app-review bypass verify success',
    );
    return res.json(await issueAuthResponse(noHp, req, 'OTP'));
  }

  // Kode admin cabang hanya untuk login jemaat yang sudah terdaftar.
  const adminFor =
    purpose === 'LOGIN'
      ? (await prisma.jemaat.findUnique({ where: { noHp }, select: { id: true, isTamu: true } }).then((j) => (j && !j.isTamu ? j.id : null)))
      : null;
  const { viaAdmin } = await consumeOtp({ noHp }, purpose, kode, { adminFor });
  if (viaAdmin) {
    logger.info({ noHp, ip: req.ip }, '[auth-otp] login dengan kode admin cabang');
  }

  // ENROLLMENT — jemaat belum ada. Jangan lookup, kembalikan marker saja.
  // Mobile lanjut ke POST /auth/register dalam window 60 menit.
  if (purpose === 'ENROLLMENT') {
    return res.json({
      success: true,
      data: {
        otpVerified: true,
        purpose: 'ENROLLMENT',
        noHp,
        pendingRegistration: true,
        nextStep: 'POST /auth/register',
        // Window di mana /auth/register akan accept verifikasi ini.
        validForSeconds: ENROLL_WINDOW_MS / 1000,
      },
      message: 'Kode terverifikasi. Lanjutkan isi data diri.',
    });
  }

  // ONBOARDING_ADD_NOHP — existing jemaat (logged via magic link) verify
  // noHp baru. Butuh JWT (user context) untuk tau jemaat mana yg update.
  if (purpose === 'ONBOARDING_ADD_NOHP') {
    // Extract jemaatId dari JWT — required
    const bearerToken = extractBearerToken(req.headers.authorization);
    if (!bearerToken) {
      throw Unauthorized('Bearer token wajib untuk ONBOARDING_ADD_NOHP');
    }
    let jwtPayload: { sub: string; jemaatId: string };
    try {
      const decoded = verifyAccessToken(bearerToken);
      jwtPayload = { sub: decoded.sub, jemaatId: decoded.jemaatId };
    } catch {
      throw Unauthorized('Bearer token tidak valid');
    }
    // Set jemaat.noHp untuk authenticated jemaat
    try {
      await prisma.jemaat.update({
        where: { id: jwtPayload.jemaatId },
        data: { noHp, noHpSource: 'SELF_VERIFIED' },
      });
    } catch (err) {
      // P2002 = noHp collision (walau di request handler sudah check, race possible)
      throw Conflict('Nomor HP sudah dipakai jemaat lain');
    }
    audit(req, {
      action: 'UPDATE',
      resource: 'jemaat',
      resourceId: jwtPayload.jemaatId,
      resourceLabel: `Add noHp via onboarding: ${noHp}`,
      metadata: { method: 'ONBOARDING_ADD_NOHP' },
    });
    return res.json({
      success: true,
      message: 'Nomor HP berhasil di-verify + di-set',
      data: { noHp },
    });
  }

  // LOGIN / RESET_FACE — jemaat harus ada. Issue JWT seperti biasa.
  // Kode OTP WhatsApp dipakai → nomor terbukti milik jemaat (mis. nomor yang
  // dulu diisi wali / admin jadi "Terverifikasi").
  if (!viaAdmin) {
    await prisma.jemaat
      .updateMany({ where: { noHp, NOT: { noHpSource: 'SELF_VERIFIED' } }, data: { noHpSource: 'SELF_VERIFIED' } })
      .catch(() => undefined);
    await prisma.jemaat
      .updateMany({ where: { noHp, noHpSource: null }, data: { noHpSource: 'SELF_VERIFIED' } })
      .catch(() => undefined);
  }
  if (viaAdmin) {
    const j = await prisma.jemaat.findUnique({ where: { noHp }, select: { id: true, namaLengkap: true } });
    audit(req, {
      action: 'LOGIN',
      resource: 'jemaat',
      resourceId: j?.id,
      resourceLabel: `Login dengan kode admin cabang: ${j?.namaLengkap ?? noHp}`,
      metadata: { kind: 'admin-code-login', channel: 'whatsapp' },
    });
  }
  return res.json(await issueAuthResponse(noHp, req, 'OTP'));
});

/**
 * POST /auth/register — self-registration jemaat baru (mobile app).
 *
 * Dua saluran:
 *   - otpChannel='whatsapp' (default, app lama): noHp + OTP ENROLLMENT terverifikasi.
 *   - otpChannel='email' (app baru): email + OTP ENROLLMENT_EMAIL terverifikasi.
 * OTP harus terverifikasi ≤ 60 menit sebelumnya (lib/otp-store ENROLL_WINDOW_MS).
 *
 * Klaim data lama (claimJemaatId + claimKode): kode CLAIM_RECORD yang dikirim
 * ke email data lama (lihat /auth/register/match). Kontak pendaftar
 * disambungkan ke data lama — tidak ada akun baru.
 *
 * Pembuatan akun (jemaat, user, homecell, consent) dalam satu transaksi.
 * Dipanggil ulang setelah sukses (respons sebelumnya tidak sampai) →
 * sesi login dikembalikan, bukan "sudah terdaftar".
 *
 * Anti-abuse: registerLimiter (3/jam per nomor/email) + wajib OTP.
 */
authRouter.post('/register', registerLimiter, async (req, res) => {
  const input = registerJemaatSchema.parse(req.body);
  const viaEmail = input.otpChannel === 'email';
  // Batas usia (S&K 3.1 / PP Tunas) — dicek sebelum data apa pun dibuat.
  if (input.consent) {
    assertAgeAllowed(input.tanggalLahir ? new Date(input.tanggalLahir) : null, input.consent.ageGroup);
  }
  await loadWaRuntime();
  if (viaEmail) {
    if (!emailSignupEnabled()) throw ServiceUnavailable('Pendaftaran dengan email sedang ditutup sementara. Silakan daftar dengan WhatsApp.', 'EMAIL_SIGNUP_DISABLED');
    if (isDisposableEmail(input.email!)) throw BadRequest('Gunakan alamat email pribadi (bukan email sementara).');
  }

  // 1. OTP pendaftaran terverifikasi dalam 60 menit.
  const target: OtpTarget = viaEmail ? { email: input.email! } : { noHp: input.noHp! };
  const otpRecord = await findVerifiedEnrollment(target);
  if (!otpRecord) {
    throw Unauthorized('Waktu pendaftaran habis atau kode belum diverifikasi. Silakan ulang pendaftaran dan minta kode baru.');
  }

  // 2. Pemilik kontak saat ini. Tamu (tanpa akun) → record-nya di-upgrade.
  const byPhone = input.noHp ? await prisma.jemaat.findUnique({ where: { noHp: input.noHp } }) : null;
  const byEmail = input.email ? await findJemaatByEmail(input.email) : null;
  const primary = viaEmail ? byEmail : byPhone;
  if (primary && !primary.isTamu) {
    // Respons pendaftaran sebelumnya tidak sampai ke app → kembalikan sesi.
    // Hanya untuk perangkat yang sama (IP & user-agent sama dengan saat minta OTP)
    // dan ≤ 10 menit setelah akun dibuat — supaya orang lain yang mengetahui
    // nomor/email tidak bisa memakai jendela pendaftaran untuk masuk ke akun itu.
    const sameDevice = !!otpRecord.ipAddress && otpRecord.ipAddress === req.ip && (otpRecord.userAgent ?? '') === (req.get('user-agent') ?? '');
    if (
      sameDevice &&
      primary.onboardedAt &&
      primary.onboardedAt >= otpRecord.usedAt! &&
      Date.now() - primary.onboardedAt.getTime() < 10 * 60_000
    ) {
      const again = await issueAuthResponseByJemaatId(primary.id, req, 'OTP');
      return res.status(201).json({ ...again, meta: { kind: 'register', jemaatCreatedId: primary.id, repeated: true } });
    }
    throw Conflict(
      viaEmail ? 'Email sudah terdaftar — gunakan "Masuk dengan email".' : 'Nomor HP sudah terdaftar — silakan masuk dengan OTP WhatsApp.',
    );
  }
  const secondary = viaEmail ? byPhone : byEmail;
  if (secondary && !secondary.isTamu && secondary.id !== primary?.id) {
    throw Conflict(
      viaEmail
        ? 'Nomor HP sudah dipakai akun lain.'
        : 'Email sudah terdaftar — gunakan "Masuk dengan email" di halaman login.',
    );
  }
  let base: Awaited<ReturnType<typeof prisma.jemaat.findUnique>> = primary?.isTamu ? primary : null;

  // 3. Klaim data lama (bukti: kode ke email data lama).
  let claimed = false;
  if (input.claimJemaatId) {
    // Hanya daftar WhatsApp: data lama tanpa nomor HP, kode dikirim ke email data lama.
    if (viaEmail) throw BadRequest('Klaim data lama hanya untuk pendaftaran dengan WhatsApp.');
    if (!input.claimKode) throw BadRequest('Kode verifikasi data lama wajib diisi.');
    const old = await prisma.jemaat.findUnique({ where: { id: input.claimJemaatId } });
    if (!old || !old.isActive || old.isTamu || !old.email) throw BadRequest('Data lama tidak ditemukan.');
    if (old.noHp && old.noHp !== input.noHp) throw Conflict('Data lama sudah memakai nomor HP lain. Hubungi admin cabang.');
    const { record } = await consumeOtp({ email: old.email }, 'CLAIM_RECORD', input.claimKode);
    if (record.jemaatId !== old.id) throw Unauthorized('Kode verifikasi data lama tidak cocok.');
    base = old;
    claimed = true;
  }

  // 4. Validate cabang
  const cabang = await prisma.cabangGereja.findUnique({
    where: { id: input.cabangId },
    select: { id: true, nama: true, isActive: true },
  });
  if (!cabang || !cabang.isActive) {
    throw BadRequest('Cabang tidak valid atau nonaktif.');
  }

  // 5. Kode jemaat unik (data lama / tamu memakai kode lamanya).
  const kode = base?.kode ?? await generateUniqueKode(
    async (k) => !!(await prisma.jemaat.findUnique({ where: { kode: k } })),
  );

  const now = new Date();
  const contact: Prisma.JemaatUncheckedUpdateInput = viaEmail
    ? { email: input.email!, emailVerifiedAt: now, emailSource: 'SELF_VERIFIED' }
    : {
        noHp: input.noHp!,
        noHpSource: 'SELF_VERIFIED',
        // Email opsional di daftar WhatsApp — belum terverifikasi.
        ...(input.email && !(base?.email) ? { email: input.email, emailVerifiedAt: null, emailSource: 'SELF' } : {}),
      };
  if (claimed && base?.email) {
    // Kode klaim dikirim ke email data lama → email itu terbukti.
    Object.assign(contact, { emailVerifiedAt: base.emailVerifiedAt ?? now, emailSource: base.emailSource ?? 'SELF_VERIFIED' });
  }

  // 6. Buat / perbarui akun dalam satu transaksi.
  const { created, user } = await prisma.$transaction(async (tx) => {
    const profile = {
      cabangId: cabang.id,
      namaLengkap: input.namaLengkap,
      kode,
      // Data lama: field yang sudah terisi tidak ditimpa nilai kosong.
      tanggalLahir: input.tanggalLahir ? new Date(input.tanggalLahir) : base?.tanggalLahir ?? null,
      jenisKelamin: input.jenisKelamin,
      alamat: input.alamat ?? base?.alamat ?? null,
      tanggalBergabung: base?.tanggalBergabung ?? now,
      // Register lengkap = onboarded (skip wizard first login).
      onboardedAt: now,
      isActive: true,
    };
    const created = base
      ? await tx.jemaat.update({
          where: { id: base.id },
          data: { ...profile, ...contact, isTamu: false } as Prisma.JemaatUncheckedUpdateInput,
        })
      : await tx.jemaat.create({ data: { ...profile, ...contact } as Prisma.JemaatUncheckedCreateInput });

    if (input.homecellId) {
      const hc = await tx.homecell.findUnique({ where: { id: input.homecellId }, select: { id: true } });
      const already = hc ? await tx.homecellMember.findFirst({ where: { homecellId: hc.id, jemaatId: created.id } }) : null;
      if (hc && !already) {
        await tx.homecellMember.create({ data: { homecellId: hc.id, jemaatId: created.id, isActive: true } });
      }
    }

    const user =
      (await tx.user.findUnique({ where: { jemaatId: created.id } })) ??
      (await tx.user.create({ data: { jemaatId: created.id } }));

    // Bukti persetujuan S&K + Kebijakan Privasi (kepatuhan no. 2)
    if (input.consent) {
      await recordConsent(tx, req, created.id, input.consent, 'REGISTER');
    }
    return { created, user };
  });
  await ensureNewMemberPrivacy(created.id);

  // 7. Role sesuai Portal → Onboarding Config (pilihan + "Semua pendaftar").
  // Gagal → dicatat saja; pendaftaran tidak boleh terblokir karena role.
  try {
    await grantRegisterRoles(created.id, input.jenisJemaat === 'NEW_COMER' ? 'NEW_COMER' : 'JEMAAT_TETAP');
  } catch (err) {
    logger.error({ err, jemaatId: created.id }, 'register: gagal memberi role onboarding (akun tetap dibuat)');
  }

  // 8. Optional foto profile (base64)
  if (input.fotoBase64) {
    try {
      const buf = Buffer.from(
        input.fotoBase64.replace(/^data:image\/\w+;base64,/, ''),
        'base64',
      );
      const fotoUrl = await saveProfilePhoto('jemaat', created.id, buf);
      await prisma.jemaat.update({ where: { id: created.id }, data: { fotoUrl } });
    } catch (err) {
      logger.warn({ err, jemaatId: created.id }, 'Gagal save foto profil saat register');
    }
  }

  // 9. Data lama tanpa email yang mirip → catat kandidat ganda untuk admin.
  if (!claimed) {
    void recordDuplicateCandidates(created.id).catch((err) =>
      logger.warn({ err, jemaatId: created.id }, 'register: gagal mencatat kandidat ganda'),
    );
  }

  // 10. Audit
  audit(req, {
    action: claimed ? 'UPDATE' : 'CREATE',
    resource: 'jemaat',
    resourceId: created.id,
    resourceLabel: `${claimed ? 'Klaim data lama' : 'Self-register'}: ${created.namaLengkap} (${cabang.nama})`,
    metadata: {
      kind: claimed ? 'claim-record' : 'self-onboard-mobile',
      channel: viaEmail ? 'email' : 'whatsapp',
      noHp: input.noHp ?? null,
    },
  });

  // 11. Issue tokens — langsung login
  const authResponse = await issueAuthResponseByJemaatId(created.id, req, 'OTP');
  return res.status(201).json({
    ...authResponse,
    meta: { kind: claimed ? 'claim' : 'register', jemaatCreatedId: created.id, userCreatedId: user.id },
  });
});

/**
 * POST /auth/register/match — cari data jemaat lama yang mungkin milik pendaftar
 * (dipanggil app baru setelah OTP pendaftaran terverifikasi & data diri diisi).
 * Respons tersamarkan; maks 1 kandidat yang jelas unggul.
 */
authRouter.post('/register/match', registerMatchLimiter, async (req, res) => {
  const input = registerMatchSchema.parse(req.body);
  const viaEmail = input.otpChannel === 'email';
  const verified = await findVerifiedEnrollment(viaEmail ? { email: input.email! } : { noHp: input.noHp! });
  if (!verified) throw Unauthorized('Waktu pendaftaran habis atau kode belum diverifikasi. Silakan ulang pendaftaran.');
  const list = await findOldRecords({
    namaLengkap: input.namaLengkap,
    tanggalLahir: new Date(input.tanggalLahir),
    cabangId: input.cabangId,
    channel: viaEmail ? 'email' : 'whatsapp',
  });
  const top = pickOffer(list);
  if (!top) return res.json({ success: true, data: { match: null } });
  const cabang = await prisma.cabangGereja.findUnique({ where: { id: input.cabangId }, select: { nama: true } });
  // Klaim hanya lewat kode ke email data lama (daftar WhatsApp).
  const canClaim = !viaEmail && !!top.email;
  res.json({
    success: true,
    data: {
      match: {
        jemaatId: top.id,
        namaMasked: maskName(top.namaLengkap),
        cabang: cabang?.nama ?? null,
        emailMasked: canClaim ? maskEmail(top.email!) : null,
        canClaim,
      },
    },
  });
});

/**
 * POST /auth/register/claim-otp — kirim kode CLAIM_RECORD ke email data lama.
 * Kandidat dihitung ulang dari data pendaftar (tidak bisa memakai id sembarang).
 */
authRouter.post('/register/claim-otp', registerMatchLimiter, async (req, res) => {
  const input = registerMatchSchema.parse(req.body);
  if (input.otpChannel === 'email') throw BadRequest('Klaim data lama hanya untuk pendaftaran dengan WhatsApp.');
  if (!input.claimJemaatId) throw BadRequest('claimJemaatId wajib diisi.');
  const verified = await findVerifiedEnrollment({ noHp: input.noHp! });
  if (!verified) throw Unauthorized('Waktu pendaftaran habis atau kode belum diverifikasi. Silakan ulang pendaftaran.');
  const top = pickOffer(
    await findOldRecords({
      namaLengkap: input.namaLengkap,
      tanggalLahir: new Date(input.tanggalLahir),
      cabangId: input.cabangId,
      channel: 'whatsapp',
    }),
  );
  if (!top || top.id !== input.claimJemaatId || !top.email) throw BadRequest('Data lama tidak ditemukan.');
  await assertOtpCooldown({ email: top.email }, 'CLAIM_RECORD');
  const ttl = otpTtlSeconds('email');
  const { row, otp } = await createOtp({ email: top.email }, 'CLAIM_RECORD', { ttlSeconds: ttl, req, jemaatId: top.id, provider: 'email' });
  try {
    await sendOtpEmail({ to: top.email, namaLengkap: top.namaLengkap, otp, expiresInMinutes: Math.round(ttl / 60), kind: 'claim' });
  } catch (err) {
    logger.error({ err }, '[register-claim] gagal kirim kode');
    await prisma.otpVerification.delete({ where: { id: row.id } }).catch(() => undefined);
    throw ServiceUnavailable('Layanan email sedang gangguan. Lanjutkan pendaftaran — admin cabang akan menyatukan data lama Anda.', 'EMAIL_UNAVAILABLE');
  }
  res.json({
    success: true,
    message: `Kode dikirim ke ${maskEmail(top.email)}. Bila tidak ada di Inbox, cek folder Spam / Promosi.`,
    data: { emailMasked: maskEmail(top.email), expiresIn: ttl },
  });
});

/**
 * POST /auth/face/login — login shortcut via face descriptor.
 *
 * Patch 2026-05-21r — switch ke MobileFaceNet (cosine similarity).
 * Patch 2026-05-21s — dim correction: actual MobileFaceNet variant ini output
 *                     128-dim, bukan 192 (mobile flatbuffer inspect confirmed).
 * Patch 2026-05-21q — RESTful endpoints + standardized error codes + confidence.
 *
 * - Response include `confidence` field (= cosine similarity, range ~0..1)
 * - Optional `modelVersion` di body — reject kalau mismatch dengan stored
 *   (cegah descriptor model lama match dengan model baru)
 * - Reject stored descriptor dengan modelVersion lama (facenet-v1) — force
 *   re-enroll dengan mobilefacenet-v1
 */
/**
 * POST /auth/face/liveness-nonce — issue signed nonce untuk liveness gate.
 *
 * Mobile flow:
 *   1. Sebelum start liveness challenge UI, panggil endpoint ini dengan
 *      { noHp, purpose: 'ENROLL' | 'LOGIN' }.
 *   2. Server return nonce (HMAC signed JWT) + expiresAt (3 menit dari now).
 *   3. Mobile execute challenges client-side.
 *   4. Mobile submit /face/login or /face/enroll dengan body include
 *      `livenessNonce` field.
 *   5. Server verify signature + TTL + one-shot, throw 401 kalau invalid.
 *
 * Rate-limited via authVerifyLimiter supaya attacker tidak bisa enumerate
 * nonces. Backward compat: nonce OPTIONAL di V1, log warn kalau missing.
 */
authRouter.post('/face/liveness-nonce', authVerifyLimiter, async (req, res) => {
  const { noHp, purpose } = requestLivenessNonceSchema.parse(req.body);
  const { nonce, expiresAt } = issueLivenessNonce(noHp, purpose);
  res.json({
    success: true,
    data: { nonce, expiresAt, ttlSeconds: Math.floor((expiresAt.getTime() - Date.now()) / 1000) },
  });
});

authRouter.post('/face/login', authVerifyLimiter, async (req, res) => {
  const { noHp, descriptor, modelVersion, livenessNonce } = faceLoginSchema.parse(req.body);
  if (!isValidDescriptor(descriptor)) {
    throw new ApiError(422, 'FACE_INVALID_DESCRIPTOR', 'Descriptor tidak valid (harus 128-dim, semua finite).');
  }
  // Liveness gate — V1 optional supaya mobile lama tidak break.
  // V2 akan flip ke required setelah grace period (2026-06-01).
  if (livenessNonce) {
    try {
      consumeLivenessNonce(livenessNonce, noHp, 'LOGIN');
    } catch (err: any) {
      if (err instanceof LivenessNonceError) {
        throw new ApiError(401, err.code, err.message);
      }
      throw err;
    }
  } else {
    logger.warn(
      { noHp, kind: 'face-login-no-nonce' },
      '[liveness] face/login tanpa nonce — V1 grace, akan ke-enforce V2.',
    );
  }

  const jemaat = await prisma.jemaat.findUnique({
    where: { noHp },
    include: { user: true },
  });
  if (!jemaat?.user?.faceDescriptor) {
    throw new ApiError(401, 'FACE_NOT_ENROLLED', 'Wajah belum terdaftar untuk nomor ini. Login dengan OTP dulu lalu enroll wajah di settings.');
  }

  // Model version check. Stored data dengan model lama (facenet-v1 atau NULL)
  // tidak comparable dengan descriptor MobileFaceNet — tolak + minta re-enroll.
  const storedModelVersion = jemaat.user.faceModelVersion ?? 'facenet-v1';
  if (storedModelVersion !== 'mobilefacenet-v1') {
    throw new ApiError(
      409,
      'FACE_MODEL_MISMATCH',
      `Model wajah lama terdeteksi (${storedModelVersion}). Hapus + re-enroll dengan model baru di settings.`,
      { storedModelVersion, expectedModelVersion: 'mobilefacenet-v1' },
    );
  }
  // Client mismatch (mobile kirim model selain mobilefacenet-v1)
  if (modelVersion && modelVersion !== storedModelVersion) {
    throw new ApiError(
      409,
      'FACE_MODEL_MISMATCH',
      `Model wajah client beda (client: ${modelVersion}, server: ${storedModelVersion}).`,
      { clientModelVersion: modelVersion, storedModelVersion },
    );
  }

  const stored = jemaat.user.faceDescriptor as number[];
  const result = matchFace(descriptor, stored);
  if (!result.match) {
    throw new ApiError(
      401,
      'FACE_NO_MATCH',
      'Wajah tidak dikenali. Coba lagi atau login dengan OTP.',
      { similarity: result.similarity, threshold: result.threshold },
    );
  }

  // Confidence = cosine similarity itself (already in 0..1 range untuk
  // normalized face descriptors). Clamp untuk safety.
  const confidence = Math.max(0, Math.min(1, result.similarity));

  const authResponse = await issueAuthResponse(noHp, req, 'FACE');
  return res.json({
    ...authResponse,
    data: {
      ...(authResponse as { data: Record<string, unknown> }).data,
      confidence,
    },
  });
});

/**
 * POST /auth/face/enroll — simpan face descriptor untuk user yang sedang login.
 *
 * Patch 2026-05-21q:
 * - Tolak kalau user sudah enrolled — pakai PUT /auth/me/face-profile untuk
 *   re-enrollment. Pencegah accidental overwrite.
 * - Accept modelVersion + metadata di body untuk audit.
 */
authRouter.post('/face/enroll', requireAuth, async (req, res) => {
  const { descriptor, modelVersion, metadata, livenessNonce } = faceEnrollmentSchema.parse(req.body);
  if (!isValidDescriptor(descriptor)) {
    throw new ApiError(422, 'FACE_INVALID_DESCRIPTOR', 'Descriptor tidak valid (harus 128-dim, semua finite).');
  }

  const userId = req.user!.sub;
  // Liveness gate — V1 optional. Untuk ENROLL, expect noHp dari current jemaat.
  if (livenessNonce) {
    const callerNoHp = (
      await prisma.jemaat.findUnique({
        where: { id: req.user!.jemaatId },
        select: { noHp: true },
      })
    )?.noHp;
    if (!callerNoHp) {
      throw new ApiError(400, 'NO_PHONE', 'Caller tidak punya noHp — tidak bisa verify liveness.');
    }
    try {
      consumeLivenessNonce(livenessNonce, callerNoHp, 'ENROLL');
    } catch (err: any) {
      if (err instanceof LivenessNonceError) {
        throw new ApiError(401, err.code, err.message);
      }
      throw err;
    }
  } else {
    logger.warn(
      { userId, kind: 'face-enroll-no-nonce' },
      '[liveness] face/enroll tanpa nonce — V1 grace, akan ke-enforce V2.',
    );
  }

  // Cek kalau sudah enrolled — POST untuk first-time only, re-enroll via PUT.
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { faceDescriptor: true },
  });
  if (existing?.faceDescriptor) {
    throw new ApiError(
      409,
      'FACE_ALREADY_ENROLLED',
      'Wajah sudah terdaftar. Pakai PUT /auth/me/face-profile untuk update.',
    );
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      faceDescriptor: descriptor,
      faceEnrolledAt: new Date(),
      faceModelVersion: modelVersion ?? 'mobilefacenet-v1',
      faceMetadata: metadata ? (metadata as Prisma.InputJsonValue) : Prisma.DbNull,
    },
    select: { id: true, faceEnrolledAt: true, faceModelVersion: true },
  });

  logger.info({ userId, modelVersion: updated.faceModelVersion }, 'Face descriptor enrolled');
  audit(req, {
    action: 'ENROLL_FACE',
    resource: 'auth',
    resourceId: userId,
    metadata: { modelVersion: updated.faceModelVersion, kind: 'face-enroll' },
  });
  res.status(201).json({
    success: true,
    message: 'Wajah berhasil terdaftar',
    data: {
      faceEnrolledAt: updated.faceEnrolledAt,
      modelVersion: updated.faceModelVersion,
      hasFaceEnrolled: true,
    },
  });
});

/**
 * POST /auth/face/reset — hapus face descriptor user (self-service).
 *
 * Aliased ke DELETE /auth/me/face-profile (preferred mobile pattern).
 * POST endpoint tetap untuk backward-compat.
 */
authRouter.post('/face/reset', requireAuth, async (req, res) => {
  await resetFaceProfile(req);
  res.json({ success: true, message: 'Wajah telah dihapus', data: { hasFaceEnrolled: false } });
});

// ===================================================================
//  /auth/me/face-profile — RESTful pattern (mobile prefers)
// ===================================================================

/**
 * GET /auth/me/face-profile — status enrollment user current.
 */
authRouter.get('/me/face-profile', requireAuth, async (req, res) => {
  const userId = req.user!.sub;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      faceDescriptor: true,
      faceEnrolledAt: true,
      faceModelVersion: true,
    },
  });
  const enrolled = !!user?.faceDescriptor;
  res.json({
    success: true,
    data: {
      enrolled,
      enrolledAt: enrolled ? user!.faceEnrolledAt : null,
      modelVersion: enrolled ? user!.faceModelVersion ?? 'mobilefacenet-v1' : null,
    },
  });
});

/**
 * PUT /auth/me/face-profile — re-enrollment (replace existing descriptor).
 *
 * Berbeda dengan POST /auth/face/enroll yang tolak kalau sudah enrolled,
 * endpoint ini eksplisit untuk REPLACE existing descriptor.
 */
authRouter.put('/me/face-profile', requireAuth, async (req, res) => {
  const { descriptor, modelVersion, metadata } = faceEnrollmentSchema.parse(req.body);
  if (!isValidDescriptor(descriptor)) {
    throw new ApiError(422, 'FACE_INVALID_DESCRIPTOR', 'Descriptor tidak valid (harus 128-dim, semua finite).');
  }

  const userId = req.user!.sub;
  const before = await prisma.user.findUnique({
    where: { id: userId },
    select: { faceEnrolledAt: true, faceModelVersion: true },
  });

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      faceDescriptor: descriptor,
      faceEnrolledAt: new Date(),
      faceModelVersion: modelVersion ?? 'mobilefacenet-v1',
      faceMetadata: metadata ? (metadata as Prisma.InputJsonValue) : Prisma.DbNull,
    },
    select: { id: true, faceEnrolledAt: true, faceModelVersion: true },
  });

  logger.info(
    {
      userId,
      newModelVersion: updated.faceModelVersion,
      previousModelVersion: before?.faceModelVersion,
    },
    'Face descriptor re-enrolled',
  );
  audit(req, {
    action: 'ENROLL_FACE',
    resource: 'auth',
    resourceId: userId,
    metadata: {
      kind: 'face-re-enroll',
      previousModelVersion: before?.faceModelVersion,
      newModelVersion: updated.faceModelVersion,
    },
  });
  res.json({
    success: true,
    message: 'Wajah berhasil di-update',
    data: {
      faceEnrolledAt: updated.faceEnrolledAt,
      modelVersion: updated.faceModelVersion,
      hasFaceEnrolled: true,
    },
  });
});

/**
 * DELETE /auth/me/face-profile — hapus face profile (mobile RESTful pattern).
 *
 * Identical dengan POST /auth/face/reset (legacy), tapi DELETE method
 * lebih semantic untuk "remove my biometric data".
 */
authRouter.delete('/me/face-profile', requireAuth, async (req, res) => {
  await resetFaceProfile(req);
  res.json({
    success: true,
    message: 'Data wajah dihapus',
    data: { hasFaceEnrolled: false },
  });
});

/** Shared helper: hapus face data dari User row + audit. */
async function resetFaceProfile(req: Request) {
  const userId = req.user!.sub;
  await prisma.user.update({
    where: { id: userId },
    data: {
      faceDescriptor: Prisma.JsonNull,
      faceEnrolledAt: null,
      faceModelVersion: null,
      faceMetadata: Prisma.DbNull,
    },
  });
  audit(req, { action: 'RESET_FACE', resource: 'auth', resourceId: userId });
}

/**
 * POST /auth/refresh — rotate access + refresh token.
 *
 * Strategi keamanan:
 *   1. Verify JWT signature dari refresh token
 *   2. Lookup hash di DB — harus ada, belum revoked, belum expired
 *   3. **Reuse detection**: jika token yang sudah revoked dipakai lagi,
 *      revoke SEMUA refresh token user (kemungkinan token bocor)
 *   4. Issue pair baru, simpan hash baru, revoke yang lama (token rotation)
 */
authRouter.post('/refresh', refreshLimiter, async (req, res) => {
  const { refreshToken } = refreshTokenSchema.parse(req.body);

  let payload: { sub: string; type: string };
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw Unauthorized('Refresh token tidak valid');
  }
  if (payload.type !== 'refresh') throw Unauthorized('Token type salah');

  const tokenHash = hashToken(refreshToken);
  const record = await prisma.refreshToken.findUnique({ where: { tokenHash } });

  // Rotation race (2026-10-12): beberapa tab / portal + planning berbagi refresh
  // token. Tab A merotasi, tab B yg masih pegang token lama ikut refresh beberapa
  // detik kemudian. Itu BUKAN pencurian — tolak saja (client akan baca token
  // terbaru dari storage) tanpa me-revoke semua sesi.
  if (record?.revokedAt && isWithinRotationGrace(record.revokedAt)) {
    throw new ApiError(401, 'REFRESH_TOKEN_ROTATED', 'Refresh token sudah diperbarui di tab lain.');
  }

  // Reuse detection (di luar jeda toleransi) — anggap token bocor, cabut semua.
  if (record?.revokedAt) {
    logger.warn(
      { userId: payload.sub, ip: req.ip },
      '⚠️  Refresh token reuse detected — revoking all tokens for user',
    );
    await prisma.refreshToken.updateMany({
      where: { userId: payload.sub, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw Unauthorized('Refresh token sudah pernah dipakai — semua sesi di-logout untuk keamanan');
  }

  if (!record || record.expiresAt < new Date()) {
    throw Unauthorized('Refresh token tidak ditemukan atau kadaluarsa');
  }

  // Rotate: revoke yang lama
  await prisma.refreshToken.update({
    where: { id: record.id },
    data: { revokedAt: new Date() },
  });

  // Cari user → re-build JWT payload (roles bisa berubah sejak login terakhir)
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: payload.sub },
    include: {
      jemaat: {
        include: {
          jemaatRoles: {
            where: { isActive: true },
            include: { role: true, subRole: true, subRoleStatus: true },
          },
        },
      },
    },
  });
  // Gate refresh: kalau jemaat sudah self-deactivate, revoke all + tolak.
  // Kombinasi dgn revoke saat DELETE /admin/me memastikan session benar2 mati.
  if (!user.jemaat.isActive) {
    await prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw Unauthorized('Akun sudah dinonaktifkan. Silakan hubungi admin.');
  }

  const roles = user.jemaat.jemaatRoles.map((jr) => {
    const status = jr.subRoleStatus?.nama ? `:${jr.subRoleStatus.nama}` : '';
    return `${jr.role.nama}:${jr.subRole.nama}${status}`;
  });
  const isFulltimer = user.jemaat.jemaatRoles.some((jr) => jr.role.nama === 'Fulltimer');

  const newAccess = signAccessToken({
    sub: user.id,
    jemaatId: user.jemaatId,
    roles,
    isFulltimer,
  });
  const newRefresh = signRefreshToken(user.id);
  await persistRefreshToken(user.id, newRefresh, req);

  res.json({
    success: true,
    data: {
      accessToken: newAccess,
      refreshToken: newRefresh,
      expiresIn: getJwtTtlSeconds(),
    },
  });
});

/**
 * POST /auth/logout — revoke refresh token (single session) atau all (?all=true).
 */
// GET /auth/me/access — re-fetch resolved menu access untuk user current.
// Berguna setelah admin ubah Role/SubRole access — user bisa refresh tanpa
// re-login.
authRouter.get('/me/access', requireAuth, async (req, res) => {
  if (!req.user) throw Unauthorized();
  const access = await resolveJemaatAccess(req.user.jemaatId);
  res.json({ success: true, data: access });
});

authRouter.post('/logout', async (req, res) => {
  const token = extractBearerToken(req.headers.authorization);
  let userId: string | null = null;
  if (token) {
    try {
      const p = verifyAccessToken(token);
      userId = p.sub;
    } catch {
      // ignore
    }
  }

  const all = req.query.all === 'true';
  const { refreshToken } = req.body ?? {};

  if (all && userId) {
    await prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  } else if (refreshToken) {
    const tokenHash = hashToken(refreshToken);
    await prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  if (userId) {
    audit(req, { action: 'LOGOUT', resource: 'auth', resourceId: userId, metadata: { all } });
  }
  res.json({ success: true, message: 'Logout sukses' });
});

/**
 * GET /auth/cabang — public catalog cabang untuk picker sign-up.
 *
 * Tidak butuh auth (user belum login saat sign-up). Rate-limited 30/menit/IP.
 *
 * Field di-whitelist eksplisit — tidak boleh expose kontak admin, jumlah
 * jemaat, atau data sensitive lainnya. Default filter `isActive=true`
 * supaya picker tidak nge-list cabang yang sudah ditutup.
 *
 * Lihat docs/backend-request-cabang-list.md (request mobile team 2026-05-20).
 */
authRouter.get('/cabang', cabangListLimiter, async (req, res) => {
  const isActiveRaw = req.query.isActive;
  const isActive =
    isActiveRaw === 'false' ? false : isActiveRaw === 'all' ? undefined : true;

  const where = typeof isActive === 'boolean' ? { isActive } : {};
  const data = await prisma.cabangGereja.findMany({
    where,
    orderBy: [{ isActive: 'desc' }, { nama: 'asc' }],
    select: {
      id: true,
      nama: true,
      kode: true,
      alamat: true,
      // Koordinat untuk future map view di mobile (opsional, nullable).
      latitude: true,
      longitude: true,
      // Link Google Maps cabang — tujuan tombol "Petunjuk arah" (website & app).
      mapsUrl: true,
      // Zona waktu IANA cabang — mobile mengonversi jam jadwal ke zona HP.
      timezone: true,
      // Kota untuk label jam "Waktu <kota>" (null = dari nama cabang).
      kota: true,
      isActive: true,
      // Tidak expose: kontak, sinodeId internal, jumlah jemaat, dll.
    },
  });
  res.json({ success: true, data });
});

// ===================================================================
//  Helpers
// ===================================================================

async function persistRefreshToken(userId: string, token: string, req: Request) {
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + getRefreshTtlSeconds() * 1000);
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    },
  });
}

async function issueAuthResponse(noHp: string, req: Request, method: 'OTP' | 'FACE' = 'OTP') {
  const jemaat = await prisma.jemaat.findUniqueOrThrow({
    where: { noHp },
    include: {
      user: true,
      jemaatRoles: {
        where: { isActive: true },
        include: { role: true, subRole: true, subRoleStatus: true },
      },
    },
  });
  // Gate: jemaat self-deactivated → tolak login. Reactivation hanya via portal admin.
  if (!jemaat.isActive) {
    throw Forbidden(
      'Akun Anda sudah dinonaktifkan. Hubungi admin cabang untuk reaktivasi.',
    );
  }

  let user = jemaat.user;
  if (!user) {
    user = await prisma.user.create({ data: { jemaatId: jemaat.id } });
    await ensureNewMemberPrivacy(jemaat.id);
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  const roles = jemaat.jemaatRoles.map((jr) => {
    const status = jr.subRoleStatus?.nama ? `:${jr.subRoleStatus.nama}` : '';
    return `${jr.role.nama}:${jr.subRole.nama}${status}`;
  });
  const isFulltimer = jemaat.jemaatRoles.some((jr) => jr.role.nama === 'Fulltimer');

  const accessToken = signAccessToken({
    sub: user.id,
    jemaatId: jemaat.id,
    roles,
    isFulltimer,
  });
  const refreshToken = signRefreshToken(user.id);
  await persistRefreshToken(user.id, refreshToken, req);

  // Resolve menu access + canAccessPortal sesuai RBAC.
  const access = await resolveJemaatAccess(jemaat.id);

  audit(req, {
    action: 'LOGIN',
    resource: 'auth',
    resourceId: user.id,
    resourceLabel: jemaat.namaLengkap,
    userId: user.id,
    userName: jemaat.namaLengkap,
    metadata: { method, isFulltimer, canAccessPortal: access.canAccessPortal },
  });

  const needsOnboarding = jemaat.onboardedAt == null;
  const onboardingReason = needsOnboarding
    ? {
        missingNoHp: !jemaat.noHp,
        missingProfile: (
          [
            !jemaat.jenisKelamin ? 'jenisKelamin' : null,
            !jemaat.tanggalLahir ? 'tanggalLahir' : null,
          ].filter(Boolean) as string[]
        ),
      }
    : null;

  return {
    success: true,
    data: {
      accessToken,
      refreshToken,
      expiresIn: getJwtTtlSeconds(),
      user: {
        id: user.id,
        jemaatId: jemaat.id,
        namaLengkap: jemaat.namaLengkap,
        noHp: jemaat.noHp ?? '',
        email: jemaat.email ?? null,
        isFulltimer,
        canAccessPortal: access.canAccessPortal,
        menuAccess: access.menuAccess,
        hasFaceEnrolled: !!user.faceDescriptor,
        fotoUrl: user.fotoUrl ?? jemaat.fotoUrl ?? null,
        // Onboarding gate untuk mobile: kalau true, route ke wizard first
        // login. Ini akan set NULL untuk 6736 legacy Shiftsoft jemaat.
        needsOnboarding,
        onboardingReason,
      },
    },
  };
}

// ============================================================
// MODULE 24 — MAGIC LINK EMAIL LOGIN + ONBOARDING
// ============================================================

/**
 * Overload issueAuthResponse untuk terima jemaat by email (magic link path).
 * Reuse core logic dengan lookup berbeda.
 */
async function issueAuthResponseByEmail(email: string, req: Request) {
  // Same shape sebagai issueAuthResponse tapi lookup by email (unique).
  // Untuk avoid duplication, kita panggil issueAuthResponse setelah dapat noHp.
  // Kalau noHp NULL (legacy jemaat blm ada noHp), lookup via jemaatId shortcut.
  const jemaat = await prisma.jemaat.findUnique({
    where: { email },
    select: { id: true, noHp: true },
  });
  if (!jemaat) throw NotFound('Jemaat tidak ditemukan');
  if (jemaat.noHp) {
    return issueAuthResponse(jemaat.noHp, req, 'EMAIL_MAGIC_LINK' as 'OTP');
  }
  // Legacy jemaat tanpa noHp — issue JWT langsung by jemaatId
  return issueAuthResponseByJemaatId(jemaat.id, req);
}

/**
 * Issue JWT untuk jemaat yg belum punya noHp (magic link path, legacy).
 * Same output shape sebagai issueAuthResponse.
 */
async function issueAuthResponseByJemaatId(
  jemaatId: string,
  req: Request,
  method: 'OTP' | 'EMAIL_MAGIC_LINK' | 'EMAIL_OTP' | 'ADMIN_CODE' = 'EMAIL_MAGIC_LINK',
) {
  const jemaat = await prisma.jemaat.findUniqueOrThrow({
    where: { id: jemaatId },
    include: {
      user: true,
      jemaatRoles: {
        where: { isActive: true },
        include: { role: true, subRole: true, subRoleStatus: true },
      },
    },
  });
  if (!jemaat.isActive) {
    throw Forbidden('Akun Anda sudah dinonaktifkan.');
  }
  let user = jemaat.user;
  if (!user) {
    user = await prisma.user.create({ data: { jemaatId: jemaat.id } });
    await ensureNewMemberPrivacy(jemaat.id);
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });
  const roles = jemaat.jemaatRoles.map((jr) => {
    const status = jr.subRoleStatus?.nama ? `:${jr.subRoleStatus.nama}` : '';
    return `${jr.role.nama}:${jr.subRole.nama}${status}`;
  });
  const isFulltimer = jemaat.jemaatRoles.some((jr) => jr.role.nama === 'Fulltimer');
  const accessToken = signAccessToken({
    sub: user.id,
    jemaatId: jemaat.id,
    roles,
    isFulltimer,
  });
  const refreshToken = signRefreshToken(user.id);
  await persistRefreshToken(user.id, refreshToken, req);
  const access = await resolveJemaatAccess(jemaat.id);

  audit(req, {
    action: 'LOGIN',
    resource: 'auth',
    resourceId: user.id,
    resourceLabel: jemaat.namaLengkap,
    userId: user.id,
    userName: jemaat.namaLengkap,
    metadata: { method, isFulltimer },
  });

  const needsOnboarding = jemaat.onboardedAt == null;
  return {
    success: true,
    data: {
      accessToken,
      refreshToken,
      expiresIn: getJwtTtlSeconds(),
      user: {
        id: user.id,
        jemaatId: jemaat.id,
        namaLengkap: jemaat.namaLengkap,
        noHp: jemaat.noHp ?? '',
        email: jemaat.email ?? null,
        isFulltimer,
        canAccessPortal: access.canAccessPortal,
        menuAccess: access.menuAccess,
        hasFaceEnrolled: !!user.faceDescriptor,
        fotoUrl: user.fotoUrl ?? jemaat.fotoUrl ?? null,
        needsOnboarding,
        onboardingReason: needsOnboarding
          ? {
              // Portal WhatsApp Config / ONBOARDING_SKIP_NOHP_OTP → wizard app melewati langkah
              // tambah nomor HP + OTP WhatsApp (app lama ikut, tanpa update).
              missingNoHp: !jemaat.noHp && !skipNoHpOtp(),
              missingProfile: (
                [
                  !jemaat.jenisKelamin ? 'jenisKelamin' : null,
                  !jemaat.tanggalLahir ? 'tanggalLahir' : null,
                ].filter(Boolean) as string[]
              ),
            }
          : null,
      },
    },
  };
}

/**
 * Kirim magic link ke jemaat aktif. Throw EMAIL_UNAVAILABLE bila pengiriman
 * gagal — server tahu email terdaftar & gagal terkirim, jadi jemaat diberi
 * tahu (bukan disuruh menunggu email yang tidak pernah datang).
 */
async function sendMagicLinkFor(jemaat: { id: string; namaLengkap: string; email: string | null }, req: Request) {
  const to = jemaat.email!;
  // Generate token: 32-byte random → 64 char hex
  const token = randomBytes(32).toString('hex');
  const ttlMinutes = Number(process.env.MAGIC_LINK_TTL_MINUTES ?? 15);
  const row = await prisma.magicLinkToken.create({
    data: {
      jemaatId: jemaat.id,
      email: to,
      token,
      expiresAt: new Date(Date.now() + ttlMinutes * 60_000),
      requestedIp: req.ip ?? null,
    },
  });
  // Email button HARUS pakai HTTPS supaya clickable di semua email client
  // (custom URL scheme `ecc://` di-blokir sbg security risk di iOS Mail, Gmail
  // web, Outlook, dsb). Portal `/auth/email/verify` page handle token → JWT,
  // dan (kalau mobile UA) offer deeplink open app.
  const webBase = process.env.EMAIL_MAGIC_LINK_WEB_URL || '';
  const mobileBase = process.env.EMAIL_MAGIC_LINK_MOBILE_URL || '';
  const magicLinkUrl = (webBase || mobileBase) + `?token=${token}`;
  try {
    await sendMagicLinkEmail({ to, namaLengkap: jemaat.namaLengkap, magicLinkUrl, expiresInMinutes: ttlMinutes });
  } catch (err) {
    logger.error({ err: (err as Error).message, jemaatId: jemaat.id }, '[magic-link] Email send failed');
    await prisma.magicLinkToken.delete({ where: { id: row.id } }).catch(() => undefined);
    throw ServiceUnavailable(
      'Layanan email sedang gangguan, link login belum bisa dikirim. Coba masuk dengan OTP WhatsApp, atau coba lagi beberapa menit lagi.',
      'EMAIL_UNAVAILABLE',
    );
  }
  audit(req, {
    action: 'CREATE',
    resource: 'magic_link_token',
    resourceLabel: `Magic link requested for ${jemaat.namaLengkap}`,
    metadata: { email: to },
  });
}

/**
 * POST /auth/email/request-magic-link
 * Body: { email }
 * Email tidak terdaftar → respons umum (tidak membocorkan data).
 * Email terdaftar tapi gagal terkirim → 503 EMAIL_UNAVAILABLE.
 * Pencarian email tidak peka huruf besar/kecil. Rate limit 5/jam per email.
 */
authRouter.post('/email/request-magic-link', magicLinkLimiter, async (req, res) => {
  const { email } = requestMagicLinkSchema.parse(req.body);
  const jemaat = await findJemaatByEmail(email);
  if (jemaat && jemaat.isActive && !jemaat.isTamu) await sendMagicLinkFor(jemaat, req);
  res.json({
    success: true,
    message: 'Kalau email terdaftar, link login sudah dikirim. Cek inbox Anda — bila tidak ada, cek juga folder Spam / Promosi.',
  });
});

/**
 * POST /auth/email/verify-magic-link
 * Body: { token }
 * Validate token → issue JWT (+ needsOnboarding flag di user response).
 */
authRouter.post('/email/verify-magic-link', authVerifyLimiter, async (req, res) => {
  const { token } = verifyMagicLinkSchema.parse(req.body);

  const record = await prisma.magicLinkToken.findUnique({
    where: { token },
    select: {
      id: true,
      jemaatId: true,
      email: true,
      expiresAt: true,
      usedAt: true,
    },
  });
  if (!record) throw Unauthorized('Link tidak valid atau sudah kedaluwarsa. Minta link baru.');
  if (record.usedAt) throw Unauthorized('Link sudah pernah dipakai. Minta link baru.');
  if (record.expiresAt < new Date()) {
    throw Unauthorized('Link sudah kedaluwarsa. Minta link baru.');
  }

  // Mark used (one-time)
  await prisma.magicLinkToken.update({
    where: { id: record.id },
    data: { usedAt: new Date() },
  });

  // Link di email dipakai → email terbukti milik jemaat.
  await prisma.jemaat
    .updateMany({ where: { id: record.jemaatId, email: record.email, emailVerifiedAt: null }, data: { emailVerifiedAt: new Date() } })
    .catch(() => undefined);
  await prisma.jemaat
    .updateMany({
      where: { id: record.jemaatId, email: record.email, OR: [{ emailSource: null }, { NOT: { emailSource: 'SELF_VERIFIED' } }] },
      data: { emailSource: 'SELF_VERIFIED' },
    })
    .catch(() => undefined);

  const authResponse = await issueAuthResponseByJemaatId(record.jemaatId, req);
  return res.json(authResponse);
});

/**
 * POST /auth/email/resend-magic-link
 * Same as request-magic-link tapi rate-limited terpisah.
 */
authRouter.post('/email/resend-magic-link', magicLinkLimiter, async (req, res) => {
  const { email } = requestMagicLinkSchema.parse(req.body);
  const jemaat = await findJemaatByEmail(email);
  if (jemaat && jemaat.isActive && !jemaat.isTamu) await sendMagicLinkFor(jemaat, req);
  res.json({
    success: true,
    message: 'Link login baru sudah dikirim. Cek inbox Anda — bila tidak ada, cek juga folder Spam / Promosi.',
  });
});

/**
 * POST /auth/email-otp/request — kode OTP 6 digit lewat email.
 *   ENROLLMENT_EMAIL — daftar dengan email (email belum dipakai anggota).
 *   LOGIN_EMAIL      — masuk dengan email di Els App web (pengganti magic link).
 * LOGIN_EMAIL untuk email tak terdaftar dijawab umum (tidak membocorkan data).
 */
authRouter.post('/email-otp/request', otpRequestLimiter, async (req, res) => {
  const { email, purpose } = requestEmailOtpSchema.parse(req.body);
  await loadWaRuntime();
  let nama = 'Calon jemaat';
  let jemaatId: string | null = null;
  if (purpose === 'ENROLLMENT_EMAIL') {
    if (!emailSignupEnabled()) {
      throw ServiceUnavailable('Pendaftaran dengan email sedang ditutup sementara. Silakan daftar dengan WhatsApp.', 'EMAIL_SIGNUP_DISABLED');
    }
    if (isDisposableEmail(email)) throw BadRequest('Gunakan alamat email pribadi (bukan email sementara).');
    const owner = await findJemaatByEmail(email);
    if (owner && !owner.isTamu) throw Conflict('Email sudah terdaftar — gunakan "Masuk dengan email" di halaman login.');
  } else {
    const j = await findJemaatByEmail(email);
    if (!j || !j.isActive || j.isTamu) {
      return res.json({ success: true, message: 'Kalau email terdaftar, kode OTP sudah dikirim.', data: { channel: 'email' } });
    }
    nama = j.namaLengkap;
    jemaatId = j.id;
    const adminCode = await prisma.otpVerification.findFirst({
      where: { jemaatId: j.id, purpose: 'ADMIN_CODE', usedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true },
    });
    if (adminCode) {
      return res.json({ success: true, message: 'Masukkan kode masuk dari admin cabang.', data: { channel: 'admin' } });
    }
  }
  await assertOtpCooldown({ email }, purpose);
  const ttl = otpTtlSeconds('email');
  const { row, otp } = await createOtp({ email }, purpose, { ttlSeconds: ttl, req, jemaatId, provider: 'email' });
  try {
    await sendOtpEmail({
      to: email,
      namaLengkap: nama,
      otp,
      expiresInMinutes: Math.round(ttl / 60),
      kind: purpose === 'ENROLLMENT_EMAIL' ? 'signup' : 'login',
    });
  } catch (err) {
    logger.error({ err, purpose }, '[email-otp] gagal kirim');
    await prisma.otpVerification.delete({ where: { id: row.id } }).catch(() => undefined);
    throw ServiceUnavailable(
      purpose === 'ENROLLMENT_EMAIL'
        ? 'Layanan email sedang gangguan. Coba lagi beberapa menit lagi, atau daftar dengan WhatsApp.'
        : 'Layanan email sedang gangguan. Coba lagi beberapa menit lagi, atau masuk dengan OTP WhatsApp.',
      'EMAIL_UNAVAILABLE',
    );
  }
  res.json({
    success: true,
    message: 'Kode OTP sudah dikirim ke email Anda. Bila tidak ada di Inbox, cek folder Spam / Promosi.',
    data: { channel: 'email', expiresIn: ttl },
  });
});

/**
 * POST /auth/email-otp/verify
 *   LOGIN_EMAIL      → sesi login (kode admin cabang juga diterima).
 *   ENROLLMENT_EMAIL → penanda; lanjut POST /auth/register (otpChannel='email') ≤ 60 menit.
 */
authRouter.post('/email-otp/verify', authVerifyLimiter, async (req, res) => {
  const { email, kode, purpose } = verifyEmailOtpSchema.parse(req.body);
  if (purpose === 'ENROLLMENT_EMAIL') {
    await consumeOtp({ email }, purpose, kode);
    return res.json({
      success: true,
      data: { otpVerified: true, purpose, email, pendingRegistration: true, nextStep: 'POST /auth/register', validForSeconds: ENROLL_WINDOW_MS / 1000 },
      message: 'Kode terverifikasi. Lanjutkan isi data diri.',
    });
  }
  const j = await findJemaatByEmail(email);
  if (!j || j.isTamu) throw Unauthorized('Kode OTP tidak ditemukan atau sudah kedaluwarsa. Minta kode baru.');
  const { viaAdmin } = await consumeOtp({ email }, purpose, kode, { adminFor: j.id });
  // Kode ke email terpakai → email terbukti milik jemaat.
  if (!viaAdmin && (!j.emailVerifiedAt || j.emailSource !== 'SELF_VERIFIED')) {
    await prisma.jemaat
      .update({ where: { id: j.id }, data: { emailVerifiedAt: j.emailVerifiedAt ?? new Date(), emailSource: 'SELF_VERIFIED' } })
      .catch(() => undefined);
  }
  if (viaAdmin) {
    audit(req, {
      action: 'LOGIN',
      resource: 'jemaat',
      resourceId: j.id,
      resourceLabel: `Login dengan kode admin cabang: ${j.namaLengkap}`,
      metadata: { kind: 'admin-code-login', channel: 'email' },
    });
  }
  return res.json(await issueAuthResponseByJemaatId(j.id, req, viaAdmin ? 'ADMIN_CODE' : 'EMAIL_OTP'));
});

/**
 * POST /auth/onboarding/complete
 * Body: { namaLengkap?, jenisKelamin?, tanggalLahir?, alamat?, cabangId?, email? }
 * Requires JWT. Update profile fields + set onboardedAt=now().
 *
 * Untuk add noHp, lo pakai flow OTP terpisah:
 *   POST /auth/otp/request  { noHp, purpose: 'ONBOARDING_ADD_NOHP' }
 *   POST /auth/otp/verify   { noHp, kode, purpose: 'ONBOARDING_ADD_NOHP' }
 * → Handler OTP verify akan set jemaat.noHp untuk authenticated user.
 * Setelah noHp verified, call /onboarding/complete untuk profile lain.
 */
authRouter.post(
  '/onboarding/complete',
  onboardingLimiter,
  requireAuth,
  async (req, res) => {
    if (!req.user) throw Unauthorized();
    const input = completeOnboardingSchema.parse(req.body);

    const existing = await prisma.jemaat.findUnique({
      where: { id: req.user.jemaatId },
      select: { id: true, onboardedAt: true, namaLengkap: true, email: true },
    });
    if (!existing) throw NotFound('Jemaat tidak ditemukan');

    // Idempotent — kalau sudah onboarded, tetap boleh update profile tapi
    // onboardedAt tidak berubah.
    const wasOnboarded = existing.onboardedAt != null;

    // Overwrite only fields yang di-set (undefined skip)
    const updateData: Record<string, unknown> = {};
    if (input.namaLengkap !== undefined) updateData.namaLengkap = input.namaLengkap;
    if (input.jenisKelamin !== undefined) updateData.jenisKelamin = input.jenisKelamin;
    if (input.tanggalLahir !== undefined) updateData.tanggalLahir = new Date(input.tanggalLahir);
    if (input.alamat !== undefined) updateData.alamat = input.alamat;
    if (input.cabangId !== undefined) updateData.cabangId = input.cabangId;
    if (input.email !== undefined && input.email !== existing.email?.toLowerCase()) {
      // Email baru diketik sendiri (belum lewat OTP) → belum terverifikasi.
      updateData.email = input.email;
      updateData.emailVerifiedAt = null;
      updateData.emailSource = 'SELF';
    }

    // Tandai onboarded secara atomik: hanya satu permintaan yang "menang" bila
    // tombol ditekan dua kali / request terkirim ulang → role tidak dobel.
    let firstTime = false;
    if (!wasOnboarded) {
      const claim = await prisma.jemaat.updateMany({ where: { id: existing.id, onboardedAt: null }, data: { onboardedAt: new Date() } });
      firstTime = claim.count === 1;
    }

    const updated = await prisma.jemaat.update({
      where: { id: existing.id },
      data: updateData,
      select: {
        id: true,
        namaLengkap: true,
        noHp: true,
        email: true,
        jenisKelamin: true,
        tanggalLahir: true,
        alamat: true,
        cabangId: true,
        onboardedAt: true,
      },
    });

    // Login pertama (data dari impor/admin/keluarga) → role sesuai Onboarding
    // Config, hanya bila belum punya role. Gagal tidak memblokir onboarding.
    let rolesGranted = 0;
    if (firstTime) {
      try {
        rolesGranted = await grantOnboardingRoles(existing.id, input.jenisJemaat === 'NEW_COMER' ? 'NEW_COMER' : 'JEMAAT_TETAP');
      } catch (err) {
        logger.error({ err, jemaatId: existing.id }, 'onboarding: gagal memberi role (onboarding tetap selesai)');
      }
    }

    audit(req, {
      action: 'UPDATE',
      resource: 'jemaat',
      resourceId: existing.id,
      resourceLabel: `Onboarding complete: ${existing.namaLengkap}`,
      metadata: { firstTime, fieldsSet: Object.keys(updateData), rolesGranted },
    });

    res.json({
      success: true,
      message: wasOnboarded ? 'Profil diperbarui' : 'Onboarding selesai',
      data: updated,
    });
  },
);
