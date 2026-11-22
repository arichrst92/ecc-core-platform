/**
 * Group authorization helpers (module 23).
 *
 * Rules:
 *   - PIC (Group.picJemaatId) → full manage (approve, add, remove, dismiss)
 *   - Admin Portal dengan Role Access menu Group (tulis) → full manage
 *     (2026-11: TIDAK ada lagi jalan pintas Fulltimer)
 *   - Member (in GroupMember) → view + leave self only
 *   - Non-member → view public group only (or via joinCode)
 */
import { prisma } from '@ecc/database';
import { Forbidden, NotFound } from './errors.js';

/** Cek user boleh manage group (PIC atau admin Role Access Group). `isAdmin` dihitung pemanggil. */
export async function assertCanManageGroup(
  groupId: string,
  userJemaatId: string,
  isAdmin: boolean,
): Promise<void> {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: { id: true, picJemaatId: true, cabangId: true },
  });
  if (!group) throw NotFound('Group tidak ditemukan');

  // Admin Role Access Group (Portal) → OK
  if (isAdmin) return;
  // PIC sendiri → OK
  if (group.picJemaatId === userJemaatId) return;

  throw Forbidden('Hanya PIC group ini (atau admin dengan akses Group di Portal) yang boleh mengelola group ini.');
}

/**
 * Cek group visible/accessible ke user:
 * - Public group → siapa aja
 * - Private group → cuma member + PIC + admin Role Access Group (Portal)
 *
 * Return group data (dengan minimal fields) atau throw 403/404.
 */
export async function assertCanViewGroup(
  groupId: string,
  userJemaatId: string,
  canViewAll: boolean,
): Promise<{ id: string; isPublic: boolean; picJemaatId: string | null }> {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: { id: true, isPublic: true, picJemaatId: true, isActive: true },
  });
  if (!group || !group.isActive) throw NotFound('Group tidak ditemukan');

  if (group.isPublic) return group;

  // Private — cek membership atau role
  if (canViewAll) return group;
  if (group.picJemaatId === userJemaatId) return group;

  const isMember = await prisma.groupMember.findUnique({
    where: { groupId_jemaatId: { groupId, jemaatId: userJemaatId } },
    select: { id: true, isActive: true },
  });
  if (isMember?.isActive) return group;

  // Untuk private, hide existence (404 daripada 403) — biar gak leak group ID
  throw NotFound('Group tidak ditemukan');
}

/**
 * Generate join code 8-char alphanumeric uppercase (no ambiguous chars
 * O/0/I/1/L). ~30 bits entropy, cukup untuk invitation code.
 */
export function generateJoinCode(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

/**
 * Generate unique join code (retry kalau collision di DB).
 * Max 5 attempts — probability collision sangat kecil (~10 juta code space).
 */
export async function generateUniqueJoinCode(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateJoinCode();
    const existing = await prisma.group.findUnique({
      where: { joinCode: code },
      select: { id: true },
    });
    if (!existing) return code;
  }
  throw new Error('Failed generate unique join code after 5 attempts');
}

/**
 * PIC otomatis jadi anggota aktif group (supaya muncul di "My Groups",
 * menerima notifikasi, dan terhitung di jumlah anggota). Idempotent:
 * anggota yang pernah keluar diaktifkan kembali.
 */
export async function ensurePicMember(groupId: string, picJemaatId: string | null | undefined): Promise<void> {
  if (!picJemaatId) return;
  await prisma.groupMember.upsert({
    where: { groupId_jemaatId: { groupId, jemaatId: picJemaatId } },
    create: { groupId, jemaatId: picJemaatId },
    update: { isActive: true, tanggalKeluar: null },
  });
}
