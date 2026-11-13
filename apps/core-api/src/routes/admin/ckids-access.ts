/**
 * Akses CKids — menu mana di aplikasi CKids (ckids.eccchurch.global) yang
 * boleh dibuka anggota pelayanan / pemegang role tertentu.
 *
 *   GET /admin/ckids-access              → daftar menu + pelayanan & role per menu
 *   PUT /admin/ckids-access/:menuKey     { pelayananIds: [], pelayananRoleIds: [], roleIds: [] } → ganti isi
 *     pelayananIds     = seluruh anggota pelayanan
 *     pelayananRoleIds = hanya posisi tertentu (mis. Multimedia → Sound System)
 *
 * Fulltimer dan Role Access "Gift Stall (CKids)" tetap berlaku seperti biasa.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@ecc/database';
import { CKIDS_MENUS, CKIDS_MENU_KEYS, type CkidsMenuKey } from '@ecc/shared-types';
import { requireMenu } from '../../middleware/require-menu.js';
import { BadRequest } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';

export const ckidsAccessRouter = Router();
const canRead = requireMenu('ckids-access');
const canWrite = requireMenu('ckids-access', 'write');

ckidsAccessRouter.get('/', canRead, async (_req, res) => {
  const rows = await prisma.ckidsMenuAccess.findMany({
    select: {
      menuKey: true,
      pelayanan: { select: { id: true, nama: true, ikon: true, warna: true } },
      pelayananRole: {
        select: { id: true, nama: true, pelayanan: { select: { id: true, nama: true, ikon: true, warna: true } } },
      },
      role: { select: { id: true, nama: true } },
    },
  });
  const data = CKIDS_MENUS.map((m) => ({
    ...m,
    pelayanan: rows
      .filter((r) => r.menuKey === m.key && r.pelayanan)
      .map((r) => r.pelayanan!)
      .sort((a, b) => a.nama.localeCompare(b.nama)),
    pelayananRoles: rows
      .filter((r) => r.menuKey === m.key && r.pelayananRole)
      .map((r) => r.pelayananRole!)
      .sort((a, b) => `${a.pelayanan.nama} ${a.nama}`.localeCompare(`${b.pelayanan.nama} ${b.nama}`)),
    roles: rows
      .filter((r) => r.menuKey === m.key && r.role)
      .map((r) => r.role!)
      .sort((a, b) => a.nama.localeCompare(b.nama)),
  }));
  res.json({ success: true, data });
});

const putSchema = z.object({
  pelayananIds: z.array(z.string().uuid()).max(100).default([]),
  pelayananRoleIds: z.array(z.string().uuid()).max(300).default([]),
  roleIds: z.array(z.string().uuid()).max(100).default([]),
});

ckidsAccessRouter.put('/:menuKey', canWrite, async (req, res) => {
  const menuKey = req.params.menuKey as CkidsMenuKey;
  if (!CKIDS_MENU_KEYS.includes(menuKey)) throw BadRequest('Menu CKids tidak dikenal.');
  const input = putSchema.parse(req.body ?? {});
  const pelayananIds = [...new Set(input.pelayananIds)];
  const roleIds = [...new Set(input.roleIds)];
  // Posisi yang pelayanannya sudah dipilih utuh tidak perlu disimpan terpisah.
  const posisi = await prisma.pelayananRole.findMany({
    where: { id: { in: [...new Set(input.pelayananRoleIds)] } },
    select: { id: true, pelayananId: true },
  });
  if (posisi.length !== new Set(input.pelayananRoleIds).size) throw BadRequest('Ada posisi pelayanan yang tidak ditemukan.');
  const pelayananRoleIds = posisi.filter((p) => !pelayananIds.includes(p.pelayananId)).map((p) => p.id);
  const [np, nr] = await Promise.all([
    prisma.pelayanan.count({ where: { id: { in: pelayananIds } } }),
    prisma.role.count({ where: { id: { in: roleIds } } }),
  ]);
  if (np !== pelayananIds.length) throw BadRequest('Ada pelayanan yang tidak ditemukan.');
  if (nr !== roleIds.length) throw BadRequest('Ada role yang tidak ditemukan.');

  const before = await prisma.ckidsMenuAccess.findMany({
    where: { menuKey },
    select: { pelayananId: true, pelayananRoleId: true, roleId: true },
  });
  await prisma.$transaction([
    prisma.ckidsMenuAccess.deleteMany({ where: { menuKey } }),
    prisma.ckidsMenuAccess.createMany({
      data: [
        ...pelayananIds.map((pelayananId) => ({ menuKey, pelayananId })),
        ...pelayananRoleIds.map((pelayananRoleId) => ({ menuKey, pelayananRoleId })),
        ...roleIds.map((roleId) => ({ menuKey, roleId })),
      ],
    }),
  ]);
  const label = CKIDS_MENUS.find((m) => m.key === menuKey)?.label ?? menuKey;
  audit(req, {
    action: 'UPDATE',
    resource: 'ckids_menu_access',
    resourceId: menuKey,
    resourceLabel: `Akses CKids: ${label}`,
    before,
    after: { pelayananIds, pelayananRoleIds, roleIds },
  });
  res.json({ success: true, data: { menuKey, pelayananIds, pelayananRoleIds, roleIds }, message: `Akses "${label}" disimpan` });
});
