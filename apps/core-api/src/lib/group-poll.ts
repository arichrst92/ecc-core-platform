/**
 * Logika murni voting group (tanpa DB) — supaya mudah di-test.
 */

export interface PollState {
  multiple: boolean;
  isClosed: boolean;
  closesAt: Date | null;
}

/** Voting masih terbuka? (tidak ditutup manual & belum lewat batas waktu) */
export function isPollOpen(p: PollState, now: Date = new Date()): boolean {
  if (p.isClosed) return false;
  if (p.closesAt && p.closesAt.getTime() <= now.getTime()) return false;
  return true;
}

export type VoteCheck =
  | { ok: true; optionIds: string[] }
  | { ok: false; code: 'POLL_CLOSED' | 'POLL_INVALID_OPTION' | 'POLL_SINGLE_CHOICE'; message: string };

/**
 * Validasi pilihan jemaat. Array kosong = tarik suara. Duplikat dibuang.
 */
export function checkVoteSelection(
  poll: PollState,
  validOptionIds: string[],
  selected: string[],
  now: Date = new Date(),
): VoteCheck {
  if (!isPollOpen(poll, now)) {
    return { ok: false, code: 'POLL_CLOSED', message: 'Voting sudah ditutup.' };
  }
  const uniq = [...new Set(selected)];
  const valid = new Set(validOptionIds);
  if (uniq.some((id) => !valid.has(id))) {
    return { ok: false, code: 'POLL_INVALID_OPTION', message: 'Pilihan tidak valid.' };
  }
  if (!poll.multiple && uniq.length > 1) {
    return { ok: false, code: 'POLL_SINGLE_CHOICE', message: 'Voting ini hanya boleh memilih satu opsi.' };
  }
  return { ok: true, optionIds: uniq };
}

/**
 * Hasil boleh dilihat: pengelola selalu; anggota setelah memilih atau
 * setelah voting ditutup.
 */
export function canSeeResults(args: { canManage: boolean; hasVoted: boolean; open: boolean }): boolean {
  return args.canManage || args.hasVoted || !args.open;
}

/** Opsi poll: trim, buang kosong & duplikat (case-insensitive), 2–10 opsi. */
export function normalizePollOptions(raw: string[]): string[] | null {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of raw) {
    const v = r.trim().slice(0, 200);
    if (!v) continue;
    const k = v.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out.length >= 2 && out.length <= 10 ? out : null;
}
