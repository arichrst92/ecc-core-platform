import { Router, type Request } from 'express';
import { prisma } from '@ecc/database';
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
  requestOtpSchema,
  verifyOtpSchema,
  faceLoginSchema,
  faceEnrollmentSchema,
  refreshTokenSchema,
} from '@ecc/shared-types';
import { BadRequest, NotFound, Unauthorized } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { requireAuth } from '../middleware/require-auth.js';
import {
  otpRequestLimiter,
  authVerifyLimiter,
  refreshLimiter,
} from '../middleware/rate-limit.js';
import { audit } from '../lib/audit.js';

export const authRouter = Router();

/**
 * POST /auth/otp/request — kirim OTP via WhatsApp.
 */
authRouter.post('/otp/request', otpRequestLimiter, async (req, res) => {
  const { noHp, purpose } = requestOtpSchema.parse(req.body);

  const jemaat = await prisma.jemaat.findUnique({ where: { noHp } });
  if (!jemaat) throw NotFound('Nomor HP belum terdaftar sebagai jemaat');

  const recent = await prisma.otpVerification.findFirst({
    where: { noHp, purpose, usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  const cooldown = Number(process.env.OTP_RESEND_COOLDOWN_SECONDS ?? 60);
  if (recent && Date.now() - recent.createdAt.getTime() < cooldown * 1000) {
    throw BadRequest(`Mohon tunggu ${cooldown} detik sebelum request OTP baru`);
  }

  const otp = generateOtp();
  const kodeHash = await hashOtp(otp);

  await prisma.otpVerification.create({
    data: {
      noHp,
      kodeHash,
      purpose,
      expiresAt: getOtpExpiry(),
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    },
  });

  await sendOtpViaWhatsApp(noHp, otp);

  res.json({ success: true, message: 'OTP telah dikirim via WhatsApp' });
});

/**
 * POST /auth/otp/verify — verifikasi OTP, dapat JWT.
 */
authRouter.post('/otp/verify', authVerifyLimiter, async (req, res) => {
  const { noHp, kode, purpose } = verifyOtpSchema.parse(req.body);

  const record = await prisma.otpVerification.findFirst({
    where: { noHp, purpose, usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  if (!record) throw Unauthorized('OTP tidak ditemukan atau kadaluarsa');

  const maxAttempts = Number(process.env.OTP_MAX_ATTEMPTS ?? 3);
  if (record.attempts >= maxAttempts) throw Unauthorized('Terlalu banyak percobaan');

  const ok = await verifyOtpHash(kode, record.kodeHash);
  if (!ok) {
    await prisma.otpVerification.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
    });
    throw Unauthorized('OTP salah');
  }

  await prisma.otpVerification.update({
    where: { id: record.id },
    data: { usedAt: new Date() },
  });

  return res.json(await issueAuthResponse(noHp, req, 'OTP'));
});

/**
 * POST /auth/face/login — login shortcut via face descriptor.
 */
authRouter.post('/face/login', authVerifyLimiter, async (req, res) => {
  const { noHp, descriptor } = faceLoginSchema.parse(req.body);
  if (!isValidDescriptor(descriptor)) throw BadRequest('Descriptor tidak valid');

  const jemaat = await prisma.jemaat.findUnique({
    where: { noHp },
    include: { user: true },
  });
  if (!jemaat?.user?.faceDescriptor) throw Unauthorized('Wajah belum terdaftar');

  const stored = jemaat.user.faceDescriptor as number[];
  const result = matchFace(descriptor, stored);
  if (!result.match) {
    throw Unauthorized(`Wajah tidak cocok (distance=${result.distance.toFixed(3)})`);
  }

  return res.json(await issueAuthResponse(noHp, req, 'FACE'));
});

/**
 * POST /auth/face/enroll — simpan face descriptor untuk user yang sedang login.
 *
 * Setelah enrollment, user bisa login pakai shortcut /auth/face/login.
 * Endpoint ini overwrite descriptor sebelumnya (re-enrollment OK).
 */
authRouter.post('/face/enroll', requireAuth, async (req, res) => {
  const { descriptor } = faceEnrollmentSchema.parse(req.body);
  if (!isValidDescriptor(descriptor)) throw BadRequest('Descriptor tidak valid');

  const userId = req.user!.sub;
  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      faceDescriptor: descriptor,
      faceEnrolledAt: new Date(),
    },
    select: { id: true, faceEnrolledAt: true },
  });

  logger.info({ userId }, 'Face descriptor enrolled');
  audit(req, { action: 'ENROLL_FACE', resource: 'auth', resourceId: userId });
  res.json({
    success: true,
    message: 'Wajah berhasil terdaftar',
    data: { faceEnrolledAt: updated.faceEnrolledAt, hasFaceEnrolled: true },
  });
});

/**
 * POST /auth/face/reset — hapus face descriptor user (self-service).
 */
authRouter.post('/face/reset', requireAuth, async (req, res) => {
  const userId = req.user!.sub;
  await prisma.user.update({
    where: { id: userId },
    data: { faceDescriptor: null, faceEnrolledAt: null },
  });
  audit(req, { action: 'RESET_FACE', resource: 'auth', resourceId: userId });
  res.json({ success: true, message: 'Wajah telah dihapus', data: { hasFaceEnrolled: false } });
});

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

  // Reuse detection
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

  let user = jemaat.user;
  if (!user) {
    user = await prisma.user.create({ data: { jemaatId: jemaat.id } });
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

  audit(req, {
    action: 'LOGIN',
    resource: 'auth',
    resourceId: user.id,
    resourceLabel: jemaat.namaLengkap,
    userId: user.id,
    userName: jemaat.namaLengkap,
    metadata: { method, isFulltimer },
  });

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
        isFulltimer,
        hasFaceEnrolled: !!user.faceDescriptor,
        fotoUrl: user.fotoUrl ?? jemaat.fotoUrl ?? null,
      },
    },
  };
}
