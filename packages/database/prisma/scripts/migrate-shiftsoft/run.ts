/**
 * Migration orchestrator — Shiftsoft legacy → ECC.
 *
 * USAGE:
 *   # Dry-run 1 tenant (default — TIDAK write ke DB):
 *   pnpm --filter @ecc/database exec tsx prisma/scripts/migrate-shiftsoft/run.ts --slug=eccbandung
 *
 *   # Actual commit ke DB:
 *   pnpm --filter @ecc/database exec tsx prisma/scripts/migrate-shiftsoft/run.ts --slug=eccbandung --commit
 *
 *   # Limit untuk testing:
 *   pnpm --filter @ecc/database exec tsx prisma/scripts/migrate-shiftsoft/run.ts --slug=eccbandung --limit=10
 *
 *   # Semua tenant:
 *   pnpm --filter @ecc/database exec tsx prisma/scripts/migrate-shiftsoft/run.ts --all --commit
 *
 * BEHAVIOR:
 * - Match by `legacyShiftsoftId` (unique) untuk idempotent re-sync
 * - Konflik: overwrite (legacy wins) — per keputusan user 2026-07-28
 * - Cabang resolved via slug substring match ke CabangGereja.nama (contain)
 * - Skip record kalau Name kosong (invalid)
 * - Skip auto-create Homecell + FamilyRelation (defer ke script terpisah
 *   Phase 3 — data legacy dirty, perlu review manual)
 *
 * OUTPUT:
 * - Real-time progress per tenant
 * - Summary end: total processed / created / updated / skipped / warnings
 * - Report file /tmp/shiftsoft-migration-<timestamp>.json
 */
import { writeFile } from 'node:fs/promises';
import { PrismaClient, Prisma } from '@prisma/client';
import { TENANTS, getTenant, type TenantConfig } from './config.js';
import { ShiftsoftClient } from './shiftsoft-client.js';
import { mapLegacyUserToJemaat } from './mappers/jemaat.js';

// ============================================================
// CLI arg parser (minimal — no external deps)
// ============================================================
interface CliArgs {
  slug?: string;
  all: boolean;
  commit: boolean;
  limit?: number;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { all: false, commit: false };
  for (const a of argv) {
    if (a === '--all') args.all = true;
    else if (a === '--commit') args.commit = true;
    else if (a.startsWith('--slug=')) args.slug = a.slice('--slug='.length);
    else if (a.startsWith('--limit=')) args.limit = Number(a.slice('--limit='.length));
  }
  if (!args.all && !args.slug) {
    throw new Error('Wajib pass --slug=<tenant> atau --all');
  }
  return args;
}

// ============================================================
// Cabang resolver — slug → CabangGereja.id
// ============================================================
const prisma = new PrismaClient();

async function resolveCabangId(tenant: TenantConfig): Promise<string> {
  // Inference: match cabang nama contains `tenant.cabangMatch` (case-insensitive).
  const cabang = await prisma.cabangGereja.findFirst({
    where: {
      nama: { contains: tenant.cabangMatch, mode: 'insensitive' },
      isActive: true,
    },
    select: { id: true, nama: true },
  });
  if (!cabang) {
    throw new Error(
      `Cabang untuk tenant ${tenant.slug} tidak ditemukan. ` +
        `Cari nama LIKE '%${tenant.cabangMatch}%' di CabangGereja aktif — kosong. ` +
        `Buat cabang dulu di portal atau adjust cabangMatch di config.ts.`,
    );
  }
  return cabang.id;
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
  created: number;
  updated: number;
  skippedNoName: number;
  errors: number;
  /**
   * Recovery counter: record yang collision di noHp/email, di-retry
   * dengan field tsb di-null. Berbeda dari `errors` yg beneran gagal
   * (bukan collision).
   */
  collisionsNulled: number;
  warnings: Array<{ legacyId: number; name: string; warnings: string[] }>;
  errorDetails: Array<{ legacyId: number; name: string; error: string }>;
  durationMs: number;
}

async function migrateTenant(
  tenant: TenantConfig,
  opts: { commit: boolean; limit?: number },
): Promise<TenantReport> {
  const startedAt = Date.now();
  const report: TenantReport = {
    slug: tenant.slug,
    label: tenant.label,
    cabangId: null,
    fetched: 0,
    processed: 0,
    created: 0,
    updated: 0,
    skippedNoName: 0,
    errors: 0,
    collisionsNulled: 0,
    warnings: [],
    errorDetails: [],
    durationMs: 0,
  };

  console.log(`\n[${tenant.slug}] === ${tenant.label} ===`);

  // Resolve cabang
  const cabangId = await resolveCabangId(tenant);
  report.cabangId = cabangId;
  console.log(`[${tenant.slug}] cabangId = ${cabangId}`);

  // Fetch users
  const client = new ShiftsoftClient(tenant);
  console.log(`[${tenant.slug}] fetch /user/list ...`);
  const resp = await client.listUsers();
  const users = resp.data ?? [];
  report.fetched = users.length;
  console.log(`[${tenant.slug}] fetched ${users.length} users`);

  const toProcess = opts.limit ? users.slice(0, opts.limit) : users;

  for (const u of toProcess) {
    const mapped = mapLegacyUserToJemaat(u, cabangId);
    if (!mapped) {
      report.skippedNoName++;
      continue;
    }
    report.processed++;
    if (mapped.warnings.length > 0) {
      report.warnings.push({
        legacyId: u.ID,
        name: mapped.create.namaLengkap,
        warnings: mapped.warnings,
      });
    }

    if (!opts.commit) {
      // Dry-run: just count would-be action
      const existing = await prisma.jemaat.findUnique({
        where: { legacyShiftsoftId: mapped.legacyShiftsoftId },
        select: { id: true },
      });
      if (existing) report.updated++;
      else report.created++;
      continue;
    }

    // Upsert dengan collision recovery: kalau P2002 di noHp/email,
    // retry sekali dengan field tsb di-null (record tetap ke-import,
    // cuma field yg conflict di-drop). Legacy data punya duplicate
    // phone (shared HP keluarga, typo, dll) yg bikin unique constraint
    // fail. Alternatif drop record entirely — kita pilih preserve.
    const created = mapped.create;
    const updateData = {
      namaLengkap: created.namaLengkap,
      email: created.email,
      noHp: created.noHp,
      tanggalLahir: created.tanggalLahir,
      jenisKelamin: created.jenisKelamin,
      alamat: created.alamat,
      tanggalBergabungGereja: created.tanggalBergabungGereja,
      pendidikanTerakhir: created.pendidikanTerakhir,
      statusPekerjaan: created.statusPekerjaan,
      namaKantor: created.namaKantor,
      alamatKantor: created.alamatKantor,
      statusPernikahan: created.statusPernikahan,
      tanggalPernikahan: created.tanggalPernikahan,
      sudahBaptisAir: created.sudahBaptisAir,
      sudahBaptisRohKudus: created.sudahBaptisRohKudus,
      spiritualJourneyLevel: created.spiritualJourneyLevel,
    };
    const nulledFields: string[] = [];

    const attemptUpsert = async () => {
      const existing = await prisma.jemaat.findUnique({
        where: { legacyShiftsoftId: mapped.legacyShiftsoftId },
        select: { id: true },
      });
      await prisma.jemaat.upsert({
        where: { legacyShiftsoftId: mapped.legacyShiftsoftId },
        create: created,
        update: updateData,
      });
      if (existing) report.updated++;
      else report.created++;
    };

    // Retry loop untuk collision recovery — max 4 attempt supaya bisa
    // handle chain P2002 (mis. noHp collide → null → retry email collide →
    // null → retry sukses). Tiap retry catat field yg di-null.
    const MAX_ATTEMPTS = 4;
    const nullableCols = new Set(['no_hp', 'email']);
    let succeeded = false;
    let finalErr: unknown = null;

    for (let attempt = 0; attempt < MAX_ATTEMPTS && !succeeded; attempt++) {
      try {
        await attemptUpsert();
        succeeded = true;
      } catch (err) {
        const isP2002 =
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002';
        if (!isP2002) {
          // Non-collision error — abort, no retry
          finalErr = err;
          break;
        }
        const target = (err.meta?.target as string[] | undefined) ?? [];
        const toNull = target.filter(
          (t) => nullableCols.has(t) && !nulledFields.includes(t),
        );
        if (toNull.length === 0) {
          // Nothing more we can null — give up
          finalErr = err;
          break;
        }
        for (const col of toNull) {
          if (col === 'no_hp') {
            created.noHp = null;
            updateData.noHp = null;
          } else if (col === 'email') {
            created.email = null;
            updateData.email = null;
          }
          nulledFields.push(col);
        }
      }
    }

    if (succeeded) {
      if (nulledFields.length > 0) {
        report.collisionsNulled++;
        report.warnings.push({
          legacyId: u.ID,
          name: mapped.create.namaLengkap,
          warnings: [
            `Unique collision — nulled: ${nulledFields.join(', ')} (duplikat dengan Jemaat lain)`,
          ],
        });
      }
    } else {
      report.errors++;
      const msg = finalErr instanceof Error ? finalErr.message : String(finalErr);
      report.errorDetails.push({
        legacyId: u.ID,
        name: mapped.create.namaLengkap,
        error: msg,
      });
      console.warn(
        `[${tenant.slug}]   error ID=${u.ID} "${mapped.create.namaLengkap}": ${msg}`,
      );
    }

    // Progress log per 500 records (reduce noise di dataset besar)
    if (report.processed % 500 === 0) {
      const mode = opts.commit ? 'commit' : 'dry';
      console.log(
        `[${tenant.slug}]   ${mode} progress: ${report.processed}/${toProcess.length} (created=${report.created}, updated=${report.updated}, nulled=${report.collisionsNulled}, err=${report.errors})`,
      );
    }
  }

  report.durationMs = Date.now() - startedAt;
  const mode = opts.commit ? 'COMMIT' : 'DRY-RUN';
  console.log(
    `[${tenant.slug}] ${mode} done: processed=${report.processed}/${report.fetched}, ` +
      `created=${report.created}, updated=${report.updated}, collisions_nulled=${report.collisionsNulled}, ` +
      `skipped_no_name=${report.skippedNoName}, errors=${report.errors}, ` +
      `warnings=${report.warnings.length}, took=${(report.durationMs / 1000).toFixed(1)}s`,
  );
  return report;
}

// ============================================================
// Main
// ============================================================
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const mode = args.commit ? 'COMMIT (WRITE)' : 'DRY-RUN (no write)';
  console.log(`\n=== SHIFTSOFT MIGRATION — ${mode} ===`);
  if (args.limit) console.log(`Limit: ${args.limit} records per tenant`);

  const tenants: TenantConfig[] = args.all
    ? TENANTS
    : [getTenant(args.slug!)];

  const reports: TenantReport[] = [];
  for (const tenant of tenants) {
    try {
      const r = await migrateTenant(tenant, {
        commit: args.commit,
        limit: args.limit,
      });
      reports.push(r);
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
      'processed'.padStart(12) +
      'created'.padStart(10) +
      'updated'.padStart(10) +
      'nulled'.padStart(10) +
      'skipped'.padStart(10) +
      'errors'.padStart(10) +
      'warns'.padStart(8),
  );
  for (const r of reports) {
    console.log(
      r.slug.padEnd(20) +
        String(r.fetched).padStart(10) +
        String(r.processed).padStart(12) +
        String(r.created).padStart(10) +
        String(r.updated).padStart(10) +
        String(r.collisionsNulled).padStart(10) +
        String(r.skippedNoName).padStart(10) +
        String(r.errors).padStart(10) +
        String(r.warnings.length).padStart(8),
    );
  }
  const totals = reports.reduce(
    (acc, r) => ({
      fetched: acc.fetched + r.fetched,
      processed: acc.processed + r.processed,
      created: acc.created + r.created,
      updated: acc.updated + r.updated,
      nulled: acc.nulled + r.collisionsNulled,
      skipped: acc.skipped + r.skippedNoName,
      errors: acc.errors + r.errors,
      warnings: acc.warnings + r.warnings.length,
    }),
    { fetched: 0, processed: 0, created: 0, updated: 0, nulled: 0, skipped: 0, errors: 0, warnings: 0 },
  );
  console.log(
    'TOTAL'.padEnd(20) +
      String(totals.fetched).padStart(10) +
      String(totals.processed).padStart(12) +
      String(totals.created).padStart(10) +
      String(totals.updated).padStart(10) +
      String(totals.nulled).padStart(10) +
      String(totals.skipped).padStart(10) +
      String(totals.errors).padStart(10) +
      String(totals.warnings).padStart(8),
  );

  // Persist full report ke /tmp
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = `/tmp/shiftsoft-migration-${ts}.json`;
  await writeFile(reportPath, JSON.stringify({ mode, args, reports }, null, 2));
  console.log(`\nFull report: ${reportPath}`);

  if (!args.commit) {
    console.log(
      '\nDry-run selesai. Rerun dengan --commit untuk actually write ke DB.',
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
