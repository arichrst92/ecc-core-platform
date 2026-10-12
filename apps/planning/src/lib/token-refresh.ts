/**
 * Refresh access token yang aman lintas tab / lintas app satu origin.
 *
 * Masalah yang diselesaikan (2026-10-12): beberapa tab (atau portal + planning
 * yang berbagi localStorage) bisa merotasi refresh token bersamaan. Tab yang
 * masih memegang token lama memicu "reuse detection" di backend → semua sesi
 * di-logout. Di sini:
 *   1. Refresh diserialisasi pakai Web Locks (satu refresh sekaligus per origin).
 *   2. Sebelum refresh, baca ulang token terbaru dari storage — kalau tab lain
 *      sudah memperbarui, langsung pakai access token baru tanpa memanggil API.
 *   3. Gagal karena jaringan TIDAK menghapus login (user tetap login, coba lagi nanti).
 */
import axios from 'axios';

interface AuthLikeState {
  accessToken: string | null;
  refreshToken: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  user: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setAuth: (data: { accessToken: string; refreshToken: string; user: any }) => void;
}

interface PersistedStore {
  getState: () => AuthLikeState;
  persist: { rehydrate: () => Promise<void> | void };
}

/** Error yang berarti sesi memang tidak valid lagi → boleh logout. */
export class SessionExpiredError extends Error {
  constructor(message = 'SESSION_EXPIRED') {
    super(message);
  }
}

export function createTokenRefresher(store: PersistedStore, baseURL: string, lockName: string) {
  let inflight: Promise<string> | null = null;

  async function run(usedAccessToken?: string | null): Promise<string> {
    await store.persist.rehydrate();
    const st = store.getState();
    if (st.accessToken && usedAccessToken && st.accessToken !== usedAccessToken) {
      return st.accessToken; // tab lain sudah refresh
    }
    if (!st.refreshToken || !st.user) throw new SessionExpiredError('NO_REFRESH_TOKEN');

    try {
      const res = await axios.post(
        `${baseURL}/auth/refresh`,
        { refreshToken: st.refreshToken },
        { headers: { 'Content-Type': 'application/json' } },
      );
      const { accessToken, refreshToken } = res.data.data as { accessToken: string; refreshToken: string };
      st.setAuth({ accessToken, refreshToken, user: st.user });
      return accessToken;
    } catch (err) {
      const status = (err as { response?: { status?: number } }).response?.status;
      const code = (err as { response?: { data?: { error?: { code?: string } } } }).response?.data?.error
        ?.code;
      if (code === 'REFRESH_TOKEN_ROTATED') {
        // Tab lain merotasi duluan — ambil token terbaru dari storage.
        await store.persist.rehydrate();
        const again = store.getState();
        if (again.accessToken && again.accessToken !== st.accessToken) return again.accessToken;
      }
      if (status === 401 || status === 403) throw new SessionExpiredError();
      throw err; // jaringan / 5xx — jangan logout
    }
  }

  return function refresh(usedAccessToken?: string | null): Promise<string> {
    if (inflight) return inflight;
    const locks =
      typeof navigator !== 'undefined'
        ? (navigator as Navigator & { locks?: { request: <T>(n: string, cb: () => Promise<T>) => Promise<T> } })
            .locks
        : undefined;
    const p: Promise<string> = locks
      ? locks.request<string>(lockName, () => run(usedAccessToken))
      : run(usedAccessToken);
    const tracked = p.finally(() => {
      inflight = null;
    });
    inflight = tracked;
    return tracked;
  };
}

/** Sinkron state login antar tab: tab lain login/refresh/logout → tab ini ikut. */
export function syncAuthAcrossTabs(store: PersistedStore, storageKey: string) {
  if (typeof window === 'undefined') return;
  window.addEventListener('storage', (e) => {
    if (e.key === storageKey) void store.persist.rehydrate();
  });
}

/** Ambil access token yang dipakai request yg gagal (untuk deteksi "sudah di-refresh tab lain"). */
export function bearerOf(headers: unknown): string | null {
  const h = headers as { Authorization?: unknown; authorization?: unknown } | undefined;
  const v = (h?.Authorization ?? h?.authorization) as string | undefined;
  return typeof v === 'string' ? v.replace(/^Bearer\s+/i, '') : null;
}
