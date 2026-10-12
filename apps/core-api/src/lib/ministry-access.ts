/**
 * Aturan akses ministry join approval (helper murni, mudah di-test).
 *
 * Leader = membership aktif dengan role level >= LEADER_MIN_LEVEL
 * (seed: Leader=10, Co-Leader=5, Pastor=15, Zone Leader=10, Homecell Leader=5).
 * Fulltimer boleh mengelola semua ministry.
 */
export const LEADER_MIN_LEVEL = 5;

export function canManageMinistry(managed: 'ALL' | Set<string>, pelayananId: string): boolean {
  return managed === 'ALL' || managed.has(pelayananId);
}

export type JoinDecision =
  | { ok: true }
  | { ok: false; code: 'ALREADY_MEMBER' | 'JOIN_REQUEST_PENDING'; message: string };

/** Validasi boleh mengajukan join (sebelum insert request PENDING). */
export function checkCanRequestJoin(state: {
  hasActiveMembership: boolean;
  hasPendingRequest: boolean;
}): JoinDecision {
  if (state.hasActiveMembership) {
    return { ok: false, code: 'ALREADY_MEMBER', message: 'Anda sudah member ministry ini' };
  }
  if (state.hasPendingRequest) {
    return {
      ok: false,
      code: 'JOIN_REQUEST_PENDING',
      message: 'Permintaan Anda masih menunggu persetujuan',
    };
  }
  return { ok: true };
}

/**
 * myJoinRequest yang ditampilkan di detail ministry: request terakhir user
 * berstatus PENDING atau REJECTED; null kalau sudah anggota aktif, tidak ada
 * request, atau request terakhir APPROVED/CANCELLED.
 */
export function pickMyJoinRequest<T extends { status: string }>(
  latest: T | null,
  hasActiveMembership: boolean,
): T | null {
  if (hasActiveMembership || !latest) return null;
  return latest.status === 'PENDING' || latest.status === 'REJECTED' ? latest : null;
}
