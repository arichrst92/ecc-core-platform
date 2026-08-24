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

interface SubRoleRow {
  id: string;
  nama: string;
  canAccessPortal: boolean | null;
  menuAccesses: MenuAccessRow[];
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
        Atur wewenang akses portal + menu per Role / Sub-Role. SubRole-level meng-override Role-level.
      </p>

      <div className="text-xs text-neutral-600 bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 flex gap-2">
        <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <div>
          <strong>Cara kerja:</strong> User butuh minimal satu Role/SubRole dengan{' '}
          <strong>Akses Portal = Ya</strong> untuk login. Setelah masuk, sidebar
          hanya menampilkan menu dengan <strong>Read = ✓</strong>. SubRole bisa override
          akses Role parent-nya (untuk Portal: ✓/✗/inherit; untuk Menu: snapshot per row).
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
  currentUserJemaatId?: string;
}) {
  const [activeSubRole, setActiveSubRole] = useState<string | null>(null);

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

          {/* Active context info */}
          {activeSubRole && (
            <SubRolePortalCard
              subRole={role.subRoles.find((s) => s.id === activeSubRole)!}
              roleDefault={role.canAccessPortal}
              onChange={(v) => onSubTogglePortal(activeSubRole, v)}
            />
          )}

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
                        activeSubRole={activeSubRole}
                        roleRow={accessRowFor(role.menuAccesses, m.key)}
                        subRow={
                          activeSubRole
                            ? accessRowFor(
                                role.subRoles.find((s) => s.id === activeSubRole)!.menuAccesses,
                                m.key,
                              )
                            : null
                        }
                        onRoleChange={(levels) => onRoleMenuChange(m.key, levels)}
                        onSubChange={(levels) =>
                          activeSubRole && onSubMenuChange(activeSubRole, m.key, levels)
                        }
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
  onChange,
}: {
  subRole: SubRoleRow;
  roleDefault: boolean;
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
            <span className="ml-1 text-neutral-500">(inherit Role: {roleDefault ? 'Ya' : 'Tidak'})</span>
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
  activeSubRole,
  roleRow,
  subRow,
  onRoleChange,
  onSubChange,
}: {
  menu: MenuItem;
  activeSubRole: string | null;
  roleRow: { canRead: boolean; canWrite: boolean; canDelete: boolean };
  subRow: { canRead: boolean; canWrite: boolean; canDelete: boolean } | null;
  onRoleChange: (l: { canRead: boolean; canWrite: boolean; canDelete: boolean }) => void;
  onSubChange: (l: { canRead: boolean; canWrite: boolean; canDelete: boolean }) => void;
}) {
  // Which level we're editing
  const isSubMode = activeSubRole !== null;
  const cur = isSubMode ? subRow! : roleRow;
  const onChange = (level: Level, value: boolean) => {
    const next = { ...cur, [level]: value };
    // Saat user enable Write/Delete, auto-enable Read juga (lebih intuitif).
    if (level !== 'canRead' && value && !next.canRead) {
      next.canRead = true;
    }
    if (isSubMode) onSubChange(next);
    else onRoleChange(next);
  };

  return (
    <tr className="border-b border-neutral-100">
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
