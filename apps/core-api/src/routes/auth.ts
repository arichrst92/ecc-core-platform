import { Router } from 'express';
import { prisma } from '@ecc/database';
import {
  generateOtp,
  hashOtp,
  getOtpExpiry,
  verifyOtpHash,
  sendOtpViaWhatsApp,
  signAccessToken,
  signRefreshToken,
  matchFace,
  isValidDescriptor,
} from '@ecc/auth';
import {
  requestOtpSchema,
  verifyOtpSchema,
  faceLoginSchema,
} from '@ecc/shared-types';
import { BadRequest, NotFound, Unauthorized } from '../lib/errors.js';

export const authRouter = Router();

/**
 * POST /auth/otp/request — kirim OTP via WhatsApp.
 */
authRouter.post('/otp/request', async (req, res) => {
  const { noHp, purpose } = requestOtpSchema.parse(req.body);

  // Cek jemaat ada
  const jemaat = await prisma.jemaat.findUnique({ where: { noHp } });
  if (!jemaat) throw NotFound('Nomor HP belum terdaftar sebagai jemaat');

  // Rate-limit: cek apakah ada OTP aktif yang belum expired
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
authRouter.post('/otp/verify', async (req, res) => {
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

  return res.json(await issueAuthResponse(noHp));
});

/**
 * POST /auth/face/login — login shortcut via face descriptor.
 */
authRouter.post('/face/login', async (req, res) => {
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

  return res.json(await issueAuthResponse(noHp));
});

// ---------- Helpers ----------

async function issueAuthResponse(noHp: string) {
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

  // Pastikan user record ada (auto-create kalau belum ada)
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

  return {
    success: true,
    data: {
      accessToken,
      refreshToken,
      expiresIn: 7 * 24 * 60 * 60,
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
