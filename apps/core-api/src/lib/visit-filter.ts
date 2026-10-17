/**
 * Filter & ringkasan Visit (portal). Filter "orang" (cabang, area, homecell,
 * role, sub role, status, pelayanan, nama) berlaku untuk SATU orang yang
 * sama di sisi yang dipilih:
 *   - side = 'any'       → pengunjung ATAU yang dikunjungi cocok
 *   - side = 'initiator' → pengunjung (yang scan QR) cocok
 *   - side = 'target'    → yang dikunjungi (yang di-scan) cocok
 */
import type { Prisma } from '@ecc/database';

export type VisitSide = 'any' | 'initiator' | 'target';

export interface VisitFilter {
  cabangId?: string;
  homecellAreaId?: string;
  homecellId?: string;
  roleId?: string;
  subRoleId?: string;
  subRoleStatusId?: string;
  pelayananId?: string;
  nama?: string;
  side?: VisitSide;
  /** Cari di judul / lokasi visit. */
  q?: string;
  /** 'ada' = minimal satu pihak menulis catatan; 'belum' = belum ada catatan. */
  catatan?: 'ada' | 'belum';
  /** Rentang instant [from, toExclusive). */
  from?: Date;
  toExclusive?: Date;
}

/** Syarat untuk satu orang (Jemaat); null kalau tidak ada filter orang. */
export function personWhere(f: VisitFilter): Prisma.JemaatWhereInput | null {
  const and: Prisma.JemaatWhereInput[] = [];
  if (f.cabangId) and.push({ cabangId: f.cabangId });
  if (f.homecellId) and.push({ homecellMembership: { some: { isActive: true, homecellId: f.homecellId } } });
  else if (f.homecellAreaId)
    and.push({ homecellMembership: { some: { isActive: true, homecell: { areaId: f.homecellAreaId } } } });
  if (f.roleId || f.subRoleId || f.subRoleStatusId) {
    and.push({
      jemaatRoles: {
        some: {
          isActive: true,
          ...(f.roleId ? { roleId: f.roleId } : {}),
          ...(f.subRoleId ? { subRoleId: f.subRoleId } : {}),
          ...(f.subRoleStatusId ? { subRoleStatusId: f.subRoleStatusId } : {}),
        },
      },
    });
  }
  if (f.pelayananId) and.push({ jemaatPelayanan: { some: { isActive: true, pelayananId: f.pelayananId } } });
  if (f.nama?.trim()) and.push({ namaLengkap: { contains: f.nama.trim(), mode: 'insensitive' } });
  if (and.length === 0) return null;
  return and.length === 1 ? and[0]! : { AND: and };
}

export function buildVisitWhere(f: VisitFilter): Prisma.VisitWhereInput {
  const and: Prisma.VisitWhereInput[] = [];
  const person = personWhere(f);
  if (person) {
    const side = f.side ?? 'any';
    if (side === 'initiator') and.push({ initiator: person });
    else if (side === 'target') and.push({ target: person });
    else and.push({ OR: [{ initiator: person }, { target: person }] });
  }
  if (f.q?.trim()) {
    const q = f.q.trim();
    and.push({
      OR: [
        { judul: { contains: q, mode: 'insensitive' } },
        { lokasi: { contains: q, mode: 'insensitive' } },
      ],
    });
  }
  if (f.catatan === 'ada') and.push({ OR: [{ noteDariInitiator: { not: null } }, { noteDariTarget: { not: null } }] });
  if (f.catatan === 'belum') and.push({ noteDariInitiator: null, noteDariTarget: null });
  if (f.from || f.toExclusive) {
    and.push({
      tanggalVisit: {
        ...(f.from ? { gte: f.from } : {}),
        ...(f.toExclusive ? { lt: f.toExclusive } : {}),
      },
    });
  }
  return and.length ? { AND: and } : {};
}

type Person = { id: string; namaLengkap: string; cabang?: { nama: string } | null };

export interface VisitSummaryRow {
  initiatorJemaatId: string;
  targetJemaatId: string;
  noteDariInitiator: string | null;
  noteDariTarget: string | null;
  initiator: Person;
  target: Person;
}

export interface VisitSummary {
  total: number;
  pengunjungUnik: number;
  dikunjungiUnik: number;
  denganCatatan: number;
  /** Jemaat paling aktif (jumlah visit sebagai pengunjung + dikunjungi). */
  top: {
    id: string;
    namaLengkap: string;
    cabang: string | null;
    sebagaiPengunjung: number;
    sebagaiDikunjungi: number;
    total: number;
  }[];
}

export function summarizeVisits(rows: VisitSummaryRow[], topN = 10): VisitSummary {
  const per = new Map<string, VisitSummary['top'][number]>();
  const bump = (p: Person, k: 'sebagaiPengunjung' | 'sebagaiDikunjungi') => {
    const e = per.get(p.id) ?? {
      id: p.id,
      namaLengkap: p.namaLengkap,
      cabang: p.cabang?.nama ?? null,
      sebagaiPengunjung: 0,
      sebagaiDikunjungi: 0,
      total: 0,
    };
    e[k]++;
    e.total++;
    per.set(p.id, e);
  };
  const initiators = new Set<string>();
  const targets = new Set<string>();
  let denganCatatan = 0;
  for (const r of rows) {
    initiators.add(r.initiatorJemaatId);
    targets.add(r.targetJemaatId);
    if (r.noteDariInitiator || r.noteDariTarget) denganCatatan++;
    bump(r.initiator, 'sebagaiPengunjung');
    bump(r.target, 'sebagaiDikunjungi');
  }
  const top = [...per.values()]
    .sort((a, b) => b.total - a.total || b.sebagaiPengunjung - a.sebagaiPengunjung || a.namaLengkap.localeCompare(b.namaLengkap))
    .slice(0, topN);
  return {
    total: rows.length,
    pengunjungUnik: initiators.size,
    dikunjungiUnik: targets.size,
    denganCatatan,
    top,
  };
}
