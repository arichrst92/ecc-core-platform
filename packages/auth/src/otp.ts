import bcrypt from 'bcrypt';
import { randomInt } from 'node:crypto';

const OTP_LENGTH = Number(process.env.OTP_LENGTH ?? 6);
const BCRYPT_ROUNDS = 10;

/** Generate OTP numerik dengan panjang konstan (default 6 digit). */
export function generateOtp(): string {
  const max = 10 ** OTP_LENGTH;
  const num = randomInt(0, max);
  return num.toString().padStart(OTP_LENGTH, '0');
}

export async function hashOtp(otp: string): Promise<string> {
  return bcrypt.hash(otp, BCRYPT_ROUNDS);
}

export async function verifyOtpHash(otp: string, hash: string): Promise<boolean> {
  return bcrypt.compare(otp, hash);
}

/** Timestamp expiry untuk OTP — default 5 menit dari sekarang. */
export function getOtpExpiry(): Date {
  const seconds = Number(process.env.OTP_EXPIRES_SECONDS ?? 300);
  return new Date(Date.now() + seconds * 1000);
}
