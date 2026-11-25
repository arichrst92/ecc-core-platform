/**
 * In-app notification helper — Modul 30.
 *
 * Emit notif ke feed user (mobile bell icon) untuk 5 event:
 *   CKIDS_CHECKIN, CKIDS_PICKUP, GIFT_REDEEMED, POINT_EARNED,
 *   POINT_ADJUSTED, FAMILY_LINKED
 *
 * Fire-and-forget dari caller — kalau insert gagal, log tapi jangan block
 * business logic. Mobile polling `/admin/me/notifications` per 30s.
 *
 * Untuk kids events (check-in, pickup, redeem, point) — recipient = parent(s)
 * anak (guardian: `primaryGuardianId` + `JemaatRelasi` tipe Ayah/Ibu/Wali).
 * Untuk family link — recipient = target jemaat yang di-link.
 */
import { prisma } from '@ecc/database';
import { logger } from './logger.js';
import { channelsForInAppType, claimDedup } from './notif-channels.js';
import { notifyByEmail } from './notif-email.js';

export type InAppNotifType =
  | 'CKIDS_CHECKIN'
  | 'CKIDS_PICKUP'
  | 'GIFT_REDEEMED'
  | 'POINT_EARNED'
  | 'POINT_ADJUSTED'
  | 'FAMILY_LINKED'
  | 'GROUP_MEMBER_ADDED'
  | 'GROUP_MEMBER_REMOVED'
  | 'GROUP_DISMISSED'
  | 'EVENT_APPROVED'
  | 'EVENT_CHECKED_IN'
  | 'BRANCH_CHANGE_APPROVED'
  | 'BRANCH_CHANGE_REJECTED'
  | 'EVENT_REGISTERED'
  | 'HOMECELL_ATTENDED'
  | 'VISIT_RECORDED'
  | 'MINISTRY_JOIN_REQUESTED'
  | 'MINISTRY_JOIN_APPROVED'
  | 'MINISTRY_JOIN_REJECTED'
  | 'HOMECELL_JOIN_REQUESTED'
  | 'HOMECELL_JOIN_APPROVED'
  | 'HOMECELL_JOIN_REJECTED'
  | 'GROUP_JOIN_REQUESTED'
  | 'GROUP_JOIN_APPROVED'
  | 'GROUP_JOIN_REJECTED'
  | 'GROUP_ANNOUNCEMENT'
  | 'GROUP_POLL_CREATED'
  | 'HOMECELL_ANNOUNCEMENT'
  | 'HOMECELL_POLL_CREATED'
  | 'FEEDBACK_REPLIED'
  | 'PRAYER_ASSIGNED'
  | 'PRAYER_PRAYED'
  | 'SPIRITUAL_JOURNEY_APPROVED'
  | 'SPIRITUAL_JOURNEY_REJECTED'
  | 'FAMILY_LINK_REQUESTED'
  | 'FAMILY_LINK_APPROVED'
  | 'FAMILY_LINK_REJECTED'
  | 'BUSINESS_PARTNER_INVITED'
  | 'BUSINESS_PARTNER_ACCEPTED'
  | 'BUSINESS_PARTNER_REJECTED'
  | 'BUSINESS_PARTNER_REMOVED'
  | 'HOMECELL_ASISTEN_ASSIGNED'
  | 'MINISTRY_DUTY_ASSIGNED'
  | 'MINISTRY_DUTY_REMOVED'
  | 'IBADAH_REMINDER'
  | 'EVENT_REMINDER'
  | 'BIRTHDAY_GREETING'
  | 'HOMECELL_MATERIAL'
  | 'EVENT_PAYMENT_REJECTED'
  | 'EVENT_CANCELLED_BY_ADMIN'
  | 'FORM_REMINDER'
  | 'FORM_NEEDS_FIX'
  | 'FORM_REJECTED'
  | 'KONSELING_ASSIGNED'
  | 'KONSELING_SCHEDULED'
  | 'KONSELING_UPDATED';

interface CreateNotifArgs {
  jemaatId: string;
  type: InAppNotifType;
  title: string;
  body: string;
  actionUrl?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Insert 1 notification row. Fire-and-forget — don't await di caller kritis.
 */
export async function createNotification(args: CreateNotifArgs): Promise<void> {
  // Saluran per jenis (Portal → Saluran notifikasi): in-app bisa dimatikan,
  // email ikut dikirim bila diaktifkan. Default = perilaku lama.
  const ch = await channelsForInAppType(args.type);
  if (ch.key && (ch.email || ch.waFallbackEmail)) {
    void notifyByEmail({
      jemaatIds: [args.jemaatId],
      key: ch.key,
      always: ch.email,
      waFallback: ch.waFallbackEmail,
      title: args.title,
      body: args.body,
      actionUrl: args.actionUrl,
    }).catch((e) => logger.warn({ err: (e as Error).message }, '[notification] email gagal diantrekan'));
  }
  if (!ch.inApp) return;
  try {
    await prisma.notification.create({
      data: {
        jemaatId: args.jemaatId,
        // Cast: schema.prisma extended dgn 7 value baru per migration
        // 20260803110000_extend_notif_types. Prisma client type union
        // sinkron setelah `db:generate` di Mac. Cast supaya cross-machine safe.
        type: args.type as never,
        title: args.title,
        body: args.body,
        actionUrl: args.actionUrl ?? null,
        metadata: (args.metadata ?? null) as never,
      },
    });
  } catch (e) {
    logger.error(
      { err: e instanceof Error ? e.message : String(e), args },
      '[notification] createNotification failed',
    );
  }
}

/**
 * Batch create untuk multi-recipient (mis. semua parent anak).
 */
export async function createNotificationBatch(
  recipients: string[],
  args: Omit<CreateNotifArgs, 'jemaatId'>,
): Promise<void> {
  if (recipients.length === 0) return;
  const ch = await channelsForInAppType(args.type);
  if (ch.key && (ch.email || ch.waFallbackEmail)) {
    void notifyByEmail({
      jemaatIds: recipients,
      key: ch.key,
      always: ch.email,
      waFallback: ch.waFallbackEmail,
      title: args.title,
      body: args.body,
      actionUrl: args.actionUrl,
    }).catch((e) => logger.warn({ err: (e as Error).message }, '[notification] email gagal diantrekan'));
  }
  if (!ch.inApp) return;
  try {
    await prisma.notification.createMany({
      data: recipients.map((jemaatId) => ({
        jemaatId,
        type: args.type as never,
        title: args.title,
        body: args.body,
        actionUrl: args.actionUrl ?? null,
        metadata: (args.metadata ?? null) as never,
      })),
    });
  } catch (e) {
    logger.error(
      { err: e instanceof Error ? e.message : String(e), recipients, args },
      '[notification] createNotificationBatch failed',
    );
  }
}

/**
 * Resolve parent/guardian jemaat IDs untuk anak tertentu.
 * Priority:
 *   1. Jemaat.primaryGuardianId (kalau di-set)
 *   2. JemaatRelasi where jemaatId=anak + tipeRelasi.nama IN
 *      ('Ayah', 'Ibu', 'Wali') — return semua parent aktif
 *
 * Return unique list, filter jemaat active only.
 */
export async function resolveGuardianJemaatIds(anakId: string): Promise<string[]> {
  const anak = await prisma.jemaat.findUnique({
    where: { id: anakId },
    select: { id: true, primaryGuardianId: true, isActive: true },
  });
  if (!anak) return [];

  const ids = new Set<string>();

  if (anak.primaryGuardianId) {
    const g = await prisma.jemaat.findUnique({
      where: { id: anak.primaryGuardianId },
      select: { id: true, isActive: true },
    });
    if (g?.isActive) ids.add(g.id);
  }

  // JemaatRelasi tipe parent
  const relasi = await prisma.jemaatRelasi.findMany({
    where: {
      jemaatId: anakId,
      tipeRelasi: {
        nama: { in: ['Ayah', 'Ibu', 'Wali'] },
      },
      jemaatTerkait: { isActive: true },
    },
    select: { jemaatTerkaitId: true },
  });
  for (const r of relasi) {
    ids.add(r.jemaatTerkaitId);
  }

  return Array.from(ids);
}

/**
 * Notifikasi dari job terjadwal (pengingat H-1, ulang tahun) ke saluran
 * in-app / email sesuai Portal → Saluran notifikasi. Sekali per dedupKey
 * (job bisa berjalan beberapa kali dalam jendela kirim). WhatsApp tetap
 * dikirim terpisah oleh job lewat sendWaOnce.
 */
export async function notifyScheduled(args: {
  key: string;
  inAppType: InAppNotifType;
  jemaatId: string;
  dedupKey: string;
  title: string;
  body: string;
  actionUrl?: string;
  channels: { inApp: boolean; email: boolean; waFallbackEmail: boolean };
}): Promise<void> {
  const { channels: ch } = args;
  if (ch.inApp && (await claimDedup(`inapp:${args.dedupKey}`))) {
    try {
      await prisma.notification.create({
        data: {
          jemaatId: args.jemaatId,
          type: args.inAppType as never,
          title: args.title,
          body: args.body,
          actionUrl: args.actionUrl ?? null,
        },
      });
    } catch (e) {
      logger.error({ err: e instanceof Error ? e.message : String(e) }, '[notification] notifyScheduled in-app gagal');
    }
  }
  if ((ch.email || ch.waFallbackEmail) && (await claimDedup(`email:${args.dedupKey}`))) {
    await notifyByEmail({
      jemaatIds: [args.jemaatId],
      key: args.key,
      always: ch.email,
      waFallback: ch.waFallbackEmail,
      title: args.title,
      body: args.body,
      actionUrl: args.actionUrl,
    }).catch((e) => logger.warn({ err: (e as Error).message }, '[notification] notifyScheduled email gagal'));
  }
}
