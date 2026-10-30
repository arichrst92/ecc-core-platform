/**
 * Konsolidasi data jemaat dari spreadsheet (rekap manual Shiftsoft) — human check.
 *
 *   POST /admin/jemaat-consolidation/preview   multipart file=.xlsx, ?sheet=Data
 *        → baris sheet + hasil pencocokan ke DB + diff per field + rencana
 *          area/homecell/leader/ministry. TIDAK menulis apa pun.
 *   POST /admin/jemaat-consolidation/apply     JSON keputusan dari GUI
 *        → tulis hanya yang dipilih admin. Baris yang tidak ada di production
 *          bisa dicentang "tambahkan sebagai jemaat baru" (`create`) → jemaat
 *          dibuat di cabang sheet, lalu diproses sama (role, homecell, ministry).
 *
 * Fulltimer only. Role sheet diabaikan — semua jemaat dipastikan punya
 * role Jemaat → Jemaat Tetap.
 *
 * Kolom "Spiritual Journey" (mis. "Expand"): jemaat diberi role yang
 * disyaratkan tahap tersebut DAN semua tahap sebelumnya (yang belum dipenuhi).
 */
import { Router } from 'express';
import multer from 'multer';
import { prisma } from '@ecc/database';
import { z } from 'zod';
import { requireFulltimer } from '../../middleware/require-auth.js';
import { BadRequest, NotFound, Unauthorized } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { readXlsx } from '../../lib/xlsx-lite.js';
import { generateUniqueKode } from '../../lib/kode-reservasi.js';
import {
  DIFF_FIELDS,
  buildIndex,
  diffField,
  majority,
  matchRow,
  journeyStepsToGrant,
  normalizeName,
  parseSheetRows,
  suggestJourneyStep,
  suggestPelayanan,
  splitMinistries,
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

/** Tahap Spiritual Journey aktif, urut. */
async function loadJourneySteps() {
  return prisma.spiritualJourneyStep.findMany({
    where: { isActive: true },
    orderBy: [{ urutan: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      judul: true,
      urutan: true,
      roleId: true,
      subRoleId: true,
      subRoleStatusId: true,
      role: {
        select: {
          nama: true,
          subRoles: { where: { isActive: true }, orderBy: { nama: 'asc' }, select: { id: true, nama: true } },
        },
      },
      subRole: { select: { nama: true } },
      subRoleStatus: { select: { nama: true } },
    },
  });
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
      .map((id) => ({ ...jemaatOut(id), via: ['nama'] }))
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
  // Satu jemaat bisa punya beberapa ministry (dipisah koma / titik koma / garis miring / baris baru,
  // atau baris terpisah di sheet) — setiap nama dipetakan sendiri.
  const ministryNames = [...new Set(rows.flatMap((r) => splitMinistries(r.ministry)))].sort();
  const ministries = ministryNames.map((nama) => ({
    sheetNama: nama,
    suggestedPelayananId: suggestPelayanan(nama, pelayanan),
    memberCount: rows.filter((r) => splitMinistries(r.ministry).includes(nama)).length,
  }));

  // ---- Spiritual Journey ----
  const steps = await loadJourneySteps();
  const journeyNames = [...new Set(rows.map((r) => r.spiritualJourney).filter((x): x is string => !!x))].sort();
  const journeys = journeyNames.map((nama) => ({
    sheetNama: nama,
    suggestedStepId: suggestJourneyStep(nama, steps),
    memberCount: rows.filter((r) => r.spiritualJourney === nama).length,
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
      journeys,
      journeySteps: steps.map((st) => ({
        id: st.id,
        judul: st.judul,
        urutan: st.urutan,
        roleNama: st.role.nama,
        subRoleId: st.subRoleId,
        subRoleNama: st.subRole?.nama ?? null,
        subRoleStatusNama: st.subRoleStatus?.nama ?? null,
        // Tahap tanpa sub role → admin memilih sub role yang diberikan.
        subRoleOptions: st.subRoleId ? [] : st.role.subRoles,
      })),
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

const createJemaat = z
  .object({
    namaLengkap: z.string().trim().min(2).max(255),
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
      z
        .object({
          rowNo: z.number().int(),
          // Salah satu: jemaatId (update jemaat yang ada) ATAU create (jemaat baru).
          jemaatId: z.string().uuid().optional(),
          create: createJemaat.optional(),
          updates: fieldUpdates.default({}),
          area: z.string().trim().max(100).nullable(),
          homecell: z.string().trim().max(150).nullable(),
          ministry: z.string().trim().max(500).nullable(),
          spiritualJourney: z.string().trim().max(150).nullable().optional(),
        })
        .refine((r) => !!r.jemaatId !== !!r.create, 'Tiap baris wajib jemaatId atau create (salah satu).'),
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
  // Nilai kolom Spiritual Journey di sheet → id tahap (null = lewati).
  journeyMap: z.record(z.string(), z.string().uuid().nullable()).default({}),
  // Tahap tanpa sub role → sub role yang diberikan (stepId → subRoleId).
  journeySubRole: z.record(z.string().uuid(), z.string().uuid()).default({}),
});

type RowResult = { rowNo: number; jemaatId: string | null; ok: boolean; created?: boolean; changes: string[]; error?: string };

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
    jemaatCreated: 0,
    areasCreated: 0,
    homecellsCreated: 0,
    picSet: 0,
    pelayananCreated: 0,
    fieldsUpdated: 0,
    rolesSet: 0,
    homecellMembers: 0,
    ministryMembers: 0,
    penggembalaanAdded: 0,
    journeyRolesAdded: 0,
  };

  // ---- Spiritual Journey: tahap + sub role yang diberikan ----
  const journeySteps = await loadJourneySteps();
  const stepIndex = new Map(journeySteps.map((st, i) => [st.id, i]));
  const grantSubRole = new Map<string, string>();
  for (const st of journeySteps) {
    if (st.subRoleId) {
      grantSubRole.set(st.id, st.subRoleId);
      continue;
    }
    const chosen = input.journeySubRole[st.id];
    const valid = chosen && st.role.subRoles.some((x) => x.id === chosen) ? chosen : st.role.subRoles[0]?.id;
    if (valid) grantSubRole.set(st.id, valid);
  }
  const journeyTarget = new Map<string, number>();
  for (const [sheetNama, stepId] of Object.entries(input.journeyMap)) {
    if (!stepId) continue;
    const idx = stepIndex.get(stepId);
    if (idx === undefined) throw BadRequest(`Tahap Spiritual Journey untuk "${sheetNama}" tidak ditemukan / tidak aktif.`);
    journeyTarget.set(sheetNama.trim().toLowerCase(), idx);
  }
  // Sub role yang dipakai tahap journey — jangan diubah oleh normalisasi Jemaat Tetap.
  const journeySubRoleIds = new Set(grantSubRole.values());

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
  // Orang yang sama bisa muncul di beberapa baris (mis. satu baris per ministry).
  // Jemaat baru hanya dibuat sekali; baris berikutnya memakai jemaat yang sama.
  const createdByKey = new Map<string, string>();
  const createKeys = (c: { namaLengkap: string; noHp?: string | null; email?: string | null }) =>
    [c.noHp ? `hp:${c.noHp}` : null, c.email ? `em:${c.email.toLowerCase()}` : null, !c.noHp && !c.email ? `nm:${normalizeName(c.namaLengkap)}` : null].filter(
      (k): k is string => !!k,
    );
  for (const r of input.rows) {
    const changes: string[] = [];
    let jemaatId: string | null = r.jemaatId ?? null;
    try {
      const reuse = r.create ? createKeys(r.create).map((k) => createdByKey.get(k)).find(Boolean) : undefined;
      if (r.create && reuse) {
        jemaatId = reuse;
        changes.push('baris tambahan (jemaat sama)');
      } else if (r.create) {
        // Jemaat baru dari baris sheet (dicentang admin).
        const c = r.create;
        const created = await prisma.jemaat.create({
          data: {
            cabangId: cabang.id,
            kode: await generateUniqueKode(async (k) => !!(await prisma.jemaat.findUnique({ where: { kode: k } }))),
            namaLengkap: c.namaLengkap,
            noHp: c.noHp ?? null,
            email: c.email ? c.email.toLowerCase() : null,
            alamat: c.alamat ?? null,
            statusPernikahan: c.statusPernikahan ?? null,
            tanggalBergabungGereja: c.tanggalBergabungGereja ? new Date(c.tanggalBergabungGereja) : null,
          },
          select: { id: true },
        });
        jemaatId = created.id;
        for (const k of createKeys(c)) createdByKey.set(k, created.id);
        changes.push('dibuat');
        summary.jemaatCreated += 1;
      }
      if (!jemaatId) throw new Error('Jemaat tidak ditentukan.');

      const data: Record<string, unknown> = {};
      const u = r.updates;
      if (!r.create) {
        if (u.noHp) data.noHp = u.noHp;
        if (u.email) data.email = u.email.toLowerCase();
        if (u.alamat) data.alamat = u.alamat;
        if (u.statusPernikahan) data.statusPernikahan = u.statusPernikahan;
        if (u.tanggalBergabungGereja) data.tanggalBergabungGereja = new Date(u.tanggalBergabungGereja);
      }
      if (Object.keys(data).length) {
        await prisma.jemaat.update({ where: { id: jemaatId }, data });
        changes.push(...Object.keys(data));
        summary.fieldsUpdated += 1;
      }

      // Role → Jemaat Tetap
      const roles = await prisma.jemaatRole.findMany({
        where: { jemaatId: jemaatId, roleId: jemaatRole.id, isActive: true },
        select: { id: true, subRoleId: true },
      });
      if (roles.length === 0) {
        await prisma.jemaatRole.create({
          data: { jemaatId: jemaatId, roleId: jemaatRole.id, subRoleId: tetapId },
        });
        changes.push('role');
        summary.rolesSet += 1;
      } else if (!roles.some((x) => x.subRoleId === tetapId)) {
        // Role Jemaat yang menjadi syarat tahap Spiritual Journey tidak diubah.
        const convertible = roles.find((x) => !journeySubRoleIds.has(x.subRoleId));
        if (convertible) {
          await prisma.jemaatRole.update({ where: { id: convertible.id }, data: { subRoleId: tetapId } });
        } else {
          await prisma.jemaatRole.create({ data: { jemaatId: jemaatId, roleId: jemaatRole.id, subRoleId: tetapId } });
        }
        changes.push('role');
        summary.rolesSet += 1;
      }

      // Spiritual Journey: role tahap target + semua tahap sebelumnya.
      const targetIdx = r.spiritualJourney ? journeyTarget.get(r.spiritualJourney.trim().toLowerCase()) : undefined;
      if (targetIdx !== undefined) {
        const held = await prisma.jemaatRole.findMany({
          where: { jemaatId, isActive: true },
          select: { roleId: true, subRoleId: true, subRoleStatusId: true },
        });
        const target = journeySteps[targetIdx]!;
        let added = 0;
        for (const st of journeyStepsToGrant(journeySteps, targetIdx, held)) {
          const subRoleId = grantSubRole.get(st.id);
          if (!subRoleId) throw new Error(`Role "${st.role.nama}" untuk tahap "${st.judul}" belum punya sub role.`);
          await prisma.jemaatRole.create({
            data: {
              jemaatId,
              roleId: st.roleId,
              subRoleId,
              subRoleStatusId: st.subRoleStatusId ?? null,
              catatan: `Konsolidasi: Spiritual Journey "${target.judul}" (tahap ${st.judul})`,
            },
          });
          held.push({ roleId: st.roleId, subRoleId, subRoleStatusId: st.subRoleStatusId ?? null });
          added += 1;
        }
        if (added) {
          changes.push(`spiritual-journey:${target.judul}`);
          summary.journeyRolesAdded += added;
        }
      }

      // Homecell
      if (r.homecell && r.area) {
        const hcId = homecellIdByKey.get(`${r.area.toUpperCase()}|${r.homecell.toUpperCase()}`);
        if (hcId) {
          const existing = await prisma.homecellMember.findUnique({
            where: { homecellId_jemaatId: { homecellId: hcId, jemaatId: jemaatId } },
            select: { id: true, isActive: true },
          });
          if (!existing) {
            await prisma.homecellMember.create({ data: { homecellId: hcId, jemaatId: jemaatId } });
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

      // Ministry — bisa lebih dari satu per jemaat (sel berisi beberapa nama
      // dan/atau beberapa baris sheet untuk orang yang sama).
      for (const nama of splitMinistries(r.ministry)) {
        const mt = ministryTarget.get(nama);
        if (!mt) continue;
        const exists = await prisma.jemaatPelayanan.findFirst({
          where: { jemaatId: jemaatId, pelayananId: mt.pelayananId, isActive: true },
          select: { id: true },
        });
        if (!exists) {
          await prisma.jemaatPelayanan.create({
            data: { jemaatId: jemaatId, pelayananId: mt.pelayananId, pelayananRoleId: mt.roleId, isActive: true },
          });
          if (!changes.includes('ministry')) changes.push('ministry');
          summary.ministryMembers += 1;
        }
      }

      results.push({ rowNo: r.rowNo, jemaatId, ok: true, created: !!r.create, changes });
    } catch (e) {
      const code = (e as { code?: string }).code;
      const msg =
        code === 'P2002'
          ? r.create
            ? 'Tidak bisa dibuat: Email / No HP sudah dipakai jemaat lain.'
            : 'Email / No HP sudah dipakai jemaat lain.'
          : code === 'P2025'
            ? 'Jemaat tidak ditemukan.'
            : (e as Error).message;
      results.push({ rowNo: r.rowNo, jemaatId, ok: false, created: false, changes, error: msg });
    }
  }

  audit(req, {
    action: 'UPDATE',
    resource: 'jemaat_consolidation',
    resourceLabel: `Konsolidasi ${cabang.nama}: ${input.rows.length} baris (${summary.jemaatCreated} jemaat baru)`,
    metadata: { ...summary, failed: results.filter((x) => !x.ok).length },
  });

  res.json({ success: true, data: { summary, results } });
});
