/**
 * Script untuk update no HP salah satu jemaat existing.
 *
 * Usage (paling sederhana — pilih jemaat pertama otomatis):
 *   pnpm --filter @ecc/database db:update-nohp -- --newNoHp "082115678446"
 *
 * Atau spesifik jemaat:
 *   pnpm --filter @ecc/database db:update-nohp -- \
 *     --newNoHp "082115678446" \
 *     --jemaatId "<uuid>"
 *
 *   pnpm --filter @ecc/database db:update-nohp -- \
 *     --newNoHp "082115678446" \
 *     --name "Ari"          # cari by substring nama (case-insensitive)
 *
 *   pnpm --filter @ecc/database db:update-nohp -- --list
 *     → tampilkan 10 jemaat pertama (untuk pilih ID/nama)
 *
 * Side effects:
 *   - Kalau no HP target sudah dipakai jemaat LAIN → script exit (cegah konflik).
 *   - Kalau jemaat target belum punya role Fulltimer aktif → opsional
 *     auto-assign dengan --assignRole Fulltimer.
 *   - Pastikan User record (auth) ada untuk jemaat tsb supaya bisa login.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function parseArgs(): Record<string, string> {
  const args: Record<string, string> = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        args[key] = next;
        i += 1;
      } else {
        args[key] = 'true';
      }
    }
  }
  return args;
}

async function main() {
  const args = parseArgs();

  // Mode list: tampilkan 10 jemaat pertama
  if (args.list === 'true') {
    const list = await prisma.jemaat.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' },
      take: 10,
      include: { cabang: { select: { nama: true } } },
    });
    console.log(`Top ${list.length} jemaat (oldest first):\n`);
    for (const j of list) {
      console.log(`  ${j.id}`);
      console.log(`    ${j.namaLengkap}  · ${j.noHp ?? '(no HP kosong)'}  · ${j.cabang.nama}`);
    }
    return;
  }

  const newNoHp = args.newNoHp;
  if (!newNoHp) {
    console.error('Required: --newNoHp "0821...". Atau --list untuk lihat daftar jemaat.');
    process.exit(1);
  }

  // 1. Cek konflik: kalau ada jemaat LAIN dengan no HP target
  const conflict = await prisma.jemaat.findUnique({ where: { noHp: newNoHp } });
  if (conflict) {
    console.log(`✔ No HP ${newNoHp} sudah dipakai oleh:`);
    console.log(`  ${conflict.namaLengkap}  (id=${conflict.id})`);
    console.log('Tidak ada perubahan. Pilih jemaat ini langsung kalau ingin login pakai nomor tsb.');
    return;
  }

  // 2. Pilih jemaat target
  let target;
  if (args.jemaatId) {
    target = await prisma.jemaat.findUnique({ where: { id: args.jemaatId } });
    if (!target) {
      console.error(`Jemaat dengan id ${args.jemaatId} tidak ditemukan.`);
      process.exit(1);
    }
  } else if (args.name) {
    target = await prisma.jemaat.findFirst({
      where: {
        namaLengkap: { contains: args.name, mode: 'insensitive' },
        isActive: true,
      },
      orderBy: { createdAt: 'asc' },
    });
    if (!target) {
      console.error(`Tidak ada jemaat aktif yang nama-nya cocok dengan "${args.name}".`);
      process.exit(1);
    }
  } else {
    // Default: jemaat aktif pertama (oldest)
    target = await prisma.jemaat.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!target) {
      console.error('Tidak ada jemaat aktif di DB.');
      process.exit(1);
    }
  }

  console.log(`✔ Jemaat dipilih: ${target.namaLengkap} (id=${target.id})`);
  console.log(`  No HP lama: ${target.noHp ?? '(kosong)'}`);
  console.log(`  No HP baru: ${newNoHp}`);

  // 3. Update no HP
  const updated = await prisma.jemaat.update({
    where: { id: target.id },
    data: { noHp: newNoHp },
  });
  console.log(`✔ No HP berhasil di-update`);

  // 4. Pastikan punya role Fulltimer aktif (kalau --assignRole=Fulltimer)
  const assignRole = args.assignRole ?? 'Fulltimer';
  if (assignRole && assignRole !== 'none') {
    const role = await prisma.role.findUnique({ where: { nama: assignRole } });
    if (!role) {
      console.warn(`⚠ Role "${assignRole}" tidak ditemukan di DB. Skip assign role.`);
    } else {
      const existing = await prisma.jemaatRole.findFirst({
        where: { jemaatId: updated.id, roleId: role.id, isActive: true },
      });
      if (existing) {
        console.log(`✔ Role ${assignRole} sudah aktif untuk jemaat ini.`);
      } else {
        // Ambil SubRole pertama yang ada (Administration kalau ada, atau apapun)
        const subRoleNama = args.subRole ?? 'Administration';
        let subRole = await prisma.subRole.findUnique({
          where: { roleId_nama: { roleId: role.id, nama: subRoleNama } },
        });
        if (!subRole) {
          // Fallback: SubRole pertama di role
          subRole = await prisma.subRole.findFirst({ where: { roleId: role.id } });
        }
        if (!subRole) {
          console.warn(`⚠ Tidak ada SubRole di Role "${assignRole}". Skip assign.`);
        } else {
          const statusNama = args.status ?? 'Staff';
          const status = await prisma.subRoleStatus.findUnique({
            where: { subRoleId_nama: { subRoleId: subRole.id, nama: statusNama } },
          });
          const jr = await prisma.jemaatRole.create({
            data: {
              jemaatId: updated.id,
              roleId: role.id,
              subRoleId: subRole.id,
              subRoleStatusId: status?.id ?? null,
              tanggalMulai: new Date(),
              isActive: true,
            },
          });
          console.log(
            `✔ Role di-assign: ${role.nama}:${subRole.nama}${status ? `:${status.nama}` : ''} (id=${jr.id})`,
          );
        }
      }
    }
  }

  // 5. Pastikan User record (auth) ada
  let user = await prisma.user.findUnique({ where: { jemaatId: updated.id } });
  if (!user) {
    user = await prisma.user.create({ data: { jemaatId: updated.id } });
    console.log(`✔ User record dibuat (id=${user.id})`);
  } else {
    console.log(`✔ User record sudah ada (id=${user.id})`);
  }

  console.log('\n─────────────────────────────────────────');
  console.log(`Selesai. ${updated.namaLengkap} bisa login portal:`);
  console.log(`  No HP : ${updated.noHp}`);
  console.log(`  Kode  : ${updated.kode ?? '(belum di-set; jalankan db:migrate untuk backfill)'}`);
  console.log('─────────────────────────────────────────');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
