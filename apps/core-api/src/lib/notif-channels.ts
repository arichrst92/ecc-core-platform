/**
 * Saluran notifikasi per jenis — In-app / WhatsApp / Email (Portal →
 * WhatsApp Config → Saluran notifikasi).
 *
 *   - In-app  : tabel notification_channel_config.in_app (default katalog).
 *   - WhatsApp: wa_notification_config.is_enabled (tetap di tempat lama).
 *   - Email   : notification_channel_config.email — selalu kirim email, atau
 *               wa_fallback_email — email hanya bila jemaat tidak punya nomor WhatsApp.
 *
 * Tanpa baris di tabel = default katalog → perilaku sebelum fitur ini sama
 * persis (in-app sesuai kode lama, email mati).
 */
import { prisma } from '@ecc/database';
import { logger } from './logger.js';

export type NotifGroup = 'reminder' | 'ibadah_event' | 'family' | 'group' | 'homecell' | 'ministry' | 'rohani' | 'kids' | 'other';

export interface NotifCatalogItem {
  /** Kunci konfigurasi (sama dengan tipe in-app / tipe WA). */
  key: string;
  label: string;
  group: NotifGroup;
  /** Tipe di feed app (InAppNotifType). null = tidak ada notifikasi in-app untuk jenis ini. */
  inAppType: string | null;
  /** Tipe di wa_notification_config. null = tidak ada pesan WhatsApp. */
  waType: string | null;
  /** Default in-app bila belum diatur (= perilaku lama). */
  inAppDefault: boolean;
}

const I = (key: string, label: string, group: NotifGroup, wa = false): NotifCatalogItem => ({
  key,
  label,
  group,
  inAppType: key,
  waType: wa ? key : null,
  inAppDefault: true,
});

export const NOTIF_CATALOG: NotifCatalogItem[] = [
  // Pengingat & ucapan — dulu hanya WhatsApp (in-app default mati).
  { key: 'IBADAH_REMINDER_H1', label: 'Pengingat ibadah H-1', group: 'reminder', inAppType: 'IBADAH_REMINDER', waType: 'IBADAH_REMINDER_H1', inAppDefault: false },
  { key: 'EVENT_REMINDER_H1', label: 'Pengingat event H-1', group: 'reminder', inAppType: 'EVENT_REMINDER', waType: 'EVENT_REMINDER_H1', inAppDefault: false },
  { key: 'BIRTHDAY_GREETING', label: 'Ucapan ulang tahun', group: 'reminder', inAppType: 'BIRTHDAY_GREETING', waType: 'BIRTHDAY_GREETING', inAppDefault: false },
  // Ibadah & event
  I('EVENT_REGISTERED', 'Pendaftaran event diterima', 'ibadah_event', true),
  I('EVENT_APPROVED', 'Pendaftaran event disetujui', 'ibadah_event', true),
  I('EVENT_CHECKED_IN', 'Check-in event', 'ibadah_event', true),
  I('BRANCH_CHANGE_APPROVED', 'Pindah cabang disetujui', 'ibadah_event', true),
  I('BRANCH_CHANGE_REJECTED', 'Pindah cabang ditolak', 'ibadah_event', true),
  // Keluarga
  I('FAMILY_LINKED', 'Dihubungkan sebagai keluarga', 'family', true),
  I('FAMILY_LINK_REQUESTED', 'Permintaan hubungan keluarga', 'family'),
  I('FAMILY_LINK_APPROVED', 'Hubungan keluarga disetujui', 'family'),
  I('FAMILY_LINK_REJECTED', 'Hubungan keluarga ditolak', 'family'),
  // Group
  I('GROUP_MEMBER_ADDED', 'Ditambahkan ke group', 'group', true),
  I('GROUP_MEMBER_REMOVED', 'Dikeluarkan dari group', 'group', true),
  I('GROUP_DISMISSED', 'Group dibubarkan', 'group', true),
  I('GROUP_JOIN_REQUESTED', 'Permintaan bergabung group', 'group', true),
  I('GROUP_JOIN_APPROVED', 'Bergabung group disetujui', 'group', true),
  I('GROUP_JOIN_REJECTED', 'Bergabung group ditolak', 'group', true),
  I('GROUP_ANNOUNCEMENT', 'Pengumuman group', 'group'),
  I('GROUP_POLL_CREATED', 'Polling group baru', 'group'),
  // Homecell
  I('HOMECELL_ATTENDED', 'Kehadiran homecell tercatat', 'homecell', true),
  I('HOMECELL_JOIN_REQUESTED', 'Permintaan bergabung homecell', 'homecell', true),
  I('HOMECELL_JOIN_APPROVED', 'Bergabung homecell disetujui', 'homecell', true),
  I('HOMECELL_JOIN_REJECTED', 'Bergabung homecell ditolak', 'homecell', true),
  I('HOMECELL_ANNOUNCEMENT', 'Pengumuman homecell', 'homecell'),
  I('HOMECELL_POLL_CREATED', 'Polling homecell baru', 'homecell'),
  I('HOMECELL_ASISTEN_ASSIGNED', 'Ditunjuk asisten homecell', 'homecell'),
  { key: 'HOMECELL_GUEST_APPROVED', label: 'Tamu homecell disetujui', group: 'homecell', inAppType: null, waType: 'HOMECELL_GUEST_APPROVED', inAppDefault: false },
  // Ministry
  I('MINISTRY_JOIN_REQUESTED', 'Permintaan bergabung ministry', 'ministry', true),
  I('MINISTRY_JOIN_APPROVED', 'Bergabung ministry disetujui', 'ministry', true),
  I('MINISTRY_JOIN_REJECTED', 'Bergabung ministry ditolak', 'ministry', true),
  I('MINISTRY_DUTY_ASSIGNED', 'Jadwal pelayanan ditugaskan', 'ministry'),
  I('MINISTRY_DUTY_REMOVED', 'Jadwal pelayanan dibatalkan', 'ministry'),
  { key: 'MINISTRY_SCHEDULE_ASSIGNED', label: 'Jadwal pelayanan (WhatsApp)', group: 'ministry', inAppType: null, waType: 'MINISTRY_SCHEDULE_ASSIGNED', inAppDefault: false },
  // Doa & rohani
  I('PRAYER_ASSIGNED', 'Pokok doa ditugaskan', 'rohani', true),
  I('PRAYER_PRAYED', 'Pokok doa sudah didoakan', 'rohani', true),
  I('SPIRITUAL_JOURNEY_APPROVED', 'Langkah rohani disetujui', 'rohani'),
  I('SPIRITUAL_JOURNEY_REJECTED', 'Langkah rohani ditolak', 'rohani'),
  // Kids & poin
  I('CKIDS_CHECKIN', 'Anak check-in (Kids)', 'kids'),
  I('CKIDS_PICKUP', 'Anak dijemput (Kids)', 'kids'),
  I('POINT_EARNED', 'Poin bertambah', 'kids'),
  I('POINT_ADJUSTED', 'Poin disesuaikan', 'kids'),
  I('GIFT_REDEEMED', 'Hadiah ditukar', 'kids'),
  // Lainnya
  I('VISIT_RECORDED', 'Kunjungan tercatat', 'other'),
  I('FEEDBACK_REPLIED', 'Masukan dibalas', 'other'),
  I('BUSINESS_PARTNER_INVITED', 'Undangan partner usaha', 'other'),
  I('BUSINESS_PARTNER_ACCEPTED', 'Partner usaha menerima', 'other'),
  I('BUSINESS_PARTNER_REJECTED', 'Partner usaha menolak', 'other'),
  I('BUSINESS_PARTNER_REMOVED', 'Partner usaha dikeluarkan', 'other'),
  // Universal Form (2026-12)
  I('FORM_REMINDER', 'Pengingat isi formulir', 'other', true),
  I('FORM_NEEDS_FIX', 'Formulir perlu diperbaiki', 'other'),
  I('FORM_REJECTED', 'Formulir ditolak', 'other'),
  // Konseling (2026-12)
  I('KONSELING_ASSIGNED', 'Konseling ditugaskan (konselor)', 'rohani'),
  I('KONSELING_SCHEDULED', 'Jadwal konseling ditetapkan', 'rohani'),
  I('KONSELING_UPDATED', 'Kabar permintaan konseling', 'rohani'),
];

const byKey = new Map(NOTIF_CATALOG.map((c) => [c.key, c]));
const byInApp = new Map(NOTIF_CATALOG.filter((c) => c.inAppType).map((c) => [c.inAppType!, c]));

export function catalogByKey(key: string) {
  return byKey.get(key) ?? null;
}
/** Item katalog untuk tipe in-app (mis. 'IBADAH_REMINDER' → kunci IBADAH_REMINDER_H1). */
export function catalogByInAppType(type: string) {
  return byInApp.get(type) ?? null;
}

export interface Channels {
  inApp: boolean;
  email: boolean;
  waFallbackEmail: boolean;
}

// --- cache 60 detik (hot path: setiap notifikasi) ---
const TTL = 60_000;
let cache: { at: number; rows: Map<string, Channels> } | null = null;

async function loadAll(): Promise<Map<string, Channels>> {
  if (cache && Date.now() - cache.at < TTL) return cache.rows;
  try {
    const rows = await prisma.notificationChannelConfig.findMany();
    cache = { at: Date.now(), rows: new Map(rows.map((r) => [r.type, { inApp: r.inApp, email: r.email, waFallbackEmail: r.waFallbackEmail }])) };
  } catch (err) {
    logger.warn({ err }, '[notif-channels] gagal memuat — pakai default');
    cache = { at: Date.now(), rows: cache?.rows ?? new Map() };
  }
  return cache.rows;
}

export function invalidateNotifChannels() {
  cache = null;
}

/** Saluran efektif untuk satu kunci katalog (default = perilaku lama). */
export async function channelsFor(key: string): Promise<Channels> {
  const item = byKey.get(key);
  const row = (await loadAll()).get(key);
  return {
    inApp: row ? row.inApp : (item?.inAppDefault ?? true),
    email: row?.email ?? false,
    waFallbackEmail: row?.waFallbackEmail ?? false,
  };
}

/** Saluran efektif untuk tipe in-app (dipakai createNotification). Tipe tak dikenal → in-app saja. */
export async function channelsForInAppType(type: string): Promise<Channels & { key: string | null }> {
  const item = byInApp.get(type);
  if (!item) return { key: null, inApp: true, email: false, waFallbackEmail: false };
  return { key: item.key, ...(await channelsFor(item.key)) };
}

/** Semua jenis + saluran efektif + status WhatsApp (untuk Portal). */
export async function listNotifChannels() {
  const rows = await loadAll();
  const wa = await prisma.waNotificationConfig.findMany({ select: { type: true, isEnabled: true, label: true } });
  const waMap = new Map(wa.map((w) => [w.type, w]));
  return NOTIF_CATALOG.map((c) => {
    const row = rows.get(c.key);
    const w = c.waType ? waMap.get(c.waType) : undefined;
    return {
      key: c.key,
      label: c.label,
      group: c.group,
      supports: { inApp: !!c.inAppType, whatsapp: !!w, email: !!c.inAppType },
      inApp: c.inAppType ? (row ? row.inApp : c.inAppDefault) : false,
      whatsapp: !!w?.isEnabled,
      waType: w ? c.waType : null,
      email: row?.email ?? false,
      waFallbackEmail: row?.waFallbackEmail ?? false,
    };
  });
}

export async function saveNotifChannel(
  key: string,
  patch: Partial<Channels>,
  userId: string | null,
): Promise<void> {
  const item = byKey.get(key);
  if (!item) throw new Error(`Jenis notifikasi tidak dikenal: ${key}`);
  const cur = await channelsFor(key);
  const next = { ...cur, ...patch };
  await prisma.notificationChannelConfig.upsert({
    where: { type: key },
    create: { type: key, inApp: next.inApp, email: next.email, waFallbackEmail: next.waFallbackEmail, updatedByUserId: userId },
    update: { inApp: next.inApp, email: next.email, waFallbackEmail: next.waFallbackEmail, updatedByUserId: userId },
  });
  invalidateNotifChannels();
}

/** Tandai sekali kirim (job terjadwal). true = baru (boleh kirim), false = sudah pernah. */
export async function claimDedup(key: string): Promise<boolean> {
  try {
    await prisma.notificationDedup.create({ data: { dedupKey: key.slice(0, 255) } });
    return true;
  } catch {
    return false;
  }
}
