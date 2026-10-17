/**
 * Privasi data pribadi jemaat (app mobile).
 *
 * Tiap jemaat memilih, per data, kelompok mana yang boleh melihat
 * (centang banyak). Nama & foto selalu tampil.
 *
 * Selalu boleh lihat semua data (tidak bisa dimatikan):
 *   - diri sendiri
 *   - PIC homecell / PIC area dari homecell jemaat itu (kebutuhan pastoral)
 * Admin portal memakai endpoint admin sendiri, tidak terkena aturan ini.
 */
import { prisma } from '@ecc/database';
import { familyOf } from './family.js';

export const PRIVACY_FIELDS = [
  'noHp',
  'email',
  'tanggalLahir',
  'ulangTahun',
  'alamat',
  'pekerjaan',
  'pernikahan',
  'keluarga',
] as const;
export type PrivacyField = (typeof PRIVACY_FIELDS)[number];

export const AUDIENCES = ['KELUARGA', 'HOMECELL', 'AREA', 'GROUP', 'PELAYANAN', 'CABANG', 'SEMUA'] as const;
export type Audience = (typeof AUDIENCES)[number];

/** Relasi viewer → target. SELF & PASTORAL selalu boleh lihat semua. */
export type Relation = Audience | 'SELF' | 'PASTORAL';

export type PrivacySettings = Record<PrivacyField, Audience[]>;

export const DEFAULT_PRIVACY: PrivacySettings = {
  noHp: ['KELUARGA', 'HOMECELL', 'AREA', 'GROUP', 'PELAYANAN'],
  email: ['KELUARGA'],
  tanggalLahir: ['KELUARGA', 'HOMECELL'],
  ulangTahun: ['KELUARGA', 'HOMECELL', 'AREA', 'GROUP', 'PELAYANAN', 'CABANG'],
  alamat: ['KELUARGA', 'HOMECELL'],
  pekerjaan: ['KELUARGA', 'HOMECELL'],
  pernikahan: ['KELUARGA', 'HOMECELL'],
  keluarga: ['KELUARGA', 'HOMECELL'],
};

/** JSON tersimpan → setelan lengkap (field kosong/invalid pakai default). */
export function normalizePrivacy(raw: unknown): PrivacySettings {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const out = {} as PrivacySettings;
  for (const f of PRIVACY_FIELDS) {
    const v = src[f];
    out[f] = Array.isArray(v)
      ? AUDIENCES.filter((a) => v.includes(a))
      : [...DEFAULT_PRIVACY[f]];
  }
  return out;
}

export function canSee(settings: PrivacySettings, field: PrivacyField, rel: Set<Relation>): boolean {
  if (rel.has('SELF') || rel.has('PASTORAL')) return true;
  const allowed = settings[field];
  if (allowed.includes('SEMUA')) return true;
  return allowed.some((a) => rel.has(a));
}

export interface PrivacyGate {
  can: (targetId: string, field: PrivacyField) => boolean;
  relations: (targetId: string) => Set<Relation>;
}

/** Gate yang mengizinkan semuanya (admin portal). */
export const OPEN_GATE: PrivacyGate = {
  can: () => true,
  relations: () => new Set<Relation>(['PASTORAL']),
};

/**
 * Hitung relasi viewer ke banyak target sekaligus + muat setelan privasi
 * mereka. Query dibatch, aman untuk daftar anggota.
 */
export async function privacyGate(viewerId: string, targetIdsIn: Iterable<string>): Promise<PrivacyGate> {
  const targetIds = [...new Set(targetIdsIn)].filter(Boolean);
  const rel = new Map<string, Set<Relation>>(targetIds.map((id) => [id, new Set<Relation>()]));
  const settings = new Map<string, PrivacySettings>();
  if (targetIds.length === 0) return { can: () => false, relations: () => new Set() };

  const add = (id: string, r: Relation) => rel.get(id)?.add(r);
  if (rel.has(viewerId)) add(viewerId, 'SELF');

  const [
    privacyRows,
    viewer,
    family,
    reverseFamily,
    viewerHcMember,
    viewerHcLed,
    viewerAreaLed,
    targetHcMember,
    targetHcLed,
    viewerGroups,
    viewerPelayanan,
  ] = await Promise.all([
    prisma.jemaatPrivacy.findMany({ where: { jemaatId: { in: targetIds } }, select: { jemaatId: true, settings: true } }),
    prisma.jemaat.findUnique({ where: { id: viewerId }, select: { cabangId: true } }),
    familyOf(viewerId),
    prisma.jemaatRelasi.findMany({
      where: { jemaatId: { in: targetIds }, jemaatTerkaitId: viewerId },
      select: { jemaatId: true },
    }),
    prisma.homecellMember.findMany({
      where: { jemaatId: viewerId, isActive: true },
      select: { homecellId: true, homecell: { select: { areaId: true } } },
    }),
    prisma.homecell.findMany({ where: { picJemaatId: viewerId, isActive: true }, select: { id: true, areaId: true } }),
    prisma.homecellArea.findMany({ where: { picJemaatId: viewerId, isActive: true }, select: { id: true } }),
    prisma.homecellMember.findMany({
      where: { jemaatId: { in: targetIds }, isActive: true },
      select: { jemaatId: true, homecellId: true, homecell: { select: { areaId: true, picJemaatId: true } } },
    }),
    prisma.homecell.findMany({
      where: { picJemaatId: { in: targetIds }, isActive: true },
      select: { id: true, areaId: true, picJemaatId: true },
    }),
    prisma.groupMember.findMany({ where: { jemaatId: viewerId, isActive: true }, select: { groupId: true } }),
    prisma.jemaatPelayanan.findMany({ where: { jemaatId: viewerId, isActive: true }, select: { pelayananId: true } }),
  ]);

  for (const p of privacyRows) settings.set(p.jemaatId, normalizePrivacy(p.settings));

  // Keluarga (dua arah).
  for (const id of targetIds) if (family.has(id)) add(id, 'KELUARGA');
  for (const r of reverseFamily) add(r.jemaatId, 'KELUARGA');

  // Homecell & area.
  const myHc = new Set([...viewerHcMember.map((m) => m.homecellId), ...viewerHcLed.map((h) => h.id)]);
  const myAreas = new Set([
    ...viewerHcMember.map((m) => m.homecell.areaId),
    ...viewerHcLed.map((h) => h.areaId),
    ...viewerAreaLed.map((a) => a.id),
  ]);
  const ledHc = new Set(viewerHcLed.map((h) => h.id));
  const ledArea = new Set(viewerAreaLed.map((a) => a.id));
  for (const m of targetHcMember) {
    if (myHc.has(m.homecellId)) add(m.jemaatId, 'HOMECELL');
    if (myAreas.has(m.homecell.areaId)) add(m.jemaatId, 'AREA');
    if (ledHc.has(m.homecellId) || ledArea.has(m.homecell.areaId)) add(m.jemaatId, 'PASTORAL');
  }
  for (const h of targetHcLed) {
    if (!h.picJemaatId) continue;
    if (myHc.has(h.id)) add(h.picJemaatId, 'HOMECELL');
    if (myAreas.has(h.areaId)) add(h.picJemaatId, 'AREA');
    if (ledArea.has(h.areaId)) add(h.picJemaatId, 'PASTORAL');
  }

  // Group & pelayanan (sesama anggota aktif; PIC group terhitung anggota).
  const groupIds = viewerGroups.map((g) => g.groupId);
  const pelayananIds = viewerPelayanan.map((p) => p.pelayananId);
  const [groupMates, groupPics, pelayananMates, targetCabang] = await Promise.all([
    groupIds.length
      ? prisma.groupMember.findMany({
          where: { groupId: { in: groupIds }, jemaatId: { in: targetIds }, isActive: true },
          select: { jemaatId: true },
        })
      : Promise.resolve([]),
    prisma.group.findMany({
      where: {
        isActive: true,
        OR: [
          { picJemaatId: { in: targetIds }, members: { some: { jemaatId: viewerId, isActive: true } } },
          { picJemaatId: viewerId, members: { some: { jemaatId: { in: targetIds }, isActive: true } } },
        ],
      },
      select: { picJemaatId: true, members: { where: { jemaatId: { in: targetIds }, isActive: true }, select: { jemaatId: true } } },
    }),
    pelayananIds.length
      ? prisma.jemaatPelayanan.findMany({
          where: { pelayananId: { in: pelayananIds }, jemaatId: { in: targetIds }, isActive: true },
          select: { jemaatId: true },
        })
      : Promise.resolve([]),
    prisma.jemaat.findMany({ where: { id: { in: targetIds } }, select: { id: true, cabangId: true } }),
  ]);
  for (const g of groupMates) add(g.jemaatId, 'GROUP');
  for (const g of groupPics) {
    if (g.picJemaatId && g.picJemaatId !== viewerId) add(g.picJemaatId, 'GROUP');
    if (g.picJemaatId === viewerId) for (const m of g.members) add(m.jemaatId, 'GROUP');
  }
  for (const p of pelayananMates) add(p.jemaatId, 'PELAYANAN');
  for (const t of targetCabang) if (viewer && t.cabangId === viewer.cabangId) add(t.id, 'CABANG');

  const relations = (id: string) => rel.get(id) ?? new Set<Relation>();
  return {
    relations,
    can: (id, field) => canSee(settings.get(id) ?? DEFAULT_PRIVACY, field, relations(id)),
  };
}

/** Setelan privasi milik jemaat (default kalau belum pernah diatur). */
export async function getPrivacy(jemaatId: string) {
  const row = await prisma.jemaatPrivacy.findUnique({ where: { jemaatId } });
  return {
    settings: normalizePrivacy(row?.settings),
    discoverableByPhone: row?.discoverableByPhone ?? true,
  };
}

/** Jemaat yang menolak ditemukan lewat pencarian no HP. */
export async function notDiscoverableByPhone(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await prisma.jemaatPrivacy.findMany({
    where: { jemaatId: { in: ids }, discoverableByPhone: false },
    select: { jemaatId: true },
  });
  return new Set(rows.map((r) => r.jemaatId));
}
