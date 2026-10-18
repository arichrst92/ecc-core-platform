/**
 * WhatsApp gateway client — Fonnte (gateway lokal Indonesia).
 *
 * Endpoint: https://api.fonnte.com/send
 * Docs:     https://docs.fonnte.com/
 *
 * Kenapa Fonnte (vs Meta Cloud API)?
 *   - Tidak perlu template approval — kirim text biasa
 *   - Setup super cepat (cukup daftar + connect device WhatsApp)
 *   - Harga ~Rp 100/pesan, cocok volume rendah-menengah
 *   - API simpel (POST form-data dengan token di header)
 *
 * Untuk migrate ke Meta Cloud API nanti (saat volume tinggi atau butuh
 * delivery guarantee resmi), tinggal ganti implementation fungsi
 * `sendOtpViaWhatsApp()` — interface tetap sama.
 */

import { normalizePhoneNumber } from '@ecc/shared-types';

const FONNTE_URL = 'https://api.fonnte.com/send';
const FONNTE_TOKEN = process.env.FONNTE_TOKEN ?? '';

/**
 * Signature di-append di SEMUA outbound WA message (OTP, reminder ibadah,
 * reminder event, broadcast future). Single source of truth supaya kalau
 * branding berubah, edit di sini saja.
 */
// Domain ditulis "ide\u2024asia" (U+2024 ONE DOT LEADER, tampak seperti titik)
// tanpa "https://" supaya WhatsApp tidak mendeteksinya sebagai link: tidak
// clickable dan tidak memunculkan preview/OG image IDEA di setiap pesan.
export const WA_SIGNATURE =
  '\n\n_Powered by IDEA (ide\u2024asia)_\n_an Enterprise IT Service and Outsourcing Company_';

/** Wrap body dengan signature footer. Idempotent: kalau signature sudah ada, tidak duplicate. */
export function appendSignature(body: string): string {
  if (body.includes('Powered by IDEA')) return body;
  return body + WA_SIGNATURE;
}

export interface SendOtpResult {
  messageId: string;
  to: string;
}

/**
 * Kirim OTP via Fonnte. Format `noHpE164` = "+628...".
 * Fonnte minta tanpa "+" di field `target` (mis. "628123456789").
 */
export async function sendOtpViaWhatsApp(noHpE164: string, otp: string): Promise<SendOtpResult> {
  if (!FONNTE_TOKEN) {
    throw new Error('Fonnte not configured: set FONNTE_TOKEN di .env');
  }

  const target = noHpE164.replace(/^\+/, '');
  const ttlSec = Number(process.env.OTP_EXPIRES_SECONDS ?? 300);
  const ttlLabel = ttlSec % 60 === 0 ? `${ttlSec / 60} menit` : `${ttlSec} detik`;
  const body = `*ECC Portal*\nKode OTP Anda: *${otp}*\n\nBerlaku ${ttlLabel}. Jangan bagikan kode ini ke siapapun.`;
  const message = appendSignature(body);

  const formData = new URLSearchParams();
  formData.append('target', target);
  formData.append('message', message);
  formData.append('countryCode', fonnteCountryCode(target));

  const res = await fetch(FONNTE_URL, {
    method: 'POST',
    headers: {
      Authorization: FONNTE_TOKEN,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formData.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Fonnte send failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as {
    status?: boolean;
    reason?: string;
    id?: string[] | string;
    detail?: string;
  };

  // Fonnte response: { status: true, id: ["123"], detail: "..." }
  // Atau saat error: { status: false, reason: "..." }
  if (data.status === false) {
    throw new Error(`Fonnte error: ${data.reason ?? data.detail ?? 'unknown'}`);
  }

  const messageId = Array.isArray(data.id) ? (data.id[0] ?? '') : (data.id ?? '');
  return { messageId, to: target };
}

/**
 * Generic Fonnte text send — dipakai untuk reminder ibadah, event,
 * announcement, dll (selain OTP). Mengembalikan {messageId, to} sama seperti
 * `sendOtpViaWhatsApp()`.
 *
 * Throws kalau Fonnte error (caller bisa catch + log ke NotificationLog).
 */
export async function sendWhatsAppText(
  noHpE164: string,
  message: string,
): Promise<SendOtpResult> {
  if (!FONNTE_TOKEN) {
    throw new Error('Fonnte not configured: set FONNTE_TOKEN di .env');
  }
  const target = noHpE164.replace(/^\+/, '');
  // Auto-append signature ke semua outbound message. Idempotent — kalau caller
  // sudah include manual, tidak duplicate.
  const finalMessage = appendSignature(message);
  const formData = new URLSearchParams();
  formData.append('target', target);
  formData.append('message', finalMessage);
  formData.append('countryCode', fonnteCountryCode(target));

  const res = await fetch(FONNTE_URL, {
    method: 'POST',
    headers: {
      Authorization: FONNTE_TOKEN,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formData.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Fonnte send failed (${res.status}): ${text}`);
  }
  const data = (await res.json()) as {
    status?: boolean;
    reason?: string;
    id?: string[] | string;
    detail?: string;
  };
  if (data.status === false) {
    throw new Error(`Fonnte error: ${data.reason ?? data.detail ?? 'unknown'}`);
  }
  const messageId = Array.isArray(data.id) ? (data.id[0] ?? '') : (data.id ?? '');
  return { messageId, to: target };
}

/**
 * Normalisasi no HP ke E.164 — semua negara (lihat `normalizePhoneNumber`
 * di @ecc/shared-types). Nomor lokal tanpa kode negara dianggap Indonesia.
 * Kalau tidak valid, kembalikan input yang sudah dibersihkan (caller validasi).
 */
export function normalizeNoHp(input: string): string {
  return normalizePhoneNumber(input) ?? input.trim().replace(/[\s\-()]/g, '');
}

/**
 * Field `countryCode` Fonnte: kode negara untuk nomor yang diawali 0.
 * Target kita selalu internasional penuh (tanpa "+"), jadi untuk nomor
 * non-Indonesia kirim "0" supaya Fonnte tidak menambahkan prefix 62.
 */
function fonnteCountryCode(target: string): string {
  return target.startsWith('62') ? '62' : '0';
}
