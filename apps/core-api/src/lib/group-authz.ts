/**
 * Group authorization helpers (module 23).
 *
 * Rules:
 *   - PIC (Group.picJemaatId) → full manage (approve, add, remove, dismiss)
 *   - Fulltimer admin cabang → full manage
 *   - Member (in GroupMember) → view + leave self only
 *   - Non-member → view public group only (or via joinCode)
 */
import { prisma } from '@ecc/database';
import { Forbidden, NotFound } from './errors.js';

/** Cek user boleh manage group (PIC atau admin fulltimer). */
export async function assertCanManageGroup(
  groupId: string,
  userJemaatId: string,
  isFulltimer: boolean,
): Promise<void> {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: { id: true, picJemaatId: true, cabangId: true },
  });
  if (!group) throw NotFound('Group tidak ditemukan');

  // Fulltimer di cabang yang sama → OK
  if (isFulltimer) {
    // TODO: strict — cek fulltimer beneran di cabang yg sama.
    // MVP: any fulltimer = OK (mirror pattern homecell-pic.ts).
    return;
  }
  // PIC sendiri → OK
  if (group.picJemaatId === userJemaatId) return;

  throw Forbidden('Cuma PIC atau admin fulltimer yg boleh manage group ini');
}

/**
 * Cek group visible/accessible ke user:
 * - Public group → siapa aja
 * - Private group → cuma member + PIC + fulltimer
 *
 * Return group data (dengan minimal fields) atau throw 403/404.
 */
export async function assertCanViewGroup(
  groupId: string,
  userJemaatId: string,
  isFulltimer: boolean,
): Promise<{ id: string; isPublic: boolean; picJemaatId: string | null }> {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: { id: true, isPublic: true, picJemaatId: true, isActive: true },
  });
  if (!group || !group.isActive) throw NotFound('Group tidak ditemukan');

  if (group.isPublic) return group;

  // Private — cek membership atau role
  if (isFulltimer) return group;
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
