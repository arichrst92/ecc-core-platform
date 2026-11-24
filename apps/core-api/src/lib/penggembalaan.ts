/**
 * Pelayanan penggembalaan (homecell & zona) — dikenali dari ID di app_config,
 * BUKAN dari nama. Pelayanan & role-nya boleh di-rename di Portal.
 *
 *   app_config.penggembalaan_pelayanan_id  → pelayanan (bawaan: nama "Penggembalaan")
 *   app_config.zone_leader_role_id         → role PIC zona (bawaan: "Zone Leader")
 *   app_config.homecell_leader_role_id     → role PIC homecell (bawaan: "Homecell Leader")
 *   app_config.pastor_role_id              → role pastor zona (bawaan: "Pastor")
 *
 * Kolom kosong → cadangan cari berdasarkan nama bawaan (perilaku lama).
 * Diatur di Portal → Pelayanan → "Pelayanan penggembalaan".
 */
import { prisma } from '@ecc/database';

export type PenggembalaanPeran = 'ZONE_LEADER' | 'HOMECELL_LEADER' | 'PASTOR';

const DEFAULT_NAMES = {
  pelayanan: 'Penggembalaan',
  ZONE_LEADER: 'Zone Leader',
  HOMECELL_LEADER: 'Homecell Leader',
  PASTOR: 'Pastor',
} as const;

export type PenggembalaanResolved = {
  pelayananId: string | null;
  pelayananNama: string;
  roles: { id: string; nama: string; level: number }[];
  roleId: Record<PenggembalaanPeran, string | null>;
  roleNama: Record<PenggembalaanPeran, string>;
};

let cache: { at: number; value: PenggembalaanResolved } | null = null;
const TTL_MS = 60_000;

export function invalidatePenggembalaanCache() {
  cache = null;
}

export async function resolvePenggembalaan(): Promise<PenggembalaanResolved> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  const cfg = await prisma.appConfig.findUnique({
    where: { id: 'global' },
    select: { penggembalaanPelayananId: true, zoneLeaderRoleId: true, homecellLeaderRoleId: true, pastorRoleId: true },
  });
  const pel =
    (cfg?.penggembalaanPelayananId
      ? await prisma.pelayanan.findUnique({
          where: { id: cfg.penggembalaanPelayananId },
          select: { id: true, nama: true, roles: { select: { id: true, nama: true, level: true } } },
        })
      : null) ??
    (await prisma.pelayanan.findFirst({
      where: { nama: { equals: DEFAULT_NAMES.pelayanan, mode: 'insensitive' } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, nama: true, roles: { select: { id: true, nama: true, level: true } } },
    }));
  const roles = pel?.roles ?? [];
  const pick = (peran: PenggembalaanPeran, id: string | null | undefined) =>
    roles.find((r) => r.id === id) ?? roles.find((r) => r.nama.toLowerCase() === DEFAULT_NAMES[peran].toLowerCase()) ?? null;
  const z = pick('ZONE_LEADER', cfg?.zoneLeaderRoleId);
  const h = pick('HOMECELL_LEADER', cfg?.homecellLeaderRoleId);
  const p = pick('PASTOR', cfg?.pastorRoleId);
  const value: PenggembalaanResolved = {
    pelayananId: pel?.id ?? null,
    pelayananNama: pel?.nama ?? DEFAULT_NAMES.pelayanan,
    roles,
    roleId: { ZONE_LEADER: z?.id ?? null, HOMECELL_LEADER: h?.id ?? null, PASTOR: p?.id ?? null },
    roleNama: {
      ZONE_LEADER: z?.nama ?? DEFAULT_NAMES.ZONE_LEADER,
      HOMECELL_LEADER: h?.nama ?? DEFAULT_NAMES.HOMECELL_LEADER,
      PASTOR: p?.nama ?? DEFAULT_NAMES.PASTOR,
    },
  };
  cache = { at: Date.now(), value };
  return value;
}

/** Peran dari parameter lama berbasis nama ("Zone Leader" / "Homecell Leader" / "Pastor"). */
export function peranFromLegacyName(nama: string | undefined): PenggembalaanPeran | null {
  const n = (nama ?? '').trim().toLowerCase();
  if (n === 'zone leader') return 'ZONE_LEADER';
  if (n === 'homecell leader') return 'HOMECELL_LEADER';
  if (n === 'pastor') return 'PASTOR';
  return null;
}
