/**
 * Seed 3 jemaat test untuk smoke test onboarding wizard M37 mobile.
 *
 * Per request tim mobile di:
 * `ecc-mobile-app/docs/backend-request-seed-onboarding-test-jemaat.md`
 *
 * Idempotent — kalau kode TEST-001/002/003 sudah ada, di-reset ke state
 * initial (untuk regression testing kapan saja).
 *
 * Usage:
 *   pnpm --filter @ecc/database exec dotenv -e ../../.env -- \
 *     tsx prisma/scripts/seed-test-onboarding.ts
 *
 * Optional flags:
 *   --cabang="<nama>"   Nama cabang untuk 3 jemaat test (default: first active).
 *   --email-prefix="X"  Prefix email domain, default 'test-onboarding'.
 *   --noHp="+628XXXXX"  Nomor untuk TEST-002 dan TEST-003. Default random.
 *   --reset             Force reset state (setara delete + create).
 */
import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'node:crypto';

const prisma = new PrismaClient();

function parseArgs(): Record<string, string | boolean> {
  const args: Record<string, string | boolean> = {};
  for (const a of process.argv.slice(2)) {
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      args[k ?? ''] = v ?? true;
    }
  }
  return args;
}

function randomNoHp(): string {
  const digits = randomBytes(6)
    .toString('hex')
    .replace(/\D/g, '')
    .slice(0, 9)
    .padStart(9, '0');
  return `+6281${digits.slice(0, 7)}`;
}

async function main() {
  const args = parseArgs();
  const cabangNama = typeof args.cabang === 'string' ? args.cabang : undefined;
  const emailPrefix =
    typeof args['email-prefix'] === 'string'
      ? (args['email-prefix'] as string)
      : 'test-onboarding';
  const customNoHp = typeof args.noHp === 'string' ? args.noHp : undefined;

  // Resolve cabang target
  const cabang = cabangNama
    ? await prisma.cabangGereja.findFirst({
        where: {
          nama: { contains: cabangNama, mode: 'insensitive' },
          isActive: true,
        },
      })
    : await prisma.cabangGereja.findFirst({
        where: { isActive: true },
        orderBy: { createdAt: 'asc' },
      });
  if (!cabang) {
    console.error(
      cabangNama
        ? `❌ Cabang "${cabangNama}" tidak ditemukan atau nonaktif.`
        : '❌ Tidak ada cabang aktif di DB.',
    );
    process.exit(1);
  }
  console.log(`✔ Cabang target: ${cabang.nama} (${cabang.id})`);

  const noHp2 = customNoHp ?? randomNoHp();
  const noHp3 = customNoHp ?? randomNoHp();

  const jemaatSpecs = [
    {
      kode: 'TEST-001',
      namaLengkap: 'Test User Onboarding Full',
      email: `${emailPrefix}-1@ide.asia`,
      noHp: null,
      jenisKelamin: null,
      tanggalLahir: null,
      onboardedAt: null,
      legacyShiftsoftId: null as number | null,
      description:
        'Full onboarding — missingNoHp + missingProfile (jenisKelamin + tanggalLahir)',
    },
    {
      kode: 'TEST-002',
      namaLengkap: 'Test User Onboarding Profile',
      email: `${emailPrefix}-2@ide.asia`,
      noHp: noHp2,
      jenisKelamin: null,
      tanggalLahir: null,
      onboardedAt: null,
      legacyShiftsoftId: null,
      description: 'Missing profile only — noHp sudah ada, skip add-phone step',
    },
    {
      kode: 'TEST-003',
      namaLengkap: 'Test User Sudah Onboarded',
      email: `${emailPrefix}-3@ide.asia`,
      noHp: noHp3,
      jenisKelamin: 'L' as const,
      tanggalLahir: new Date('1990-01-01'),
      onboardedAt: new Date(),
      legacyShiftsoftId: null,
      description: 'Control — sudah onboarded, wizard skip',
    },
  ];

  const results: { kode: string; id: string; action: 'CREATED' | 'RESET' }[] = [];

  for (const spec of jemaatSpecs) {
    const existing = await prisma.jemaat.findUnique({
      where: { kode: spec.kode },
      select: { id: true },
    });

    const payload = {
      cabangId: cabang.id,
      namaLengkap: spec.namaLengkap,
      email: spec.email,
      noHp: spec.noHp,
      jenisKelamin: spec.jenisKelamin,
      tanggalLahir: spec.tanggalLahir,
      onboardedAt: spec.onboardedAt,
      isActive: true,
    };

    if (existing) {
      // Idempotent reset — untuk regression testing berulang.
      await prisma.jemaat.update({
        where: { id: existing.id },
        data: payload,
      });
      // Sekaligus bersihkan magic link token lama supaya test fresh.
      await prisma.magicLinkToken.deleteMany({
        where: { jemaatId: existing.id },
      });
      results.push({ kode: spec.kode, id: existing.id, action: 'RESET' });
      console.log(`↻ RESET ${spec.kode} (${spec.description})`);
    } else {
      const created = await prisma.jemaat.create({
        data: {
          kode: spec.kode,
          tanggalBergabung: new Date(),
          ...payload,
        },
      });
      // Pastikan ada User row untuk auth login.
      await prisma.user.upsert({
        where: { jemaatId: created.id },
        create: { jemaatId: created.id },
        update: {},
      });
      results.push({ kode: spec.kode, id: created.id, action: 'CREATED' });
      console.log(`✔ CREATED ${spec.kode} (${spec.description})`);
    }
  }

  console.log('\n─────────────────────────────────────────');
  console.log('SEED TEST ONBOARDING — DONE');
  console.log('─────────────────────────────────────────');
  console.table(results);
  console.log('\n📧 Emails:');
  console.log(`  - ${emailPrefix}-1@ide.asia (TEST-001, full onboarding)`);
  console.log(`  - ${emailPrefix}-2@ide.asia (TEST-002, missing profile only)`);
  console.log(`  - ${emailPrefix}-3@ide.asia (TEST-003, sudah onboarded)`);
  console.log(`\n📞 noHp assigned:`);
  console.log(`  - TEST-002: ${noHp2}`);
  console.log(`  - TEST-003: ${noHp3}`);
  console.log(`\n🏛️  Cabang: ${cabang.nama} (${cabang.id})`);
  console.log('\nNext steps untuk mobile team:');
  console.log('  1. Request magic link ke email TEST-001 → verify wizard trigger');
  console.log('  2. Complete full onboarding flow → verify onboardedAt di-set');
  console.log('  3. Retest — jalanin script ini lagi untuk reset state');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
