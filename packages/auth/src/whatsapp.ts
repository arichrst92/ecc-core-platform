/**
 * WhatsApp gateway client — dua provider dengan failover otomatis:
 *   1. Fonnte      (utama)   — FONNTE_TOKEN
 *   2. StarSender  (cadangan) — STARSENDER_DEVICE_KEY (Device API key, menu Device)
 * Urutan bisa diubah lewat WA_PROVIDER_ORDER="fonnte,starsender" (atau sebaliknya).
 * Bila provider pertama gagal (perangkat terputus, kuota habis, HTTP error,
 * timeout), pesan otomatis dikirim lewat provider berikutnya. Provider yang
 * baru gagal dilewati sementara (60 detik) supaya OTP tidak menunggu lama.
 *
 * Fonnte:
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
const STARSENDER_URL = 'https://api.starsender.online/api/send';
const STARSENDER_KEY = process.env.STARSENDER_DEVICE_KEY ?? '';
const SEND_TIMEOUT_MS = 12_000;

export type WaProvider = 'fonnte' | 'starsender';

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

/**
 * Baca respons Fonnte dengan aman.
 * - Gagal pasti (pesan TIDAK dikirim): `status`/`Status` false → throw "Fonnte error: …".
 * - Sukses: id bisa string atau angka → selalu dikembalikan sebagai string
 *   (id angka sebelumnya membuat pencatatan "SENT" gagal → dianggap gagal →
 *   reminder dikirim ulang tiap jam).
 * - Respons tidak bisa dibaca padahal HTTP 200 → dianggap TERKIRIM (id kosong),
 *   bukan gagal, supaya tidak memicu kirim ulang.
 */
async function parseFonnteResponse(res: Response): Promise<string> {
  let data: Record<string, unknown> = {};
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    return '';
  }
  const status = data.status ?? data.Status;
  if (status === false) {
    throw new Error(`Fonnte error: ${String(data.reason ?? data.detail ?? 'unknown')}`);
  }
  const id = Array.isArray(data.id) ? data.id[0] : data.id;
  return id === undefined || id === null ? '' : String(id).slice(0, 100);
}

export interface SendOtpResult {
  messageId: string;
  to: string;
  /** Provider yang berhasil mengirim. */
  provider?: WaProvider;
}

// ------------------------------------------------------------
//  Provider: Fonnte
// ------------------------------------------------------------
async function sendViaFonnte(target: string, message: string): Promise<string> {
  if (!FONNTE_TOKEN) throw new Error('Fonnte not configured: set FONNTE_TOKEN di .env');
  const formData = new URLSearchParams();
  formData.append('target', target);
  formData.append('message', message);
  formData.append('countryCode', fonnteCountryCode(target));
  const res = await fetch(FONNTE_URL, {
    method: 'POST',
    headers: { Authorization: FONNTE_TOKEN, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formData.toString(),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Fonnte send failed (${res.status}): ${await res.text()}`);
  return parseFonnteResponse(res);
}

// ------------------------------------------------------------
//  Provider: StarSender (https://docs.starsender.online/docs/message-api/kirim-pesan)
// ------------------------------------------------------------
async function sendViaStarsender(target: string, message: string): Promise<string> {
  if (!STARSENDER_KEY) throw new Error('StarSender not configured: set STARSENDER_DEVICE_KEY di .env');
  const res = await fetch(STARSENDER_URL, {
    method: 'POST',
    headers: { Authorization: STARSENDER_KEY, 'Content-Type': 'application/json' },
    // Nomor dengan kode negara (tanpa "+"), mis. 628123456789.
    body: JSON.stringify({ messageType: 'text', to: target, body: message }),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });
  let data: { success?: boolean; message?: string; data?: Record<string, unknown> } = {};
  try {
    data = (await res.json()) as typeof data;
  } catch {
    if (!res.ok) throw new Error(`StarSender send failed (${res.status})`);
    return '';
  }
  if (!res.ok || data.success === false) {
    throw new Error(`StarSender error: ${data.message ?? `HTTP ${res.status}`}`);
  }
  const id = data.data?.message_id ?? data.data?.id;
  return id === undefined || id === null ? '' : String(id).slice(0, 100);
}

// ------------------------------------------------------------
//  Failover
// ------------------------------------------------------------
const SENDERS: Record<WaProvider, { configured: () => boolean; send: (t: string, m: string) => Promise<string> }> = {
  fonnte: { configured: () => !!FONNTE_TOKEN, send: sendViaFonnte },
  starsender: { configured: () => !!STARSENDER_KEY, send: sendViaStarsender },
};
const COOLDOWN_MS = 60_000;
/** Awalan error bila semua provider gagal (dipakai wa-dispatch untuk klasifikasi). */
export const ALL_FAILED_PREFIX = 'Semua gateway WhatsApp gagal — ';
const lastFailure: Partial<Record<WaProvider, number>> = {};

/** Urutan provider (WA_PROVIDER_ORDER), hanya yang punya kredensial. */
export function waProviders(): WaProvider[] {
  const order = (process.env.WA_PROVIDER_ORDER ?? 'fonnte,starsender')
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter((x): x is WaProvider => x === 'fonnte' || x === 'starsender');
  const uniq = [...new Set(order.length ? order : (['fonnte', 'starsender'] as WaProvider[]))];
  return uniq.filter((p) => SENDERS[p].configured());
}

/**
 * Kirim teks lewat provider pertama yang berhasil. Provider yang gagal dalam
 * 60 detik terakhir dicoba paling akhir (tetap dicoba bila yang lain gagal).
 * Throw berisi alasan semua provider bila semuanya gagal.
 */
async function sendWithFailover(target: string, message: string): Promise<{ messageId: string; provider: WaProvider }> {
  const providers = waProviders();
  if (!providers.length) {
    throw new Error('WhatsApp gateway not configured: set FONNTE_TOKEN dan/atau STARSENDER_DEVICE_KEY di .env');
  }
  const now = Date.now();
  const ordered = [
    ...providers.filter((p) => !(lastFailure[p] && now - lastFailure[p]! < COOLDOWN_MS)),
    ...providers.filter((p) => lastFailure[p] && now - lastFailure[p]! < COOLDOWN_MS),
  ];
  const errors: string[] = [];
  for (const p of ordered) {
    try {
      const messageId = await SENDERS[p].send(target, message);
      delete lastFailure[p];
      return { messageId, provider: p };
    } catch (e) {
      lastFailure[p] = Date.now();
      // Pesan error tiap provider sudah diawali nama provider ("Fonnte …" / "StarSender …").
      errors.push((e as Error).message);
    }
  }
  throw new Error(errors.length === 1 ? errors[0]! : `${ALL_FAILED_PREFIX}${errors.join(' | ')}`);
}

/**
 * Kirim OTP via WhatsApp (Fonnte → StarSender bila gagal). Format `noHpE164` = "+628...".
 */
export async function sendOtpViaWhatsApp(noHpE164: string, otp: string): Promise<SendOtpResult> {
  const target = noHpE164.replace(/^\+/, '');
  const ttlSec = Number(process.env.OTP_EXPIRES_SECONDS ?? 300);
  const ttlLabel = ttlSec % 60 === 0 ? `${ttlSec / 60} menit` : `${ttlSec} detik`;
  const body = `*ECC Portal*\nKode OTP Anda: *${otp}*\n\nBerlaku ${ttlLabel}. Jangan bagikan kode ini ke siapapun.`;
  const { messageId, provider } = await sendWithFailover(target, appendSignature(body));
  return { messageId, to: target, provider };
}

/**
 * Kirim teks WhatsApp umum — reminder ibadah, event, pengumuman, dll (selain OTP).
 * Fonnte → StarSender bila gagal. Throws bila semua provider gagal
 * (caller bisa catch + log ke NotificationLog).
 */
export async function sendWhatsAppText(noHpE164: string, message: string): Promise<SendOtpResult> {
  const target = noHpE164.replace(/^\+/, '');
  // Auto-append signature ke semua outbound message (idempotent).
  const { messageId, provider } = await sendWithFailover(target, appendSignature(message));
  return { messageId, to: target, provider };
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

// ===== Status perangkat & validasi nomor (diagnosa "terkirim tapi tidak sampai") =====
// Catatan: respons /send `status: true` artinya pesan MASUK ANTREAN Fonnte, bukan
// sudah sampai. Pengiriman sebenarnya dilakukan oleh HP pengirim yang tersambung.

export interface FonnteDevice {
  /** Nomor pengirim (tanpa "+"). */
  device: string | null;
  connected: boolean;
  name: string | null;
  quota: string | null;
  expired: string | null;
  packageName: string | null;
}

/** POST https://api.fonnte.com/device — status perangkat pengirim. */
export async function getFonnteDevice(): Promise<FonnteDevice> {
  if (!FONNTE_TOKEN) throw new Error('Fonnte not configured: set FONNTE_TOKEN di .env');
  const res = await fetch('https://api.fonnte.com/device', {
    method: 'POST',
    headers: { Authorization: FONNTE_TOKEN },
    signal: AbortSignal.timeout(8000),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if ((data.status ?? data.Status) === false) {
    throw new Error(`Fonnte error: ${String(data.reason ?? 'unknown')}`);
  }
  const str = (v: unknown) => (v === undefined || v === null || v === '' ? null : String(v));
  return {
    device: str(data.device),
    connected: String(data.device_status ?? '').toLowerCase() === 'connect',
    name: str(data.name),
    quota: str(data.quota),
    expired: str(data.expired),
    packageName: str(data.package),
  };
}

/**
 * POST https://api.fonnte.com/validate — apakah nomor terdaftar di WhatsApp.
 * true / false, atau null bila tidak bisa dicek (perangkat terputus, API gagal).
 */
export async function isWhatsAppRegistered(noHpE164: string): Promise<boolean | null> {
  if (!FONNTE_TOKEN) return null;
  const target = noHpE164.replace(/^\+/, '');
  try {
    const body = new URLSearchParams({ target, countryCode: fonnteCountryCode(target) });
    const res = await fetch('https://api.fonnte.com/validate', {
      method: 'POST',
      headers: { Authorization: FONNTE_TOKEN, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: AbortSignal.timeout(8000),
    });
    const data = (await res.json()) as { status?: boolean; registered?: unknown[]; not_registered?: unknown[] };
    if (!data.status) return null;
    if ((data.not_registered ?? []).map(String).includes(target)) return false;
    if ((data.registered ?? []).map(String).includes(target)) return true;
    return null;
  } catch {
    return null;
  }
}
