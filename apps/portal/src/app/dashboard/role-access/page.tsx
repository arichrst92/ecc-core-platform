'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Shield,
  Loader2,
  ChevronRight,
  ChevronDown,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Info,
  Unlock,
  Lock,
} from 'lucide-react';
import toast from 'react-hot-toast';
import type { MenuItem } from '@ecc/shared-types';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';

// ============== Types ==============

interface MenuAccessRow {
  id: string;
  menuKey: string;
  canRead: boolean;
  canWrite: boolean;
  canDelete: boolean;
}

interface StatusRow {
  id: string;
  nama: string;
  isActive: boolean;
  canAccessPortal: boolean | null;
  menuAccesses: MenuAccessRow[];
}

interface SubRoleRow {
  id: string;
  nama: string;
  canAccessPortal: boolean | null;
  menuAccesses: MenuAccessRow[];
  statuses?: StatusRow[];
}

interface RoleRow {
  id: string;
  nama: string;
  canAccessPortal: boolean;
  menuAccesses: MenuAccessRow[];
  subRoles: SubRoleRow[];
}

interface MatrixResponse {
  roles: RoleRow[];
  menuCatalog: MenuItem[];
}

type Level = 'canRead' | 'canWrite' | 'canDelete';
type Levels = { canRead: boolean; canWrite: boolean; canDelete: boolean };
type Target = 'role' | 'sub' | 'status';

// ============== Page ==============

export default function RoleAccessPage() {
  const qc = useQueryClient();
  const authUser = useAuthStore((s) => s.user);
  const setAccess = useAuthStore((s) => s.setAccess);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const matrixQ = useQuery({
    queryKey: ['role-access', 'matrix'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: MatrixResponse }>('/admin/role/access/matrix');
      return res.data.data;
    },
  });

  // Helper: refresh menu access user current setelah edit (supaya sidebar
  // immediate update kalau admin edit role mereka sendiri).
  async function refreshSelfAccess() {
    try {
      const res = await apiClient.get<{
        data: { canAccessPortal: boolean; menuAccess: Record<string, any> };
      }>('/auth/me/access');
      setAccess(res.data.data);
    } catch {
      // best-effort
    }
  }

  function invalidateAfterEdit() {
    qc.invalidateQueries({ queryKey: ['role-access', 'matrix'] });
    void refreshSelfAccess();
  }

  // Mutations — Role portal toggle
  const rolePortalMut = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: boolean }) =>
      apiClient.patch(`/admin/role/${id}/access/portal`, { canAccessPortal: value }),
    onSuccess: () => {
      toast.success('Akses portal Role diperbarui');
      invalidateAfterEdit();
    },
    onError: (err: any) =>
      toast.error(err.response?.data?.error?.message ?? 'Gagal update'),
  });

  // SubRole portal toggle (nullable: null = inherit dari role)
  const subPortalMut = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: boolean | null }) =>
      apiClient.patch(`/admin/role/sub/${id}/access/portal`, { canAccessPortal: value }),
    onSuccess: () => {
      toast.success('Akses portal SubRole diperbarui');
      invalidateAfterEdit();
    },
    onError: (err: any) =>
      toast.error(err.response?.data?.error?.message ?? 'Gagal update'),
  });

  // Status portal toggle (nullable: null = inherit dari sub-role → role)
  const statusPortalMut = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: boolean | null }) =>
      apiClient.patch(`/admin/role/status/${id}/access/portal`, { canAccessPortal: value }),
    onSuccess: () => {
      toast.success('Akses portal Status diperbarui');
      invalidateAfterEdit();
    },
    onError: (err: any) =>
      toast.error(err.response?.data?.error?.message ?? 'Gagal update'),
  });

  // Menu access — Status-level
  const statusMenuMut = useMutation({
    mutationFn: async (input: { statusId: string; menuKey: string } & Levels) =>
      apiClient.put(`/admin/role/status/${input.statusId}/access/menu`, {
        menuKey: input.menuKey,
        canRead: input.canRead,
        canWrite: input.canWrite,
        canDelete: input.canDelete,
      }),
    onSuccess: invalidateAfterEdit,
    onError: (err: any) =>
      toast.error(err.response?.data?.error?.message ?? 'Gagal update menu access'),
  });

  // Menu access — Role-level
  const roleMenuMut = useMutation({
    mutationFn: async (input: {
      roleId: string;
      menuKey: string;
      canRead: boolean;
      canWrite: boolean;
      canDelete: boolean;
    }) =>
      apiClient.put(`/admin/role/${input.roleId}/access/menu`, {
        menuKey: input.menuKey,
        canRead: input.canRead,
        canWrite: input.canWrite,
        canDelete: input.canDelete,
      }),
    onSuccess: invalidateAfterEdit,
    onError: (err: any) =>
      toast.error(err.response?.data?.error?.message ?? 'Gagal update menu access'),
  });

  // Menu access — SubRole-level
  const subMenuMut = useMutation({
    mutationFn: async (input: {
      subRoleId: string;
      menuKey: string;
      canRead: boolean;
      canWrite: boolean;
      canDelete: boolean;
    }) =>
      apiClient.put(`/admin/role/sub/${input.subRoleId}/access/menu`, {
        menuKey: input.menuKey,
        canRead: input.canRead,
        canWrite: input.canWrite,
        canDelete: input.canDelete,
      }),
    onSuccess: invalidateAfterEdit,
    onError: (err: any) =>
      toast.error(err.response?.data?.error?.message ?? 'Gagal update menu access'),
  });

  // Kembalikan Sub-Role / Status ke "ikuti level atas".
  const resetMut = useMutation({
    mutationFn: async (input: { target: 'sub' | 'status'; id: string }) =>
      apiClient.delete(input.target === 'sub' ? `/admin/role/sub/${input.id}/access/menu` : `/admin/role/status/${input.id}/access/menu`),
    onSuccess: () => {
      toast.success('Akses menu kembali mengikuti level di atasnya');
      invalidateAfterEdit();
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message ?? 'Gagal mengembalikan'),
  });

  // Buka / tutup SEMUA menu sekaligus (Role-level atau SubRole-level)
  const bulkMut = useMutation({
    mutationFn: async (input: { target: Target; id: string; grant: boolean }) =>
      apiClient.put(
        input.target === 'role'
          ? `/admin/role/${input.id}/access/menu/all`
          : input.target === 'sub'
            ? `/admin/role/sub/${input.id}/access/menu/all`
            : `/admin/role/status/${input.id}/access/menu/all`,
        { grant: input.grant },
      ),
    onSuccess: (_res, input) => {
      toast.success(input.grant ? 'Semua akses menu dibuka' : 'Semua akses menu ditutup');
      invalidateAfterEdit();
    },
    onError: (err: any) =>
      toast.error(err.response?.data?.error?.message ?? 'Gagal update akses menu'),
  });

  if (matrixQ.isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
      </div>
    );
  }
  if (!matrixQ.data) {
    return (
      <div className="text-center py-20 text-neutral-500">Gagal memuat data.</div>
    );
  }

  const { roles, menuCatalog } = matrixQ.data;
  // Group menu by group untuk display lebih rapi
  const grouped = groupMenu(menuCatalog);

  return (
    <div className="w-full">
      <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
        <Shield className="w-6 h-6 text-brand-500" />
        Role Access
      </h1>
      <p className="text-neutral-500 mt-1 mb-6">
        Atur wewenang akses portal + menu per Role / Sub-Role / Status. Berlaku untuk semua akun, termasuk Fulltimer.
      </p>

      <div className="text-xs text-neutral-600 bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 flex gap-2">
        <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <div>
          <strong>Cara kerja:</strong> User butuh minimal satu Role/Sub-Role/Status dengan{' '}
          <strong>Akses Portal = Ya</strong> untuk login. Menu &amp; halaman hanya muncul bila <strong>Read = ✓</strong>.
          Akses menu memakai level <b>paling spesifik yang sudah diatur</b>: Status → Sub-Role → Role.
          Sub-Role / Status yang <b>sudah diatur</b> berlaku utuh — menu yang tidak dicentang berarti <b>tertutup</b>
          (tidak lagi mewarisi Role). Yang <b>belum diatur</b> mengikuti level di atasnya; pakai tombol
          <b> Ikuti level atas</b> untuk mengembalikannya. Berlaku juga untuk Fulltimer. Perubahan yang membuat Anda
          kehilangan akses Role Access sendiri otomatis dibatalkan. Akun lain melihat perubahan dalam ±1 menit.
        </div>
      </div>

      <div className="space-y-3">
        {roles.map((role) => (
          <RoleCard
            key={role.id}
            role={role}
            menuCatalog={menuCatalog}
            menuGroups={grouped}
            isExpanded={!!expanded[role.id]}
            onToggleExpand={() =>
              setExpanded((e) => ({ ...e, [role.id]: !e[role.id] }))
            }
            onTogglePortal={(value) => rolePortalMut.mutate({ id: role.id, value })}
            onSubTogglePortal={(subId, value) =>
              subPortalMut.mutate({ id: subId, value })
            }
            onRoleMenuChange={(menuKey, levels) =>
              roleMenuMut.mutate({ roleId: role.id, menuKey, ...levels })
            }
            onSubMenuChange={(subId, menuKey, levels) =>
              subMenuMut.mutate({ subRoleId: subId, menuKey, ...levels })
            }
            onStatusTogglePortal={(statusId, value) => statusPortalMut.mutate({ id: statusId, value })}
            onStatusMenuChange={(statusId, menuKey, levels) =>
              statusMenuMut.mutate({ statusId, menuKey, ...levels })
            }
            onBulk={(target, id, grant) => bulkMut.mutate({ target, id, grant })}
            onReset={(target, id) => {
              if (confirm('Kembalikan akses menu ke level di atasnya? Pengaturan menu di level ini dihapus.')) resetMut.mutate({ target, id });
            }}
            bulkPending={bulkMut.isPending || resetMut.isPending}
            currentUserJemaatId={authUser?.jemaatId}
          />
        ))}
      </div>
    </div>
  );
}

// ============== Helpers ==============

function groupMenu(menus: MenuItem[]): { group: string | null; items: MenuItem[] }[] {
  const groupMap = new Map<string | null, MenuItem[]>();
  for (const m of menus) {
    const k = m.group ?? null;
    const arr = groupMap.get(k) ?? [];
    arr.push(m);
    groupMap.set(k, arr);
  }
  return Array.from(groupMap.entries()).map(([group, items]) => ({ group, items }));
}

function accessRowFor(rows: MenuAccessRow[], menuKey: string): {
  canRead: boolean;
  canWrite: boolean;
  canDelete: boolean;
} {
  const found = rows.find((r) => r.menuKey === menuKey);
  return {
    canRead: found?.canRead ?? false,
    canWrite: found?.canWrite ?? false,
    canDelete: found?.canDelete ?? false,
  };
}

// ============== RoleCard ==============

function RoleCard({
  role,
  menuCatalog,
  menuGroups,
  isExpanded,
  onToggleExpand,
  onTogglePortal,
  onSubTogglePortal,
  onRoleMenuChange,
  onSubMenuChange,
  onStatusTogglePortal,
  onStatusMenuChange,
  onBulk,
  onReset,
  bulkPending,
  currentUserJemaatId: _currentUserJemaatId,
}: {
  role: RoleRow;
  menuCatalog: MenuItem[];
  menuGroups: { group: string | null; items: MenuItem[] }[];
  isExpanded: boolean;
  onToggleExpand: () => void;
  onTogglePortal: (value: boolean) => void;
  onSubTogglePortal: (subId: string, value: boolean | null) => void;
  onRoleMenuChange: (
    menuKey: string,
    levels: { canRead: boolean; canWrite: boolean; canDelete: boolean },
  ) => void;
  onSubMenuChange: (
    subId: string,
    menuKey: string,
    levels: { canRead: boolean; canWrite: boolean; canDelete: boolean },
  ) => void;
  onStatusTogglePortal: (statusId: string, value: boolean | null) => void;
  onStatusMenuChange: (statusId: string, menuKey: string, levels: Levels) => void;
  onBulk: (target: Target, id: string, grant: boolean) => void;
  onReset: (target: 'sub' | 'status', id: string) => void;
  bulkPending: boolean;
  currentUserJemaatId?: string;
}) {
  const [activeSubRole, setActiveSubRoleRaw] = useState<string | null>(null);
  const [activeStatusId, setActiveStatusId] = useState<string | null>(null);
  const setActiveSubRole = (id: string | null) => {
    setActiveSubRoleRaw(id);
    setActiveStatusId(null);
  };
  const activeSub = activeSubRole ? role.subRoles.find((s) => s.id === activeSubRole) : undefined;
  const statuses = activeSub?.statuses ?? [];
  const activeStatus = activeStatusId ? statuses.find((x) => x.id === activeStatusId) : undefined;
  // Level yang sudah diatur berlaku utuh; yang belum diatur menampilkan akses
  // warisan (abu-abu) dari level di atasnya.
  const subRowsEff = activeSub?.menuAccesses.length ? activeSub.menuAccesses : role.menuAccesses;
  const ownRows = activeStatus ? activeStatus.menuAccesses : activeSub ? activeSub.menuAccesses : role.menuAccesses;
  const inherited = !!(activeStatus || activeSub) && ownRows.length === 0;
  const inheritFrom = activeStatus ? (activeSub?.menuAccesses.length ? 'Sub-Role' : 'Role') : 'Role';
  const contextRows = activeStatus ? (ownRows.length ? ownRows : subRowsEff) : activeSub ? (ownRows.length ? ownRows : role.menuAccesses) : role.menuAccesses;
  const contextName = activeStatus
    ? `${role.nama} → ${activeSub!.nama} → ${activeStatus.nama}`
    : activeSub
      ? `${role.nama} → ${activeSub.nama}`
      : `${role.nama} (Role-level)`;
  const subPortalEffective = activeSub ? (activeSub.canAccessPortal ?? role.canAccessPortal) : role.canAccessPortal;
  const fullCount = menuCatalog.filter((m) => {
    const a = accessRowFor(contextRows, m.key);
    return a.canRead && a.canWrite && a.canDelete;
  }).length;

  function bulk(grant: boolean) {
    const msg = grant
      ? `Buka SEMUA akses menu (Read, Write, Delete — ${menuCatalog.length} menu) untuk ${contextName}?`
      : `Tutup SEMUA akses menu untuk ${contextName}?`;
    if (!confirm(msg)) return;
    if (activeStatus) onBulk('status', activeStatus.id, grant);
    else onBulk(activeSub ? 'sub' : 'role', activeSub ? activeSub.id : role.id, grant);
  }

  const totalAccessibleMenus = menuCatalog.filter((m) => {
    const a = accessRowFor(role.menuAccesses, m.key);
    return a.canRead || a.canWrite || a.canDelete;
  }).length;

  return (
    <div className="border border-neutral-200 rounded-xl bg-white overflow-hidden">
      <div className="flex items-center justify-between gap-3 p-4 bg-neutral-50 border-b border-neutral-100">
        <button
          onClick={onToggleExpand}
          className="flex items-center gap-2 flex-1 min-w-0 text-left"
        >
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-neutral-500" />
          ) : (
            <ChevronRight className="w-4 h-4 text-neutral-500" />
          )}
          <span className="font-semibold text-neutral-900">{role.nama}</span>
          <span className="text-xs text-neutral-500">
            · {role.subRoles.length} sub-role · {totalAccessibleMenus} menu access
          </span>
        </button>

        <label className="flex items-center gap-2 text-xs cursor-pointer shrink-0">
          <input
            type="checkbox"
            checked={role.canAccessPortal}
            onChange={(e) => onTogglePortal(e.target.checked)}
            className="w-4 h-4 accent-brand-500"
          />
          <span className="font-medium text-neutral-700">Akses Portal</span>
        </label>
      </div>

      {isExpanded && (
        <div className="p-4 space-y-4">
          {/* SubRole selector */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setActiveSubRole(null)}
              className={`px-2.5 py-1 text-xs font-medium rounded-full border ${
                activeSubRole === null
                  ? 'bg-brand-100 border-brand-300 text-brand-800'
                  : 'border-neutral-300 hover:bg-neutral-50 text-neutral-700'
              }`}
            >
              Role-level (default)
            </button>
            {role.subRoles.map((sr) => (
              <button
                key={sr.id}
                onClick={() => setActiveSubRole(sr.id)}
                className={`px-2.5 py-1 text-xs font-medium rounded-full border ${
                  activeSubRole === sr.id
                    ? 'bg-brand-100 border-brand-300 text-brand-800'
                    : 'border-neutral-300 hover:bg-neutral-50 text-neutral-700'
                }`}
              >
                {sr.nama}
                {sr.canAccessPortal !== null && (
                  <span className="ml-1 text-[10px] text-amber-600">⚙</span>
                )}
              </button>
            ))}
          </div>

          {/* Status selector (level ketiga) — muncul saat sub-role dipilih */}
          {activeSub && (
            <div className="flex items-center gap-2 flex-wrap pl-3 border-l-2 border-brand-200">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Status</span>
              <button
                onClick={() => setActiveStatusId(null)}
                className={`px-2.5 py-1 text-xs font-medium rounded-full border ${
                  activeStatusId === null
                    ? 'bg-brand-100 border-brand-300 text-brand-800'
                    : 'border-neutral-300 hover:bg-neutral-50 text-neutral-700'
                }`}
              >
                Sub-role-level (semua status)
              </button>
              {statuses.map((st) => (
                <button
                  key={st.id}
                  onClick={() => setActiveStatusId(st.id)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-full border ${
                    activeStatusId === st.id
                      ? 'bg-brand-100 border-brand-300 text-brand-800'
                      : 'border-neutral-300 hover:bg-neutral-50 text-neutral-700'
                  } ${st.isActive ? '' : 'opacity-60'}`}
                  title={st.isActive ? undefined : 'Status nonaktif — aksesnya tidak dipakai'}
                >
                  {st.nama}
                  {!st.isActive && <span className="ml-1 text-[10px] text-neutral-500">(nonaktif)</span>}
                  {(st.canAccessPortal !== null || st.menuAccesses.length > 0) && (
                    <span className="ml-1 text-[10px] text-amber-600">⚙</span>
                  )}
                </button>
              ))}
              {statuses.length === 0 && (
                <span className="text-xs text-neutral-400">Sub-role ini belum punya status.</span>
              )}
            </div>
          )}

          {/* Active context info */}
          {activeSubRole && !activeStatus && (
            <SubRolePortalCard
              subRole={role.subRoles.find((s) => s.id === activeSubRole)!}
              roleDefault={role.canAccessPortal}
              onChange={(v) => onSubTogglePortal(activeSubRole, v)}
            />
          )}
          {activeStatus && (
            <SubRolePortalCard
              subRole={activeStatus}
              roleDefault={subPortalEffective}
              inheritLabel="Sub-Role"
              onChange={(v) => onStatusTogglePortal(activeStatus.id, v)}
            />
          )}

          {activeSub || activeStatus ? (
            <div
              className={`flex items-center justify-between gap-2 flex-wrap rounded-lg px-3 py-2 text-xs ${
                inherited ? 'bg-neutral-50 border border-neutral-200 text-neutral-600' : 'bg-amber-50 border border-amber-200 text-amber-900'
              }`}
            >
              <span>
                {inherited
                  ? `Belum diatur — mengikuti ${inheritFrom} (tampil abu-abu). Ubah satu centang untuk mulai mengatur level ini; akses ${inheritFrom} disalin dulu.`
                  : 'Sudah diatur — berlaku utuh untuk level ini. Menu yang tidak dicentang = tertutup.'}
              </span>
              {!inherited ? (
                <button
                  onClick={() => (activeStatus ? onReset('status', activeStatus.id) : onReset('sub', activeSub!.id))}
                  disabled={bulkPending}
                  className="px-2.5 py-1 rounded-md border border-amber-300 bg-white font-semibold hover:bg-amber-100 disabled:opacity-40"
                >
                  Ikuti level atas
                </button>
              ) : null}
            </div>
          ) : null}

          {/* Aksi massal untuk konteks aktif */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-xs text-neutral-500">
              {contextName}: akses penuh {fullCount}/{menuCatalog.length} menu
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => bulk(true)}
                disabled={bulkPending || fullCount === menuCatalog.length}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-brand-500 hover:bg-brand-600 text-white disabled:opacity-40"
              >
                <Unlock className="w-3.5 h-3.5" />
                Buka semua akses
              </button>
              <button
                onClick={() => bulk(false)}
                disabled={bulkPending || (!inherited && ownRows.every((r) => !r.canRead && !r.canWrite && !r.canDelete))}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-neutral-300 text-neutral-700 hover:bg-neutral-50 disabled:opacity-40"
              >
                <Lock className="w-3.5 h-3.5" />
                Tutup semua
              </button>
            </div>
          </div>

          {/* Menu access table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200">
                  <th className="text-left py-2 px-2 font-medium text-neutral-600">Menu</th>
                  <th className="text-center py-2 px-2 font-medium text-neutral-600 w-20">Read</th>
                  <th className="text-center py-2 px-2 font-medium text-neutral-600 w-20">Write</th>
                  <th className="text-center py-2 px-2 font-medium text-neutral-600 w-20">Delete</th>
                </tr>
              </thead>
              <tbody>
                {menuGroups.map((g, gi) => (
                  <>
                    {g.group && (
                      <tr key={`g-${gi}`} className="bg-neutral-50">
                        <td colSpan={4} className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">
                          {g.group}
                        </td>
                      </tr>
                    )}
                    {g.items.map((m) => (
                      <MenuRow
                        key={m.key}
                        menu={m}
                        dim={inherited}
                        cur={accessRowFor(contextRows, m.key)}
                        onChange={(levels) => {
                          if (activeStatus) onStatusMenuChange(activeStatus.id, m.key, levels);
                          else if (activeSub) onSubMenuChange(activeSub.id, m.key, levels);
                          else onRoleMenuChange(m.key, levels);
                        }}
                      />
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function SubRolePortalCard({
  subRole,
  roleDefault,
  inheritLabel = 'Role',
  onChange,
}: {
  subRole: { nama: string; canAccessPortal: boolean | null };
  roleDefault: boolean;
  inheritLabel?: string;
  onChange: (value: boolean | null) => void;
}) {
  const effective = subRole.canAccessPortal ?? roleDefault;
  return (
    <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-xs text-neutral-600">
          <strong>{subRole.nama}</strong> · Akses Portal aktual:{' '}
          {effective ? (
            <span className="text-green-700 font-semibold">Ya</span>
          ) : (
            <span className="text-neutral-500 font-semibold">Tidak</span>
          )}
          {subRole.canAccessPortal === null && (
            <span className="ml-1 text-neutral-500">(inherit {inheritLabel}: {roleDefault ? 'Ya' : 'Tidak'})</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onChange(true)}
            className={`px-2 py-1 text-xs rounded ${
              subRole.canAccessPortal === true
                ? 'bg-green-100 text-green-800 font-semibold'
                : 'text-neutral-600 hover:bg-neutral-100'
            }`}
          >
            <CheckCircle2 className="w-3 h-3 inline mr-1" />
            Ya
          </button>
          <button
            onClick={() => onChange(false)}
            className={`px-2 py-1 text-xs rounded ${
              subRole.canAccessPortal === false
                ? 'bg-red-100 text-red-800 font-semibold'
                : 'text-neutral-600 hover:bg-neutral-100'
            }`}
          >
            <XCircle className="w-3 h-3 inline mr-1" />
            Tidak
          </button>
          <button
            onClick={() => onChange(null)}
            className={`px-2 py-1 text-xs rounded ${
              subRole.canAccessPortal === null
                ? 'bg-neutral-200 text-neutral-800 font-semibold'
                : 'text-neutral-600 hover:bg-neutral-100'
            }`}
          >
            <RotateCcw className="w-3 h-3 inline mr-1" />
            Inherit
          </button>
        </div>
      </div>
    </div>
  );
}

function MenuRow({
  menu,
  cur,
  dim = false,
  onChange: emit,
}: {
  menu: MenuItem;
  /** true = nilai warisan dari level atas (belum diatur di level ini). */
  dim?: boolean;
  /** Akses di level yang sedang diedit (Role / Sub-Role / Status). */
  cur: Levels;
  onChange: (l: Levels) => void;
}) {
  const onChange = (level: Level, value: boolean) => {
    const next = { ...cur, [level]: value };
    // Saat user enable Write/Delete, auto-enable Read juga (lebih intuitif).
    if (level !== 'canRead' && value && !next.canRead) {
      next.canRead = true;
    }
    emit(next);
  };

  return (
    <tr className={`border-b border-neutral-100 ${dim ? 'opacity-50' : ''}`}>
      <td className="py-1.5 px-2 text-neutral-800">{menu.label}</td>
      <td className="text-center px-2">
        <Check
          checked={cur.canRead}
          onChange={(v) => onChange('canRead', v)}
        />
      </td>
      <td className="text-center px-2">
        <Check
          checked={cur.canWrite}
          onChange={(v) => onChange('canWrite', v)}
        />
      </td>
      <td className="text-center px-2">
        <Check
          checked={cur.canDelete}
          onChange={(v) => onChange('canDelete', v)}
        />
      </td>
    </tr>
  );
}

function Check({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="w-4 h-4 accent-brand-500 cursor-pointer"
    />
  );
}
