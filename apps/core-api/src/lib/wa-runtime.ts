/**
 * Pengaturan WhatsApp & OTP dari Portal (WhatsApp Config → Gateway & OTP),
 * disimpan di app_config. Kredensial tetap di .env; di sini saklar & pilihan:
 *   - provider aktif (Fonnte / StarSender / Resmi.ID OTP) + urutan Fonnte/StarSender
 *   - OTP salinan email: fallback | always | off
 *   - lewati verifikasi nomor HP saat onboarding (magic link)
 * Nilai NULL = ikuti .env. Di-cache di memori (dimuat saat start, tiap 30 detik,
 * dan langsung setelah disimpan) → getter sinkron aman dipakai di handler.
 */
import { prisma } from '@ecc/database';
import { setWaRuntimeConfig, type WaProvider, type WaUsage } from '@ecc/auth';
import { logger } from './logger.js';

export type OtpEmailMode = 'fallback' | 'always' | 'off';
export const OTP_EMAIL_MODES: OtpEmailMode[] = ['fallback', 'always', 'off'];
export const WA_ORDERS = ['fonnte,starsender', 'starsender,fonnte'] as const;
export const WA_USAGES: WaUsage[] = ['otp', 'notif', 'both'];

export interface WaGatewaySettings {
  /** null = ikuti WA_PROVIDER_ORDER */
  waProviderOrder: string | null;
  waFonnteEnabled: boolean;
  waStarsenderEnabled: boolean;
  waResmiOtpEnabled: boolean;
  /** Fungsi provider: otp | notif | both (prioritas tetap). */
  waFonnteUsage: WaUsage;
  waStarsenderUsage: WaUsage;
  /** null = ikuti OTP_EMAIL_COPY */
  otpEmailCopy: OtpEmailMode | null;
  /** null = ikuti ONBOARDING_SKIP_NOHP_OTP */
  onboardingSkipNoHpOtp: boolean | null;
}

const SELECT = {
  waProviderOrder: true,
  waFonnteEnabled: true,
  waStarsenderEnabled: true,
  waResmiOtpEnabled: true,
  waFonnteUsage: true,
  waStarsenderUsage: true,
  otpEmailCopy: true,
  onboardingSkipNoHpOtp: true,
} as const;

const DEFAULTS: WaGatewaySettings = {
  waProviderOrder: null,
  waFonnteEnabled: true,
  waStarsenderEnabled: true,
  waResmiOtpEnabled: true,
  waFonnteUsage: 'both',
  waStarsenderUsage: 'both',
  otpEmailCopy: null,
  onboardingSkipNoHpOtp: null,
};

let current: WaGatewaySettings = DEFAULTS;
let loadedAt = 0;
const TTL_MS = 30_000;

function apply(s: WaGatewaySettings) {
  current = s;
  loadedAt = Date.now();
  const disabled: WaProvider[] = [];
  if (!s.waFonnteEnabled) disabled.push('fonnte');
  if (!s.waStarsenderEnabled) disabled.push('starsender');
  if (!s.waResmiOtpEnabled) disabled.push('resmi');
  setWaRuntimeConfig({
    order: s.waProviderOrder,
    disabled,
    usage: { fonnte: s.waFonnteUsage, starsender: s.waStarsenderUsage },
  });
}

const normUsage = (v: string | null | undefined): WaUsage =>
  v && (WA_USAGES as string[]).includes(v) ? (v as WaUsage) : 'both';

const normMode = (v: string | null | undefined): OtpEmailMode | null =>
  v && (OTP_EMAIL_MODES as string[]).includes(v.toLowerCase()) ? (v.toLowerCase() as OtpEmailMode) : null;

/** Muat dari DB (pakai cache 30 detik kecuali force). Gagal → tetap pakai nilai terakhir. */
export async function loadWaRuntime(force = false): Promise<WaGatewaySettings> {
  if (!force && loadedAt && Date.now() - loadedAt < TTL_MS) return current;
  try {
    const row = await prisma.appConfig.findUnique({ where: { id: 'global' }, select: SELECT });
    apply(
      row
        ? {
            ...row,
            otpEmailCopy: normMode(row.otpEmailCopy),
            waProviderOrder: row.waProviderOrder || null,
            waFonnteUsage: normUsage(row.waFonnteUsage),
            waStarsenderUsage: normUsage(row.waStarsenderUsage),
          }
        : DEFAULTS,
    );
  } catch (err) {
    logger.warn({ err }, '[wa-runtime] gagal memuat pengaturan — pakai nilai terakhir');
  }
  return current;
}

/** Simpan dari Portal lalu terapkan langsung. */
export async function saveWaRuntime(patch: Partial<WaGatewaySettings>, userId: string | null): Promise<WaGatewaySettings> {
  const data = { ...patch, updatedByUserId: userId };
  await prisma.appConfig.upsert({ where: { id: 'global' }, create: { id: 'global', ...data }, update: data });
  return loadWaRuntime(true);
}

export function waRuntimeSettings(): WaGatewaySettings {
  return current;
}

/** Mode OTP salinan email efektif (Portal → .env → fallback). */
export function otpEmailMode(): OtpEmailMode {
  return current.otpEmailCopy ?? normMode(process.env.OTP_EMAIL_COPY) ?? 'fallback';
}

/** Lewati langkah nomor HP + OTP saat onboarding (Portal → .env). */
export function skipNoHpOtp(): boolean {
  if (current.onboardingSkipNoHpOtp != null) return current.onboardingSkipNoHpOtp;
  return (process.env.ONBOARDING_SKIP_NOHP_OTP ?? '').toLowerCase() === 'true';
}

/** Dipanggil sekali saat server start: muat + segarkan berkala. */
export function startWaRuntimeSync(): void {
  void loadWaRuntime(true);
  setInterval(() => void loadWaRuntime(true), TTL_MS).unref();
}
