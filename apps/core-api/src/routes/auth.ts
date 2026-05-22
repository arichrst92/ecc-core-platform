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
  requestOtpSchema,
  verifyOtpSchema,
  faceLoginSchema,
  faceEnrollmentSchema,
  refreshTokenSchema,
  registerJemaatSchema,
} from '@ecc/shared-types';
import { ApiError, BadRequest, Conflict, Forbidden, NotFound, Unauthorized } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { requireAuth } from '../middleware/require-auth.js';
import { resolveJemaatAccess } from '../lib/menu-access.js';
import {
  otpRequestLimiter,
  authVerifyLimiter,
  refreshLimiter,
  registerLimiter,
  cabangListLimiter,
} from '../middleware/rate-limit.js';
import { audit } from '../lib/audit.js';
import { generateUniqueKode } from '../lib/kode-reservasi.js';
import { saveProfilePhoto } from '../lib/storage.js';

export const authRouter = Router();

/**
 * POST /auth/otp/request — kirim OTP via WhatsApp.
 *
 * Untuk purpose=ENROLLMENT (self-registration mobile), skip lookup jemaat
 * — kita izinkan request OTP dari nomor belum terdaftar supaya bisa
 * complete flow register (POST /auth/register).
 */
authRouter.post('/otp/request', otpRequestLimiter, async (req, res) => {
  const { noHp, purpose } = requestOtpSchema.parse(req.body);

  if (purpose === 'ENROLLMENT') {
    // Cek jangan sampai noHp sudah terdaftar (cegah duplicate enrollment).
    const existing = await prisma.jemaat.findUnique({ where: { noHp } });
    if (existing) throw Conflict('Nomor HP sudah terdaftar — gunakan login OTP.');
  } else {
    const jemaat = await prisma.jemaat.findUnique({ where: { noHp } });
    if (!jemaat) throw NotFound('Nomor HP belum terdaftar sebagai jemaat');
  }

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
 * POST /auth/otp/verify — verifikasi OTP.
 *
 * Behavior per purpose:
 *   - LOGIN       → verify + langsung issue JWT (jemaat harus exist).
 *   - RESET_FACE  → verify + langsung issue JWT (jemaat harus exist, dia mau reset wajah).
 *   - ENROLLMENT  → verify saja (jemaat BELUM ada). Response cuma marker
 *                   `pendingRegistration=true` + masa berlaku 15 menit untuk
 *                   panggil /auth/register.
 *
 * Sebelumnya endpoint ini selalu panggil issueAuthResponse() yang lookup
 * jemaat by noHp dengan findUniqueOrThrow → untuk ENROLLMENT jadi error
 * "data tidak ditemukan" karena memang belum ada. Bug fix 2026-05-21c.
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

  // ENROLLMENT — jemaat belum ada. Jangan lookup, kembalikan marker saja.
  // Mobile lanjut ke POST /auth/register dalam window 15 menit.
  if (purpose === 'ENROLLMENT') {
    return res.json({
      success: true,
      data: {
        otpVerified: true,
        purpose: 'ENROLLMENT',
        noHp,
        pendingRegistration: true,
        nextStep: 'POST /auth/register',
        // Window di mana /auth/register akan accept verifikasi ini (matched
        // dengan logic di endpoint register: 15 menit dari usedAt).
        validForSeconds: 15 * 60,
      },
      message: 'OTP terverifikasi. Lanjutkan ke /auth/register untuk menyelesaikan registrasi.',
    });
  }

  // LOGIN / RESET_FACE — jemaat harus ada. Issue JWT seperti biasa.
  return res.json(await issueAuthResponse(noHp, req, 'OTP'));
});

/**
 * POST /auth/register — self-registration jemaat baru (mobile app).
 *
 * Pre-requisite:
 *   1. User sudah request OTP dengan purpose=ENROLLMENT.
 *   2. User sudah verify OTP via /auth/otp/verify (purpose=ENROLLMENT) → record
 *      OtpVerification ditandai usedAt.
 *   3. Submit form data diri ke endpoint ini dengan noHp yang sama.
 *
 * Backend cek:
 *   - Ada OtpVerification record untuk (noHp, purpose=ENROLLMENT, usedAt != null)
 *     dalam 15 menit terakhir.
 *   - Jemaat dengan noHp tsb belum ada.
 *   - Cabang exist & active.
 *
 * Side effect:
 *   - Create Jemaat baru (auto-active, auto-generated kode).
 *   - Create User row.
 *   - Auto-assign role default "Jemaat" + subRole "Jemaat Tetap" — kalau seed
 *     role tersedia.
 *   - Issue accessToken + refreshToken (langsung login).
 *
 * Anti-abuse: registerLimiter (3/jam/IP). Note: tetap perlu OTP verified, jadi
 * cost-of-attack relatively tinggi (perlu nomor HP valid + OTP).
 */
authRouter.post('/register', registerLimiter, async (req, res) => {
  const input = registerJemaatSchema.parse(req.body);

  // 1. Cek nomor belum terdaftar
  const existing = await prisma.jemaat.findUnique({ where: { noHp: input.noHp } });
  if (existing) throw Conflict('Nomor HP sudah terdaftar.');

  // 2. Verify OTP enrollment sudah pernah usedAt dalam window 15 menit
  const enrollmentWindow = 15 * 60 * 1000; // 15 min
  const otpRecord = await prisma.otpVerification.findFirst({
    where: {
      noHp: input.noHp,
      purpose: 'ENROLLMENT',
      usedAt: { gt: new Date(Date.now() - enrollmentWindow) },
    },
    orderBy: { usedAt: 'desc' },
  });
  if (!otpRecord) {
    throw Unauthorized(
      'OTP enrollment belum diverifikasi atau sudah expired. Silakan request OTP baru.',
    );
  }

  // 3. Validate cabang
  const cabang = await prisma.cabangGereja.findUnique({
    where: { id: input.cabangId },
    select: { id: true, nama: true, isActive: true },
  });
  if (!cabang || !cabang.isActive) {
    throw BadRequest('Cabang tidak valid atau nonaktif.');
  }

  // 4. Generate kode jemaat unique
  const kode = await generateUniqueKode(
    async (k) => !!(await prisma.jemaat.findUnique({ where: { kode: k } })),
  );

  // 5. Resolve role default "Jemaat" + "Jemaat Tetap" (kalau ada di seed).
  // Pakai best-effort — kalau tidak ada, skip role assignment.
  const defaultRole = await prisma.role.findFirst({
    where: { nama: 'Jemaat', isActive: true },
    include: { subRoles: { where: { nama: 'Jemaat Tetap', isActive: true } } },
  });

  // 6. Create Jemaat
  const created = await prisma.jemaat.create({
    data: {
      cabangId: cabang.id,
      namaLengkap: input.namaLengkap,
      noHp: input.noHp,
      kode,
      // tanggalLahir & alamat opsional — kalau tidak diisi, simpan NULL.
      // User bisa lengkapi nanti via PATCH /admin/me.
      tanggalLahir: input.tanggalLahir ? new Date(input.tanggalLahir) : null,
      jenisKelamin: input.jenisKelamin,
      alamat: input.alamat ?? null,
      tanggalBergabung: new Date(),
      isActive: true,
      jemaatRoles: defaultRole?.subRoles[0]
        ? {
            create: {
              roleId: defaultRole.id,
              subRoleId: defaultRole.subRoles[0].id,
              isActive: true,
            },
          }
        : undefined,
    },
  });

  // 7. Optional homecell membership
  if (input.homecellId) {
    const hc = await prisma.homecell.findUnique({ where: { id: input.homecellId } });
    if (hc) {
      await prisma.homecellMember.create({
        data: { homecellId: hc.id, jemaatId: created.id, isActive: true },
      });
    }
  }

  // 8. Create User row (auth account)
  const user = await prisma.user.create({ data: { jemaatId: created.id } });

  // 9. Optional foto profile (base64)
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

  // 10. Audit
  audit(req, {
    action: 'CREATE',
    resource: 'jemaat',
    resourceId: created.id,
    resourceLabel: `Self-register: ${created.namaLengkap} (${cabang.nama})`,
    metadata: { kind: 'self-onboard-mobile', noHp: input.noHp },
  });

  // 11. Issue tokens — langsung login
  const authResponse = await issueAuthResponse(input.noHp, req, 'OTP');
  // augment metadata: tandai initial register
  return res.status(201).json({
    ...authResponse,
    meta: { kind: 'register', jemaatCreatedId: created.id, userCreatedId: user.id },
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
authRouter.post('/face/login', authVerifyLimiter, async (req, res) => {
  const { noHp, descriptor, modelVersion } = faceLoginSchema.parse(req.body);
  if (!isValidDescriptor(descriptor)) {
    throw new ApiError(422, 'FACE_INVALID_DESCRIPTOR', 'Descriptor tidak valid (harus 128-dim, semua finite).');
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
  const { descriptor, modelVersion, metadata } = faceEnrollmentSchema.parse(req.body);
  if (!isValidDescriptor(descriptor)) {
    throw new ApiError(422, 'FACE_INVALID_DESCRIPTOR', 'Descriptor tidak valid (harus 128-dim, semua finite).');
  }

  const userId = req.user!.sub;

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
        canAccessPortal: access.canAccessPortal,
        menuAccess: access.menuAccess,
        hasFaceEnrolled: !!user.faceDescriptor,
        fotoUrl: user.fotoUrl ?? jemaat.fotoUrl ?? null,
      },
    },
  };
}
