/**
 * Event × Role jemaat.
 *
 * 1. Syarat daftar (EventRoleRequirement): jemaat harus punya role AKTIF yang
 *    cocok dengan SALAH SATU syarat. subRoleId / subRoleStatusId kosong =
 *    semua sub-role / status. Event tanpa syarat = terbuka untuk semua.
 *    Berlaku juga untuk admin yang mendaftarkan peserta (tanpa bypass).
 *
 * 2. Role yang diberikan (Event.grantRoleId/SubRoleId/SubRoleStatusId):
 *    - event dengan absensi (butuhKehadiran) → diberikan saat HADIR
 *    - event tanpa absensi → diberikan saat daftar
 *    Kalau jemaat sudah punya role aktif yang persis sama, tidak dibuat ulang.
 *    Role yang dibuat event ditandai sourceEventId.
 *
 * 3. Partisipasi BATAL / dihapus → role dari event ini diakhiri.
 */
import { prisma } from '@ecc/database';
import { ApiError } from './errors.js';
import { logger } from './logger.js';

// ------------------------------------------------------------------ murni

export interface RoleRequirement {
  roleId: string;
  subRoleId: string | null;
  subRoleStatusId: string | null;
}

export interface ActiveJemaatRole {
  roleId: string;
  subRoleId: string;
  subRoleStatusId: string | null;
}

/** Salah satu syarat cocok (atau tidak ada syarat). */
export function isEligible(reqs: RoleRequirement[], roles: ActiveJemaatRole[]): boolean {
  if (reqs.length === 0) return true;
  return reqs.some((r) =>
    roles.some(
      (a) =>
        a.roleId === r.roleId &&
        (!r.subRoleId || a.subRoleId === r.subRoleId) &&
        (!r.subRoleStatusId || a.subRoleStatusId === r.subRoleStatusId),
    ),
  );
}

/** Kapan role event diberikan. */
export function grantTrigger(event: { butuhKehadiran: boolean }): 'HADIR' | 'DAFTAR' {
  return event.butuhKehadiran ? 'HADIR' : 'DAFTAR';
}

/** "Jemaat → Jemaat Tetap → Aktif" / "Pelayan (semua sub-role)". */
export function requirementLabel(r: {
  role: { nama: string };
  subRole: { nama: string } | null;
  subRoleStatus: { nama: string } | null;
}): string {
  const parts = [r.role.nama];
  parts.push(r.subRole ? r.subRole.nama : 'semua sub-role');
  if (r.subRoleStatus) parts.push(r.subRoleStatus.nama);
  return parts.join(' → ');
}

// ------------------------------------------------------------------ DB

const reqInclude = {
  role: { select: { nama: true } },
  subRole: { select: { nama: true } },
  subRoleStatus: { select: { nama: true } },
} as const;

/**
 * Lempar 403 NOT_ELIGIBLE kalau jemaat tidak memenuhi syarat role event.
 * `who` dipakai di pesan (mis. nama anggota keluarga saat daftar batch).
 */
export async function assertEventEligible(
  eventId: string,
  jemaatId: string,
  who?: string,
): Promise<void> {
  const reqs = await prisma.eventRoleRequirement.findMany({
    where: { eventId },
    include: reqInclude,
  });
  if (reqs.length === 0) return;
  const roles = await prisma.jemaatRole.findMany({
    where: { jemaatId, isActive: true },
    select: { roleId: true, subRoleId: true, subRoleStatusId: true },
  });
  if (isEligible(reqs, roles)) return;
  const labels = reqs.map(requirementLabel);
  throw new ApiError(403, 'NOT_ELIGIBLE', notEligibleMessage(labels, who), { requirements: labels });
}

/**
 * Pesan untuk jemaat yang belum memenuhi syarat:
 * "Anda belum diperbolehkan mengikuti event ini. Syaratnya Anda harus
 *  Jemaat → Jemaat Tetap → Aktif terlebih dahulu."
 * Beberapa syarat digabung dengan "atau" (cukup salah satu).
 */
export function notEligibleMessage(labels: string[], who?: string): string {
  const syarat =
    labels.length <= 1
      ? (labels[0] ?? '')
      : `${labels.slice(0, -1).join(', ')} atau ${labels[labels.length - 1]}`;
  const subject = who ?? 'Anda';
  const harus = who ? 'harus' : 'Anda harus';
  return `${subject} belum diperbolehkan mengikuti event ini. Syaratnya ${harus} ${syarat} terlebih dahulu.`;
}

/** Beri role event ke jemaat (idempotent). Return id JemaatRole baru atau null. */
export async function grantEventRole(eventId: string, jemaatId: string): Promise<string | null> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { judul: true, grantRoleId: true, grantSubRoleId: true, grantSubRoleStatusId: true },
  });
  if (!event?.grantRoleId || !event.grantSubRoleId) return null;
  const exists = await prisma.jemaatRole.findFirst({
    where: {
      jemaatId,
      roleId: event.grantRoleId,
      subRoleId: event.grantSubRoleId,
      subRoleStatusId: event.grantSubRoleStatusId ?? null,
      isActive: true,
    },
    select: { id: true },
  });
  if (exists) return null;
  const created = await prisma.jemaatRole.create({
    data: {
      jemaatId,
      roleId: event.grantRoleId,
      subRoleId: event.grantSubRoleId,
      subRoleStatusId: event.grantSubRoleStatusId ?? null,
      sourceEventId: eventId,
      catatan: `Otomatis dari event "${event.judul}"`,
    },
    select: { id: true },
  });
  return created.id;
}

/** Akhiri role yang pernah diberikan event ini ke jemaat. Return jumlah. */
export async function revokeEventRole(eventId: string, jemaatId: string): Promise<number> {
  const r = await prisma.jemaatRole.updateMany({
    where: { jemaatId, sourceEventId: eventId, isActive: true },
    data: { isActive: false, tanggalSelesai: new Date() },
  });
  return r.count;
}

/**
 * Panggil setelah status partisipasi berubah. Aman dipanggil berulang.
 * Error di sini tidak menggagalkan request utama (dicatat ke log saja).
 */
export async function syncEventRoleForStatus(
  event: { id: string; butuhKehadiran: boolean },
  jemaatId: string,
  status: string,
): Promise<void> {
  try {
    if (status === 'BATAL') {
      await revokeEventRole(event.id, jemaatId);
      return;
    }
    const trigger = grantTrigger(event);
    if (trigger === 'HADIR' ? status === 'HADIR' : status !== 'BATAL') {
      await grantEventRole(event.id, jemaatId);
    }
  } catch (err) {
    logger.error({ eventId: event.id, jemaatId, status, err }, '[event-role] sync gagal');
  }
}
