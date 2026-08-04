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

type InAppNotifType =
  | 'CKIDS_CHECKIN'
  | 'CKIDS_PICKUP'
  | 'GIFT_REDEEMED'
  | 'POINT_EARNED'
  | 'POINT_ADJUSTED'
  | 'FAMILY_LINKED';

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
  try {
    await prisma.notification.create({
      data: {
        jemaatId: args.jemaatId,
        type: args.type,
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
  try {
    await prisma.notification.createMany({
      data: recipients.map((jemaatId) => ({
        jemaatId,
        type: args.type,
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
