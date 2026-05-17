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
// 128-dim Float32 descriptor dari face-api.js, di-encode ke array number.
export const faceDescriptorSchema = z
  .array(z.number())
  .length(128, 'Face descriptor harus 128 dimensi');

export const faceLoginSchema = z.object({
  noHp: noHpSchema,
  descriptor: faceDescriptorSchema,
});
export type FaceLoginInput = z.infer<typeof faceLoginSchema>;

// ===== Face Enrollment =====
export const faceEnrollmentSchema = z.object({
  descriptor: faceDescriptorSchema,
});
export type FaceEnrollmentInput = z.infer<typeof faceEnrollmentSchema>;

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

// ===== User Profile =====
export const userProfileSchema = z.object({
  userId: uuidSchema,
  jemaatId: uuidSchema,
  hasFaceEnrolled: z.boolean(),
});
export type UserProfile = z.infer<typeof userProfileSchema>;
