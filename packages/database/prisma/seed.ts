/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'node:crypto';

const prisma = new PrismaClient();

// ============== Helpers ==============

const KODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateKode(length = 8): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += KODE_ALPHABET[bytes[i]! % KODE_ALPHABET.length];
  }
  return out;
}

async function generateUniqueKodeJemaat(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const kode = generateKode();
    if (!(await prisma.jemaat.findUnique({ where: { kode } }))) return kode;
  }
  throw new Error('Tidak bisa generate kode jemaat unik');
}

/**
 * Resolve email yang aman dipakai untuk jemaat target. Kalau email sudah
 * dipakai jemaat LAIN (yang bukan target), return undefined supaya seed tidak
 * crash karena unique constraint email. Skenario umum: duplikat Ari Christian
 * dari seed lama (noHp format berbeda) yang sudah pakai email.
 */
async function safeEmailFor(email: string | undefined, targetId: string | null): Promise<string | undefined> {
  if (!email) return undefined;
  const other = await prisma.jemaat.findFirst({
    where: { email, ...(targetId ? { id: { not: targetId } } : {}) },
    select: { id: true, namaLengkap: true, noHp: true },
  });
  if (other) {
    console.warn(
      `  ⚠ Email ${email} sudah dipakai oleh jemaat lain (${other.namaLengkap}, noHp=${other.noHp}). Skip set email.`,
    );
    return undefined;
  }
  return email;
}

async function ensureJemaat(input: {
  noHp: string;
  namaLengkap: string;
  email?: string;
  jenisKelamin?: 'L' | 'P';
  tanggalLahir?: Date;
  tanggalBergabung?: Date;
  alamat?: string;
  cabangId: string;
}) {
  let j = await prisma.jemaat.findUnique({ where: { noHp: input.noHp } });
  if (j) {
    const safeEmail = await safeEmailFor(input.email, j.id);
    // Update field-field non-unique kalau berbeda; jangan ubah noHp / kode.
    const needUpdate =
      j.namaLengkap !== input.namaLengkap ||
      (safeEmail && j.email !== safeEmail) ||
      (input.jenisKelamin && j.jenisKelamin !== input.jenisKelamin);
    if (needUpdate) {
      j = await prisma.jemaat.update({
        where: { id: j.id },
        data: {
          namaLengkap: input.namaLengkap,
          email: safeEmail ?? j.email,
          jenisKelamin: input.jenisKelamin ?? j.jenisKelamin,
        },
      });
    }
    // Backfill kode kalau null
    if (!j.kode) {
      const kode = await generateUniqueKodeJemaat();
      j = await prisma.jemaat.update({ where: { id: j.id }, data: { kode } });
    }
    return j;
  }
  const kode = await generateUniqueKodeJemaat();
  const safeEmail = await safeEmailFor(input.email, null);
  return prisma.jemaat.create({
    data: {
      noHp: input.noHp,
      namaLengkap: input.namaLengkap,
      email: safeEmail,
      jenisKelamin: input.jenisKelamin,
      tanggalLahir: input.tanggalLahir,
      tanggalBergabung: input.tanggalBergabung ?? new Date(),
      alamat: input.alamat,
      cabangId: input.cabangId,
      kode,
      isActive: true,
    },
  });
}

async function ensureJemaatRole(opts: {
  jemaatId: string;
  roleNama: string;
  subRoleNama: string;
  statusNama?: string;
}) {
  const role = await prisma.role.findUnique({ where: { nama: opts.roleNama } });
  if (!role) throw new Error(`Role ${opts.roleNama} tidak ditemukan`);
  const subRole = await prisma.subRole.findUnique({
    where: { roleId_nama: { roleId: role.id, nama: opts.subRoleNama } },
  });
  if (!subRole) throw new Error(`SubRole ${opts.roleNama}:${opts.subRoleNama} tidak ditemukan`);
  const statusId = opts.statusNama
    ? (
        await prisma.subRoleStatus.findUnique({
          where: { subRoleId_nama: { subRoleId: subRole.id, nama: opts.statusNama } },
        })
      )?.id ?? null
    : null;

  const existing = await prisma.jemaatRole.findFirst({
    where: { jemaatId: opts.jemaatId, roleId: role.id, subRoleId: subRole.id, isActive: true },
  });
  if (existing) {
    if (statusId && existing.subRoleStatusId !== statusId) {
      await prisma.jemaatRole.update({
        where: { id: existing.id },
        data: { subRoleStatusId: statusId },
      });
    }
    return existing;
  }
  return prisma.jemaatRole.create({
    data: {
      jemaatId: opts.jemaatId,
      roleId: role.id,
      subRoleId: subRole.id,
      subRoleStatusId: statusId,
      tanggalMulai: new Date(),
      isActive: true,
    },
  });
}

async function ensureUserFor(jemaatId: string) {
  const existing = await prisma.user.findUnique({ where: { jemaatId } });
  if (existing) return existing;
  return prisma.user.create({ data: { jemaatId } });
}

/**
 * Seed data awal untuk master klasifikasi yang bersifat GLOBAL.
 *
 * Cluster yang di-seed:
 *   - role / sub_role / sub_role_status — klasifikasi keanggotaan
 *     (Jemaat & Fulltimer saja — Volunteer dipindah ke cluster Pelayanan)
 *   - kategori_ibadah
 *   - tipe_relasi_keluarga
 *   - pelayanan + pelayanan_role — tim ministry operasional
 */
async function main() {
  console.log('🌱 Seeding ECC Platform master data...');

  // ============== ROLE & SUB-ROLE & STATUS ==============
  // Catatan: Volunteer di-pindah ke cluster Pelayanan (tabel pelayanan).
  // Role/sub_role/status sekarang hanya untuk klasifikasi keanggotaan.
  //
  // canAccessPortal di-set di seed (bukan hanya migration backfill) supaya
  // tetap benar walaupun seed di-run setelah migrate-reset.
  const rolesData = [
    {
      nama: 'Jemaat',
      deskripsi: 'Anggota jemaat reguler',
      canAccessPortal: false,
      subRoles: [
        { nama: 'New Comers', deskripsi: 'Jemaat baru yang masih dalam pembinaan awal', statuses: [] },
        { nama: 'Jemaat Tetap', deskripsi: 'Jemaat aktif yang sudah terintegrasi', statuses: [] },
      ],
    },
    {
      nama: 'Fulltimer',
      deskripsi: 'Hamba Tuhan / staf penuh waktu',
      canAccessPortal: true,
      subRoles: [
        {
          nama: 'Pastoral',
          deskripsi: 'Jabatan kependetaan',
          statuses: ['Lead Pastor', 'Associate Pastor', 'Children Pastor', 'Teens Pastor', 'Youth Pastor'],
        },
        {
          nama: 'Administration',
          deskripsi: 'Staf administrasi & operasional',
          statuses: ['Head of Admin', 'Staff'],
        },
      ],
    },
  ];

  for (const roleData of rolesData) {
    const role = await prisma.role.upsert({
      where: { nama: roleData.nama },
      update: { deskripsi: roleData.deskripsi, canAccessPortal: roleData.canAccessPortal },
      create: {
        nama: roleData.nama,
        deskripsi: roleData.deskripsi,
        canAccessPortal: roleData.canAccessPortal,
      },
    });
    console.log(`  ✔ Role: ${role.nama} (portal=${role.canAccessPortal})`);

    for (const sr of roleData.subRoles) {
      const subRole = await prisma.subRole.upsert({
        where: { roleId_nama: { roleId: role.id, nama: sr.nama } },
        update: { deskripsi: sr.deskripsi },
        create: { roleId: role.id, nama: sr.nama, deskripsi: sr.deskripsi },
      });
      console.log(`    ↳ SubRole: ${subRole.nama}`);

      for (const statusNama of sr.statuses) {
        await prisma.subRoleStatus.upsert({
          where: { subRoleId_nama: { subRoleId: subRole.id, nama: statusNama } },
          update: {},
          create: { subRoleId: subRole.id, nama: statusNama },
        });
        console.log(`        ↳ Status: ${statusNama}`);
      }
    }
  }

  // Cleanup: hapus "Volunteer" lama kalau masih ada dari seed sebelumnya
  // (CASCADE akan auto-hapus sub_roles + statuses + jemaat_role terkait)
  const volunteerOld = await prisma.role.findUnique({ where: { nama: 'Volunteer' } });
  if (volunteerOld) {
    console.log('  ⚠️  Removing legacy "Volunteer" role (moved to Pelayanan cluster)...');
    await prisma.role.delete({ where: { id: volunteerOld.id } });
    console.log('  ✔ Legacy Volunteer removed');
  }

  // ============== PELAYANAN (Ministry) ==============
  // Master tim ministry + role spesifik per tim.
  // PelayananRole level: 10=Leader, 5=Co-Leader, 0=Member, -5=Trainee
  const pelayananData = [
    {
      nama: 'Multimedia',
      deskripsi: 'Tim audio, video, streaming, switcher',
      roles: [
        { nama: 'Leader', level: 10, deskripsi: 'Koordinator tim multimedia' },
        { nama: 'Co-Leader', level: 5, deskripsi: 'Wakil koordinator' },
        { nama: 'Camera Operator', level: 0 },
        { nama: 'Sound Engineer', level: 0 },
        { nama: 'Video Switcher', level: 0 },
        { nama: 'Lighting', level: 0 },
        { nama: 'Streaming', level: 0 },
        { nama: 'Trainee', level: -5, deskripsi: 'Sedang dilatih' },
      ],
    },
    {
      nama: 'Worship',
      deskripsi: 'Tim pujian & penyembahan',
      roles: [
        { nama: 'Worship Leader', level: 10 },
        { nama: 'Co-Worship Leader', level: 5 },
        { nama: 'Vocalist', level: 0 },
        { nama: 'Guitarist', level: 0 },
        { nama: 'Keyboardist', level: 0 },
        { nama: 'Bassist', level: 0 },
        { nama: 'Drummer', level: 0 },
        { nama: 'Trainee', level: -5 },
      ],
    },
    {
      nama: 'Usher',
      deskripsi: 'Tim sambutan & pelayanan tata letak ibadah',
      roles: [
        { nama: 'Leader', level: 10 },
        { nama: 'Co-Leader', level: 5 },
        { nama: 'Greeter', level: 0, deskripsi: 'Penyambut di pintu masuk' },
        { nama: 'Seater', level: 0, deskripsi: 'Mengarahkan tempat duduk' },
        { nama: 'Offering Counter', level: 0 },
      ],
    },
    {
      nama: 'Children Ministry',
      deskripsi: 'Pelayanan anak (Sekolah Minggu)',
      roles: [
        { nama: 'Leader', level: 10 },
        { nama: 'Teacher', level: 0 },
        { nama: 'Assistant Teacher', level: 0 },
        { nama: 'Trainee', level: -5 },
      ],
    },
    {
      nama: 'Teens Ministry',
      deskripsi: 'Pelayanan remaja',
      roles: [
        { nama: 'Leader', level: 10 },
        { nama: 'Mentor', level: 0 },
        { nama: 'Assistant', level: 0 },
      ],
    },
    {
      nama: 'Prayer Ministry',
      deskripsi: 'Tim doa & intercessory',
      roles: [
        { nama: 'Leader', level: 10 },
        { nama: 'Prayer Warrior', level: 0 },
      ],
    },
    {
      nama: 'Hospitality',
      deskripsi: 'Tim konsumsi & keramahtamahan',
      roles: [
        { nama: 'Leader', level: 10 },
        { nama: 'Member', level: 0 },
      ],
    },
    {
      nama: 'Penggembalaan',
      deskripsi: 'Tim penggembalaan / pastoral care — homecell, zone, area',
      roles: [
        { nama: 'Pastor', level: 15, deskripsi: 'Gembala sidang / Lead Pastor area' },
        { nama: 'Zone Leader', level: 10, deskripsi: 'PIC HomecellArea — mengkoordinir homecell dalam 1 zone' },
        { nama: 'Homecell Leader', level: 5, deskripsi: 'PIC Homecell — leader cellgroup' },
        { nama: 'Asisten', level: 0, deskripsi: 'Asisten homecell leader' },
      ],
    },
  ];

  for (const p of pelayananData) {
    const pelayanan = await prisma.pelayanan.upsert({
      where: { nama: p.nama },
      update: { deskripsi: p.deskripsi },
      create: { nama: p.nama, deskripsi: p.deskripsi },
    });
    console.log(`  ✔ Pelayanan: ${pelayanan.nama}`);

    for (const r of p.roles) {
      await prisma.pelayananRole.upsert({
        where: { pelayananId_nama: { pelayananId: pelayanan.id, nama: r.nama } },
        update: { level: r.level, deskripsi: r.deskripsi ?? null },
        create: {
          pelayananId: pelayanan.id,
          nama: r.nama,
          level: r.level,
          deskripsi: r.deskripsi ?? null,
        },
      });
      console.log(`    ↳ Role: ${r.nama} (level ${r.level})`);
    }
  }

  // ============== KATEGORI IBADAH ==============
  const kategoriIbadahData = [
    { nama: 'Ibadah Umum', deskripsi: 'Ibadah Minggu pagi/siang/sore untuk umum' },
    { nama: 'Ibadah Doa', deskripsi: 'Ibadah doa bersama' },
    { nama: 'Ibadah Pemuda', deskripsi: 'Ibadah khusus pemuda & remaja' },
    { nama: 'Ibadah Anak', deskripsi: 'Sekolah Minggu untuk anak-anak' },
    { nama: 'Komsel', deskripsi: 'Komunitas Sel / cell group' },
    { nama: 'Persekutuan Kategorial', deskripsi: 'Persekutuan berdasarkan kategori (pria, wanita, profesi)' },
  ];

  for (const k of kategoriIbadahData) {
    await prisma.kategoriIbadah.upsert({
      where: { nama: k.nama },
      update: { deskripsi: k.deskripsi },
      create: k,
    });
    console.log(`  ✔ KategoriIbadah: ${k.nama}`);
  }

  // ============== TIPE RELASI KELUARGA ==============
  const tipeRelasiData = [
    { nama: 'Suami', deskripsi: 'Pasangan suami (untuk istri)' },
    { nama: 'Istri', deskripsi: 'Pasangan istri (untuk suami)' },
    { nama: 'Ayah', deskripsi: 'Orang tua laki-laki' },
    { nama: 'Ibu', deskripsi: 'Orang tua perempuan' },
    { nama: 'Anak Laki-Laki', deskripsi: 'Anak laki-laki' },
    { nama: 'Anak Perempuan', deskripsi: 'Anak perempuan' },
    { nama: 'Saudara Kandung', deskripsi: 'Saudara/saudari kandung' },
    { nama: 'Kakek', deskripsi: 'Orang tua dari ayah/ibu (laki-laki)' },
    { nama: 'Nenek', deskripsi: 'Orang tua dari ayah/ibu (perempuan)' },
    { nama: 'Cucu', deskripsi: 'Anak dari anak' },
    { nama: 'Wali', deskripsi: 'Wali yang bertanggung jawab atas jemaat (non-ortu kandung)' },
  ];

  for (const t of tipeRelasiData) {
    await prisma.tipeRelasiKeluarga.upsert({
      where: { nama: t.nama },
      update: { deskripsi: t.deskripsi },
      create: t,
    });
    console.log(`  ✔ TipeRelasiKeluarga: ${t.nama}`);
  }

  // ============== SINODE & CABANG ==============
  console.log('🏛  Seeding Sinode & Cabang...');
  const sinode = await prisma.sinode.upsert({
    where: { kode: 'ECC' },
    update: { nama: 'ECC Indonesia' },
    create: {
      nama: 'ECC Indonesia',
      kode: 'ECC',
      alamat: 'Jakarta, Indonesia',
      kontak: 'info@eccchurch.global',
    },
  });
  console.log(`  ✔ Sinode: ${sinode.nama}`);

  const cabangData = [
    {
      kode: 'JKT',
      nama: 'ECC Jakarta',
      alamat: 'Jl. Sudirman No. 1, Jakarta',
      latitude: -6.2088,
      longitude: 106.8456,
    },
    {
      kode: 'BDG',
      nama: 'ECC Bandung',
      alamat: 'Jl. Dago No. 50, Bandung',
      latitude: -6.9175,
      longitude: 107.6191,
    },
    {
      kode: 'SBY',
      nama: 'ECC Surabaya',
      alamat: 'Jl. Pemuda No. 12, Surabaya',
      latitude: -7.2575,
      longitude: 112.7521,
    },
  ];
  const cabangMap = new Map<string, string>();
  for (const c of cabangData) {
    const cab = await prisma.cabangGereja.upsert({
      where: { sinodeId_kode: { sinodeId: sinode.id, kode: c.kode } },
      update: {
        nama: c.nama,
        alamat: c.alamat,
        latitude: c.latitude,
        longitude: c.longitude,
      },
      create: {
        sinodeId: sinode.id,
        kode: c.kode,
        nama: c.nama,
        alamat: c.alamat,
        latitude: c.latitude,
        longitude: c.longitude,
      },
    });
    cabangMap.set(c.kode, cab.id);
    console.log(`  ✔ Cabang: ${cab.nama}  (${c.latitude},${c.longitude})`);
  }
  const cabangJkt = cabangMap.get('JKT')!;
  const cabangBdg = cabangMap.get('BDG')!;
  const cabangSby = cabangMap.get('SBY')!;

  // ============== JEMAAT ==============
  console.log('👥 Seeding Jemaat...');
  // Catatan: salah satu jemaat (Ari Christian) di-set dengan no HP
  // "082115678446" sesuai permintaan. Akan di-assign role Fulltimer di
  // langkah berikutnya.
  const jemaatSeed = [
    // Fulltimer (Ari Christian) — login pakai nomor ini.
    // Disimpan dalam format E.164 (sesuai schema noHp validator). FE punya
    // helper normalizePhoneInput yang convert "082115678446" → "+6282115678446"
    // jadi user tetap bisa ketik nomor dengan format lokal di form login.
    {
      key: 'ari',
      noHp: '+6282115678446',
      namaLengkap: 'Ari Christian',
      email: 'ari.christian@eccchurch.global',
      jenisKelamin: 'L' as const,
      tanggalLahir: new Date('1992-04-15'),
      tanggalBergabung: new Date('2020-01-01'),
      alamat: 'Jl. Merdeka No. 10, Jakarta',
      cabangId: cabangJkt,
    },
    // Pastoral (Lead Pastor)
    {
      key: 'pastor-jkt',
      noHp: '+6281100000001',
      namaLengkap: 'Pastor Daniel Wijaya',
      email: 'daniel@eccchurch.global',
      jenisKelamin: 'L' as const,
      tanggalLahir: new Date('1975-08-20'),
      cabangId: cabangJkt,
    },
    {
      key: 'pastor-bdg',
      noHp: '+6281100000002',
      namaLengkap: 'Pastor Yohanes Susanto',
      jenisKelamin: 'L' as const,
      tanggalLahir: new Date('1978-11-03'),
      cabangId: cabangBdg,
    },
    // Zone Leader / Homecell Leader (Penggembalaan)
    {
      key: 'zone-jkt',
      noHp: '+6281100000003',
      namaLengkap: 'Maria Lestari',
      jenisKelamin: 'P' as const,
      tanggalLahir: new Date('1985-03-12'),
      cabangId: cabangJkt,
    },
    {
      key: 'homecell-jkt-1',
      noHp: '+6281100000004',
      namaLengkap: 'Andi Pratama',
      jenisKelamin: 'L' as const,
      tanggalLahir: new Date('1990-06-22'),
      cabangId: cabangJkt,
    },
    {
      key: 'homecell-jkt-2',
      noHp: '+6281100000005',
      namaLengkap: 'Rina Hartanto',
      jenisKelamin: 'P' as const,
      tanggalLahir: new Date('1991-09-17'),
      cabangId: cabangJkt,
    },
    // Jemaat biasa
    {
      key: 'jemaat-1',
      noHp: '+6281100000010',
      namaLengkap: 'Budi Santoso',
      jenisKelamin: 'L' as const,
      tanggalLahir: new Date('1995-02-08'),
      cabangId: cabangJkt,
    },
    {
      key: 'jemaat-2',
      noHp: '+6281100000011',
      namaLengkap: 'Citra Dewi',
      jenisKelamin: 'P' as const,
      tanggalLahir: new Date('1996-10-30'),
      cabangId: cabangJkt,
    },
    {
      key: 'jemaat-3',
      noHp: '+6281100000012',
      namaLengkap: 'Eko Saputra',
      jenisKelamin: 'L' as const,
      tanggalLahir: new Date('1988-12-05'),
      cabangId: cabangBdg,
    },
    {
      key: 'jemaat-4',
      noHp: '+6281100000013',
      namaLengkap: 'Fitri Yuliana',
      jenisKelamin: 'P' as const,
      tanggalLahir: new Date('1993-07-19'),
      cabangId: cabangBdg,
    },
    {
      key: 'jemaat-5',
      noHp: '+6281100000014',
      namaLengkap: 'Gunawan Tan',
      jenisKelamin: 'L' as const,
      tanggalLahir: new Date('1989-04-25'),
      cabangId: cabangSby,
    },
    {
      key: 'jemaat-newcomer',
      noHp: '+6281100000015',
      namaLengkap: 'Hana Permata',
      jenisKelamin: 'P' as const,
      tanggalLahir: new Date('2001-11-11'),
      tanggalBergabung: new Date('2026-04-01'),
      cabangId: cabangJkt,
    },
  ];

  const jemaatMap = new Map<string, string>();
  for (const j of jemaatSeed) {
    const created = await ensureJemaat(j);
    jemaatMap.set(j.key, created.id);
    await ensureUserFor(created.id);
    console.log(`  ✔ Jemaat: ${created.namaLengkap}  (kode=${created.kode})`);
  }

  // ============== JEMAAT ROLE ==============
  console.log('🛡  Seeding JemaatRole...');
  const roleAssignments: Array<{
    key: string;
    roleNama: string;
    subRoleNama: string;
    statusNama?: string;
  }> = [
    // Fulltimer
    { key: 'ari', roleNama: 'Fulltimer', subRoleNama: 'Administration', statusNama: 'Staff' },
    { key: 'pastor-jkt', roleNama: 'Fulltimer', subRoleNama: 'Pastoral', statusNama: 'Lead Pastor' },
    { key: 'pastor-bdg', roleNama: 'Fulltimer', subRoleNama: 'Pastoral', statusNama: 'Lead Pastor' },
    // Jemaat biasa (semua sisa)
    { key: 'zone-jkt', roleNama: 'Jemaat', subRoleNama: 'Jemaat Tetap' },
    { key: 'homecell-jkt-1', roleNama: 'Jemaat', subRoleNama: 'Jemaat Tetap' },
    { key: 'homecell-jkt-2', roleNama: 'Jemaat', subRoleNama: 'Jemaat Tetap' },
    { key: 'jemaat-1', roleNama: 'Jemaat', subRoleNama: 'Jemaat Tetap' },
    { key: 'jemaat-2', roleNama: 'Jemaat', subRoleNama: 'Jemaat Tetap' },
    { key: 'jemaat-3', roleNama: 'Jemaat', subRoleNama: 'Jemaat Tetap' },
    { key: 'jemaat-4', roleNama: 'Jemaat', subRoleNama: 'Jemaat Tetap' },
    { key: 'jemaat-5', roleNama: 'Jemaat', subRoleNama: 'Jemaat Tetap' },
    { key: 'jemaat-newcomer', roleNama: 'Jemaat', subRoleNama: 'New Comers' },
  ];
  for (const ra of roleAssignments) {
    const jemaatId = jemaatMap.get(ra.key);
    if (!jemaatId) continue;
    await ensureJemaatRole({
      jemaatId,
      roleNama: ra.roleNama,
      subRoleNama: ra.subRoleNama,
      statusNama: ra.statusNama,
    });
    console.log(`  ✔ ${ra.key} → ${ra.roleNama}:${ra.subRoleNama}${ra.statusNama ? `:${ra.statusNama}` : ''}`);
  }

  // ============== JEMAAT PELAYANAN (Ministry assignment) ==============
  console.log('🎵 Seeding JemaatPelayanan...');
  async function assignPelayanan(jemaatKey: string, pelayananNama: string, roleNama: string) {
    const jemaatId = jemaatMap.get(jemaatKey);
    if (!jemaatId) return;
    const pelayanan = await prisma.pelayanan.findUnique({ where: { nama: pelayananNama } });
    if (!pelayanan) return;
    const role = await prisma.pelayananRole.findUnique({
      where: { pelayananId_nama: { pelayananId: pelayanan.id, nama: roleNama } },
    });
    if (!role) return;
    const existing = await prisma.jemaatPelayanan.findFirst({
      where: { jemaatId, pelayananId: pelayanan.id, isActive: true },
    });
    if (existing) return;
    await prisma.jemaatPelayanan.create({
      data: {
        jemaatId,
        pelayananId: pelayanan.id,
        pelayananRoleId: role.id,
        tanggalMulai: new Date(),
        isActive: true,
      },
    });
    console.log(`  ✔ ${jemaatKey} → ${pelayananNama}:${roleNama}`);
  }
  await assignPelayanan('zone-jkt', 'Penggembalaan', 'Zone Leader');
  await assignPelayanan('homecell-jkt-1', 'Penggembalaan', 'Homecell Leader');
  await assignPelayanan('homecell-jkt-2', 'Penggembalaan', 'Homecell Leader');
  await assignPelayanan('jemaat-1', 'Worship', 'Vocalist');
  await assignPelayanan('jemaat-2', 'Multimedia', 'Camera Operator');
  await assignPelayanan('jemaat-3', 'Usher', 'Greeter');
  await assignPelayanan('jemaat-4', 'Children Ministry', 'Teacher');
  await assignPelayanan('ari', 'Multimedia', 'Leader');

  // ============== IBADAH ==============
  console.log('⛪ Seeding Ibadah...');
  const katIbadahUmum = await prisma.kategoriIbadah.findUnique({ where: { nama: 'Ibadah Umum' } });
  const katIbadahDoa = await prisma.kategoriIbadah.findUnique({ where: { nama: 'Ibadah Doa' } });
  const katIbadahPemuda = await prisma.kategoriIbadah.findUnique({ where: { nama: 'Ibadah Pemuda' } });
  const ibadahSeed = [
    {
      key: 'ibadah-umum-jkt',
      cabangId: cabangJkt,
      kategoriIbadahId: katIbadahUmum!.id,
      nama: 'Ibadah Minggu Pagi',
      tipeJadwal: 'WEEKLY' as const,
      hari: 'MINGGU' as const,
      tanggalMulai: new Date('2026-01-04'),
      jamMulai: '08:00',
      jamSelesai: '10:00',
      lokasi: 'Aula Utama, ECC Jakarta',
    },
    {
      key: 'ibadah-doa-jkt',
      cabangId: cabangJkt,
      kategoriIbadahId: katIbadahDoa!.id,
      nama: 'Doa Pagi',
      tipeJadwal: 'WEEKLY' as const,
      hari: 'SELASA' as const,
      tanggalMulai: new Date('2026-01-06'),
      jamMulai: '06:00',
      jamSelesai: '07:00',
      lokasi: 'Ruang Doa, ECC Jakarta',
    },
    {
      key: 'ibadah-pemuda-jkt',
      cabangId: cabangJkt,
      kategoriIbadahId: katIbadahPemuda!.id,
      nama: 'Ibadah Pemuda',
      tipeJadwal: 'WEEKLY' as const,
      hari: 'SABTU' as const,
      tanggalMulai: new Date('2026-01-03'),
      jamMulai: '18:30',
      jamSelesai: '20:30',
      lokasi: 'Aula Utama, ECC Jakarta',
    },
    {
      key: 'ibadah-umum-bdg',
      cabangId: cabangBdg,
      kategoriIbadahId: katIbadahUmum!.id,
      nama: 'Ibadah Minggu Pagi',
      tipeJadwal: 'WEEKLY' as const,
      hari: 'MINGGU' as const,
      tanggalMulai: new Date('2026-01-04'),
      jamMulai: '08:30',
      jamSelesai: '10:30',
      lokasi: 'ECC Bandung',
    },
  ];
  const ibadahMap = new Map<string, string>();
  for (const i of ibadahSeed) {
    // Cari berdasarkan (cabangId, nama) — kombinasi unik in praktis.
    const existing = await prisma.ibadah.findFirst({
      where: { cabangId: i.cabangId, nama: i.nama },
    });
    let ib;
    if (existing) {
      ib = existing;
    } else {
      ib = await prisma.ibadah.create({
        data: {
          cabangId: i.cabangId,
          kategoriIbadahId: i.kategoriIbadahId,
          nama: i.nama,
          tipeJadwal: i.tipeJadwal,
          hari: i.hari,
          tanggalMulai: i.tanggalMulai,
          jamMulai: i.jamMulai,
          jamSelesai: i.jamSelesai,
          lokasi: i.lokasi,
          isActive: true,
        },
      });
    }
    ibadahMap.set(i.key, ib.id);
    console.log(`  ✔ Ibadah: ${ib.nama}`);
  }

  // ============== HOMECELL AREA & HOMECELL ==============
  console.log('🏠 Seeding Homecell...');
  // PIC HomecellArea harus jemaat dengan Pelayanan Penggembalaan + role Zone Leader.
  // → 'zone-jkt' (Maria) sudah di-assign di atas.
  const zoneLeaderId = jemaatMap.get('zone-jkt')!;
  const hcArea = await prisma.homecellArea.upsert({
    where: { cabangId_nama: { cabangId: cabangJkt, nama: 'Area Jakarta Pusat' } },
    update: { picJemaatId: zoneLeaderId },
    create: {
      cabangId: cabangJkt,
      nama: 'Area Jakarta Pusat',
      deskripsi: 'Zone homecell Jakarta Pusat',
      picJemaatId: zoneLeaderId,
      isActive: true,
    },
  });
  console.log(`  ✔ HomecellArea: ${hcArea.nama}`);

  // Homecell + PIC Homecell Leader
  const homecellSeed = [
    { nama: 'Homecell Kelapa Gading', picKey: 'homecell-jkt-1' },
    { nama: 'Homecell Menteng', picKey: 'homecell-jkt-2' },
  ];
  const homecellMap = new Map<string, string>();
  for (const h of homecellSeed) {
    const picId = jemaatMap.get(h.picKey)!;
    const existing = await prisma.homecell.findFirst({
      where: { areaId: hcArea.id, nama: h.nama },
    });
    let hc;
    if (existing) {
      hc = await prisma.homecell.update({
        where: { id: existing.id },
        data: { picJemaatId: picId },
      });
    } else {
      hc = await prisma.homecell.create({
        data: { areaId: hcArea.id, nama: h.nama, picJemaatId: picId, isActive: true },
      });
    }
    homecellMap.set(h.nama, hc.id);
    console.log(`  ✔ Homecell: ${hc.nama}`);
  }

  // HomecellMember — assign beberapa jemaat ke homecell
  async function addHomecellMember(homecellNama: string, jemaatKey: string) {
    const homecellId = homecellMap.get(homecellNama);
    const jemaatId = jemaatMap.get(jemaatKey);
    if (!homecellId || !jemaatId) return;
    const existing = await prisma.homecellMember.findFirst({
      where: { homecellId, jemaatId },
    });
    if (existing) return;
    await prisma.homecellMember.create({
      data: { homecellId, jemaatId, isActive: true },
    });
  }
  await addHomecellMember('Homecell Kelapa Gading', 'jemaat-1');
  await addHomecellMember('Homecell Kelapa Gading', 'jemaat-2');
  await addHomecellMember('Homecell Menteng', 'jemaat-newcomer');
  console.log(`  ✔ Anggota homecell di-seed`);

  // ============== EVENT ==============
  console.log('🎉 Seeding Event...');
  // Author harus User. Pakai user dari Ari Christian.
  const ariUser = await prisma.user.findUnique({ where: { jemaatId: jemaatMap.get('ari')! } });
  if (ariUser) {
    const eventSeed = [
      {
        slug: 'penggalangan-dana-pembangunan-2026',
        judul: 'Penggalangan Dana Pembangunan Gedung Baru',
        ringkasan: 'Mari berpartisipasi membangun rumah Tuhan baru.',
        deskripsi:
          'Kami sedang mengumpulkan dana untuk pembangunan gedung gereja baru di Jakarta Pusat. Setiap kontribusi sangat berarti.',
        tanggalMulai: new Date('2026-06-01'),
        tanggalSelesai: new Date('2026-12-31'),
        tipeBayar: 'NOMINAL_BEBAS' as const,
        bankNama: 'BCA',
        bankNomor: '1234567890',
        bankAtasNama: 'Yayasan ECC',
        isPublished: true,
        butuhKehadiran: false,
      },
      {
        slug: 'retreat-pemuda-2026',
        judul: 'Retreat Pemuda 2026',
        ringkasan: 'Retreat 3 hari di Puncak untuk pemuda.',
        deskripsi:
          'Retreat tahunan pemuda — sesi worship, sharing, outbound. Termasuk akomodasi + konsumsi.',
        tanggalMulai: new Date('2026-08-15'),
        tanggalSelesai: new Date('2026-08-17'),
        tipeBayar: 'NOMINAL_TETAP' as const,
        nominal: 750000,
        lokasi: 'Wisma Cibubur, Puncak',
        bankNama: 'BCA',
        bankNomor: '1234567890',
        bankAtasNama: 'Yayasan ECC',
        quotaPeserta: 50,
        isPublished: true,
        butuhKehadiran: true,
        cabangId: cabangJkt,
      },
      {
        slug: 'puasa-21-hari-januari-2026',
        judul: 'Puasa 21 Hari',
        ringkasan: 'Bergabung dalam puasa nasional 21 hari.',
        deskripsi: 'Puasa Daniel selama 21 hari — disertai panduan devosional harian.',
        tanggalMulai: new Date('2026-01-01'),
        tanggalSelesai: new Date('2026-01-21'),
        tipeBayar: 'GRATIS' as const,
        isPublished: true,
        butuhKehadiran: false,
      },
    ];
    for (const e of eventSeed) {
      const existing = await prisma.event.findUnique({ where: { slug: e.slug } });
      if (existing) {
        console.log(`  ✔ Event sudah ada: ${e.judul}`);
        continue;
      }
      await prisma.event.create({
        data: {
          slug: e.slug,
          judul: e.judul,
          ringkasan: e.ringkasan,
          deskripsi: e.deskripsi,
          tanggalMulai: e.tanggalMulai,
          tanggalSelesai: e.tanggalSelesai,
          tipeBayar: e.tipeBayar,
          nominal: 'nominal' in e ? e.nominal : null,
          lokasi: 'lokasi' in e ? e.lokasi : null,
          bankNama: 'bankNama' in e ? e.bankNama : null,
          bankNomor: 'bankNomor' in e ? e.bankNomor : null,
          bankAtasNama: 'bankAtasNama' in e ? e.bankAtasNama : null,
          quotaPeserta: 'quotaPeserta' in e ? e.quotaPeserta : null,
          isPublished: e.isPublished,
          publishedAt: e.isPublished ? new Date() : null,
          butuhKehadiran: e.butuhKehadiran,
          cabangId: 'cabangId' in e ? e.cabangId : null,
          sinodeId: 'cabangId' in e ? sinode.id : null,
          authorId: ariUser.id,
        },
      });
      console.log(`  ✔ Event: ${e.judul}`);
    }
  }

  // ============== KONTEN (News & Renungan) ==============
  console.log('📰 Seeding Konten...');
  if (ariUser) {
    const kontenSeed = [
      {
        tipe: 'NEWS' as const,
        slug: 'jadwal-ibadah-natal-2026',
        judul: 'Jadwal Ibadah Natal 2026',
        ringkasan: 'Ibadah Natal dan Tahun Baru di seluruh cabang ECC.',
        konten: '# Jadwal Ibadah Natal\n\nIbadah Natal di semua cabang akan berlangsung 24 dan 25 Desember 2026.',
        tags: ['natal', 'jadwal'],
        isPublished: true,
      },
      {
        tipe: 'NEWS' as const,
        slug: 'pembukaan-pendaftaran-baptisan',
        judul: 'Pembukaan Pendaftaran Baptisan',
        ringkasan: 'Pendaftaran baptisan dibuka sampai akhir bulan.',
        konten: 'Pendaftaran baptisan dewasa periode Q2 2026 dibuka mulai hari ini.',
        tags: ['baptisan'],
        isPublished: true,
      },
      {
        tipe: 'RENUNGAN' as const,
        slug: 'renungan-pengharapan-baru',
        judul: 'Pengharapan Baru',
        ringkasan: 'Bahkan dalam masa sulit, Tuhan menyediakan pengharapan.',
        konten:
          '## Pengharapan Baru\n\nFirman Tuhan dalam Yeremia 29:11 berbicara tentang rancangan damai sejahtera dari Tuhan...',
        tanggal: new Date('2026-05-19'),
        ayatAlkitab: 'Yeremia 29:11',
        tags: ['pengharapan', 'devosi'],
        isPublished: true,
      },
    ];
    for (const k of kontenSeed) {
      const existing = await prisma.konten.findUnique({ where: { slug: k.slug } });
      if (existing) {
        console.log(`  ✔ Konten sudah ada: ${k.judul}`);
        continue;
      }
      await prisma.konten.create({
        data: {
          tipe: k.tipe,
          slug: k.slug,
          judul: k.judul,
          ringkasan: k.ringkasan,
          konten: k.konten,
          tanggal: 'tanggal' in k ? k.tanggal : null,
          ayatAlkitab: 'ayatAlkitab' in k ? k.ayatAlkitab : null,
          tags: k.tags,
          isPublished: k.isPublished,
          publishedAt: k.isPublished ? new Date() : null,
          authorId: ariUser.id,
        },
      });
      console.log(`  ✔ Konten: ${k.judul}`);
    }
  }

  // ============== ROLE MENU ACCESS ==============
  // Daftar semua menu key (harus sinkron dengan menu-catalog.ts).
  const ALL_MENU_KEYS = [
    'dashboard',
    'sinode',
    'cabang',
    'jemaat',
    'role-jemaat',
    'tipe-relasi',
    'ibadah',
    'kategori-ibadah',
    'pelayanan',
    'kehadiran',
    'homecell-area',
    'homecell',
    'event',
    'news',
    'renungan',
    'api-key',
    'audit-log',
    'role-access',
  ];

  // Fulltimer = full access (read+write+delete) ke SEMUA menu.
  // Di-set di seed (selain migration backfill) supaya tetap berlaku
  // walaupun seed di-run setelah db reset.
  console.log('🔐 Seeding RoleMenuAccess untuk Fulltimer...');
  const fulltimerRole = await prisma.role.findUnique({ where: { nama: 'Fulltimer' } });
  if (fulltimerRole) {
    for (const menuKey of ALL_MENU_KEYS) {
      await prisma.roleMenuAccess.upsert({
        where: { roleId_menuKey: { roleId: fulltimerRole.id, menuKey } },
        update: { canRead: true, canWrite: true, canDelete: true },
        create: { roleId: fulltimerRole.id, menuKey, canRead: true, canWrite: true, canDelete: true },
      });
    }
    console.log(`  ✔ Fulltimer: full access ke ${ALL_MENU_KEYS.length} menu`);
  }

  // Jemaat biasa: read-only ke menu publik.
  console.log('🔐 Seeding RoleMenuAccess untuk Jemaat...');
  const jemaatRole = await prisma.role.findUnique({ where: { nama: 'Jemaat' } });
  if (jemaatRole) {
    // canAccessPortal=false default. Tidak boleh login portal — ubah manual
    // di /dashboard/role-access kalau ingin.
    const jemaatMenuKeys = ['dashboard', 'event', 'news', 'renungan'];
    for (const menuKey of jemaatMenuKeys) {
      await prisma.roleMenuAccess.upsert({
        where: { roleId_menuKey: { roleId: jemaatRole.id, menuKey } },
        update: { canRead: true, canWrite: false, canDelete: false },
        create: { roleId: jemaatRole.id, menuKey, canRead: true, canWrite: false, canDelete: false },
      });
    }
    console.log(`  ✔ Jemaat: read access ke ${jemaatMenuKeys.join(', ')}`);
  }

  console.log('\n✅ Seed selesai.');
  console.log('\n📌 Akun siap login:');
  console.log('  No HP : +6282115678446  (input bisa juga "082115678446" — FE auto-normalize)');
  console.log('  Nama  : Ari Christian');
  console.log('  Role  : Fulltimer:Administration:Staff');
  console.log('  Cabang: ECC Jakarta');
  console.log('\nLogin via OTP WhatsApp ke nomor tersebut.\n');
}

main()
  .catch((e) => {
    console.error('❌ Seed gagal:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
