/**
 * Penyimpanan & verifikasi kode OTP untuk dua saluran (nomor HP / email),
 * termasuk "kode masuk dari admin cabang" (purpose ADMIN_CODE).
 *
 * Satu tabel `otp_verification`; target = no_hp ATAU email.
 */
import type { Request } from 'express';
import { prisma, type OtpPurpose, type OtpVerification } from '@ecc/database';
import { generateOtp, hashOtp, verifyOtpHash } from '@ecc/auth';
import { BadRequest, Unauthorized } from './errors.js';

export type OtpTarget = { noHp: string; email?: undefined } | { email: string; noHp?: undefined };

/** Masa berlaku: WhatsApp 5 menit (OTP_EXPIRES_SECONDS), email 10 menit, kode admin 10 menit. */
export function otpTtlSeconds(kind: 'wa' | 'email' | 'admin'): number {
  if (kind === 'wa') return Number(process.env.OTP_EXPIRES_SECONDS ?? 300);
  if (kind === 'email') return Number(process.env.EMAIL_OTP_EXPIRES_SECONDS ?? 600);
  return Number(process.env.ADMIN_CODE_EXPIRES_SECONDS ?? 600);
}

/** Jendela setelah OTP pendaftaran terverifikasi untuk menyelesaikan /auth/register. */
export const ENROLL_WINDOW_MS = 60 * 60_000;

const targetWhere = (t: OtpTarget) => (t.noHp ? { noHp: t.noHp } : { email: t.email! });

/** Tolak permintaan OTP baru bila yang sebelumnya baru saja dibuat (cooldown). */
export async function assertOtpCooldown(target: OtpTarget, purpose: OtpPurpose): Promise<void> {
  const cooldown = Number(process.env.OTP_RESEND_COOLDOWN_SECONDS ?? 60);
  const recent = await prisma.otpVerification.findFirst({
    where: { ...targetWhere(target), purpose, usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  if (recent && Date.now() - recent.createdAt.getTime() < cooldown * 1000) {
    throw BadRequest(`Mohon tunggu ${cooldown} detik sebelum request OTP baru`);
  }
}

/** Buat baris OTP baru. Kode asli dikembalikan untuk dikirim (tidak disimpan). */
export async function createOtp(
  target: OtpTarget,
  purpose: OtpPurpose,
  opts: { ttlSeconds: number; req?: Request; jemaatId?: string | null; createdByUserId?: string | null; provider?: string | null },
): Promise<{ row: OtpVerification; otp: string }> {
  const otp = generateOtp();
  const row = await prisma.otpVerification.create({
    data: {
      noHp: target.noHp ?? null,
      email: target.email ?? null,
      kodeHash: await hashOtp(otp),
      purpose,
      expiresAt: new Date(Date.now() + opts.ttlSeconds * 1000),
      ipAddress: opts.req?.ip,
      userAgent: opts.req?.get('user-agent'),
      jemaatId: opts.jemaatId ?? null,
      createdByUserId: opts.createdByUserId ?? null,
      provider: opts.provider ?? null,
    },
  });
  return { row, otp };
}

export async function setOtpProvider(id: string, provider: string): Promise<void> {
  await prisma.otpVerification.update({ where: { id }, data: { provider } }).catch(() => undefined);
}

/**
 * Verifikasi kode. Bila `adminFor` diisi (jemaatId), kode masuk dari admin
 * cabang untuk jemaat itu juga diterima. Kode benar → ditandai terpakai.
 */
export async function consumeOtp(
  target: OtpTarget,
  purpose: OtpPurpose,
  kode: string,
  opts: { adminFor?: string | null } = {},
): Promise<{ record: OtpVerification; viaAdmin: boolean }> {
  const now = new Date();
  const maxAttempts = Number(process.env.OTP_MAX_ATTEMPTS ?? 3);
  const record = await prisma.otpVerification.findFirst({
    where: { ...targetWhere(target), purpose, usedAt: null, expiresAt: { gt: now } },
    orderBy: { createdAt: 'desc' },
  });
  if (record && record.attempts < maxAttempts && (await verifyOtpHash(kode, record.kodeHash))) {
    const used = await prisma.otpVerification.update({ where: { id: record.id }, data: { usedAt: now } });
    return { record: used, viaAdmin: false };
  }

  if (opts.adminFor) {
    const adminCodes = await prisma.otpVerification.findMany({
      where: { jemaatId: opts.adminFor, purpose: 'ADMIN_CODE', usedAt: null, expiresAt: { gt: now }, attempts: { lt: maxAttempts } },
      orderBy: { createdAt: 'desc' },
      take: 3,
    });
    for (const a of adminCodes) {
      if (await verifyOtpHash(kode, a.kodeHash)) {
        const used = await prisma.otpVerification.update({ where: { id: a.id }, data: { usedAt: now } });
        return { record: used, viaAdmin: true };
      }
    }
    if (adminCodes.length && !record) {
      await prisma.otpVerification.updateMany({ where: { id: { in: adminCodes.map((a) => a.id) } }, data: { attempts: { increment: 1 } } });
      throw Unauthorized('OTP salah');
    }
  }

  if (!record) throw Unauthorized('OTP tidak ditemukan atau kadaluarsa');
  if (record.attempts >= maxAttempts) throw Unauthorized('Terlalu banyak percobaan');
  await prisma.otpVerification.update({ where: { id: record.id }, data: { attempts: { increment: 1 } } });
  throw Unauthorized('OTP salah');
}

/** OTP pendaftaran (nomor HP / email) yang terverifikasi dalam jendela 60 menit. */
export async function findVerifiedEnrollment(target: OtpTarget) {
  return prisma.otpVerification.findFirst({
    where: {
      ...targetWhere(target),
      purpose: target.noHp ? 'ENROLLMENT' : 'ENROLLMENT_EMAIL',
      usedAt: { gt: new Date(Date.now() - ENROLL_WINDOW_MS) },
    },
    orderBy: { usedAt: 'desc' },
  });
}

/**
 * Cari jemaat lewat email tanpa peka huruf besar/kecil. Persis sama
 * didahulukan; bila hanya cocok tanpa peka huruf dan hasilnya >1 (email ganda
 * yang belum dirapikan) → null (ambigu, jangan menebak akun).
 */
export async function findJemaatByEmail(email: string) {
  const e = email.trim().toLowerCase();
  const exact = await prisma.jemaat.findUnique({ where: { email: e } });
  if (exact) return exact;
  const rows = await prisma.jemaat.findMany({ where: { email: { equals: e, mode: 'insensitive' } }, take: 2 });
  return rows.length === 1 ? rows[0]! : null;
}

/** Samarkan email untuk ditampilkan: "kenrick@gmail.com" → "k******@gmail.com". */
export function maskEmail(email: string): string {
  const [user = '', domain = ''] = email.split('@');
  if (!domain) return '***';
  const head = user.slice(0, 1);
  return `${head}${'*'.repeat(Math.max(3, user.length - 1))}@${domain}`;
}

/** Samarkan nama: "Kenrick Nathanael" → "Ke***** Na*******". */
export function maskName(nama: string): string {
  return nama
    .trim()
    .split(/\s+/)
    .map((w) => (w.length <= 2 ? `${w[0] ?? ''}*` : `${w.slice(0, 2)}${'*'.repeat(w.length - 2)}`))
    .join(' ');
}
