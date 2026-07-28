/**
 * Group workflow notification dispatcher (module 23).
 *
 * Pattern: insert row ke NotificationLog dengan status=PENDING.
 * Cron job scheduled-jobs.ts akan pick up + send via Fonnte WA gateway.
 *
 * Dedup key format: `group:<groupId>:<action>:<jemaatId>:<timestamp>`
 * — supaya idempotent kalau handler retry.
 */
import { prisma } from '@ecc/database';

interface QueueNotifArgs {
  jemaatId: string | null;
  noHp: string;
  type: 'GROUP_MEMBER_ADDED' | 'GROUP_MEMBER_REMOVED' | 'GROUP_DISMISSED';
  messageBody: string;
  dedupKey: string;
}

async function queueNotif(args: QueueNotifArgs): Promise<void> {
  try {
    await prisma.notificationLog.upsert({
      where: { dedupKey: args.dedupKey },
      create: {
        jemaatId: args.jemaatId,
        noHp: args.noHp,
        type: args.type,
        dedupKey: args.dedupKey,
        messageBody: args.messageBody,
        status: 'PENDING',
      },
      update: {}, // idempotent — jangan re-queue kalau sudah ada
    });
  } catch (err) {
    // Non-fatal: notification adalah side effect, jangan gagalkan business logic.
    console.warn(
      `[group-notif] Failed queue ${args.type} ke ${args.noHp}: ${(err as Error).message}`,
    );
  }
}

/** Notif jemaat: kamu di-add ke group X. */
export async function notifMemberAdded(
  groupId: string,
  jemaatId: string,
): Promise<void> {
  const [group, jemaat] = await Promise.all([
    prisma.group.findUnique({
      where: { id: groupId },
      select: { nama: true },
    }),
    prisma.jemaat.findUnique({
      where: { id: jemaatId },
      select: { noHp: true, namaLengkap: true },
    }),
  ]);
  if (!group || !jemaat?.noHp) return;

  await queueNotif({
    jemaatId,
    noHp: jemaat.noHp,
    type: 'GROUP_MEMBER_ADDED',
    messageBody: `Halo ${jemaat.namaLengkap}, Anda baru saja bergabung ke Group "${group.nama}" di ECC. Cek detail di aplikasi ECC.`,
    dedupKey: `group:${groupId}:added:${jemaatId}:${Date.now()}`,
  });
}

/** Notif jemaat: kamu di-remove dari group X. */
export async function notifMemberRemoved(
  groupId: string,
  jemaatId: string,
): Promise<void> {
  const [group, jemaat] = await Promise.all([
    prisma.group.findUnique({
      where: { id: groupId },
      select: { nama: true },
    }),
    prisma.jemaat.findUnique({
      where: { id: jemaatId },
      select: { noHp: true, namaLengkap: true },
    }),
  ]);
  if (!group || !jemaat?.noHp) return;

  await queueNotif({
    jemaatId,
    noHp: jemaat.noHp,
    type: 'GROUP_MEMBER_REMOVED',
    messageBody: `Halo ${jemaat.namaLengkap}, Anda telah dikeluarkan dari Group "${group.nama}". Kalau ada pertanyaan, hubungi PIC group.`,
    dedupKey: `group:${groupId}:removed:${jemaatId}:${Date.now()}`,
  });
}

/**
 * Notif ke all members: group di-dismiss.
 * Dispatch batch — 1 notif per member.
 */
export async function notifGroupDismissed(groupId: string): Promise<void> {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: {
      nama: true,
      members: {
        where: { isActive: true },
        select: {
          jemaat: {
            select: { id: true, noHp: true, namaLengkap: true },
          },
        },
      },
    },
  });
  if (!group) return;

  const ts = Date.now();
  for (const m of group.members) {
    const j = m.jemaat;
    if (!j?.noHp) continue;
    await queueNotif({
      jemaatId: j.id,
      noHp: j.noHp,
      type: 'GROUP_DISMISSED',
      messageBody: `Halo ${j.namaLengkap}, Group "${group.nama}" telah ditutup. Kalau perlu group baru, hubungi PIC atau admin cabang.`,
      dedupKey: `group:${groupId}:dismissed:${j.id}:${ts}`,
    });
  }
}
