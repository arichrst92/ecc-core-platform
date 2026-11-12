/**
 * Akses CKids per menu. Sumber:
 *   - Fulltimer → semua menu
 *   - Role Access "Gift Stall (CKids)" (`gift-stall`): Lihat → menu lihat,
 *     Ubah → juga menu ubah data (Kelola Hadiah, Adjust Point, Batalkan Redeem)
 *   - Portal → CKids → Akses CKids (per pelayanan / role) → `ckids:<menu>`
 */
import { useMemo } from 'react';
import { ckidsAllowedMenus, type CkidsMenuKey } from '@ecc/shared-types';
import { useAuthStore } from './auth-store';

type U = Parameters<typeof ckidsAllowedMenus>[0];

export type { CkidsMenuKey };

export function canUseCkids(u: U): boolean {
  return ckidsAllowedMenus(u).size > 0;
}

export function useCkidsMenus(): Set<CkidsMenuKey> {
  const user = useAuthStore((s) => s.user) as U;
  return useMemo(() => ckidsAllowedMenus(user), [user]);
}

export function useCanMenu(key: CkidsMenuKey): boolean {
  return useCkidsMenus().has(key);
}

/** Kelola hadiah (tambah / edit / foto / stok). */
export function useCanManage(): boolean {
  return useCanMenu('katalog');
}

/** Halaman pertama yang boleh dibuka user (untuk redirect). */
export const MENU_HREF: Record<CkidsMenuKey, string> = {
  gift: '/',
  katalog: '/',
  scanner: '/ibadah',
  hadir: '/hadir',
  'adjust-point': '/adjust-point',
  history: '/history',
  'cancel-redeem': '/history',
  report: '/report',
};
