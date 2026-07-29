/**
 * Helper: seed 1 Sinode + 8 CabangGereja untuk testing migrate-shiftsoft.
 *
 * Idempotent: kalau sudah ada (by nama), skip. Kalau baru, create.
 *
 * Run: pnpm --filter @ecc/database exec tsx prisma/scripts/migrate-shiftsoft/seed-cabang.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Match Sinode dengan nama LIKE 'ECC%' — flexible untuk 'ECC' atau
// 'ECC Indonesia' dari seed.ts baseline.
const SINODE_SEARCH = 'ECC';
const CABANG_LIST: Array<{ nama: string; kode: string }> = [
  { nama: 'ECC Global', kode: 'GLOBAL' },
  { nama: 'ECC Bandung', kode: 'BDG' },
  { nama: 'ECC Jakarta', kode: 'JKT' },
  { nama: 'ECC Bali', kode: 'BAL' },
  { nama: 'ECC Malang', kode: 'MLG' },
  { nama: 'ECC Sydney', kode: 'SYD' },
  { nama: 'ECC Kuala Lumpur', kode: 'KUL' },
  { nama: 'ECC Makassar', kode: 'MKS' },
];

async function main() {
  console.log('=== Seed Sinode + Cabang untuk Shiftsoft migration ===');

  // 1. Ensure Sinode (accept 'ECC' atau 'ECC Indonesia' dari existing seed)
  let sinode = await prisma.sinode.findFirst({
    where: { nama: { startsWith: SINODE_SEARCH, mode: 'insensitive' } },
    orderBy: { createdAt: 'asc' },
  });
  if (!sinode) {
    sinode = await prisma.sinode.create({
      data: { nama: 'ECC', kode: 'ECC', isActive: true },
    });
    console.log(`✓ Created Sinode "${sinode.nama}" (${sinode.id})`);
  } else {
    console.log(`= Sinode "${sinode.nama}" already exists (${sinode.id})`);
  }

  // 2. Ensure each cabang
  for (const c of CABANG_LIST) {
    const existing = await prisma.cabangGereja.findFirst({
      where: {
        sinodeId: sinode.id,
        nama: { equals: c.nama, mode: 'insensitive' },
      },
    });
    if (existing) {
      console.log(`= Cabang "${c.nama}" already exists (${existing.id})`);
      continue;
    }
    const created = await prisma.cabangGereja.create({
      data: {
        sinodeId: sinode.id,
        nama: c.nama,
        kode: c.kode,
        isActive: true,
      },
    });
    console.log(`✓ Created Cabang "${created.nama}" (${created.id})`);
  }

  console.log('\n=== Done. Sekarang bisa run:  ===');
  console.log('pnpm --filter @ecc/database db:migrate-shiftsoft -- --slug=eccbandung --limit=5');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
