'use client';

/** Cek akses Role Access user yang sedang login (untuk menampilkan/menyembunyikan tombol). Server tetap penjaga utama. */
import { hasMenuAccess } from '@ecc/shared-types';
import { useAuthStore } from '@/lib/auth-store';

export function useMenuAccess(menuKey: string, level: 'read' | 'write' | 'delete' = 'read'): boolean {
  return useAuthStore((s) => hasMenuAccess(s.user?.menuAccess ?? {}, menuKey, level));
}
