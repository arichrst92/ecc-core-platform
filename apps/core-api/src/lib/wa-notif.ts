/**
 * WhatsApp Notification Helper
 *
 * Dispatch WA message berdasarkan config di `WaNotificationConfig` table.
 * Admin bisa enable/disable + edit template per type via portal
 * `/dashboard/wa-config`.
 *
 * In-memory cache (TTL 60s) supaya hot path (reminder scheduler, trigger notif)
 * tidak hit DB tiap send. Call `invalidateWaConfigCache()` setelah admin PATCH.
 */
import { prisma } from '@ecc/database';
import { sendWhatsAppText } from '@ecc/auth';
import { logger } from './logger.js';

/** Known WA notif types — subset untuk type safety. String bebas tetap OK. */
export type WaNotifType =
  | 'FAMILY_LINKED'
  | 'GROUP_MEMBER_ADDED'
  | 'GROUP_MEMBER_REMOVED'
  | 'EVENT_REGISTERED'
  | 'EVENT_APPROVED'
  | 'EVENT_CHECKED_IN'
  | 'MINISTRY_SCHEDULE_ASSIGNED'
  | 'HOMECELL_ATTENDED'
  | 'BRANCH_CHANGE_APPROVED'
  | 'IBADAH_REMINDER_H1'
  | 'EVENT_REMINDER_H1'
  | 'BIRTHDAY_GREETING'
  | (string & {});

export interface WaConfig {
  type: string;
  isEnabled: boolean;
  template: string;
  category: string;
  placeholders: string[];
}

// --- Cache ---
const CACHE_TTL_MS = 60_000;
interface CacheEntry {
  value: WaConfig | null;
  expiresAt: number;
}
const cache = new Map<string, CacheEntry>();

export function invalidateWaConfigCache(type?: string) {
  if (type) cache.delete(type);
  else cache.clear();
}

/** Fetch config by type (cached 60s). Returns null if not found. */
export async function getConfig(type: string): Promise<WaConfig | null> {
  const cached = cache.get(type);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const row = await prisma.waNotificationConfig.findUnique({ where: { type } });
  const value = row
    ? {
        type: row.type,
        isEnabled: row.isEnabled,
        template: row.template,
        category: row.category,
        placeholders: row.placeholders,
      }
    : null;
  cache.set(type, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

/** Replace `{placeholder}` tokens in template. Unknown keys → kept as-is. */
export function renderTemplate(
  template: string,
  vars: Record<string, string | number | null | undefined>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    const v = vars[key];
    if (v === null || v === undefined) return match;
    return String(v);
  });
}

/**
 * Send WA kalau config aktif. Catch internal — tidak throw.
 * Pemakaian umum: `void sendWaIfEnabled('FAMILY_LINKED', jemaat.noHp, { nama, ... })`.
 */
export async function sendWaIfEnabled(
  type: WaNotifType,
  noHp: string | null,
  vars: Record<string, string | number | null | undefined>,
): Promise<void> {
  if (!noHp) return;
  try {
    const cfg = await getConfig(type);
    if (!cfg || !cfg.isEnabled || !cfg.template.trim()) return;

    const message = renderTemplate(cfg.template, vars);
    const result = await sendWhatsAppText(noHp, message);
    logger.info({ type, noHp, messageId: result.messageId }, '[wa-notif] sent');
  } catch (err) {
    logger.warn(
      { type, noHp, err: (err as Error).message },
      '[wa-notif] send failed (suppressed)',
    );
  }
}
