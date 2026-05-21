import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ResolvedMenuAccess } from '@ecc/shared-types';

interface AuthUser {
  id: string;
  jemaatId: string;
  namaLengkap: string;
  noHp: string;
  isFulltimer: boolean;
  // Gate login portal — RBAC resolved (Role.canAccessPortal OR override SubRole).
  canAccessPortal: boolean;
  // Map menuKey → { canRead, canWrite, canDelete }
  menuAccess: ResolvedMenuAccess;
  hasFaceEnrolled: boolean;
  fotoUrl: string | null;
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  setAuth: (data: { accessToken: string; refreshToken: string; user: AuthUser }) => void;
  /** Update menuAccess + canAccessPortal tanpa re-issue token (mis. setelah RBAC diubah). */
  setAccess: (a: { canAccessPortal: boolean; menuAccess: ResolvedMenuAccess }) => void;
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
      setAccess: ({ canAccessPortal, menuAccess }) =>
        set((s) =>
          s.user
            ? { user: { ...s.user, canAccessPortal, menuAccess } }
            : s,
        ),
      clearAuth: () => set({ accessToken: null, refreshToken: null, user: null }),
    }),
    { name: 'ecc-auth' },
  ),
);
