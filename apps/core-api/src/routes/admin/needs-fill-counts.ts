/**
 * GET /admin/needs-fill-counts — jumlah data penting yang MASIH KOSONG per menu
 * (badge BIRU "Perlu diisi" di menu & grup menu Portal; badge merah = antrian
 * tindakan, lihat pending-counts). Hanya menu yang boleh dibaca pengguna.
 *
 *   pelayanan  pelayanan aktif belum lengkap (peran, anggota, koordinator,
 *              kategori tugas, tugas petugas mendatang, deskripsi)
 *   ibadah     ibadah aktif yang punya petugas tanpa tugas
 *   event      event aktif mendatang tanpa gambar / tanpa rekening & QRIS (berbayar)
 *              / volunteer tanpa tugas
 *   homecell   homecell aktif tanpa PIC atau tanpa lokasi (belum ada / link tak terbaca)
 *   zona       zona aktif tanpa PIC
 *   group      group aktif tanpa PIC
 *   cabang     cabang aktif tanpa titik lokasi / tanpa rekening / rekening tanpa QRIS
 *   ibadah     (juga) ibadah aktif tanpa pelayanan, tanpa petugas, atau online tanpa link
 *
 * Dipanggil Portal tiap beberapa menit (lebih berat dari pending-counts).
 */
import { Router } from 'express';
import { prisma } from '@ecc/database';
import { Unauthorized } from '../../lib/errors.js';
import { resolveJemaatAccess } from '../../lib/menu-access.js';
import { logger } from '../../lib/logger.js';
import { homecellLokasiIssues } from '../../lib/homecell-location.js';
import { tugasKosongItems } from './pelayanan.js';

export const needsFillCountsRouter = Router();

needsFillCountsRouter.get('/', async (req, res) => {
  if (!req.user) throw Unauthorized();
  const access = (await resolveJemaatAccess(req.user.jemaatId)).menuAccess;
  const can = (menu: string) => !!access[menu]?.canRead;
  const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z');

  // Tugas kosong dipakai pelayanan, ibadah & event → hitung sekali.
  let tugasItems: Awaited<ReturnType<typeof tugasKosongItems>> | null = null;
  const tugas = async () => {
    if (!tugasItems) {
      const ids = (await prisma.pelayanan.findMany({ where: { isActive: true }, select: { id: true } })).map((p) => p.id);
      tugasItems = await tugasKosongItems(ids);
    }
    return tugasItems;
  };

  const jobs: Record<string, () => Promise<number>> = {};
  if (can('pelayanan')) {
    jobs.pelayanan = async () => {
      const rows = await prisma.pelayanan.findMany({
        where: { isActive: true },
        select: {
          id: true,
          deskripsi: true,
          _count: {
            select: {
              roles: true,
              jemaatPelayanan: { where: { isActive: true, jemaat: { isActive: true } } },
              approvers: true,
              tugasKategori: { where: { isActive: true } },
            },
          },
        },
      });
      const withTugasKosong = new Set((await tugas()).map((t) => t.pelayananId));
      return rows.filter(
        (p) =>
          !p._count.roles ||
          !p._count.jemaatPelayanan ||
          (p._count.jemaatPelayanan > 0 && !p._count.approvers) ||
          !p._count.tugasKategori ||
          withTugasKosong.has(p.id) ||
          !p.deskripsi?.trim(),
      ).length;
    };
  }
  if (can('ibadah')) {
    jobs.ibadah = async () => {
      const rows = await prisma.ibadah.findMany({
        where: { isActive: true },
        select: {
          id: true,
          isOnline: true,
          linkOnline: true,
          ibadahPelayanan: { select: { _count: { select: { petugas: true } } } },
        },
      });
      const ids = new Set(
        rows
          .filter(
            (i) =>
              !i.ibadahPelayanan.length ||
              i.ibadahPelayanan.every((ip) => ip._count.petugas === 0) ||
              (i.isOnline && !i.linkOnline?.trim()),
          )
          .map((i) => i.id),
      );
      for (const t of await tugas()) if (t.jenis === 'ibadah') ids.add(t.targetId);
      return ids.size;
    };
  }
  if (can('event')) {
    jobs.event = async () => {
      const rows = await prisma.event.findMany({
        where: {
          isActive: true,
          OR: [{ tanggalSelesai: { gte: today } }, { tanggalSelesai: null, tanggalMulai: { gte: today } }],
        },
        select: { id: true, heroImageUrl: true, tipeBayar: true, bankNomor: true, qrisImageUrl: true },
      });
      const ids = new Set(
        rows
          .filter((e) => !e.heroImageUrl || (e.tipeBayar !== 'GRATIS' && !e.bankNomor && !e.qrisImageUrl))
          .map((e) => e.id),
      );
      for (const t of await tugas()) if (t.jenis === 'event') ids.add(t.targetId);
      return ids.size;
    };
  }
  if (can('homecell')) {
    jobs.homecell = async () => {
      const issues = await homecellLokasiIssues({ isActive: true });
      const noPic = await prisma.homecell.findMany({ where: { isActive: true, picJemaatId: null }, select: { id: true } });
      const ids = new Set(noPic.map((h) => h.id));
      for (const [id, i] of issues) if (!i.serius) ids.add(id);
      return ids.size;
    };
  }
  if (can('homecell-area')) jobs.zona = () => prisma.homecellArea.count({ where: { isActive: true, picJemaatId: null } });
  if (can('group')) jobs.group = () => prisma.group.count({ where: { isActive: true, picJemaatId: null } });
  if (can('cabang')) {
    jobs.cabang = () =>
      prisma.cabangGereja.count({
        where: {
          isActive: true,
          OR: [
            { latitude: null },
            { rekening: { none: { isActive: true } } },
            { rekening: { some: { isActive: true, qrisImageUrl: null } } },
          ],
        },
      });
  }

  const entries = await Promise.all(
    Object.entries(jobs).map(async ([k, fn]) => {
      try {
        return [k, await fn()] as const;
      } catch (err) {
        logger.warn({ err, key: k }, '[needs-fill-counts] gagal menghitung');
        return [k, 0] as const;
      }
    }),
  );
  // Id ibadah/event yang punya petugas tanpa tugas → badge biru di baris daftarnya.
  const meta =
    tugasItems !== null
      ? {
          tugasKosong: {
            ibadah: [...new Set((tugasItems as { jenis: string; targetId: string }[]).filter((t) => t.jenis === 'ibadah').map((t) => t.targetId))],
            event: [...new Set((tugasItems as { jenis: string; targetId: string }[]).filter((t) => t.jenis === 'event').map((t) => t.targetId))],
          },
        }
      : undefined;
  res.json({ success: true, data: Object.fromEntries(entries), meta });
});
