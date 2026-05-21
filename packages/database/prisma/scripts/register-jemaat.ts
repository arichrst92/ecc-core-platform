/**
 * Script untuk register jemaat baru langsung ke DB (idempotent).
 *
 * Usage:
 *   pnpm --filter @ecc/database tsx prisma/scripts/register-jemaat.ts \
 *     --noHp +6282115678446 \
 *     --nama "Ari Christian" \
 *     --role Fulltimer \
 *     --subRole Administration \
 *     --status Staff \
 *     [--cabang "Nama Cabang"]
 *
 * Kalau --cabang tidak diisi, akan pakai cabang pertama yang aktif.
 *
 * Idempotent: kalau jemaat dengan noHp sudah ada, akan update + assign role.
 * Kalau JemaatRole untuk (jemaat, role, subRole) sudah ada, tidak duplicate.
 */
import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'node:crypto';

const prisma = new PrismaClient();

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateKode(length = 8): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i]! % ALPHABET.length];
  }
  return out;
}

async function generateUniqueKodeJemaat(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const kode = generateKode();
    const existing = await prisma.jemaat.findUnique({ where: { kode } });
    if (!existing) return kode;
  }
  throw new Error('Tidak bisa generate kode jemaat unik');
}

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
  const noHp = args.noHp;
  const nama = args.nama;
  const roleNama = args.role ?? 'Fulltimer';
  const subRoleNama = args.subRole ?? 'Administration';
  const statusNama = args.status ?? 'Staff';
  const cabangNama = args.cabang;

  if (!noHp || !nama) {
    console.error('Usage: --noHp +62XXX --nama "Nama Lengkap" [--role Fulltimer] [--subRole Administration] [--status Staff] [--cabang "Nama"]');
    process.exit(1);
  }

  // 1. Resolve cabang
  const cabang = cabangNama
    ? await prisma.cabangGereja.findFirst({
        where: { nama: { contains: cabangNama, mode: 'insensitive' }, isActive: true },
      })
    : await prisma.cabangGereja.findFirst({
        where: { isActive: true },
        orderBy: { createdAt: 'asc' },
      });
  if (!cabang) {
    console.error(
      cabangNama
        ? `Cabang "${cabangNama}" tidak ditemukan. Pastikan cabang sudah di-seed.`
        : 'Tidak ada cabang aktif di DB. Tambah cabang dulu (lewat seed atau portal).',
    );
    process.exit(1);
  }
  console.log(`✔ Cabang: ${cabang.nama}`);

  // 2. Resolve Role + SubRole + Status (optional)
  const role = await prisma.role.findUnique({ where: { nama: roleNama } });
  if (!role) {
    console.error(`Role "${roleNama}" tidak ditemukan. Jalankan seed dulu (pnpm db:seed).`);
    process.exit(1);
  }
  const subRole = await prisma.subRole.findUnique({
    where: { roleId_nama: { roleId: role.id, nama: subRoleNama } },
  });
  if (!subRole) {
    console.error(`SubRole "${roleNama}:${subRoleNama}" tidak ditemukan.`);
    process.exit(1);
  }
  let subRoleStatusId: string | undefined;
  if (statusNama && statusNama !== 'none') {
    const status = await prisma.subRoleStatus.findUnique({
      where: { subRoleId_nama: { subRoleId: subRole.id, nama: statusNama } },
    });
    if (status) {
      subRoleStatusId = status.id;
      console.log(`✔ Status: ${roleNama}:${subRoleNama}:${status.nama}`);
    } else {
      console.warn(`⚠ Status "${statusNama}" tidak ada di subRole ${subRoleNama}. Skip status.`);
    }
  }
  console.log(`✔ Role: ${role.nama} / SubRole: ${subRole.nama}`);

  // 3. Upsert Jemaat by noHp (unique)
  let jemaat = await prisma.jemaat.findUnique({ where: { noHp } });
  if (jemaat) {
    console.log(`✔ Jemaat sudah ada: ${jemaat.namaLengkap} (id=${jemaat.id})`);
    // Update nama kalau berbeda
    if (jemaat.namaLengkap !== nama) {
      jemaat = await prisma.jemaat.update({
        where: { id: jemaat.id },
        data: { namaLengkap: nama },
      });
      console.log(`  ↳ Nama di-update ke "${nama}"`);
    }
    // Backfill kode kalau null
    if (!jemaat.kode) {
      const kode = await generateUniqueKodeJemaat();
      jemaat = await prisma.jemaat.update({ where: { id: jemaat.id }, data: { kode } });
      console.log(`  ↳ Kode di-set: ${kode}`);
    }
  } else {
    const kode = await generateUniqueKodeJemaat();
    jemaat = await prisma.jemaat.create({
      data: {
        namaLengkap: nama,
        noHp,
        kode,
        cabangId: cabang.id,
        isActive: true,
      },
    });
    console.log(`✔ Jemaat dibuat: ${jemaat.namaLengkap} (id=${jemaat.id}, kode=${jemaat.kode})`);
  }

  // 4. Upsert JemaatRole (idempotent — cek apakah sudah ada role aktif yang sama)
  const existingRole = await prisma.jemaatRole.findFirst({
    where: {
      jemaatId: jemaat.id,
      roleId: role.id,
      subRoleId: subRole.id,
      isActive: true,
    },
  });
  if (existingRole) {
    console.log(`✔ JemaatRole sudah ada: ${role.nama}:${subRole.nama} (id=${existingRole.id})`);
    // Update status kalau berbeda
    if (subRoleStatusId && existingRole.subRoleStatusId !== subRoleStatusId) {
      await prisma.jemaatRole.update({
        where: { id: existingRole.id },
        data: { subRoleStatusId },
      });
      console.log(`  ↳ Status di-update ke "${statusNama}"`);
    }
  } else {
    const jr = await prisma.jemaatRole.create({
      data: {
        jemaatId: jemaat.id,
        roleId: role.id,
        subRoleId: subRole.id,
        subRoleStatusId: subRoleStatusId ?? null,
        tanggalMulai: new Date(),
        isActive: true,
      },
    });
    console.log(`✔ JemaatRole dibuat: ${role.nama}:${subRole.nama}${statusNama ? `:${statusNama}` : ''} (id=${jr.id})`);
  }

  // 5. Pastikan User record ada (untuk login). Buat kalau belum.
  let user = await prisma.user.findUnique({ where: { jemaatId: jemaat.id } });
  if (!user) {
    user = await prisma.user.create({ data: { jemaatId: jemaat.id } });
    console.log(`✔ User record dibuat (id=${user.id})`);
  } else {
    console.log(`✔ User record sudah ada (id=${user.id})`);
  }

  console.log('\n─────────────────────────────────────────');
  console.log(`Selesai. ${jemaat.namaLengkap} bisa login portal:`);
  console.log(`  No HP : ${jemaat.noHp}`);
  console.log(`  Kode  : ${jemaat.kode}`);
  console.log(`  Cabang: ${cabang.nama}`);
  console.log(`  Role  : ${role.nama}:${subRole.nama}${statusNama ? `:${statusNama}` : ''}`);
  console.log('─────────────────────────────────────────');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
