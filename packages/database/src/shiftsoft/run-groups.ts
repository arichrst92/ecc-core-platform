/**
 * Migration orchestrator — Shiftsoft Circle → ECC Group.
 *
 * DEPENDENCY: WAJIB run `run.ts` (migrate Jemaat) DULU. Group members
 * resolve via `Jemaat.legacyShiftsoftId` — kalau Jemaat belum ter-import,
 * membership akan skip.
 *
 * USAGE:
 *   # Dry-run 1 tenant
 *   pnpm --filter @ecc/database db:migrate-shiftsoft-groups -- --slug=eccbandung
 *
 *   # Actual commit
 *   pnpm --filter @ecc/database db:migrate-shiftsoft-groups -- --slug=eccbandung --commit
 *
 *   # Semua tenant
 *   pnpm --filter @ecc/database db:migrate-shiftsoft-groups -- --all --commit
 *
 * BEHAVIOR:
 * - 2-pass import per tenant:
 *   Pass 1: create/update semua Group (skip parentId dulu, karena parent
 *           mungkin belum exists di run yg sama)
 *   Pass 2: set parentId untuk hierarchy — resolve via legacyShiftsoftCircleId
 *   Pass 3: create/update GroupMember membership
 * - Skip Circle kalau: Status != 2, IsStore = 1, empty members + leaf
 * - Idempotent via legacyShiftsoftCircleId (unique)
 * - PIC resolve dari Circle.CreatedBy → Jemaat.legacyShiftsoftId
 */
import { writeFile } from 'node:fs/promises';
import { PrismaClient, Prisma, GroupJenis, HariMinggu } from '@prisma/client';
import { TENANTS, getTenant, type TenantConfig } from './config.js';
import {
  SHIFTSOFT_BASE,
  REQUEST_DELAY_MS,
  REQUEST_TIMEOUT_MS,
  getTenantHash,
} from './config.js';
import type { LegacyCircle, ShiftsoftCircleListResponse } from './types.js';
import {
  classifyJenis,
  mapHari,
  stripHtml,
  normalizeJam,
} from './mappers/group.js';

// ============================================================
// CLI arg parser
// ============================================================
interface CliArgs {
  slug?: string;
  all: boolean;
  commit: boolean;
  limit?: number;
  skipEmpty: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { all: false, commit: false, skipEmpty: true };
  for (const a of argv) {
    if (a === '--all') args.all = true;
    else if (a === '--commit') args.commit = true;
    else if (a === '--include-empty') args.skipEmpty = false;
    else if (a.startsWith('--slug=')) args.slug = a.slice('--slug='.length);
    else if (a.startsWith('--limit=')) args.limit = Number(a.slice('--limit='.length));
  }
  if (!args.all && !args.slug) {
    throw new Error('Wajib pass --slug=<tenant> atau --all');
  }
  return args;
}

// ============================================================
// Circle client — throttled fetch dgn eager-load Members
// ============================================================
async function fetchCircles(
  tenant: TenantConfig,
): Promise<LegacyCircle[]> {
  const hash = getTenantHash(tenant);
  const url = `${SHIFTSOFT_BASE}/${tenant.slug}/api/circle/list?with%5B0%5D=Members`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { h: hash, Accept: 'application/json' },
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
    const json = (await res.json()) as ShiftsoftCircleListResponse;
    return json.data ?? [];
  } finally {
    clearTimeout(timer);
  }
}

// ============================================================
// Cabang resolver — sama dengan Jemaat migration
// ============================================================
const prisma = new PrismaClient();

async function resolveCabangId(tenant: TenantConfig): Promise<string> {
  const cabang = await prisma.cabangGereja.findFirst({
    where: {
      nama: { contains: tenant.cabangMatch, mode: 'insensitive' },
      isActive: true,
    },
    select: { id: true, nama: true },
  });
  if (!cabang) {
    throw new Error(
      `Cabang untuk ${tenant.slug} tidak ditemukan (LIKE '%${tenant.cabangMatch}%')`,
    );
  }
  return cabang.id;
}

/**
 * Cache: legacyShiftsoftId (User.ID di Shiftsoft) → Jemaat.id di ECC.
 * Populate saat cabang-scoped fetch — cuma jemaat di cabang ini yg relevan
 * untuk PIC/member assignment.
 */
async function buildJemaatMap(cabangId: string): Promise<Map<number, string>> {
  const rows = await prisma.jemaat.findMany({
    where: { cabangId, legacyShiftsoftId: { not: null } },
    select: { id: true, legacyShiftsoftId: true },
  });
  const map = new Map<number, string>();
  for (const r of rows) {
    if (r.legacyShiftsoftId != null) map.set(r.legacyShiftsoftId, r.id);
  }
  return map;
}

// ============================================================
// Per-tenant migration
// ============================================================
interface TenantReport {
  slug: string;
  label: string;
  cabangId: string | null;
  fetched: number;
  processed: number;
  createdGroups: number;
  updatedGroups: number;
  skippedInactive: number;
  skippedStore: number;
  skippedEmpty: number;
  hierarchyLinked: number;
  membersCreated: number;
  membersUpdated: number;
  membersSkippedNoJemaat: number;
  errors: number;
  errorDetails: Array<{ circleId: number; name: string; error: string }>;
  durationMs: number;
}

async function migrateTenant(
  tenant: TenantConfig,
  opts: { commit: boolean; limit?: number; skipEmpty: boolean },
): Promise<TenantReport> {
  const startedAt = Date.now();
  const report: TenantReport = {
    slug: tenant.slug,
    label: tenant.label,
    cabangId: null,
    fetched: 0,
    processed: 0,
    createdGroups: 0,
    updatedGroups: 0,
    skippedInactive: 0,
    skippedStore: 0,
    skippedEmpty: 0,
    hierarchyLinked: 0,
    membersCreated: 0,
    membersUpdated: 0,
    membersSkippedNoJemaat: 0,
    errors: 0,
    errorDetails: [],
    durationMs: 0,
  };

  console.log(`\n[${tenant.slug}] === ${tenant.label} (Groups) ===`);

  const cabangId = await resolveCabangId(tenant);
  report.cabangId = cabangId;
  console.log(`[${tenant.slug}] cabangId = ${cabangId}`);

  console.log(`[${tenant.slug}] fetch /circle/list?with[0]=Members ...`);
  const circles = await fetchCircles(tenant);
  report.fetched = circles.length;
  console.log(`[${tenant.slug}] fetched ${circles.length} circles`);

  console.log(`[${tenant.slug}] loading jemaat map (legacyShiftsoftId → uuid)...`);
  const jemaatMap = await buildJemaatMap(cabangId);
  console.log(`[${tenant.slug}] jemaat map: ${jemaatMap.size} legacy jemaat di cabang ini`);

  // Circles yg lolos filter
  const eligible: LegacyCircle[] = [];
  for (const c of circles) {
    if (c.Status !== undefined && c.Status !== 2) {
      report.skippedInactive++;
      continue;
    }
    if (c.IsStore === 1) {
      report.skippedStore++;
      continue;
    }
    // Skip empty leaf circle (0 members + tidak jadi parent circle lain)
    if (opts.skipEmpty) {
      const hasMembers = Array.isArray(c.Members) && c.Members.length > 0;
      const isParent = circles.some((x) => x.ParentID === c.ID);
      if (!hasMembers && !isParent) {
        report.skippedEmpty++;
        continue;
      }
    }
    eligible.push(c);
  }

  const toProcess = opts.limit ? eligible.slice(0, opts.limit) : eligible;
  console.log(
    `[${tenant.slug}] eligible: ${eligible.length}/${circles.length} ` +
      `(inactive=${report.skippedInactive}, store=${report.skippedStore}, empty=${report.skippedEmpty})`,
  );

  // ============================================================
  // PASS 1: upsert Group (skip parentId dulu)
  // ============================================================
  console.log(`[${tenant.slug}] Pass 1: upsert ${toProcess.length} groups (no parent yet)...`);
  for (const c of toProcess) {
    const nama = (c.Name ?? '').trim();
    if (!nama) {
      report.errors++;
      report.errorDetails.push({ circleId: c.ID, name: '(empty)', error: 'Nama kosong' });
      continue;
    }
    const picJemaatId = c.CreatedBy != null ? jemaatMap.get(c.CreatedBy) ?? null : null;
    const jenis = classifyJenis(nama);
    const createData = {
      cabangId,
      nama: nama.slice(0, 200),
      deskripsi: stripHtml(c.Description),
      jenis: jenis as GroupJenis,
      alamat: c.Place?.trim() || null,
      gps: (c.GPS ?? '').trim() || null,
      hari: mapHari(c.Day) as HariMinggu | null,
      jam: normalizeJam(c.StartTime),
      picJemaatId,
      isActive: true,
      legacyShiftsoftCircleId: c.ID,
    };

    report.processed++;

    if (!opts.commit) {
      const existing = await prisma.group.findUnique({
        where: { legacyShiftsoftCircleId: c.ID },
        select: { id: true },
      });
      if (existing) report.updatedGroups++;
      else report.createdGroups++;
      continue;
    }

    try {
      const existing = await prisma.group.findUnique({
        where: { legacyShiftsoftCircleId: c.ID },
        select: { id: true },
      });
      await prisma.group.upsert({
        where: { legacyShiftsoftCircleId: c.ID },
        create: createData,
        update: {
          // Overwrite semua field (legacy wins), kecuali parentId + cabangId
          nama: createData.nama,
          deskripsi: createData.deskripsi,
          jenis: createData.jenis,
          alamat: createData.alamat,
          gps: createData.gps,
          hari: createData.hari,
          jam: createData.jam,
          picJemaatId: createData.picJemaatId,
        },
      });
      if (existing) report.updatedGroups++;
      else report.createdGroups++;
    } catch (err) {
      report.errors++;
      const msg = err instanceof Error ? err.message : String(err);
      report.errorDetails.push({ circleId: c.ID, name: nama, error: msg });
      console.warn(`[${tenant.slug}]   error circle ID=${c.ID} "${nama}": ${msg}`);
    }
  }

  // ============================================================
  // PASS 2: link hierarchy (parentId)
  // ============================================================
  if (opts.commit) {
    console.log(`[${tenant.slug}] Pass 2: linking hierarchy parentId...`);
    // Build map legacy circle ID → ECC group UUID
    const groupMap = new Map<number, string>();
    const allGroups = await prisma.group.findMany({
      where: { cabangId, legacyShiftsoftCircleId: { not: null } },
      select: { id: true, legacyShiftsoftCircleId: true },
    });
    for (const g of allGroups) {
      if (g.legacyShiftsoftCircleId != null) {
        groupMap.set(g.legacyShiftsoftCircleId, g.id);
      }
    }

    for (const c of toProcess) {
      if (!c.ParentID || c.ParentID === 0) continue;
      const groupId = groupMap.get(c.ID);
      const parentEccId = groupMap.get(c.ParentID);
      if (!groupId || !parentEccId) continue;
      try {
        await prisma.group.update({
          where: { id: groupId },
          data: { parentId: parentEccId },
        });
        report.hierarchyLinked++;
      } catch (err) {
        // Non-fatal — parent link failed
        console.warn(
          `[${tenant.slug}]   parent link failed circle ${c.ID} → ${c.ParentID}: ${(err as Error).message}`,
        );
      }
    }
  }

  // ============================================================
  // PASS 3: membership (GroupMember)
  // ============================================================
  if (opts.commit) {
    console.log(`[${tenant.slug}] Pass 3: upsert group members...`);
    for (const c of toProcess) {
      const members = c.Members ?? [];
      if (members.length === 0) continue;
      const groupRow = await prisma.group.findUnique({
        where: { legacyShiftsoftCircleId: c.ID },
        select: { id: true },
      });
      if (!groupRow) continue;

      for (const m of members) {
        const jemaatId = jemaatMap.get(m.ID);
        if (!jemaatId) {
          report.membersSkippedNoJemaat++;
          continue;
        }
        try {
          const existing = await prisma.groupMember.findUnique({
            where: { groupId_jemaatId: { groupId: groupRow.id, jemaatId } },
            select: { id: true },
          });
          await prisma.groupMember.upsert({
            where: { groupId_jemaatId: { groupId: groupRow.id, jemaatId } },
            create: { groupId: groupRow.id, jemaatId, isActive: true },
            update: { isActive: true, tanggalKeluar: null },
          });
          if (existing) report.membersUpdated++;
          else report.membersCreated++;
        } catch (err) {
          report.errors++;
          report.errorDetails.push({
            circleId: c.ID,
            name: `${c.Name} → member ${m.Name}`,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }
  } else {
    // Dry-run: cuma count membership yg akan di-import
    for (const c of toProcess) {
      for (const m of c.Members ?? []) {
        if (jemaatMap.has(m.ID)) report.membersCreated++;
        else report.membersSkippedNoJemaat++;
      }
    }
  }

  report.durationMs = Date.now() - startedAt;
  const mode = opts.commit ? 'COMMIT' : 'DRY-RUN';
  console.log(
    `[${tenant.slug}] ${mode} done: processed=${report.processed}/${report.fetched} ` +
      `(created=${report.createdGroups}, updated=${report.updatedGroups}), ` +
      `hierarchy=${report.hierarchyLinked}, ` +
      `members=${report.membersCreated}/${report.membersCreated + report.membersUpdated} ` +
      `(skipped_no_jemaat=${report.membersSkippedNoJemaat}), ` +
      `errors=${report.errors}, took=${(report.durationMs / 1000).toFixed(1)}s`,
  );
  return report;
}

// ============================================================
// Main
// ============================================================
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const mode = args.commit ? 'COMMIT (WRITE)' : 'DRY-RUN (no write)';
  console.log(`\n=== SHIFTSOFT GROUPS MIGRATION — ${mode} ===`);
  if (args.limit) console.log(`Limit: ${args.limit} circles per tenant`);
  if (!args.skipEmpty) console.log(`Include empty circles: yes`);

  const tenants: TenantConfig[] = args.all ? TENANTS : [getTenant(args.slug!)];
  const reports: TenantReport[] = [];

  for (const tenant of tenants) {
    try {
      const r = await migrateTenant(tenant, {
        commit: args.commit,
        limit: args.limit,
        skipEmpty: args.skipEmpty,
      });
      reports.push(r);
      // Throttle antar tenant
      await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));
    } catch (err) {
      console.error(
        `[${tenant.slug}] FATAL: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // Summary
  console.log('\n=== SUMMARY ===');
  console.log(
    'tenant'.padEnd(20) +
      'fetched'.padStart(10) +
      'created'.padStart(10) +
      'updated'.padStart(10) +
      'linked'.padStart(10) +
      'members'.padStart(10) +
      'no_jmt'.padStart(10) +
      'errors'.padStart(10),
  );
  for (const r of reports) {
    console.log(
      r.slug.padEnd(20) +
        String(r.fetched).padStart(10) +
        String(r.createdGroups).padStart(10) +
        String(r.updatedGroups).padStart(10) +
        String(r.hierarchyLinked).padStart(10) +
        String(r.membersCreated).padStart(10) +
        String(r.membersSkippedNoJemaat).padStart(10) +
        String(r.errors).padStart(10),
    );
  }

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = `/tmp/shiftsoft-groups-migration-${ts}.json`;
  await writeFile(reportPath, JSON.stringify({ mode, args, reports }, null, 2));
  console.log(`\nFull report: ${reportPath}`);

  if (!args.commit) {
    console.log(
      `\nDry-run selesai. Rerun dengan --commit untuk actually write ke DB.`,
    );
  }
}

main()
  .catch((err) => {
    console.error('FATAL:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
