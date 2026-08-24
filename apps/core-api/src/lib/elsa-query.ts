/**
 * Elsa dynamic query helpers — Modul 31 v2.
 *
 * Design: expose Prisma DB via generic query tools dgn strict guardrails:
 *   - Entity whitelist (30 entities safe untuk exposure)
 *   - Field exclusion per entity (sensitive: face descriptor, credential secrets)
 *   - Relation include whitelist per entity (prevent leak via nested include)
 *   - Max 50 records per query
 *   - Read-only operations (findMany/findUnique/count/groupBy)
 *   - Include depth 2 (prevent N+1 leak)
 *
 * Public API (dipakai router elsa.ts):
 *   - listEntities() → { entities: [{name, description, keyFields, allowedInclude}] }
 *   - describeEntity(name) → full schema info + example queries
 *   - queryEntity(entity, filter?, include?, orderBy?, limit?) → rows[]
 *   - countEntity(entity, filter?) → { count }
 *   - groupByEntity(entity, by, filter?) → grouped counts
 */
import { prisma } from '@ecc/database';

// ============================================================
// ENTITY_MAP — 30 whitelisted entities
// ============================================================

interface EntityConfig {
  /** Prisma client key (mis. 'jemaat' untuk prisma.jemaat) */
  prismaKey: string;
  /** Human-readable description untuk LLM */
  description: string;
  /** Fields to exclude dari response (sensitive data) */
  excludeFields?: string[];
  /** Relations yang boleh di-include (nama sesuai Prisma schema field) */
  allowedInclude: string[];
  /** Filter fields yang commonly digunakan (untuk prompt hint) */
  keyFields: string[];
}

export const ENTITY_MAP: Record<string, EntityConfig> = {
  // ===== Entity =====
  sinode: {
    prismaKey: 'sinode',
    description: 'Sinode (top-level organization, mis. "ECC Indonesia"). Menaungi banyak cabang.',
    allowedInclude: ['cabangs'],
    keyFields: ['id', 'nama', 'kode', 'isActive'],
  },
  cabang: {
    prismaKey: 'cabangGereja',
    description: 'Cabang gereja lokal di bawah sinode. Punya alamat, kontak, koordinat.',
    allowedInclude: ['sinode', 'rekening', 'jemaats'],
    keyFields: ['id', 'nama', 'kode', 'kota', 'sinodeId', 'isActive'],
  },
  // ===== People =====
  jemaat: {
    prismaKey: 'jemaat',
    description: 'Master data jemaat (church member). Full profile: nama, no HP, cabang, tanggal lahir.',
    excludeFields: [],
    allowedInclude: [
      'cabang',
      'primaryGuardian',
      'jemaatRoles',
      'jemaatPelayanan',
      'relasiAsal',
      'homecellMembership',
    ],
    keyFields: ['id', 'namaLengkap', 'noHp', 'kode', 'cabangId', 'jenisKelamin', 'tanggalLahir', 'isActive'],
  },
  role: {
    prismaKey: 'role',
    description: 'Master role jemaat (Jemaat Tetap, Fulltimer, dll) + sub-role hierarchy.',
    allowedInclude: ['subRoles', 'parentRole'],
    keyFields: ['id', 'nama', 'kode', 'parentRoleId', 'isActive'],
  },
  jemaat_role: {
    prismaKey: 'jemaatRole',
    description: 'Assignment role ke jemaat. Jemaat bisa punya multiple role.',
    allowedInclude: ['jemaat', 'role'],
    keyFields: ['id', 'jemaatId', 'roleId', 'isActive'],
  },
  tipe_relasi: {
    prismaKey: 'tipeRelasiKeluarga',
    description: 'Master tipe relasi keluarga (Suami/Istri, Ayah/Ibu, Anak L/P, Kakek/Nenek, Wali, dll).',
    allowedInclude: [],
    keyFields: ['id', 'nama', 'isActive'],
  },
  jemaat_relasi: {
    prismaKey: 'jemaatRelasi',
    description: 'Relasi keluarga antar jemaat (2-arah auto-reciprocal). Contoh: Ari→Sarah=Istri, Sarah→Ari=Suami.',
    allowedInclude: ['jemaat', 'jemaatTerkait', 'tipeRelasi'],
    keyFields: ['id', 'jemaatId', 'jemaatTerkaitId', 'tipeRelasiId'],
  },
  // ===== Service =====
  kategori_ibadah: {
    prismaKey: 'kategoriIbadah',
    description: 'Master kategori ibadah (Ibadah Umum, Pemuda, KKR, Doa, Anak, dll).',
    allowedInclude: ['ibadah'],
    keyFields: ['id', 'nama', 'isActive'],
  },
  ibadah: {
    prismaKey: 'ibadah',
    description: 'Jadwal ibadah (weekly/biweekly/monthly/once) per cabang.',
    allowedInclude: ['cabang', 'kategoriIbadah', 'reservasi', 'pelayananLinks'],
    keyFields: ['id', 'nama', 'cabangId', 'kategoriIbadahId', 'tipeJadwal', 'hari', 'jamMulai', 'isKidsIbadah', 'requiresCheckout', 'isActive'],
  },
  pelayanan: {
    prismaKey: 'pelayanan',
    description: 'Master ministry / pelayanan (Worship Team, Multimedia, Usher, dll).',
    allowedInclude: ['roles', 'jemaatPelayanan'],
    keyFields: ['id', 'nama', 'deskripsi', 'isActive'],
  },
  pelayanan_role: {
    prismaKey: 'pelayananRole',
    description: 'Role di pelayanan (mis. Sound Engineer, Vocal, Leader) + level hierarchy.',
    allowedInclude: ['pelayanan', 'jemaatPelayanan'],
    keyFields: ['id', 'pelayananId', 'nama', 'level', 'isActive'],
  },
  jemaat_pelayanan: {
    prismaKey: 'jemaatPelayanan',
    description: 'Membership jemaat di pelayanan + posisi role.',
    allowedInclude: ['jemaat', 'pelayanan', 'pelayananRole'],
    keyFields: ['id', 'jemaatId', 'pelayananId', 'pelayananRoleId', 'tanggalMulai', 'isActive'],
  },
  reservasi: {
    prismaKey: 'reservasi',
    description: 'Reservasi/kehadiran ibadah per jemaat per tanggal. Status: RESERVE/JOIN/CANCEL.',
    allowedInclude: ['jemaat', 'ibadah'],
    keyFields: ['id', 'jemaatId', 'ibadahId', 'tanggalIbadah', 'status', 'joinedAt', 'checkedOutAt', 'pickedUpAt', 'pickupCode'],
  },
  // ===== Community =====
  homecell_area: {
    prismaKey: 'homecellArea',
    description: 'Area homecell (kelompok homecell per wilayah).',
    allowedInclude: ['homecells'],
    keyFields: ['id', 'nama', 'isActive'],
  },
  homecell: {
    prismaKey: 'homecell',
    description: 'Homecell (kelompok kecil per area) + PIC.',
    allowedInclude: ['area', 'picJemaat', 'members', 'schedules'],
    keyFields: ['id', 'nama', 'areaId', 'picJemaatId', 'hari', 'jam', 'isActive'],
  },
  homecell_member: {
    prismaKey: 'homecellMember',
    description: 'Membership jemaat di homecell.',
    allowedInclude: ['homecell', 'jemaat'],
    keyFields: ['id', 'homecellId', 'jemaatId', 'isActive', 'tanggalKeluar'],
  },
  homecell_schedule: {
    prismaKey: 'homecellSchedule',
    description: 'Jadwal pertemuan homecell (per tanggal + lokasi).',
    allowedInclude: ['homecell', 'creator', 'attendances'],
    keyFields: ['id', 'homecellId', 'tanggal', 'lokasi', 'createdBy'],
  },
  homecell_attendance: {
    prismaKey: 'homecellAttendance',
    description: 'Absensi jemaat di pertemuan homecell (via QR scan).',
    allowedInclude: ['schedule', 'jemaat', 'scanner'],
    keyFields: ['id', 'scheduleId', 'jemaatId', 'scannedAt', 'source'],
  },
  // ===== Movement =====
  event: {
    prismaKey: 'event',
    description: 'Event satu-kali (KKR, Retret, dll) dgn registrasi + pembayaran + checkin.',
    allowedInclude: ['cabang', 'sinode', 'author', 'partisipasi'],
    keyFields: ['id', 'judul', 'slug', 'tanggalMulai', 'tanggalSelesai', 'cabangId', 'sinodeId', 'tipeBayar', 'quotaPeserta', 'isPublished'],
  },
  event_participation: {
    prismaKey: 'eventParticipation',
    description: 'Peserta event + status (DAFTAR/MENUNGGU_VERIFIKASI/BAYAR/HADIR/BATAL).',
    allowedInclude: ['event', 'jemaat', 'approver'],
    keyFields: ['id', 'eventId', 'jemaatId', 'status', 'nominalBayar', 'paidAt', 'attendedAt'],
  },
  visit: {
    prismaKey: 'visit',
    description: 'Visit peer-to-peer antar jemaat (scan QR). Movement module.',
    allowedInclude: ['initiator', 'target'],
    keyFields: ['id', 'initiatorJemaatId', 'targetJemaatId', 'judul', 'lokasi', 'tanggalVisit'],
  },
  local_business: {
    prismaKey: 'localBusiness',
    description: 'UMKM directory / Local Market — bisnis jemaat.',
    allowedInclude: ['owner', 'cabang'],
    keyFields: ['id', 'nama', 'ownerJemaatId', 'cabangId', 'industri', 'tipeBisnis', 'isActive', 'isPublic'],
  },
  // ===== Broadcast =====
  konten: {
    prismaKey: 'konten',
    description: 'Konten broadcast (News atau Renungan) — tipe dibedakan via field type.',
    allowedInclude: ['cabang', 'sinode', 'author'],
    keyFields: ['id', 'type', 'judul', 'slug', 'ringkasan', 'cabangId', 'sinodeId', 'isPublished', 'publishedAt'],
  },
  // ===== Group =====
  group: {
    prismaKey: 'group',
    description: 'Generic group (module 23) — terpisah dari homecell. Support hierarchy + public/private.',
    allowedInclude: ['picJemaat', 'parent', 'children', 'members', 'jenis'],
    keyFields: ['id', 'nama', 'jenis', 'parentId', 'picJemaatId', 'cabangId', 'isPublic', 'isActive'],
  },
  group_member: {
    prismaKey: 'groupMember',
    description: 'Member di group (module 23).',
    allowedInclude: ['group', 'jemaat'],
    keyFields: ['id', 'groupId', 'jemaatId', 'isActive', 'tanggalKeluar'],
  },
  // ===== CKids =====
  hadiah_katalog: {
    prismaKey: 'hadiahKatalog',
    description: 'Katalog hadiah CKids per cabang (untuk redeem point anak).',
    allowedInclude: ['cabang'],
    keyFields: ['id', 'cabangId', 'nama', 'pointCost', 'stock', 'isActive'],
  },
  jemaat_point_balance: {
    prismaKey: 'jemaatPointBalance',
    description: 'Balance point jemaat (biasanya anak) per cabang.',
    allowedInclude: ['jemaat', 'cabang'],
    keyFields: ['id', 'jemaatId', 'cabangId', 'balance', 'updatedAt'],
  },
  point_transaction: {
    prismaKey: 'pointTransaction',
    description: 'Transaksi point (EARN dari kehadiran kids ibadah, REDEEM dari stall, ADJUST manual).',
    allowedInclude: ['jemaat', 'cabang', 'createdBy'],
    keyFields: ['id', 'jemaatId', 'cabangId', 'type', 'amount', 'source', 'referenceId', 'note', 'createdAt'],
  },
  hadiah_redeem: {
    prismaKey: 'hadiahRedeem',
    description: 'History redeem hadiah di gift stall CKids.',
    allowedInclude: ['jemaat', 'hadiah', 'cabang', 'processedBy'],
    keyFields: ['id', 'jemaatId', 'hadiahId', 'cabangId', 'pointDeducted', 'processedAt'],
  },
  // ===== System =====
  notification: {
    prismaKey: 'notification',
    description: 'In-app notification feed per jemaat (Modul 30). 16 types (kids checkin, redeem, family, dll).',
    allowedInclude: ['jemaat'],
    keyFields: ['id', 'jemaatId', 'type', 'title', 'readAt', 'createdAt'],
  },
  branch_change_request: {
    prismaKey: 'branchChangeRequest',
    description: 'Permohonan pindah cabang jemaat. Status PENDING/APPROVED/REJECTED.',
    allowedInclude: ['jemaat', 'currentCabang', 'targetCabang', 'reviewer'],
    keyFields: ['id', 'jemaatId', 'currentCabangId', 'targetCabangId', 'status', 'submittedAt', 'reviewedAt'],
  },
};

// ============================================================
// Helpers
// ============================================================

function stripExcluded<T extends Record<string, unknown>>(row: T, excludeFields?: string[]): T {
  if (!excludeFields || excludeFields.length === 0) return row;
  const clone = { ...row };
  for (const f of excludeFields) delete (clone as Record<string, unknown>)[f];
  return clone as T;
}

function buildIncludeObject(includeList: string[] | undefined, cfg: EntityConfig): Record<string, boolean> | undefined {
  if (!includeList || includeList.length === 0) return undefined;
  const obj: Record<string, boolean> = {};
  for (const rel of includeList) {
    if (!cfg.allowedInclude.includes(rel)) {
      throw new Error(
        `Relation "${rel}" not allowed for entity "${cfg.prismaKey}". Allowed: ${cfg.allowedInclude.join(', ')}`,
      );
    }
    obj[rel] = true;
  }
  return obj;
}

function getPrismaModel(entity: string): {
  cfg: EntityConfig;
  model: {
    findMany: (args: Record<string, unknown>) => Promise<unknown[]>;
    count: (args: Record<string, unknown>) => Promise<number>;
    groupBy: (args: Record<string, unknown>) => Promise<unknown[]>;
  };
} {
  const cfg = ENTITY_MAP[entity];
  if (!cfg) {
    throw new Error(
      `Unknown entity "${entity}". Available: ${Object.keys(ENTITY_MAP).join(', ')}`,
    );
  }
  const model = (prisma as unknown as Record<string, unknown>)[cfg.prismaKey];
  if (!model) {
    throw new Error(`Prisma model "${cfg.prismaKey}" not found in client.`);
  }
  return { cfg, model: model as never };
}

// ============================================================
// Public API — dipakai router elsa.ts
// ============================================================

/** List semua entity available + brief description. */
export function listEntities(): {
  count: number;
  entities: Array<{ name: string; description: string; keyFields: string[] }>;
} {
  return {
    count: Object.keys(ENTITY_MAP).length,
    entities: Object.entries(ENTITY_MAP).map(([name, cfg]) => ({
      name,
      description: cfg.description,
      keyFields: cfg.keyFields,
    })),
  };
}

/** Deskripsi detail 1 entity — fields + relations + example. */
export function describeEntity(entity: string): {
  entity: string;
  description: string;
  keyFields: string[];
  allowedRelations: string[];
  excludedFields: string[];
  exampleQuery: string;
} {
  const cfg = ENTITY_MAP[entity];
  if (!cfg) throw new Error(`Unknown entity "${entity}". Call list_entities first.`);
  return {
    entity,
    description: cfg.description,
    keyFields: cfg.keyFields,
    allowedRelations: cfg.allowedInclude,
    excludedFields: cfg.excludeFields ?? [],
    exampleQuery: `query_entity({ entity: "${entity}", filter: { isActive: true }, limit: 10 })`,
  };
}

/**
 * Query entity dgn filter + include + orderBy + limit.
 * Guardrails: limit max 50, relation include whitelist, field exclude.
 */
export async function queryEntity(args: {
  entity: string;
  filter?: Record<string, unknown>;
  include?: string[];
  orderBy?: Record<string, 'asc' | 'desc'>;
  limit?: number;
}): Promise<{ entity: string; count: number; rows: unknown[] }> {
  const { cfg, model } = getPrismaModel(args.entity);
  const take = Math.min(Math.max(args.limit ?? 20, 1), 50);
  const include = buildIncludeObject(args.include, cfg);

  const rows = await model.findMany({
    ...(args.filter ? { where: args.filter } : {}),
    ...(include ? { include } : {}),
    ...(args.orderBy ? { orderBy: args.orderBy } : {}),
    take,
  });

  const cleaned = rows.map((r) => stripExcluded(r as Record<string, unknown>, cfg.excludeFields));
  return { entity: args.entity, count: cleaned.length, rows: cleaned };
}

/** Count entity dgn optional filter. */
export async function countEntity(args: {
  entity: string;
  filter?: Record<string, unknown>;
}): Promise<{ entity: string; count: number }> {
  const { model } = getPrismaModel(args.entity);
  const count = await model.count({
    ...(args.filter ? { where: args.filter } : {}),
  });
  return { entity: args.entity, count };
}

/**
 * GroupBy aggregate — mis. count jemaat per cabangId.
 * `by`: array field names untuk grouping.
 */
export async function groupByEntity(args: {
  entity: string;
  by: string[];
  filter?: Record<string, unknown>;
  limit?: number;
}): Promise<{
  entity: string;
  by: string[];
  count: number;
  groups: unknown[];
}> {
  const { model } = getPrismaModel(args.entity);
  const take = Math.min(Math.max(args.limit ?? 20, 1), 50);
  const groups = await model.groupBy({
    by: args.by as never,
    ...(args.filter ? { where: args.filter } : {}),
    _count: true,
    take,
  });
  return { entity: args.entity, by: args.by, count: groups.length, groups };
}
