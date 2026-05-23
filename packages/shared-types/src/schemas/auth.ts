import { z } from 'zod';
import { noHpSchema, uuidSchema } from './common.js';

// ===== Request OTP =====
export const requestOtpSchema = z
  .object({
    noHp: noHpSchema,
    purpose: z.enum(['LOGIN', 'ENROLLMENT', 'RESET_FACE']).default('LOGIN'),
  })
  .openapi('RequestOtpInput');
export type RequestOtpInput = z.infer<typeof requestOtpSchema>;

// ===== Verify OTP =====
export const verifyOtpSchema = z
  .object({
    noHp: noHpSchema,
    kode: z.string().length(6, 'OTP harus 6 digit').openapi({ example: '123456' }),
    purpose: z.enum(['LOGIN', 'ENROLLMENT', 'RESET_FACE']).default('LOGIN'),
  })
  .openapi('VerifyOtpInput');
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;

// ===== Face Login (shortcut, opsional) =====
// 128-dim Float32 descriptor dari MobileFaceNet (native TFLite di mobile),
// di-encode ke array number. **Patch 2026-05-21r** — switch dari face-api.js
// (FaceNet 128-dim Euclidean) ke MobileFaceNet (cosine) karena WebView TFJS
// terlalu lambat di production. **Patch 2026-05-21s** — dim correction: actual
// MobileFaceNet variant ini output 128-dim (verified via TFLite flatbuffer
// inspect mobile-side; initial estimate 192 typo'd). Descriptor space tetap
// beda dari legacy face-api.js — disambiguate via `face_model_version`.
export const faceDescriptorSchema = z
  .array(z.number())
  .length(128, 'Face descriptor harus 128 dimensi (MobileFaceNet)');

/**
 * Optional di V1 — opaque HMAC-signed nonce dari POST /auth/face/liveness-nonce.
 * Saat di-set, server verify nonce TTL + binding ke noHp + one-shot consume.
 * Future: required setelah grace period mobile migrate.
 */
const livenessNonceField = z.string().min(20).max(2048).optional().openapi({
  description:
    'Liveness nonce dari POST /auth/face/liveness-nonce (3 menit TTL, one-shot). Optional V1, required setelah grace period.',
});

export const faceLoginSchema = z
  .object({
    noHp: noHpSchema,
    descriptor: faceDescriptorSchema,
    modelVersion: z.string().min(1).max(32).optional(),
    livenessNonce: livenessNonceField,
  })
  .openapi('FaceLoginInput');
export type FaceLoginInput = z.infer<typeof faceLoginSchema>;

// ===== Face Enrollment =====
//
// Body: 128-dim descriptor (MobileFaceNet) + optional modelVersion + metadata.
// Mobile dev kirim descriptor dari client-side MobileFaceNet (TFLite native via
// react-native-fast-tflite). modelVersion + metadata optional untuk audit +
// future model migration. Default modelVersion server-side: `mobilefacenet-v1`.
export const faceEnrollmentSchema = z
  .object({
    descriptor: faceDescriptorSchema,
    modelVersion: z
      .string()
      .min(1)
      .max(32)
      .optional()
      .openapi({ example: 'mobilefacenet-v1', description: 'ML model identifier, default mobilefacenet-v1' }),
    metadata: z
      .object({
        platform: z.enum(['ios', 'android', 'web']).optional(),
        deviceModel: z.string().max(100).optional(),
        appVersion: z.string().max(32).optional(),
        consentVersion: z.string().max(32).optional(),
      })
      .optional()
      .openapi({ description: 'Audit metadata: device + consent info' }),
    livenessNonce: livenessNonceField,
  })
  .openapi('FaceEnrollmentInput');
export type FaceEnrollmentInput = z.infer<typeof faceEnrollmentSchema>;

// ===== Liveness Nonce Request =====
// POST /auth/face/liveness-nonce — caller specify noHp + purpose.
// Response include nonce (opaque token, JWT-style HMAC signed, TTL 3 menit).
export const requestLivenessNonceSchema = z
  .object({
    noHp: noHpSchema,
    purpose: z.enum(['ENROLL', 'LOGIN']).openapi({
      description: 'ENROLL untuk face enrollment baru, LOGIN untuk shortcut login.',
    }),
  })
  .openapi('RequestLivenessNonceInput');
export type RequestLivenessNonceInput = z.infer<typeof requestLivenessNonceSchema>;

// ===== JWT Payload =====
export interface JwtPayload {
  sub: string;            // user id
  jemaatId: string;
  roles: string[];        // contoh: ["Fulltimer:Pastoral:Lead Pastor", "Jemaat:Jemaat Tetap"]
  isFulltimer: boolean;   // shortcut untuk portal access check
  iat: number;
  exp: number;
}

// ===== Auth Response =====
export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: {
    id: string;
    jemaatId: string;
    namaLengkap: string;
    noHp: string;
    isFulltimer: boolean;
    hasFaceEnrolled: boolean;
    // URL foto profil — prioritas: user.fotoUrl (avatar), fallback ke jemaat.fotoUrl
    fotoUrl: string | null;
  };
}

// ===== Refresh =====
export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;

// ===== Self-Registration (mobile app, post-OTP) =====
// Flow: jemaat baru request OTP purpose=ENROLLMENT → verify OTP → submit form
// data diri ke POST /auth/register. Backend cek OTP record terakhir untuk
// noHp+purpose=ENROLLMENT yang status `usedAt != null` (sudah verified) dalam
// window 15 menit. Anti-abuse: rate limit per noHp (1 register / nomor).
// Per request `docs/backend-request-optional-signup-fields.md` (2026-05-21):
// Mobile simplify form ke 3 field saja (nama, JK, cabang). tanggalLahir &
// alamat opsional supaya user onboard cepat dan lengkapi data via PATCH /admin/me
// setelah login.
export const registerJemaatSchema = z
  .object({
    noHp: noHpSchema,
    namaLengkap: z.string().trim().min(2).max(255),
    jenisKelamin: z.enum(['L', 'P']),
    cabangId: uuidSchema,
    // Optional — user bisa lengkapi nanti via PATCH /admin/me.
    tanggalLahir: z
      .string()
      .date()
      .optional()
      .openapi({ example: '1992-05-15', description: 'ISO date, opsional' }),
    alamat: z.string().trim().max(500).optional(),
    homecellId: uuidSchema.optional(),
    // OPSIONAL: foto profile bisa di-upload setelah register via /admin/me/foto.
    fotoBase64: z
      .string()
      .max(5 * 1024 * 1024) // ~5MB base64 string
      .optional()
      .openapi({ description: 'Base64-encoded JPEG/PNG (max ~5MB)' }),
  })
  .openapi('RegisterJemaatInput');
export type RegisterJemaatInput = z.infer<typeof registerJemaatSchema>;

// ===== Self profile edit (PATCH /admin/me) =====
// Field yang user boleh self-edit (subset dari updateJemaatSchema admin).
// noHp tidak boleh — pindah HP perlu re-verify OTP.
//
// **Patch 2026-05-22** — cabangId sekarang **boleh** untuk direct branch
// change (per request mobile direct-branch-change.md). Sebelumnya wajib via
// branch-change-request flow + admin approval. UX decision: trust-based,
// audit log capture pindah supaya ops bisa trace.
export const selfEditJemaatSchema = z
  .object({
    namaLengkap: z.string().trim().min(2).max(255).optional(),
    email: z.string().trim().email().nullable().optional(),
    tanggalLahir: z.string().date().nullable().optional(),
    jenisKelamin: z.enum(['L', 'P']).nullable().optional(),
    alamat: z.string().trim().max(500).nullable().optional(),
    cabangId: uuidSchema.optional(),
  })
  .openapi('SelfEditJemaatInput');
export type SelfEditJemaatInput = z.infer<typeof selfEditJemaatSchema>;

// ===== Edit dependent (PATCH /admin/me/family/:jemaatId/profile) =====
// Patch 2026-05-22 per request mobile profile-edit-completeness.md +
// extended 2026-05-22 per dependent-edit-fuller.md untuk include
// noHp + email — guardian bisa promote dependent ke full member (anak
// balita yg sudah remaja + punya HP sendiri).
//
// Cabang/kode/primaryGuardianId/role tetap admin-only.
export const editDependentJemaatSchema = z
  .object({
    namaLengkap: z.string().trim().min(2).max(255).optional(),
    tanggalLahir: z.string().date().nullable().optional(),
    jenisKelamin: z.enum(['L', 'P']).nullable().optional(),
    alamat: z.string().trim().max(500).nullable().optional(),
    // noHp & email: pakai noHpSchema (E.164 international) + email standard.
    // Nullable supaya guardian bisa clear field dengan kirim null/"".
    // Empty string '' di-coerce ke null via preprocess.
    noHp: z
      .preprocess(
        (v) => (v === '' || v === null ? null : v),
        z.union([noHpSchema, z.null()]),
      )
      .optional(),
    email: z
      .preprocess(
        (v) => (v === '' || v === null ? null : v),
        z.union([z.string().trim().email().max(255), z.null()]),
      )
      .optional(),
  })
  .openapi('EditDependentJemaatInput');
export type EditDependentJemaatInput = z.infer<typeof editDependentJemaatSchema>;

// ===== User Profile =====
export const userProfileSchema = z.object({
  userId: uuidSchema,
  jemaatId: uuidSchema,
  hasFaceEnrolled: z.boolean(),
});
export type UserProfile = z.infer<typeof userProfileSchema>;
