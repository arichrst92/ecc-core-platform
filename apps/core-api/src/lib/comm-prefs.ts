/**
 * Preferensi pesan WhatsApp non-wajib per jemaat (kepatuhan no. 19 /
 * Spam Act AU / hak menolak pemasaran langsung PDPA MY).
 *
 *   reminders → pengingat ibadah & event H-1
 *   greetings → ucapan ulang tahun
 *   updates   → info aktivitas (group, event, pelayanan, keluarga, homecell, doa)
 *
 * Pesan keamanan (OTP WhatsApp, tautan login email) TIDAK terpengaruh.
 */
import { prisma } from '@ecc/database';

export type CommCategory = 'reminders' | 'greetings' | 'updates';
export interface CommPrefs {
  waReminders: boolean;
  waGreetings: boolean;
  waUpdates: boolean;
}
export const DEFAULT_COMM_PREFS: CommPrefs = { waReminders: true, waGreetings: true, waUpdates: true };

export function categoryOf(type: string): CommCategory {
  if (type === 'IBADAH_REMINDER_H1' || type === 'EVENT_REMINDER_H1' || type.endsWith('_REMINDER')) return 'reminders';
  if (type === 'BIRTHDAY_GREETING') return 'greetings';
  return 'updates';
}

const FIELD: Record<CommCategory, keyof CommPrefs> = {
  reminders: 'waReminders',
  greetings: 'waGreetings',
  updates: 'waUpdates',
};

export async function getCommPrefs(jemaatId: string): Promise<CommPrefs> {
  const p = await prisma.jemaatPrivacy.findUnique({
    where: { jemaatId },
    select: { waReminders: true, waGreetings: true, waUpdates: true },
  });
  return p ?? DEFAULT_COMM_PREFS;
}

/** Boleh kirim WA jenis `type` ke jemaat ini? (by id) */
export async function waAllowedForJemaat(jemaatId: string, type: string): Promise<boolean> {
  const prefs = await getCommPrefs(jemaatId);
  return prefs[FIELD[categoryOf(type)]];
}

/** Boleh kirim WA jenis `type` ke nomor ini? Nomor non-jemaat (tamu baru) → boleh. */
export async function waAllowedForNoHp(noHp: string, type: string): Promise<boolean> {
  const j = await prisma.jemaat.findUnique({
    where: { noHp },
    select: { privacy: { select: { waReminders: true, waGreetings: true, waUpdates: true } } },
  });
  const prefs = j?.privacy ?? DEFAULT_COMM_PREFS;
  return prefs[FIELD[categoryOf(type)]];
}
