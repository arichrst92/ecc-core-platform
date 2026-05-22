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

const FONNTE_URL = 'https://api.fonnte.com/send';
const FONNTE_TOKEN = process.env.FONNTE_TOKEN ?? '';

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
  const message = `*ECC Portal*\nKode OTP Anda: *${otp}*\n\nBerlaku ${ttlLabel}. Jangan bagikan kode ini ke siapapun.`;

  const formData = new URLSearchParams();
  formData.append('target', target);
  formData.append('message', message);
  formData.append('countryCode', '62');

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
  const formData = new URLSearchParams();
  formData.append('target', target);
  formData.append('message', message);
  formData.append('countryCode', '62');

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

/** Normalisasi no HP ke format E.164 Indonesia (+62...). */
export function normalizeNoHp(input: string): string {
  let s = input.trim().replace(/[\s\-()]/g, '');
  if (s.startsWith('+62')) return s;
  if (s.startsWith('62')) return `+${s}`;
  if (s.startsWith('0')) return `+62${s.slice(1)}`;
  if (s.startsWith('8')) return `+62${s}`;
  return s;
}
