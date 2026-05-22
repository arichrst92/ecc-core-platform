/**
 * Ministry (Pelayanan) — mobile-friendly read-only endpoints.
 *
 * Berbeda dari /admin/pelayanan (admin CRUD), ini shape dioptimize untuk
 * mobile app halaman "Ministry":
 *   - GET /admin/ministry            → list semua Pelayanan + memberCount + leader proxy
 *   - GET /admin/ministry/:id        → detail Pelayanan + members + jadwal (later)
 *
 * **Patch 2026-05-22** per request mobile ministry-endpoints.md.
 *
 * Note: Pelayanan adalah master global (Multimedia, Worship, dll) — tidak
 * cabang-specific. Mobile request mention `?cabangId` filter, tapi semantic
 * yang reasonable: filter by `members aktif yang ada di cabang X`. Untuk MVP
 * skip filter ini (return semua), bisa ditambah belakangan.
 *
 * Leader proxy: tidak ada `leaderId` di schema Pelayanan. "Leader" di-derive
 * dari JemaatPelayanan yang punya role dengan level tertinggi. Kalau multiple
 * tied, ambil yang earliest tanggalMulai (paling lama menjabat).
 */
import { Router } from 'express';
import { prisma } from '@ecc/database';
import { NotFound } from '../../lib/errors.js';

export const ministryRouter = Router();

ministryRouter.get('/', async (_req, res) => {
  const items = await prisma.pelayanan.findMany({
    where: { isActive: true },
    include: {
      roles: {
        where: { isActive: true },
        orderBy: { level: 'desc' },
        select: { id: true, nama: true, level: true },
      },
      _count: { select: { jemaatPelayanan: { where: { isActive: true } } } },
      // Untuk leader proxy: ambil 1 row aktif dengan role level tertinggi.
      jemaatPelayanan: {
        where: { isActive: true },
        orderBy: [{ pelayananRole: { level: 'desc' } }, { tanggalMulai: 'asc' }],
        take: 1,
        select: {
          jemaat: {
            select: { id: true, namaLengkap: true, fotoUrl: true },
          },
          pelayananRole: { select: { nama: true, level: true } },
        },
      },
    },
    orderBy: { nama: 'asc' },
  });

  const data = items.map((m) => ({
    id: m.id,
    nama: m.nama,
    deskripsi: m.deskripsi,
    memberCount: m._count.jemaatPelayanan,
    // Anggap selalu open untuk MVP. Kalau ke depan ada flag isOpen di schema,
    // tinggal tukar source.
    isOpen: m.isActive,
    leader: m.jemaatPelayanan[0]
      ? {
          jemaat: m.jemaatPelayanan[0].jemaat,
          role: m.jemaatPelayanan[0].pelayananRole.nama,
        }
      : null,
    roles: m.roles, // mobile bisa preview options sebelum join
  }));

  res.json({ success: true, data });
});

ministryRouter.get('/:id', async (req, res) => {
  const item = await prisma.pelayanan.findUnique({
    where: { id: req.params.id },
    include: {
      roles: {
        where: { isActive: true },
        orderBy: { level: 'desc' },
        select: { id: true, nama: true, level: true, deskripsi: true },
      },
      _count: { select: { jemaatPelayanan: { where: { isActive: true } } } },
      jemaatPelayanan: {
        where: { isActive: true },
        orderBy: [{ pelayananRole: { level: 'desc' } }, { tanggalMulai: 'asc' }],
        select: {
          id: true,
          tanggalMulai: true,
          jemaat: {
            select: {
              id: true,
              namaLengkap: true,
              fotoUrl: true,
              cabang: { select: { id: true, nama: true } },
            },
          },
          pelayananRole: { select: { id: true, nama: true, level: true } },
        },
      },
    },
  });
  if (!item) throw NotFound('Ministry tidak ditemukan');

  // Auth-aware: tandai myMembership kalau current user adalah member.
  const jemaatId = req.user?.jemaatId;
  const myMembership = jemaatId
    ? item.jemaatPelayanan.find((jp) => jp.jemaat.id === jemaatId)
    : undefined;

  res.json({
    success: true,
    data: {
      id: item.id,
      nama: item.nama,
      deskripsi: item.deskripsi,
      isOpen: item.isActive,
      memberCount: item._count.jemaatPelayanan,
      roles: item.roles,
      leader: item.jemaatPelayanan[0]
        ? {
            jemaat: item.jemaatPelayanan[0].jemaat,
            role: item.jemaatPelayanan[0].pelayananRole.nama,
          }
        : null,
      members: item.jemaatPelayanan.map((jp) => ({
        id: jp.id,
        jemaat: jp.jemaat,
        posisi: jp.pelayananRole.nama,
        sinceDate: jp.tanggalMulai,
      })),
      myMembership: myMembership
        ? {
            id: myMembership.id,
            posisi: myMembership.pelayananRole.nama,
            sinceDate: myMembership.tanggalMulai,
          }
        : null,
    },
  });
});
