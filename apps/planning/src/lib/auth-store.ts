import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ResolvedMenuAccess } from '@ecc/shared-types';

/**
 * Auth state — shared format dengan portal.
 * SSO di-handle lewat URL hash (lihat app/auth/sso-in/page.tsx) karena
 * localStorage origin-scoped (planning.eccchurch.global ≠ portal.eccchurch.global).
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
    { name: 'ecc-planning-auth' },
  ),
);
