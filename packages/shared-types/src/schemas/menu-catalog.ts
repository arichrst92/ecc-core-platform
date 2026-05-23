/**
 * Menu catalog — daftar semua menu di portal yang bisa di-atur akses-nya
 * lewat RBAC. Dipakai oleh:
 *   - Backend: validasi `menuKey` di endpoint menu-access.
 *   - Frontend: sidebar filter + halaman manage Role Access.
 *
 * Setiap entry punya:
 *   - key: identifier stabil untuk RoleMenuAccess.menuKey
 *   - label: untuk display
 *   - href: route portal (untuk sidebar)
 *   - group: header grup di sidebar (null = top-level)
 *
 * Saat tambah menu baru, daftarkan di sini DAN tambahkan kode key-nya ke
 * INSERT backfill di migration `20260519200000_rbac_menu_access`.
 */
import { z } from 'zod';

export interface MenuItem {
  key: string;
  label: string;
  href: string;
  group: string | null;
}

export const MENU_CATALOG: MenuItem[] = [
  // Top-level (selalu visible kalau user login + canAccessPortal=true).
  // 'dashboard' tetap di-list di RBAC supaya konsisten, walau biasanya
  // semua role yg boleh masuk portal punya akses ke dashboard.
  { key: 'dashboard', label: 'Dashboard', href: '/dashboard', group: null },

  // Entity
  { key: 'sinode', label: 'Sinode', href: '/dashboard/sinode', group: 'Entity' },
  { key: 'cabang', label: 'Cabang Gereja', href: '/dashboard/cabang', group: 'Entity' },

  // Service
  { key: 'ibadah', label: 'Ibadah', href: '/dashboard/ibadah', group: 'Service' },
  { key: 'kategori-ibadah', label: 'Kategori Ibadah', href: '/dashboard/kategori-ibadah', group: 'Service' },
  { key: 'pelayanan', label: 'Pelayanan', href: '/dashboard/pelayanan', group: 'Service' },
  { key: 'kehadiran', label: 'Kehadiran', href: '/dashboard/kehadiran', group: 'Service' },

  // People
  { key: 'jemaat', label: 'Jemaat', href: '/dashboard/jemaat', group: 'People' },
  { key: 'role-jemaat', label: 'Role Jemaat', href: '/dashboard/role', group: 'People' },
  { key: 'tipe-relasi', label: 'Relasi Jemaat', href: '/dashboard/tipe-relasi', group: 'People' },

  // Community
  { key: 'homecell-area', label: 'Homecell Area', href: '/dashboard/homecell-area', group: 'Community' },
  { key: 'homecell', label: 'Homecell', href: '/dashboard/homecell', group: 'Community' },

  // Movement
  { key: 'event', label: 'Event', href: '/dashboard/event', group: 'Movement' },
  { key: 'visit', label: 'Visit', href: '/dashboard/visit', group: 'Movement' },
  { key: 'local-business', label: 'Local Market', href: '/dashboard/local-business', group: 'Movement' },

  // Broadcast
  { key: 'news', label: 'News', href: '/dashboard/news', group: 'Broadcast' },
  { key: 'renungan', label: 'Renungan', href: '/dashboard/renungan', group: 'Broadcast' },

  // Developer Tools / Access Control
  { key: 'api-key', label: 'API Keys', href: '/dashboard/api-key', group: 'Developer Tools' },
  { key: 'audit-log', label: 'Audit Log', href: '/dashboard/audit-log', group: 'Developer Tools' },
  { key: 'role-access', label: 'Role Access', href: '/dashboard/role-access', group: 'Developer Tools' },
  { key: 'maintenance', label: 'Maintenance', href: '/dashboard/maintenance', group: 'Developer Tools' },
  { key: 'server-health', label: 'Server Health', href: '/dashboard/server-health', group: 'Developer Tools' },
  { key: 'credential', label: 'Credential', href: '/dashboard/credential', group: 'Developer Tools' },
  { key: 'diagnostics', label: 'Diagnostics', href: '/dashboard/diagnostics', group: 'Developer Tools' },

  // App Settings — content untuk mobile app (legal, version)
  { key: 'legal', label: 'Legal Docs', href: '/dashboard/legal', group: 'App Settings' },
  { key: 'app-version', label: 'App Versions', href: '/dashboard/app-version', group: 'App Settings' },
  { key: 'maintenance-mode', label: 'Maintenance Mode', href: '/dashboard/maintenance-mode', group: 'App Settings' },
];

export const MENU_KEYS = MENU_CATALOG.map((m) => m.key) as readonly string[];

/** Zod schema untuk validate `menuKey` di endpoint backend. */
export const menuKeySchema = z.enum(MENU_KEYS as [string, ...string[]]);

/** Bentuk akses per menu (3 level boolean). */
export interface MenuAccessLevels {
  canRead: boolean;
  canWrite: boolean;
  canDelete: boolean;
}

export const menuAccessLevelsSchema = z.object({
  canRead: z.boolean(),
  canWrite: z.boolean(),
  canDelete: z.boolean(),
});

/** Map menuKey → access levels (untuk resolved access user). */
export type ResolvedMenuAccess = Record<string, MenuAccessLevels>;

/** Helper di FE/BE: cek apakah user punya akses tertentu ke menu. */
export function hasMenuAccess(
  resolved: ResolvedMenuAccess,
  menuKey: string,
  level: 'read' | 'write' | 'delete' = 'read',
): boolean {
  const entry = resolved[menuKey];
  if (!entry) return false;
  return level === 'read' ? entry.canRead : level === 'write' ? entry.canWrite : entry.canDelete;
}

// ============================================================
//  Schemas untuk PATCH menu-access endpoints
// ============================================================

export const setMenuAccessSchema = z.object({
  menuKey: menuKeySchema,
  canRead: z.boolean().optional(),
  canWrite: z.boolean().optional(),
  canDelete: z.boolean().optional(),
});
export type SetMenuAccessInput = z.infer<typeof setMenuAccessSchema>;

export const updateCanAccessPortalSchema = z.object({
  canAccessPortal: z.boolean().nullable(),
});
export type UpdateCanAccessPortalInput = z.infer<typeof updateCanAccessPortalSchema>;
