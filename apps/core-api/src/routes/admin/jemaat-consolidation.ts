/**
 * Konsolidasi data jemaat dari spreadsheet (rekap manual Shiftsoft) — human check.
 *
 *   POST /admin/jemaat-consolidation/preview   multipart file=.xlsx, ?sheet=Data
 *        → baris sheet + hasil pencocokan ke DB + diff per field + rencana
 *          area/homecell/leader/ministry. TIDAK menulis apa pun.
 *   POST /admin/jemaat-consolidation/apply     JSON keputusan dari GUI
 *        → tulis hanya yang dipilih admin.
 *
 * Fulltimer only. Role sheet diabaikan — semua jemaat dipastikan punya
 * role Jemaat → Jemaat Tetap.
 */
import { Router } from 'express';
import multer from 'multer';
import { prisma } from '@ecc/database';
import { z } from 'zod';
import { requireFulltimer } from '../../middleware/require-auth.js';
import { BadRequest, NotFound, Unauthorized } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { readXlsx } from '../../lib/xlsx-lite.js';
import {
  DIFF_FIELDS,
  buildIndex,
  diffField,
  majority,
  matchRow,
  normalizeName,
  parseSheetRows,
  suggestPelayanan,
  type JemaatLite,
} from '../../lib/jemaat-consolidation.js';

export const jemaatConsolidationRouter = Router();
jemaatConsolidationRouter.use(requireFulltimer);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024, files: 1 } });

async function loadAllJemaat(): Promise<JemaatLite[]> {
  const rows = await prisma.jemaat.findMany({
    select: {
      id: true,
      kode: true,
      namaLengkap: true,
      email: true,
      noHp: true,
      alamat: true,
      statusPernikahan: true,
      tanggalBergabungGereja: true,
      cabangId: true,
      cabang: { select: { nama: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    kode: r.kode,
    namaLengkap: r.namaLengkap,
    email: r.email,
    noHp: r.noHp,
    alamat: r.alamat,
    statusPernikahan: r.statusPernikahan,
    tanggalBergabungGereja: r.tanggalBergabungGereja
      ? r.tanggalBergabungGereja.toISOString().slice(0, 10)
      : null,
    cabangId: r.cabangId,
    cabangNama: r.cabang.nama,
  }));
}

// ============================================================
//  PREVIEW
// ============================================================

jemaatConsolidationRouter.post('/preview', upload.single('file'), async (req, res) => {
  if (!req.file) throw BadRequest('File .xlsx wajib di-upload (field "file").');
  let wb;
  try {
    wb = readXlsx(req.file.buffer);
  } catch (e) {
    throw BadRequest((e as Error).message);
  }
  const requested = typeof req.query.sheet === 'string' ? req.query.sheet : undefined;
  const sheet = requested ?? (wb.sheetNames.includes('Data') ? 'Data' : wb.sheetNames[0]);
  if (!sheet || !wb.sheetNames.includes(sheet)) {
    throw BadRequest(`Sheet "${requested}" tidak ada. Pilihan: ${wb.sheetNames.join(', ')}`);
  }

  const { rows, missingColumns } = parseSheetRows(wb.readSheet(sheet));
  if (missingColumns.length) {
    return res.json({
      success: true,
      data: { sheetNames: wb.sheetNames, sheet, missingColumns, rows: [], cabang: null },
    });
  }

  // Cabang: nilai terbanyak di kolom Cabang.
  const cabangNama = majority(rows.map((r) => r.cabang));
  const cabang = cabangNama
    ? await prisma.cabangGereja.findFirst({
        where: { nama: { equals: cabangNama, mode: 'insensitive' } },
        select: { id: true, nama: true },
      })
    : null;
  if (!cabang) throw BadRequest(`Cabang "${cabangNama ?? '-'}" tidak ditemukan di database.`);

  const all = await loadAllJemaat();
  const ix = buildIndex(all);
  const jemaatOut = (id: string) => {
    const j = ix.byId.get(id)!;
    return {
      id: j.id,
      kode: j.kode,
      namaLengkap: j.namaLengkap,
      email: j.email,
      noHp: j.noHp,
      alamat: j.alamat,
      statusPernikahan: j.statusPernikahan,
      tanggalBergabungGereja: j.tanggalBergabungGereja,
      cabang: j.cabangNama,
      cabangSama: j.cabangId === cabang.id,
    };
  };

  const outRows = rows.map((r) => {
    const m = matchRow(r, ix, cabang.id);
    const target = m.jemaatId ? ix.byId.get(m.jemaatId)! : null;
    const diff = target
      ? Object.fromEntries(
          DIFF_FIELDS.map((f) => [f, diffField(f, r[f], target[f])]),
        )
      : null;
    return {
      ...r,
      match: {
        status: m.status,
        jemaatId: m.jemaatId,
        candidates: m.candidates.map((c) => ({ ...jemaatOut(c.id), via: c.via })),
      },
      diff,
    };
  });

  // ---- Struktur homecell ----
  const existingAreas = await prisma.homecellArea.findMany({
    where: { cabangId: cabang.id },
    select: { id: true, nama: true, picJemaatId: true, homecells: { select: { id: true, nama: true, picJemaatId: true } } },
  });
  const leaderCandidates = (name: string | null) => {
    const key = normalizeName(name);
    if (!key) return [];
    return (ix.byName.get(key) ?? [])
      .map(jemaatOut)
      .sort((a, b) => Number(b.cabangSama) - Number(a.cabangSama));
  };

  const areaNames = [...new Set(rows.map((r) => r.area).filter((x): x is string => !!x))].sort();
  const areas = areaNames.map((nama) => {
    const ex = existingAreas.find((a) => a.nama.toLowerCase() === nama.toLowerCase());
    const leader = majority(rows.filter((r) => r.area === nama).map((r) => r.zoneLeader));
    return {
      nama,
      existingId: ex?.id ?? null,
      existingPicJemaatId: ex?.picJemaatId ?? null,
      leaderNama: leader,
      leaderCandidates: leaderCandidates(leader),
      memberCount: rows.filter((r) => r.area === nama).length,
    };
  });

  const hcKeys = [
    ...new Map(
      rows.filter((r) => r.homecell).map((r) => [`${r.area ?? ''}|${r.homecell}`, { area: r.area, nama: r.homecell! }]),
    ).values(),
  ].sort((a, b) => `${a.area}${a.nama}`.localeCompare(`${b.area}${b.nama}`));
  const homecells = hcKeys.map(({ area, nama }) => {
    const exArea = existingAreas.find((a) => a.nama.toLowerCase() === (area ?? '').toLowerCase());
    const ex = exArea?.homecells.find((h) => h.nama.toLowerCase() === nama.toLowerCase());
    const members = rows.filter((r) => r.homecell === nama && r.area === area);
    const leader = majority(members.map((r) => r.homeLeader));
    return {
      nama,
      areaNama: area,
      existingId: ex?.id ?? null,
      existingPicJemaatId: ex?.picJemaatId ?? null,
      leaderNama: leader,
      leaderCandidates: leaderCandidates(leader),
      memberCount: members.length,
    };
  });

  // ---- Ministry ----
  const pelayanan = await prisma.pelayanan.findMany({
    where: { isActive: true },
    orderBy: { nama: 'asc' },
    select: { id: true, nama: true },
  });
  const ministryNames = [...new Set(rows.map((r) => r.ministry).filter((x): x is string => !!x))].sort();
  const ministries = ministryNames.map((nama) => ({
    sheetNama: nama,
    suggestedPelayananId: suggestPelayanan(nama, pelayanan),
    memberCount: rows.filter((r) => r.ministry === nama).length,
  }));

  res.json({
    success: true,
    data: {
      sheetNames: wb.sheetNames,
      sheet,
      missingColumns,
      cabang,
      rows: outRows,
      areas,
      homecells,
      ministries,
      pelayananOptions: pelayanan,
    },
  });
});

// ============================================================
//  APPLY
// ============================================================

const fieldUpdates = z
  .object({
    noHp: z.string().trim().min(8).max(20).optional(),
    email: z.string().trim().email().max(255).optional(),
    alamat: z.string().trim().max(2000).optional(),
    statusPernikahan: z.string().trim().max(50).optional(),
    tanggalBergabungGereja: z.string().date().optional(),
  })
  .strict();

const applySchema = z.object({
  cabangId: z.string().uuid(),
  rows: z
    .array(
      z.object({
        rowNo: z.number().int(),
        jemaatId: z.string().uuid(),
        updates: fieldUpdates,
        area: z.string().trim().max(100).nullable(),
        homecell: z.string().trim().max(150).nullable(),
        ministry: z.string().trim().max(100).nullable(),
      }),
    )
    .max(5000),
  areas: z.array(z.object({ nama: z.string().trim().min(1).max(100), picJemaatId: z.string().uuid().nullable() })),
  homecells: z.array(
    z.object({
      nama: z.string().trim().min(1).max(150),
      areaNama: z.string().trim().min(1).max(100),
      picJemaatId: z.string().uuid().nullable(),
    }),
  ),
  ministryMap: z.record(
    z.string(),
    z.union([
      z.object({ pelayananId: z.string().uuid() }),
      z.object({ createNama: z.string().trim().min(1).max(100) }),
      z.null(),
    ]),
  ),
});

type RowResult = { rowNo: number; jemaatId: string; ok: boolean; changes: string[]; error?: string };

jemaatConsolidationRouter.post('/apply', async (req, res) => {
  if (!req.user) throw Unauthorized();
  const input = applySchema.parse(req.body);

  const cabang = await prisma.cabangGereja.findUnique({ where: { id: input.cabangId }, select: { id: true, nama: true } });
  if (!cabang) throw NotFound('Cabang tidak ditemukan.');

  // ---- Role Jemaat → Jemaat Tetap ----
  const jemaatRole = await prisma.role.findUnique({
    where: { nama: 'Jemaat' },
    select: { id: true, subRoles: { where: { nama: 'Jemaat Tetap' }, select: { id: true } } },
  });
  const tetapId = jemaatRole?.subRoles[0]?.id;
  if (!jemaatRole || !tetapId) throw BadRequest('Role "Jemaat → Jemaat Tetap" belum ada di database.');

  const summary = {
    areasCreated: 0,
    homecellsCreated: 0,
    picSet: 0,
    pelayananCreated: 0,
    fieldsUpdated: 0,
    rolesSet: 0,
    homecellMembers: 0,
    ministryMembers: 0,
    penggembalaanAdded: 0,
  };

  // ---- Ministry: map / buat pelayanan ----
  const ministryTarget = new Map<string, { pelayananId: string; roleId: string }>();
  for (const [sheetNama, decision] of Object.entries(input.ministryMap)) {
    if (!decision) continue;
    let pelayananId: string;
    if ('createNama' in decision) {
      const existing = await prisma.pelayanan.findFirst({
        where: { nama: { equals: decision.createNama, mode: 'insensitive' } },
        select: { id: true },
      });
      if (existing) pelayananId = existing.id;
      else {
        const created = await prisma.pelayanan.create({
          data: {
            nama: decision.createNama,
            roles: { create: [{ nama: 'Leader', level: 10 }, { nama: 'Anggota', level: 0 }] },
          },
          select: { id: true },
        });
        pelayananId = created.id;
        summary.pelayananCreated += 1;
      }
    } else pelayananId = decision.pelayananId;
    const role = await prisma.pelayananRole.findFirst({
      where: { pelayananId, isActive: true },
      orderBy: { level: 'asc' },
      select: { id: true },
    });
    if (!role) throw BadRequest(`Pelayanan untuk "${sheetNama}" belum punya peran.`);
    ministryTarget.set(sheetNama.toUpperCase(), { pelayananId, roleId: role.id });
  }

  // ---- Penggembalaan (untuk PIC area/homecell) ----
  const penggembalaan = await prisma.pelayanan.findFirst({
    where: { nama: { equals: 'Penggembalaan', mode: 'insensitive' } },
    select: { id: true, roles: { select: { id: true, nama: true, level: true } } },
  });
  const pgRole = (nama: string) =>
    penggembalaan?.roles.find((r) => r.nama.toLowerCase() === nama.toLowerCase())?.id ??
    penggembalaan?.roles.sort((a, b) => a.level - b.level)[0]?.id;
  async function ensurePenggembalaan(jemaatId: string, roleNama: string) {
    if (!penggembalaan) return;
    const roleId = pgRole(roleNama);
    if (!roleId) return;
    const exists = await prisma.jemaatPelayanan.findFirst({
      where: { jemaatId, pelayananId: penggembalaan.id, isActive: true },
      select: { id: true },
    });
    if (exists) return;
    await prisma.jemaatPelayanan.create({
      data: { jemaatId, pelayananId: penggembalaan.id, pelayananRoleId: roleId, isActive: true },
    });
    summary.penggembalaanAdded += 1;
  }

  // ---- Area ----
  const areaIdByNama = new Map<string, string>();
  for (const a of input.areas) {
    const existing = await prisma.homecellArea.findFirst({
      where: { cabangId: cabang.id, nama: { equals: a.nama, mode: 'insensitive' } },
      select: { id: true, picJemaatId: true },
    });
    let id = existing?.id;
    if (!id) {
      id = (await prisma.homecellArea.create({ data: { cabangId: cabang.id, nama: a.nama }, select: { id: true } })).id;
      summary.areasCreated += 1;
    }
    if (a.picJemaatId && a.picJemaatId !== existing?.picJemaatId) {
      await prisma.homecellArea.update({ where: { id }, data: { picJemaatId: a.picJemaatId } });
      summary.picSet += 1;
    }
    if (a.picJemaatId) await ensurePenggembalaan(a.picJemaatId, 'Zone Leader');
    areaIdByNama.set(a.nama.toUpperCase(), id);
  }

  // ---- Homecell ----
  const homecellIdByKey = new Map<string, string>();
  for (const h of input.homecells) {
    const areaId = areaIdByNama.get(h.areaNama.toUpperCase());
    if (!areaId) throw BadRequest(`Area "${h.areaNama}" untuk homecell "${h.nama}" tidak ada di daftar area.`);
    const existing = await prisma.homecell.findFirst({
      where: { areaId, nama: { equals: h.nama, mode: 'insensitive' } },
      select: { id: true, picJemaatId: true },
    });
    let id = existing?.id;
    if (!id) {
      id = (await prisma.homecell.create({ data: { areaId, nama: h.nama }, select: { id: true } })).id;
      summary.homecellsCreated += 1;
    }
    if (h.picJemaatId && h.picJemaatId !== existing?.picJemaatId) {
      await prisma.homecell.update({ where: { id }, data: { picJemaatId: h.picJemaatId } });
      summary.picSet += 1;
    }
    if (h.picJemaatId) await ensurePenggembalaan(h.picJemaatId, 'Homecell Leader');
    homecellIdByKey.set(`${h.areaNama.toUpperCase()}|${h.nama.toUpperCase()}`, id);
  }

  // ---- Per jemaat ----
  const results: RowResult[] = [];
  for (const r of input.rows) {
    const changes: string[] = [];
    try {
      const data: Record<string, unknown> = {};
      const u = r.updates;
      if (u.noHp) data.noHp = u.noHp;
      if (u.email) data.email = u.email.toLowerCase();
      if (u.alamat) data.alamat = u.alamat;
      if (u.statusPernikahan) data.statusPernikahan = u.statusPernikahan;
      if (u.tanggalBergabungGereja) data.tanggalBergabungGereja = new Date(u.tanggalBergabungGereja);
      if (Object.keys(data).length) {
        await prisma.jemaat.update({ where: { id: r.jemaatId }, data });
        changes.push(...Object.keys(data));
        summary.fieldsUpdated += 1;
      }

      // Role → Jemaat Tetap
      const roles = await prisma.jemaatRole.findMany({
        where: { jemaatId: r.jemaatId, roleId: jemaatRole.id, isActive: true },
        select: { id: true, subRoleId: true },
      });
      if (roles.length === 0) {
        await prisma.jemaatRole.create({
          data: { jemaatId: r.jemaatId, roleId: jemaatRole.id, subRoleId: tetapId },
        });
        changes.push('role');
        summary.rolesSet += 1;
      } else if (!roles.some((x) => x.subRoleId === tetapId)) {
        await prisma.jemaatRole.update({ where: { id: roles[0]!.id }, data: { subRoleId: tetapId } });
        changes.push('role');
        summary.rolesSet += 1;
      }

      // Homecell
      if (r.homecell && r.area) {
        const hcId = homecellIdByKey.get(`${r.area.toUpperCase()}|${r.homecell.toUpperCase()}`);
        if (hcId) {
          const existing = await prisma.homecellMember.findUnique({
            where: { homecellId_jemaatId: { homecellId: hcId, jemaatId: r.jemaatId } },
            select: { id: true, isActive: true },
          });
          if (!existing) {
            await prisma.homecellMember.create({ data: { homecellId: hcId, jemaatId: r.jemaatId } });
            changes.push('homecell');
            summary.homecellMembers += 1;
          } else if (!existing.isActive) {
            await prisma.homecellMember.update({
              where: { id: existing.id },
              data: { isActive: true, tanggalKeluar: null },
            });
            changes.push('homecell');
            summary.homecellMembers += 1;
          }
        }
      }

      // Ministry
      const mt = r.ministry ? ministryTarget.get(r.ministry.toUpperCase()) : undefined;
      if (mt) {
        const exists = await prisma.jemaatPelayanan.findFirst({
          where: { jemaatId: r.jemaatId, pelayananId: mt.pelayananId, isActive: true },
          select: { id: true },
        });
        if (!exists) {
          await prisma.jemaatPelayanan.create({
            data: { jemaatId: r.jemaatId, pelayananId: mt.pelayananId, pelayananRoleId: mt.roleId, isActive: true },
          });
          changes.push('ministry');
          summary.ministryMembers += 1;
        }
      }

      results.push({ rowNo: r.rowNo, jemaatId: r.jemaatId, ok: true, changes });
    } catch (e) {
      const code = (e as { code?: string }).code;
      const msg =
        code === 'P2002'
          ? 'Email / No HP sudah dipakai jemaat lain.'
          : code === 'P2025'
            ? 'Jemaat tidak ditemukan.'
            : (e as Error).message;
      results.push({ rowNo: r.rowNo, jemaatId: r.jemaatId, ok: false, changes, error: msg });
    }
  }

  audit(req, {
    action: 'UPDATE',
    resource: 'jemaat_consolidation',
    resourceLabel: `Konsolidasi ${cabang.nama}: ${input.rows.length} baris`,
    metadata: { ...summary, failed: results.filter((x) => !x.ok).length },
  });

  res.json({ success: true, data: { summary, results } });
});
