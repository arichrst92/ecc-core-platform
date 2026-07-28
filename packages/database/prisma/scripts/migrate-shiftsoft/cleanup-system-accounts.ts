/**
 * Cleanup existing system accounts di ECC Jemaat table.
 *
 * Deactivate (isActive=false + deactivationReason) jemaat yang match pattern
 * di exclude-patterns.ts. Read-only preview default, --commit untuk actual.
 *
 * Recovery: kalau salah deactivate, cukup toggle isActive=true di portal.
 * Data record TIDAK dihapus.
 *
 * USAGE:
 *   # Preview (default — no write)
 *   pnpm --filter @ecc/database exec dotenv -e ../../.env -- \
 *     tsx prisma/scripts/migrate-shiftsoft/cleanup-system-accounts.ts
 *
 *   # Actual commit
 *   pnpm --filter @ecc/database exec dotenv -e ../../.env -- \
 *     tsx prisma/scripts/migrate-shiftsoft/cleanup-system-accounts.ts --commit
 */
import { PrismaClient } from '@prisma/client';
import {
  EXCLUDE_EXACT_NAMES,
  EXCLUDE_PATTERNS,
  shouldExclude,
} from './exclude-patterns.js';

const prisma = new PrismaClient();

async function main() {
  const commit = process.argv.includes('--commit');
  const mode = commit ? 'COMMIT (WRITE)' : 'PREVIEW (no write)';
  console.log(`=== Cleanup System Accounts — ${mode} ===\n`);

  // Fetch semua migrate jemaat yang aktif (skip yg sudah deactivated)
  const jemaats = await prisma.jemaat.findMany({
    where: {
      legacyShiftsoftId: { not: null },
      isActive: true,
    },
    select: {
      id: true,
      namaLengkap: true,
      legacyShiftsoftId: true,
      cabang: { select: { nama: true } },
    },
    orderBy: { namaLengkap: 'asc' },
  });

  console.log(`Total legacy jemaat active: ${jemaats.length}\n`);

  const toDeactivate: Array<{
    id: string;
    namaLengkap: string;
    legacyShiftsoftId: number | null;
    cabang: string;
    reason: string;
  }> = [];

  for (const j of jemaats) {
    const check = shouldExclude(j.namaLengkap);
    if (check.exclude) {
      toDeactivate.push({
        id: j.id,
        namaLengkap: j.namaLengkap,
        legacyShiftsoftId: j.legacyShiftsoftId,
        cabang: j.cabang.nama,
        reason: check.reason ?? 'excluded',
      });
    }
  }

  if (toDeactivate.length === 0) {
    console.log('✅ No system accounts detected. Nothing to deactivate.');
    return;
  }

  console.log(`Would deactivate ${toDeactivate.length} records:\n`);
  console.log(
    'legacyId'.padEnd(12) +
      'cabang'.padEnd(22) +
      'nama'.padEnd(45) +
      'reason',
  );
  console.log('-'.repeat(120));
  for (const d of toDeactivate) {
    console.log(
      String(d.legacyShiftsoftId ?? '-').padEnd(12) +
        d.cabang.padEnd(22).slice(0, 22) +
        d.namaLengkap.padEnd(45).slice(0, 45) +
        d.reason,
    );
  }

  if (!commit) {
    console.log(
      `\nDRY-RUN. Rerun dengan --commit untuk actually deactivate ${toDeactivate.length} records.`,
    );
    return;
  }

  console.log(`\n=== Executing deactivate ... ===`);
  const now = new Date();
  let updated = 0;
  for (const d of toDeactivate) {
    try {
      await prisma.jemaat.update({
        where: { id: d.id },
        data: {
          isActive: false,
          deactivatedAt: now,
          deactivationReason: `[shiftsoft-cleanup] ${d.reason}`,
        },
      });
      updated++;
    } catch (err) {
      console.error(
        `  error deactivating ${d.namaLengkap} (${d.id}): ${(err as Error).message}`,
      );
    }
  }
  console.log(`\n✅ Deactivated ${updated}/${toDeactivate.length} records`);
  console.log(
    'Records tetap di DB (isActive=false). Restore via portal kalau perlu.',
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
