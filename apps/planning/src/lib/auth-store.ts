import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ResolvedMenuAccess } from '@ecc/shared-types';

/**
 * Auth state — SHARED dengan portal via localStorage key 'ecc-auth'.
 * Planning dijalankan di path /planning di portal.eccchurch.global, jadi
 * same-origin → localStorage auto-shared. Tidak perlu SSO handoff.
 */
export interface AuthUser {
  id: string;
  jemaatId: string;
  namaLengkap: string;
  noHp: string;
  email?: string | null;
  isFulltimer: boolean;
  canAccessPortal: boolean;
  menuAccess: ResolvedMenuAccess;
  fotoUrl: string | null;
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  setAuth: (data: { accessToken: string; refreshToken: string; user: AuthUser }) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      setAuth: (data) =>
        set({
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          user: data.user,
        }),
      clearAuth: () => set({ accessToken: null, refreshToken: null, user: null }),
    }),
    { name: 'ecc-auth' },
  ),
);
