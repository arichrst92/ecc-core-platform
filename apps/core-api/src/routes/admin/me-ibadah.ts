/**
 * Self check-in ibadah (mobile) — /admin/me/ibadah/*
 *
 *   GET  /:id/self-checkin   → status jendela self check-in hari ini + daftar
 *                              saya & keluarga beserta status check-in-nya
 *   POST /:id/self-checkin   → { jemaatIds: string[] } check-in saya dan/atau
 *                              keluarga (harus anggota keluarga saya)
 *
 * Jendela: hanya di hari ibadah terjadwal, 15 menit sebelum jamMulai s.d.
 * jamSelesai (WIB). Ibadah anak tidak bisa self check-in (lewat meja CKids).
 */
import { Router, type Request } from 'express';
import { prisma } from '@ecc/database';
import { z } from 'zod';
import { ApiError, BadRequest, NotFound, Unauthorized } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { generateUniqueKode } from '../../lib/kode-reservasi.js';
import { SELF_CHECKIN_REASON_TEXT, selfCheckinWindow } from '../../lib/self-checkin.js';

export const meIbadahRouter = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FAMILY_VIA_SPOUSE = ['Anak Laki-Laki', 'Anak Perempuan', 'Ayah', 'Ibu', 'Saudara Kandung'];

function me(req: Request) {
  if (!req.user) throw Unauthorized();
  return req.user;
}

/**
 * Keluarga yang boleh saya check-in-kan: relasi langsung saya, anak/ortu/
 * saudara dari pasangan saya, dan tanggungan (primaryGuardian = saya).
 * Sama dengan daftar di menu Keluarga. Map jemaatId → label relasi.
 */
async function familyOf(jemaatId: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const direct = await prisma.jemaatRelasi.findMany({
    where: { jemaatId },
    select: { jemaatTerkaitId: true, tipeRelasi: { select: { nama: true } } },
  });
  for (const r of direct) out.set(r.jemaatTerkaitId, r.tipeRelasi.nama);
  const spouseIds = direct
    .filter((r) => r.tipeRelasi.nama === 'Suami' || r.tipeRelasi.nama === 'Istri')
    .map((r) => r.jemaatTerkaitId);
  if (spouseIds.length) {
    const viaSpouse = await prisma.jemaatRelasi.findMany({
      where: { jemaatId: { in: spouseIds }, tipeRelasi: { nama: { in: FAMILY_VIA_SPOUSE } } },
      select: { jemaatTerkaitId: true, tipeRelasi: { select: { nama: true } } },
    });
    for (const r of viaSpouse) if (!out.has(r.jemaatTerkaitId)) out.set(r.jemaatTerkaitId, r.tipeRelasi.nama);
  }
  const dependents = await prisma.jemaat.findMany({
    where: { primaryGuardianId: jemaatId },
    select: { id: true },
  });
  for (const d of dependents) if (!out.has(d.id)) out.set(d.id, 'Tanggungan');
  out.delete(jemaatId);
  return out;
}

async function loadIbadahWindow(ibadahId: string) {
  if (!UUID_RE.test(ibadahId)) throw NotFound('Ibadah tidak ditemukan');
  const ibadah = await prisma.ibadah.findUnique({
    where: { id: ibadahId },
    select: {
      id: true,
      nama: true,
      isActive: true,
      isKidsIbadah: true,
      tipeJadwal: true,
      tanggalMulai: true,
      hari: true,
      jamMulai: true,
      jamSelesai: true,
      lokasi: true,
    },
  });
  if (!ibadah) throw NotFound('Ibadah tidak ditemukan');
  const cancelled = await prisma.ibadahOccurrenceStatus.findMany({
    where: { ibadahId, status: 'CANCELLED' },
    select: { tanggalIbadah: true },
  });
  const window = selfCheckinWindow(
    ibadah,
    cancelled.map((c) => c.tanggalIbadah.toISOString().slice(0, 10)),
  );
  return { ibadah, window };
}

async function membersWithStatus(jemaatId: string, ibadahId: string, tanggal: Date) {
  const fam = await familyOf(jemaatId);
  const ids = [jemaatId, ...fam.keys()];
  const [people, reservasi] = await Promise.all([
    prisma.jemaat.findMany({
      where: { id: { in: ids }, isActive: true },
      select: { id: true, namaLengkap: true, fotoUrl: true },
    }),
    prisma.reservasi.findMany({
      where: { ibadahId, tanggalIbadah: tanggal, jemaatId: { in: ids } },
      select: { jemaatId: true, status: true, joinedAt: true },
    }),
  ]);
  const resBy = new Map(reservasi.map((r) => [r.jemaatId, r]));
  const byId = new Map(people.map((p) => [p.id, p]));
  return ids
    .filter((id) => byId.has(id))
    .map((id) => {
      const p = byId.get(id)!;
      const r = resBy.get(id);
      return {
        id,
        namaLengkap: p.namaLengkap,
        fotoUrl: p.fotoUrl,
        isSelf: id === jemaatId,
        relasi: id === jemaatId ? null : (fam.get(id) ?? null),
        status: (r?.status ?? 'NONE') as 'NONE' | 'RESERVE' | 'JOIN' | 'CANCEL',
        checkedInAt: r?.joinedAt ?? null,
      };
    });
}

meIbadahRouter.get('/:id/self-checkin', async (req, res) => {
  const u = me(req);
  const { ibadah, window } = await loadIbadahWindow(req.params.id);
  const members = await membersWithStatus(u.jemaatId, ibadah.id, new Date(`${window.tanggal}T00:00:00.000Z`));
  res.json({
    success: true,
    data: {
      ...window,
      // Jam server (UTC ISO) — mobile menghitung selisih jam HP vs server supaya
      // tombol muncul/hilang tepat waktu walau jam / zona waktu HP berbeda.
      serverNow: new Date().toISOString(),
      reasonText: window.reason ? SELF_CHECKIN_REASON_TEXT[window.reason] : null,
      ibadah: { id: ibadah.id, nama: ibadah.nama, jamMulai: ibadah.jamMulai, jamSelesai: ibadah.jamSelesai, lokasi: ibadah.lokasi },
      members,
    },
  });
});

const bodySchema = z.object({ jemaatIds: z.array(z.string().uuid()).min(1).max(20) });

meIbadahRouter.post('/:id/self-checkin', async (req, res) => {
  const u = me(req);
  const { jemaatIds } = bodySchema.parse(req.body ?? {});
  const { ibadah, window } = await loadIbadahWindow(req.params.id);
  if (!window.available) {
    throw new ApiError(400, `SELF_CHECKIN_${window.reason}`, SELF_CHECKIN_REASON_TEXT[window.reason!]);
  }
  const fam = await familyOf(u.jemaatId);
  const allowed = new Set([u.jemaatId, ...fam.keys()]);
  const unique = [...new Set(jemaatIds)];
  const foreign = unique.filter((id) => !allowed.has(id));
  if (foreign.length) throw BadRequest('Hanya bisa check-in untuk diri sendiri dan keluarga Anda.');

  const tanggal = new Date(`${window.tanggal}T00:00:00.000Z`);
  const now = new Date();
  const people = await prisma.jemaat.findMany({
    where: { id: { in: unique } },
    select: { id: true, namaLengkap: true, isActive: true },
  });
  const results: { jemaatId: string; namaLengkap: string; result: 'CHECKED_IN' | 'ALREADY' | 'FAILED'; message?: string }[] = [];

  for (const p of people) {
    if (!p.isActive) {
      results.push({ jemaatId: p.id, namaLengkap: p.namaLengkap, result: 'FAILED', message: 'Jemaat tidak aktif' });
      continue;
    }
    const existing = await prisma.reservasi.findUnique({
      where: { jemaatId_ibadahId_tanggalIbadah: { jemaatId: p.id, ibadahId: ibadah.id, tanggalIbadah: tanggal } },
    });
    if (existing?.status === 'JOIN') {
      results.push({ jemaatId: p.id, namaLengkap: p.namaLengkap, result: 'ALREADY' });
      continue;
    }
    if (existing?.status === 'CANCEL') {
      // Reservasi pernah dibatalkan — hadir sekarang tetap dicatat.
      await prisma.reservasi.update({
        where: { id: existing.id },
        data: { status: 'JOIN', joinedAt: now, cancelledAt: null, checkedInBy: u.sub },
      });
    } else if (existing) {
      await prisma.reservasi.update({
        where: { id: existing.id },
        data: { status: 'JOIN', joinedAt: now, checkedInBy: u.sub },
      });
    } else {
      const kode = await generateUniqueKode(async (k) => !!(await prisma.reservasi.findUnique({ where: { kode: k } })));
      await prisma.reservasi.create({
        data: {
          jemaatId: p.id,
          ibadahId: ibadah.id,
          tanggalIbadah: tanggal,
          status: 'JOIN',
          kode,
          joinedAt: now,
          checkedInBy: u.sub,
        },
      });
    }
    results.push({ jemaatId: p.id, namaLengkap: p.namaLengkap, result: 'CHECKED_IN' });
  }

  const checkedIn = results.filter((r) => r.result === 'CHECKED_IN');
  if (checkedIn.length) {
    audit(req, {
      action: 'UPDATE',
      resource: 'reservasi',
      resourceLabel: `Self check-in: ${checkedIn.map((r) => r.namaLengkap).join(', ')} → ${ibadah.nama}`,
      metadata: { method: 'self-checkin', ibadahId: ibadah.id, tanggal: window.tanggal, jemaatIds: checkedIn.map((r) => r.jemaatId) },
    });
  }
  res.json({
    success: true,
    data: { tanggal: window.tanggal, results },
    message:
      checkedIn.length > 0
        ? `Check-in berhasil untuk ${checkedIn.length} orang.`
        : 'Semua yang dipilih sudah check-in sebelumnya.',
  });
});
