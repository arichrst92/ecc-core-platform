/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Seed data awal untuk master klasifikasi yang bersifat GLOBAL
 * (role, sub_role, sub_role_status, kategori_ibadah, tipe_relasi_keluarga).
 *
 * Catatan: contoh dari user — Jemaat (New Comers/Jemaat Tetap),
 * Volunteer (Multimedia/Leader/Member), Fulltimer (Pastoral/Lead Pastor/dst).
 */
async function main() {
  console.log('🌱 Seeding ECC Platform master data...');

  // ---------- ROLE & SUB-ROLE & STATUS ----------
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
      nama: 'Volunteer',
      deskripsi: 'Jemaat yang melayani di tim ministry',
      subRoles: [
        { nama: 'Multimedia', deskripsi: 'Tim audio, video, streaming', statuses: ['Leader', 'Member'] },
        { nama: 'Worship', deskripsi: 'Tim pujian & penyembahan', statuses: ['Leader', 'Member'] },
        { nama: 'Usher', deskripsi: 'Tim sambutan & pelayanan ibadah', statuses: ['Leader', 'Member'] },
        { nama: 'Children Ministry', deskripsi: 'Pelayanan anak', statuses: ['Leader', 'Member'] },
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

  // ---------- KATEGORI IBADAH ----------
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

  // ---------- TIPE RELASI KELUARGA ----------
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
