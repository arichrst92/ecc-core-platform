/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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
  const rolesData = [
    {
      nama: 'Jemaat',
      deskripsi: 'Anggota jemaat reguler',
      subRoles: [
        { nama: 'New Comers', deskripsi: 'Jemaat baru yang masih dalam pembinaan awal', statuses: [] },
        { nama: 'Jemaat Tetap', deskripsi: 'Jemaat aktif yang sudah terintegrasi', statuses: [] },
      ],
    },
    {
      nama: 'Fulltimer',
      deskripsi: 'Hamba Tuhan / staf penuh waktu',
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
      update: { deskripsi: roleData.deskripsi },
      create: { nama: roleData.nama, deskripsi: roleData.deskripsi },
    });
    console.log(`  ✔ Role: ${role.nama}`);

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

  console.log('✅ Seed selesai.');
}

main()
  .catch((e) => {
    console.error('❌ Seed gagal:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
