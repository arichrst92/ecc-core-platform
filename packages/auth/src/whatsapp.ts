/**
 * WhatsApp Cloud API client (Meta official).
 *
 * Endpoint: https://graph.facebook.com/{version}/{phone_number_id}/messages
 * Docs:     https://developers.facebook.com/docs/whatsapp/cloud-api
 *
 * Untuk pengiriman OTP, Meta MEWAJIBKAN pakai template message yang sudah
 * di-approve sebelumnya. Buat template dengan kategori AUTHENTICATION, isi
 * body "Kode OTP Anda: {{1}}". Nama template = WA_OTP_TEMPLATE_NAME.
 */

const WA_API_VERSION = process.env.WA_API_VERSION ?? 'v20.0';
const WA_TOKEN = process.env.WA_CLOUD_API_TOKEN ?? '';
const WA_PHONE_NUMBER_ID = process.env.WA_PHONE_NUMBER_ID ?? '';
const WA_OTP_TEMPLATE_NAME = process.env.WA_OTP_TEMPLATE_NAME ?? 'ecc_login_otp';
const WA_OTP_TEMPLATE_LANGUAGE = process.env.WA_OTP_TEMPLATE_LANGUAGE ?? 'id';

const BASE_URL = `https://graph.facebook.com/${WA_API_VERSION}`;

export interface SendOtpResult {
  messageId: string;
  to: string;
}

/**
 * Kirim OTP via WhatsApp template. Format `to` E.164 tanpa prefix `+`
 * (Meta minta angka saja, mis. "628123456789").
 */
export async function sendOtpViaWhatsApp(noHpE164: string, otp: string): Promise<SendOtpResult> {
  if (!WA_TOKEN || !WA_PHONE_NUMBER_ID) {
    throw new Error('WhatsApp Cloud API not configured (WA_CLOUD_API_TOKEN / WA_PHONE_NUMBER_ID)');
  }

  // Strip "+" jika ada
  const to = noHpE164.replace(/^\+/, '');

  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: WA_OTP_TEMPLATE_NAME,
      language: { code: WA_OTP_TEMPLATE_LANGUAGE },
      components: [
        {
          type: 'body',
          parameters: [{ type: 'text', text: otp }],
        },
        {
          // Untuk template AUTHENTICATION, Meta wajib ada button copy-code.
          type: 'button',
          sub_type: 'url',
          index: '0',
          parameters: [{ type: 'text', text: otp }],
        },
      ],
    },
  };

  const res = await fetch(`${BASE_URL}/${WA_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${WA_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`WhatsApp send failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as { messages?: { id: string }[] };
  const messageId = data.messages?.[0]?.id ?? '';
  return { messageId, to };
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
