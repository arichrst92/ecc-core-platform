/**
 * WhatsApp gateway client:
 *   OTP:  Resmi.ID (WABA resmi, template Authentication) → Fonnte (failover).
 *         Resmi.ID aktif bila RESMI_API_URL + RESMI_API_KEY + RESMI_OTP_TEMPLATE diisi.
 *   Teks lain (notifikasi, reminder): Fonnte (non-official, teks bebas) — FONNTE_TOKEN.
 * StarSender sudah dihapus (2026-11-17). Bila Resmi.ID gagal, OTP dikirim lewat
 * Fonnte. Provider yang baru gagal dilewati sementara (60 detik).
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
const SEND_TIMEOUT_MS = 12_000;
// Resmi.ID — WhatsApp Business API resmi (Meta), KHUSUS OTP lewat template
// Authentication. Docs: dashboard Resmi.ID → Developer → View API documentation.
//   POST https://whatsapp.resmi.id/api/v1-public/messages (scope messages:send)
//   Header: Authorization: Bearer wadash_…
//   Sukses 202: { data: { message_id, status: "queued" } }
//   Gagal:      { error: { code, message } } — validation_error, template_not_found,
//               invalid_api_key, insufficient_scope, rate_limit_exceeded, …
const RESMI_API_URL = process.env.RESMI_API_URL || 'https://whatsapp.resmi.id/api/v1-public/messages';
const RESMI_API_KEY = process.env.RESMI_API_KEY ?? '';
// ID nomor pengirim (Settings → Number & WABA → Identifiers). Wajib: jangan waba_id.
const RESMI_PHONE_ID = process.env.RESMI_PHONE_ID ?? '';
const RESMI_OTP_TEMPLATE = process.env.RESMI_OTP_TEMPLATE ?? '';
const RESMI_OTP_TEMPLATE_LANG = process.env.RESMI_OTP_TEMPLATE_LANG || 'id';
// Template Authentication Meta punya tombol "Salin kode" (URL button index 0)
// yang juga diisi kode. Set "false" bila template tidak punya tombol.
const RESMI_OTP_BUTTON = (process.env.RESMI_OTP_BUTTON ?? 'true').toLowerCase() !== 'false';

/** Provider teks bebas (non-official). */
export type WaTextProvider = 'fonnte';
export type WaProvider = WaTextProvider | 'resmi';

/**
 * Pengaturan runtime dari Portal (WhatsApp Config → Gateway & OTP), di-set
 * oleh core-api dari tabel app_config. Kosong = ikuti .env.
 *   order    — tidak dipakai lagi (dulu urutan Fonnte/StarSender); diabaikan
 *   disabled — provider yang dimatikan sementara (kredensial tetap di .env)
 */
/** Fungsi provider: OTP saja, notifikasi (non-OTP) saja, atau keduanya. */
export type WaUsage = 'otp' | 'notif' | 'both';
export interface WaRuntimeConfig {
  order?: string | null;
  disabled?: WaProvider[];
  /** Fungsi Fonnte (default 'both'). Resmi.ID selalu OTP saja. */
  usage?: Partial<Record<WaTextProvider, WaUsage>>;
}
let runtime: WaRuntimeConfig = {};
export function setWaRuntimeConfig(cfg: WaRuntimeConfig): void {
  runtime = { order: cfg.order ?? null, disabled: [...(cfg.disabled ?? [])], usage: { ...(cfg.usage ?? {}) } };
}
const usageOf = (p: WaTextProvider): WaUsage => runtime.usage?.[p] ?? 'both';
/** Provider boleh dipakai untuk jenis pesan ini? */
const servesKind = (p: WaTextProvider, kind: 'otp' | 'notif') => {
  const u = usageOf(p);
  return u === 'both' || u === kind;
};
const isDisabled = (p: WaProvider) => !!runtime.disabled?.includes(p);

/** Riwayat kirim terakhir per provider (memori proses) — status di Portal. */
interface ProviderHealth {
  lastOkAt?: number;
  lastErrAt?: number;
  lastErr?: string;
}
const health: Partial<Record<WaProvider, ProviderHealth>> = {};
function markOk(p: WaProvider) {
  health[p] = { ...health[p], lastOkAt: Date.now() };
}
function markErr(p: WaProvider, msg: string) {
  health[p] = { ...health[p], lastErrAt: Date.now(), lastErr: msg.slice(0, 300) };
}
/** Status kirim terakhir: 'ok' bila sukses terakhir lebih baru dari gagal terakhir. */
export function waProviderHealth() {
  const out = {} as Record<WaProvider, { state: 'ok' | 'error' | 'unknown'; lastOkAt: string | null; lastErrAt: string | null; lastErr: string | null }>;
  for (const p of ['resmi', 'fonnte'] as WaProvider[]) {
    const h = health[p] ?? {};
    const state = h.lastOkAt && (!h.lastErrAt || h.lastOkAt >= h.lastErrAt) ? 'ok' : h.lastErrAt ? 'error' : 'unknown';
    out[p] = {
      state,
      lastOkAt: h.lastOkAt ? new Date(h.lastOkAt).toISOString() : null,
      lastErrAt: h.lastErrAt ? new Date(h.lastErrAt).toISOString() : null,
      lastErr: h.lastErr ?? null,
    };
  }
  return out;
}

/** Status tiap provider untuk Portal: ada kredensial di .env? diaktifkan? */
export function waProviderStatus() {
  return {
    fonnte: { configured: !!FONNTE_TOKEN, enabled: !isDisabled('fonnte'), usage: usageOf('fonnte') },
    resmi: {
      configured: !!(RESMI_API_KEY && RESMI_PHONE_ID && RESMI_OTP_TEMPLATE),
      enabled: !isDisabled('resmi'),
      template: RESMI_OTP_TEMPLATE || null,
      lang: RESMI_OTP_TEMPLATE_LANG,
      usage: 'otp' as WaUsage,
    },
  };
}

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
//  Provider: Resmi.ID (WABA resmi) — OTP via template Authentication
// ------------------------------------------------------------
// Template Authentication: kode di {{1}} body + tombol "Salin kode" (URL
// button index 0) yang juga diisi kode — sesuai contoh OTP di docs Resmi.ID.
const resmiCredentials = () => !!(RESMI_API_KEY && RESMI_PHONE_ID && RESMI_OTP_TEMPLATE);
/** Dipakai untuk OTP: kredensial ada DAN tidak dimatikan di Portal. */
const resmiConfigured = () => resmiCredentials() && !isDisabled('resmi');

async function sendOtpViaResmi(target: string, otp: string): Promise<string> {
  if (!resmiCredentials()) {
    throw new Error('Resmi not configured: set RESMI_API_KEY, RESMI_PHONE_ID, RESMI_OTP_TEMPLATE di .env');
  }
  const components: Record<string, unknown>[] = [{ type: 'body', parameters: [{ type: 'text', text: otp }] }];
  if (RESMI_OTP_BUTTON) {
    components.push({ type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: otp }] });
  }
  const res = await fetch(RESMI_API_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESMI_API_KEY}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      to: target,
      phone_id: RESMI_PHONE_ID,
      type: 'template',
      template: { name: RESMI_OTP_TEMPLATE, language: { code: RESMI_OTP_TEMPLATE_LANG }, components },
    }),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });
  let data: Record<string, any> = {};
  try {
    data = (await res.json()) as Record<string, any>;
  } catch {
    if (!res.ok) throw new Error(`Resmi error: HTTP ${res.status}`);
    return '';
  }
  const err = data.error;
  if (!res.ok || err) {
    const code = typeof err === 'object' && err?.code ? `${err.code}: ` : '';
    const msg = typeof err === 'string' ? err : err?.message ?? `HTTP ${res.status}`;
    throw new Error(`Resmi error: ${code}${String(msg).slice(0, 300)}`);
  }
  // message_id = ID antrean Resmi.ID (status "queued"), bukan wamid Meta.
  const id = data.data?.message_id ?? data.data?.id;
  return id === undefined || id === null ? '' : String(id).slice(0, 100);
}

// ------------------------------------------------------------
//  Failover
// ------------------------------------------------------------
const TEXT_SENDERS: Record<WaTextProvider, { configured: () => boolean; send: (t: string, m: string) => Promise<string> }> = {
  fonnte: { configured: () => !!FONNTE_TOKEN, send: sendViaFonnte },
};
const COOLDOWN_MS = 60_000;
/** Awalan error bila semua provider gagal (dipakai wa-dispatch untuk klasifikasi). */
export const ALL_FAILED_PREFIX = 'Semua gateway WhatsApp gagal — ';
const lastFailure: Partial<Record<WaProvider, number>> = {};

/** Provider teks bebas yang aktif (punya kredensial, tidak dimatikan, sesuai fungsi). */
export function waProviders(kind?: 'otp' | 'notif'): WaTextProvider[] {
  const all: WaTextProvider[] = ['fonnte'];
  return all.filter((p) => TEXT_SENDERS[p].configured() && !isDisabled(p) && (!kind || servesKind(p, kind)));
}

/** Urutan provider OTP: Resmi.ID (bila dikonfigurasi) lalu provider teks. */
export function waOtpProviders(): WaProvider[] {
  return [...(resmiConfigured() ? (['resmi'] as WaProvider[]) : []), ...waProviders('otp')];
}

type Attempt = { provider: WaProvider; send: () => Promise<string> };

/**
 * Jalankan percobaan berurutan sampai ada yang berhasil. Provider yang gagal
 * dalam 60 detik terakhir dicoba paling akhir (tetap dicoba bila yang lain
 * gagal). Throw berisi alasan semua provider bila semuanya gagal.
 */
async function runFailover(attempts: Attempt[]): Promise<{ messageId: string; provider: WaProvider }> {
  if (!attempts.length) {
    throw new Error(
      'WhatsApp gateway not configured: semua provider nonaktif / belum diisi (Portal → WhatsApp Config, atau FONNTE_TOKEN di .env)',
    );
  }
  const now = Date.now();
  const cooling = (a: Attempt) => !!lastFailure[a.provider] && now - lastFailure[a.provider]! < COOLDOWN_MS;
  const ordered = [...attempts.filter((a) => !cooling(a)), ...attempts.filter(cooling)];
  const errors: string[] = [];
  for (const a of ordered) {
    try {
      const messageId = await a.send();
      delete lastFailure[a.provider];
      markOk(a.provider);
      return { messageId, provider: a.provider };
    } catch (e) {
      lastFailure[a.provider] = Date.now();
      markErr(a.provider, (e as Error).message);
      // Pesan error tiap provider sudah diawali nama provider ("Resmi …" / "Fonnte …").
      errors.push((e as Error).message);
    }
  }
  throw new Error(errors.length === 1 ? errors[0]! : `${ALL_FAILED_PREFIX}${errors.join(' | ')}`);
}

const textAttempts = (target: string, message: string, kind: 'otp' | 'notif'): Attempt[] =>
  waProviders(kind).map((p) => ({ provider: p, send: () => TEXT_SENDERS[p].send(target, message) }));

/**
 * Kirim OTP via WhatsApp: Resmi.ID (WABA resmi, template) → Fonnte.
 * Format `noHpE164` = "+628...".
 */
export async function sendOtpViaWhatsApp(noHpE164: string, otp: string): Promise<SendOtpResult> {
  const target = noHpE164.replace(/^\+/, '');
  const ttlSec = Number(process.env.OTP_EXPIRES_SECONDS ?? 300);
  const ttlLabel = ttlSec % 60 === 0 ? `${ttlSec / 60} menit` : `${ttlSec} detik`;
  const body = `*ECC Portal*\nKode OTP Anda: *${otp}*\n\nBerlaku ${ttlLabel}. Jangan bagikan kode ini ke siapapun.`;
  const attempts: Attempt[] = [
    ...(resmiConfigured() ? [{ provider: 'resmi' as const, send: () => sendOtpViaResmi(target, otp) }] : []),
    ...textAttempts(target, appendSignature(body), 'otp'),
  ];
  const { messageId, provider } = await runFailover(attempts);
  return { messageId, to: target, provider };
}

/**
 * Kirim teks WhatsApp umum — reminder ibadah, event, pengumuman, dll (selain OTP).
 * Lewat Fonnte. Throws bila gagal
 * (caller bisa catch + log ke NotificationLog).
 */
export async function sendWhatsAppText(noHpE164: string, message: string): Promise<SendOtpResult> {
  const target = noHpE164.replace(/^\+/, '');
  // Auto-append signature ke semua outbound message (idempotent).
  const { messageId, provider } = await runFailover(textAttempts(target, appendSignature(message), 'notif'));
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

/**
 * Tes koneksi satu provider (Portal → WhatsApp Config). Tetap jalan walau
 * provider dimatikan (untuk cek sebelum dinyalakan); butuh kredensial.
 * Resmi.ID mengirim template OTP dengan kode contoh 123456.
 */
export async function testWaProvider(provider: WaProvider, noHpE164: string): Promise<{ messageId: string; to: string }> {
  const target = noHpE164.replace(/^\+/, '');
  try {
    const messageId =
      provider === 'resmi'
        ? await sendOtpViaResmi(target, '123456')
        : await TEXT_SENDERS[provider].send(
            target,
            appendSignature(`*ECC — Tes koneksi WhatsApp*\nPesan ini dikirim lewat Fonnte dari Portal (WhatsApp Config).`),
          );
    markOk(provider);
    delete lastFailure[provider];
    return { messageId, to: target };
  } catch (e) {
    markErr(provider, (e as Error).message);
    throw e;
  }
}

/**
 * Kirim teks lewat provider pilihan (Announcement). 'auto' = urutan & fungsi
 * di Portal (failover). Provider tertentu = hanya provider itu (tanpa failover),
 * selama kredensialnya ada; saklar Portal tidak menghalangi pilihan eksplisit.
 */
export async function sendWhatsAppTextVia(
  provider: 'auto' | WaTextProvider,
  noHpE164: string,
  message: string,
): Promise<SendOtpResult> {
  if (provider === 'auto') return sendWhatsAppText(noHpE164, message);
  const target = noHpE164.replace(/^\+/, '');
  if (!TEXT_SENDERS[provider].configured()) {
    throw new Error(`WhatsApp gateway not configured: FONNTE_TOKEN belum diisi di .env`);
  }
  try {
    const messageId = await TEXT_SENDERS[provider].send(target, appendSignature(message));
    markOk(provider);
    return { messageId, to: target, provider };
  } catch (e) {
    markErr(provider, (e as Error).message);
    throw e;
  }
}
