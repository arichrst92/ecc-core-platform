/**
 * Auth store untuk CKids — pattern sama dengan portal, storage key beda
 * supaya session di ckids terpisah dari portal (walaupun subdomain sama).
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ResolvedMenuAccess } from '@ecc/shared-types';

interface AuthUser {
  id: string;
  jemaatId: string;
  namaLengkap: string;
  noHp: string;
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
    { name: 'ecc-ckids-auth' },
  ),
);
