/**
 * Aturan & label app yang dulu TERTANAM di Els App (2026-11).
 *
 * App tidak bisa diperbarui lewat OTA, jadi angka aturan (menit check-in, usia
 * anak, batas hari homecell, dll.) dan teks yang menyebut angka itu dikirim
 * lewat GET /public/app-config:
 *   - `rules`  → angka yang dipakai app untuk menghitung (build setelah 2.5.0).
 *   - `texts`  → teks i18n per bahasa yang menimpa teks bawaan app. Dibentuk
 *                dari angka aturan di bawah + override Portal
 *                (Developer Tools → Diagnostics → App Config → Teks app).
 *
 * Ubah aturan server → ubah konstanta sumbernya; rules & texts ikut berubah
 * otomatis (tidak perlu build app). Lihat tabel kontrak di CLAUDE.md.
 */
import { CLOSE_AFTER_MIN, OPEN_BEFORE_MIN } from './self-checkin.js';
import { SCAN_AFTER_MIN, SCAN_BEFORE_MIN } from './scan-window.js';
import { KIDS_MAX_AGE } from './reservasi-window.js';
import { ENROLL_WINDOW_MS } from './otp-store.js';

/** Hapus kunjungan (visit) sendiri: dalam N menit sejak dibuat. */
export const VISIT_CANCEL_MIN = 60;
/** Kehadiran terakhir anggota homecell: hijau ≤ OK, kuning ≤ WARN, merah > WARN (hari). */
export const HOMECELL_OK_DAYS = 7;
export const HOMECELL_WARN_DAYS = 30;
/** Ringkasan zona: "bertemu dalam N hari" & "belum bertemu > N hari". */
export const ZONE_MET_DAYS = 7;
export const ZONE_NOT_MET_DAYS = 14;

export type AppRules = {
  selfCheckinOpenBeforeMin: number;
  selfCheckinCloseAfterMin: number;
  scanBeforeMin: number;
  scanAfterMin: number;
  cancelCheckinAfterMin: number;
  visitCancelMin: number;
  kidsMaxAge: number;
  signupWindowMin: number;
  homecellOkDays: number;
  homecellWarnDays: number;
  zoneMetDays: number;
  zoneNotMetDays: number;
};

export function appRules(): AppRules {
  return {
    selfCheckinOpenBeforeMin: OPEN_BEFORE_MIN,
    selfCheckinCloseAfterMin: CLOSE_AFTER_MIN,
    scanBeforeMin: SCAN_BEFORE_MIN,
    scanAfterMin: SCAN_AFTER_MIN,
    cancelCheckinAfterMin: CLOSE_AFTER_MIN,
    visitCancelMin: VISIT_CANCEL_MIN,
    kidsMaxAge: KIDS_MAX_AGE,
    signupWindowMin: Math.round(ENROLL_WINDOW_MS / 60_000),
    homecellOkDays: HOMECELL_OK_DAYS,
    homecellWarnDays: HOMECELL_WARN_DAYS,
    zoneMetDays: ZONE_MET_DAYS,
    zoneNotMetDays: ZONE_NOT_MET_DAYS,
  };
}

const durId = (min: number) => (min % 60 === 0 ? `${min / 60} jam` : `${min} menit`);
const durEn = (min: number) =>
  min % 60 === 0 ? (min === 60 ? 'hour' : `${min / 60} hours`) : `${min} minutes`;

export type AppTexts = { id: Record<string, string>; en: Record<string, string> };

/**
 * Teks app yang menyebut angka aturan. Placeholder {{...}} app tetap dipertahankan
 * (app mengisi `time`, `name`, `count`, dst.). Kunci = kunci i18n app.
 */
export function ruleTexts(r: AppRules = appRules()): AppTexts {
  return {
    id: {
      'ibadah.self_checkin_opens_at': `Dibuka pukul {{time}} (${r.selfCheckinOpenBeforeMin} menit sebelum mulai)`,
      'tiket.cancel_checkin_body': `Check-in {{name}} akan dibatalkan. Pakai ini bila salah check-in (mis. yang bersangkutan tidak hadir). Bisa sampai ${r.cancelCheckinAfterMin} menit setelah ibadah selesai.`,
      'visit.cancel_sub': `Hanya bisa dalam ${durId(r.visitCancelMin)} pertama. Setelah itu hubungi admin.`,
      'reservasi.kids_only': `Khusus anak usia ${r.kidsMaxAge} tahun ke bawah`,
      'signup.error_otp_expired_msg': `Waktu pendaftaran (${r.signupWindowMin} menit) sudah habis. Silakan ulang dari awal.`,
      'hcj.sum_ok': `≤ ${r.homecellOkDays} hari`,
      'hcj.sum_warn': `${r.homecellOkDays + 1}–${r.homecellWarnDays} hari`,
      'hcj.sum_bad': `> ${r.homecellWarnDays} hari`,
      'hcj.zone_not_met': `{{count}} belum bertemu > ${r.zoneNotMetDays} hari`,
      'hcj.zone_stat_met7': `Bertemu ${r.zoneMetDays} hari`,
    },
    en: {
      'ibadah.self_checkin_opens_at': `Opens at {{time}} (${r.selfCheckinOpenBeforeMin} minutes before start)`,
      'tiket.cancel_checkin_body': `{{name}}'s check-in will be cancelled. Use this if the check-in was a mistake (e.g. they are not here). Available until ${r.cancelCheckinAfterMin} minutes after the service ends.`,
      'visit.cancel_sub': `Only allowed within the first ${durEn(r.visitCancelMin)}. After that, contact admin.`,
      'reservasi.kids_only': `Kids aged ${r.kidsMaxAge} and under only`,
      'signup.error_otp_expired_msg': `The sign-up time (${r.signupWindowMin} minutes) has run out. Please start again.`,
      'hcj.sum_ok': `≤ ${r.homecellOkDays} days`,
      'hcj.sum_warn': `${r.homecellOkDays + 1}–${r.homecellWarnDays} days`,
      'hcj.sum_bad': `> ${r.homecellWarnDays} days`,
      'hcj.zone_not_met': `{{count}} not met in ${r.zoneNotMetDays}+ days`,
      'hcj.zone_stat_met7': `Met in ${r.zoneMetDays} days`,
    },
  };
}

/** Kunci i18n app: huruf, angka, garis bawah, dipisah titik (mis. "ibadah.self_checkin_opens_at"). */
const KEY_RE = /^[a-z0-9_]+(\.[a-z0-9_]+)+$/i;

/** Rapikan override dari Portal: { id: {key: teks}, en: {...} } — kunci/teks tidak valid dibuang. */
export function sanitizeTextOverrides(raw: unknown): AppTexts {
  const out: AppTexts = { id: {}, en: {} };
  if (!raw || typeof raw !== 'object') return out;
  for (const lang of ['id', 'en'] as const) {
    const m = (raw as Record<string, unknown>)[lang];
    if (!m || typeof m !== 'object') continue;
    for (const [k, v] of Object.entries(m as Record<string, unknown>)) {
      if (KEY_RE.test(k) && typeof v === 'string' && v.trim() && v.length <= 1000) out[lang][k] = v;
    }
  }
  return out;
}

/** Teks final untuk app: teks dari aturan, ditimpa override Portal. */
export function appTexts(overrides: unknown): AppTexts {
  const base = ruleTexts();
  const o = sanitizeTextOverrides(overrides);
  return { id: { ...base.id, ...o.id }, en: { ...base.en, ...o.en } };
}

/**
 * Tautan dokumen untuk app (menu Profil → User Manual), per bahasa app.
 * Bisa diganti lewat .env tanpa build app: APP_MANUAL_URL_ID / APP_MANUAL_URL_EN.
 * Manual English (2026-11): portal /download/manual-en.pdf.
 */
export function appLinks() {
  const id = process.env.APP_MANUAL_URL_ID || 'https://portal.eccchurch.global/download/manual.pdf';
  return {
    manual: { id, en: process.env.APP_MANUAL_URL_EN || 'https://portal.eccchurch.global/download/manual-en.pdf' },
  };
}
