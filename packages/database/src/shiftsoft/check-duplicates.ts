/**
 * Duplicate detector — validation script setelah migrate-shiftsoft.
 *
 * Cek 6 kategori potential duplicate:
 * 1. legacyShiftsoftId collision (should be 0 — enforced by UNIQUE index)
 * 2. noHp collision (should be 0 — enforced by UNIQUE index)
 * 3. email collision (should be 0 — enforced by UNIQUE index)
 * 4. Nama lengkap EXACT match dalam SAME cabang (kemungkinan duplicate person)
 * 5. Nama + tanggalLahir match CROSS cabang (kemungkinan orang yg sama
 *    ter-import di 2 tenant Shiftsoft berbeda — mis. admin cross-cabang)
 * 6. Dirty nama (1-2 huruf, angka, generic) — data quality issue
 *
 * Semua ke-detect PRINT ke stdout + save ke /tmp/duplicate-check-<ts>.json
 * untuk detailed audit.
 *
 * Read-only — TIDAK menghapus atau merge. Manual review + fix di portal.
 *
 * USAGE:
 *   pnpm --filter @ecc/database exec dotenv -e ../../.env -- \
 *     tsx prisma/scripts/migrate-shiftsoft/check-duplicates.ts
 */
import { writeFile } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface DuplicateGroup<T = unknown> {
  key: string;
  count: number;
  records: T[];
}

interface Report {
  timestamp: string;
  totalJemaat: number;
  totalMigrated: number;
  categories: {
    legacyIdCollision: DuplicateGroup[];
    noHpCollision: DuplicateGroup[];
    emailCollision: DuplicateGroup[];
    namaExactSameCabang: DuplicateGroup[];
    namaBirthdayCrossCabang: DuplicateGroup[];
    dirtyNames: Array<{
      id: string;
      namaLengkap: string;
      cabangNama: string;
      legacyShiftsoftId: number | null;
      reason: string;
    }>;
  };
}

async function main() {
  console.log('=== Duplicate & Data-Quality Check ===\n');

  const totalJemaat = await prisma.jemaat.count();
  const totalMigrated = await prisma.jemaat.count({
    where: { legacyShiftsoftId: { not: null } },
  });
  console.log(`Total Jemaat: ${totalJemaat}`);
  console.log(`From Shiftsoft migrate: ${totalMigrated}`);
  console.log(`Organic (non-legacy): ${totalJemaat - totalMigrated}\n`);

  const report: Report = {
    timestamp: new Date().toISOString(),
    totalJemaat,
    totalMigrated,
    categories: {
      legacyIdCollision: [],
      noHpCollision: [],
      emailCollision: [],
      namaExactSameCabang: [],
      namaBirthdayCrossCabang: [],
      dirtyNames: [],
    },
  };

  // ============================================================
  // 1. legacyShiftsoftId collision (should always be 0)
  // ============================================================
  console.log('[1/6] Checking legacyShiftsoftId collision (UNIQUE — should be 0)...');
  const legacyDupes = await prisma.$queryRaw<
    Array<{ legacy_shiftsoft_id: number; count: bigint }>
  >`
    SELECT legacy_shiftsoft_id, COUNT(*)::bigint as count
    FROM jemaat
    WHERE legacy_shiftsoft_id IS NOT NULL
    GROUP BY legacy_shiftsoft_id
    HAVING COUNT(*) > 1
  `;
  if (legacyDupes.length > 0) {
    console.warn(`  ⚠️  Found ${legacyDupes.length} legacy ID collisions (should not happen!)`);
    for (const d of legacyDupes) {
      const recs = await prisma.jemaat.findMany({
        where: { legacyShiftsoftId: d.legacy_shiftsoft_id },
        select: {
          id: true,
          namaLengkap: true,
          cabang: { select: { nama: true } },
        },
      });
      report.categories.legacyIdCollision.push({
        key: String(d.legacy_shiftsoft_id),
        count: Number(d.count),
        records: recs,
      });
    }
  } else {
    console.log('  ✓ No collision');
  }

  // ============================================================
  // 2. noHp collision (should be 0)
  // ============================================================
  console.log('\n[2/6] Checking noHp collision (UNIQUE — should be 0)...');
  const noHpDupes = await prisma.$queryRaw<
    Array<{ no_hp: string; count: bigint }>
  >`
    SELECT no_hp, COUNT(*)::bigint as count
    FROM jemaat
    WHERE no_hp IS NOT NULL
    GROUP BY no_hp
    HAVING COUNT(*) > 1
  `;
  if (noHpDupes.length > 0) {
    console.warn(`  ⚠️  Found ${noHpDupes.length} noHp collisions`);
    for (const d of noHpDupes.slice(0, 20)) {
      const recs = await prisma.jemaat.findMany({
        where: { noHp: d.no_hp },
        select: {
          id: true,
          namaLengkap: true,
          legacyShiftsoftId: true,
          cabang: { select: { nama: true } },
        },
      });
      report.categories.noHpCollision.push({
        key: d.no_hp,
        count: Number(d.count),
        records: recs,
      });
    }
  } else {
    console.log('  ✓ No collision');
  }

  // ============================================================
  // 3. email collision (should be 0)
  // ============================================================
  console.log('\n[3/6] Checking email collision (UNIQUE — should be 0)...');
  const emailDupes = await prisma.$queryRaw<
    Array<{ email: string; count: bigint }>
  >`
    SELECT email, COUNT(*)::bigint as count
    FROM jemaat
    WHERE email IS NOT NULL
    GROUP BY email
    HAVING COUNT(*) > 1
  `;
  if (emailDupes.length > 0) {
    console.warn(`  ⚠️  Found ${emailDupes.length} email collisions`);
    for (const d of emailDupes.slice(0, 20)) {
      const recs = await prisma.jemaat.findMany({
        where: { email: d.email },
        select: {
          id: true,
          namaLengkap: true,
          legacyShiftsoftId: true,
          cabang: { select: { nama: true } },
        },
      });
      report.categories.emailCollision.push({
        key: d.email,
        count: Number(d.count),
        records: recs,
      });
    }
  } else {
    console.log('  ✓ No collision');
  }

  // ============================================================
  // 4. Nama exact match SAME cabang (kemungkinan dup)
  // ============================================================
  console.log('\n[4/6] Checking nama_lengkap exact match SAME cabang...');
  const namaSameCabang = await prisma.$queryRaw<
    Array<{ nama_lengkap: string; cabang_id: string; count: bigint }>
  >`
    SELECT nama_lengkap, cabang_id, COUNT(*)::bigint as count
    FROM jemaat
    GROUP BY nama_lengkap, cabang_id
    HAVING COUNT(*) > 1
    ORDER BY count DESC
    LIMIT 100
  `;
  if (namaSameCabang.length > 0) {
    console.warn(`  ⚠️  Found ${namaSameCabang.length} nama duplicates (same cabang)`);
    for (const d of namaSameCabang.slice(0, 50)) {
      const recs = await prisma.jemaat.findMany({
        where: { namaLengkap: d.nama_lengkap, cabangId: d.cabang_id },
        select: {
          id: true,
          namaLengkap: true,
          noHp: true,
          email: true,
          tanggalLahir: true,
          legacyShiftsoftId: true,
          cabang: { select: { nama: true } },
        },
      });
      report.categories.namaExactSameCabang.push({
        key: `${d.nama_lengkap} @ ${recs[0]?.cabang.nama ?? '?'}`,
        count: Number(d.count),
        records: recs,
      });
    }
  } else {
    console.log('  ✓ No nama duplicates within same cabang');
  }

  // ============================================================
  // 5. Nama + tanggalLahir CROSS cabang (orang sama di 2 tenant?)
  // ============================================================
  console.log('\n[5/6] Checking nama + tanggalLahir CROSS cabang...');
  const crossCabang = await prisma.$queryRaw<
    Array<{ nama_lengkap: string; tanggal_lahir: Date; count: bigint }>
  >`
    SELECT nama_lengkap, tanggal_lahir, COUNT(DISTINCT cabang_id)::bigint as count
    FROM jemaat
    WHERE tanggal_lahir IS NOT NULL
    GROUP BY nama_lengkap, tanggal_lahir
    HAVING COUNT(DISTINCT cabang_id) > 1
    ORDER BY count DESC
    LIMIT 50
  `;
  if (crossCabang.length > 0) {
    console.warn(
      `  ⚠️  Found ${crossCabang.length} nama+birthday match cross-cabang (likely same person imported twice)`,
    );
    for (const d of crossCabang.slice(0, 30)) {
      const recs = await prisma.jemaat.findMany({
        where: { namaLengkap: d.nama_lengkap, tanggalLahir: d.tanggal_lahir },
        select: {
          id: true,
          namaLengkap: true,
          noHp: true,
          email: true,
          tanggalLahir: true,
          legacyShiftsoftId: true,
          cabang: { select: { nama: true } },
        },
      });
      report.categories.namaBirthdayCrossCabang.push({
        key: `${d.nama_lengkap} (${d.tanggal_lahir?.toISOString().slice(0, 10)})`,
        count: Number(d.count),
        records: recs,
      });
    }
  } else {
    console.log('  ✓ No cross-cabang duplicate detected');
  }

  // ============================================================
  // 6. Dirty nama — suspect data quality (single/short/numeric)
  // ============================================================
  console.log('\n[6/6] Checking dirty nama (data quality)...');
  const suspicious = await prisma.jemaat.findMany({
    where: {
      legacyShiftsoftId: { not: null }, // cuma migrate data
      OR: [
        { namaLengkap: { equals: '-' } },
        { namaLengkap: { equals: '.' } },
        { namaLengkap: { equals: '0' } },
      ],
    },
    select: {
      id: true,
      namaLengkap: true,
      legacyShiftsoftId: true,
      cabang: { select: { nama: true } },
    },
  });
  // Plus check nama < 3 char, numeric only, atau generic single word
  const allMigrated = await prisma.jemaat.findMany({
    where: { legacyShiftsoftId: { not: null } },
    select: {
      id: true,
      namaLengkap: true,
      legacyShiftsoftId: true,
      cabang: { select: { nama: true } },
    },
  });
  for (const j of allMigrated) {
    const trimmed = j.namaLengkap.trim();
    let reason = '';
    if (trimmed.length <= 2) reason = 'nama ≤ 2 karakter';
    else if (/^\d+$/.test(trimmed)) reason = 'nama semua digit';
    else if (/^ECC.*\d{4}$/.test(trimmed)) reason = 'nama pattern placeholder (mis. ECCBANDUNG-0574)';
    if (reason && !suspicious.find((s) => s.id === j.id)) {
      suspicious.push(j);
      report.categories.dirtyNames.push({
        id: j.id,
        namaLengkap: j.namaLengkap,
        cabangNama: j.cabang.nama,
        legacyShiftsoftId: j.legacyShiftsoftId,
        reason,
      });
    }
  }
  // Add fixed-name suspects
  for (const s of suspicious) {
    if (['-', '.', '0'].includes(s.namaLengkap.trim())) {
      report.categories.dirtyNames.push({
        id: s.id,
        namaLengkap: s.namaLengkap,
        cabangNama: s.cabang.nama,
        legacyShiftsoftId: s.legacyShiftsoftId,
        reason: `nama placeholder "${s.namaLengkap.trim()}"`,
      });
    }
  }
  if (report.categories.dirtyNames.length > 0) {
    console.warn(
      `  ⚠️  Found ${report.categories.dirtyNames.length} suspect nama (data quality)`,
    );
    for (const s of report.categories.dirtyNames.slice(0, 20)) {
      console.log(
        `    ID=${s.legacyShiftsoftId} "${s.namaLengkap}" @ ${s.cabangNama} — ${s.reason}`,
      );
    }
  } else {
    console.log('  ✓ No dirty nama detected');
  }

  // ============================================================
  // Summary
  // ============================================================
  console.log('\n=== SUMMARY ===');
  console.log(`Legacy ID collision:     ${report.categories.legacyIdCollision.length}`);
  console.log(`noHp collision:          ${report.categories.noHpCollision.length}`);
  console.log(`email collision:         ${report.categories.emailCollision.length}`);
  console.log(`Nama dup same cabang:    ${report.categories.namaExactSameCabang.length}`);
  console.log(`Nama+bday cross cabang:  ${report.categories.namaBirthdayCrossCabang.length}`);
  console.log(`Dirty nama:              ${report.categories.dirtyNames.length}`);

  const totalIssues =
    report.categories.legacyIdCollision.length +
    report.categories.noHpCollision.length +
    report.categories.emailCollision.length +
    report.categories.namaExactSameCabang.length +
    report.categories.namaBirthdayCrossCabang.length +
    report.categories.dirtyNames.length;

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = `/tmp/duplicate-check-${ts}.json`;
  await writeFile(outPath, JSON.stringify(report, null, 2));
  console.log(`\nDetailed report: ${outPath}`);

  if (totalIssues === 0) {
    console.log('\n✅ CLEAN — safe untuk deploy production');
  } else {
    console.log(`\n⚠️  ${totalIssues} issues detected — review report sebelum production deploy`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
