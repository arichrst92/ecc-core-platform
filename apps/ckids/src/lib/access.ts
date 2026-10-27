/**
 * Akses CKids — Fulltimer, atau menu "Gift Stall (CKids)" (key `gift-stall`)
 * di Role Access portal.
 *   Lihat (read)  → boleh masuk: scanner ibadah, check-in, redeem, riwayat, laporan.
 *   Ubah (write)  → kelola hadiah (tambah/edit/stok), adjust poin, batalkan redeem.
 */
import { useAuthStore } from './auth-store';

type U = { isFulltimer: boolean; menuAccess?: Record<string, { canRead?: boolean; canWrite?: boolean } | undefined> } | null | undefined;

export function canUseCkids(u: U): boolean {
  return !!u && (u.isFulltimer || !!u.menuAccess?.['gift-stall']?.canRead);
}

export function canManageCkids(u: U): boolean {
  return !!u && (u.isFulltimer || !!u.menuAccess?.['gift-stall']?.canWrite);
}

export function useCanManage(): boolean {
  return canManageCkids(useAuthStore((s) => s.user) as U);
}
