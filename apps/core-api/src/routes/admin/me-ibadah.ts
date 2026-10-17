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
import {
  SELF_CHECKIN_REASON_TEXT,
  checkSelfCheckinRadius,
  radiusErrorMessage,
  selfCheckinWindow,
  venueInfo,
  venuePoint,
} from '../../lib/self-checkin.js';
import { familyOf } from '../../lib/family.js';
import {
  canCancelReservasi,
  eligibleForKids,
  reservableOccurrences,
  type ReservableOccurrence,
} from '../../lib/reservasi-window.js';

export const meIbadahRouter = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function me(req: Request) {
  if (!req.user) throw Unauthorized();
  return req.user;
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
      latitude: true,
      longitude: true,
      selfCheckinRadiusM: true,
      cabang: { select: { latitude: true, longitude: true } },
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
      // Cek radius: app wajib kirim lokasi kalau requiresLocation=true.
      // radiusM null = self check-in boleh di mana saja.
      venue: venueInfo(ibadah.selfCheckinRadiusM, venuePoint(ibadah, ibadah.cabang)),
      members,
    },
  });
});

const bodySchema = z.object({
  jemaatIds: z.array(z.string().uuid()).min(1).max(20),
  // Posisi HP saat check-in (wajib kalau venue punya titik lokasi).
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

meIbadahRouter.post('/:id/self-checkin', async (req, res) => {
  const u = me(req);
  const { jemaatIds, lat, lng } = bodySchema.parse(req.body ?? {});
  const { ibadah, window } = await loadIbadahWindow(req.params.id);
  if (!window.available) {
    throw new ApiError(400, `SELF_CHECKIN_${window.reason}`, SELF_CHECKIN_REASON_TEXT[window.reason!]);
  }
  // Radius sesuai pengaturan ibadah (null = di mana saja), dari titik ibadah
  // atau titik cabang. Di luar radius → arahkan ke usher (QR).
  const radius = checkSelfCheckinRadius(
    venuePoint(ibadah, ibadah.cabang),
    lat != null && lng != null ? { lat, lng } : null,
    ibadah.selfCheckinRadiusM,
  );
  if (!radius.ok) {
    throw new ApiError(400, `SELF_CHECKIN_${radius.code}`, radiusErrorMessage(radius.code, 'ibadah', radius.distanceM, ibadah.selfCheckinRadiusM!), {
      distanceM: radius.distanceM,
      radiusM: ibadah.selfCheckinRadiusM,
    });
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
    select: { id: true, namaLengkap: true, isActive: true, isTamu: true },
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
        data: { status: 'JOIN', joinedAt: now, cancelledAt: null, checkedInBy: u.sub, checkinMethod: 'SELF' },
      });
    } else if (existing) {
      await prisma.reservasi.update({
        where: { id: existing.id },
        data: { status: 'JOIN', joinedAt: now, checkedInBy: u.sub, checkinMethod: 'SELF' },
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
          checkinMethod: 'SELF',
          ...(p.isTamu ? { invitedByJemaatId: u.jemaatId, guestSource: 'DIUNDANG' } : {}),
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

// ============================================================
// RESERVASI MANDIRI (saya + keluarga + tamu saya)
// ============================================================
//   GET  /:id/reservasi?tanggal=YYYY-MM-DD → pertemuan yang bisa direservasi
//        (hari ini s.d. 30 hari, WIB) + daftar saya & keluarga beserta status
//   POST /:id/reservasi         { tanggal, jemaatIds } → reservasi (RESERVE)
//   POST /:id/reservasi/cancel  { tanggal, jemaatIds } → batal (CANCEL)
// Ditutup saat jam mulai ibadah. Ibadah anak: hanya anak ≤ 13 tahun.

async function loadReservable(ibadahId: string) {
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
  if (!ibadah || !ibadah.isActive) throw NotFound('Ibadah tidak ditemukan');
  const cancelled = await prisma.ibadahOccurrenceStatus.findMany({
    where: { ibadahId, status: 'CANCELLED' },
    select: { tanggalIbadah: true },
  });
  const occurrences = reservableOccurrences(
    ibadah,
    cancelled.map((c) => c.tanggalIbadah.toISOString().slice(0, 10)),
  );
  return { ibadah, occurrences };
}

/** Saya + keluarga (+ tamu saya) yang boleh direservasikan untuk ibadah ini. */
async function reservableMembers(jemaatId: string, ibadah: { id: string; isKidsIbadah: boolean }, tanggal: Date | null) {
  const fam = await familyOf(jemaatId);
  const ids = [jemaatId, ...fam.keys()];
  const [people, reservasi] = await Promise.all([
    prisma.jemaat.findMany({
      where: { id: { in: ids }, isActive: true },
      select: { id: true, namaLengkap: true, fotoUrl: true, tanggalLahir: true, primaryGuardianId: true, isTamu: true },
    }),
    tanggal
      ? prisma.reservasi.findMany({
          where: { ibadahId: ibadah.id, tanggalIbadah: tanggal, jemaatId: { in: ids } },
          select: { id: true, jemaatId: true, status: true, kode: true },
        })
      : Promise.resolve([]),
  ]);
  const resBy = new Map(reservasi.map((r) => [r.jemaatId, r]));
  return people
    .map((p) => {
      const isDependent = p.primaryGuardianId === jemaatId;
      const r = resBy.get(p.id);
      return {
        id: p.id,
        namaLengkap: p.namaLengkap,
        fotoUrl: p.fotoUrl,
        isSelf: p.id === jemaatId,
        isTamu: p.isTamu,
        relasi: p.id === jemaatId ? null : (fam.get(p.id) ?? null),
        status: (r?.status ?? 'NONE') as 'NONE' | 'RESERVE' | 'JOIN' | 'CANCEL',
        reservasiId: r?.id ?? null,
        // Ibadah anak: hanya anak ≤ 13 tahun / tanggungan tanpa tanggal lahir.
        eligible: !ibadah.isKidsIbadah || eligibleForKids({ tanggalLahir: p.tanggalLahir, isDependent }),
      };
    })
    .sort((a, b) => (a.isSelf ? -1 : b.isSelf ? 1 : a.namaLengkap.localeCompare(b.namaLengkap)));
}

function pickOccurrence(occ: ReservableOccurrence[], tanggal: string | undefined) {
  if (tanggal) {
    const o = occ.find((x) => x.tanggal === tanggal);
    if (!o) throw new ApiError(400, 'RESERVASI_NOT_SCHEDULED', 'Tidak ada ibadah terjadwal di tanggal ini (atau di luar 30 hari ke depan).');
    return o;
  }
  return occ.find((x) => x.open) ?? null;
}

meIbadahRouter.get('/:id/reservasi', async (req, res) => {
  const u = me(req);
  const { ibadah, occurrences } = await loadReservable(req.params.id);
  const tanggalQ = typeof req.query.tanggal === 'string' ? req.query.tanggal : undefined;
  const selected = pickOccurrence(occurrences, tanggalQ);
  const members = await reservableMembers(
    u.jemaatId,
    ibadah,
    selected ? new Date(`${selected.tanggal}T00:00:00.000Z`) : null,
  );
  res.json({
    success: true,
    data: {
      ibadah: {
        id: ibadah.id,
        nama: ibadah.nama,
        jamMulai: ibadah.jamMulai,
        jamSelesai: ibadah.jamSelesai,
        lokasi: ibadah.lokasi,
        isKidsIbadah: ibadah.isKidsIbadah,
      },
      occurrences,
      selected,
      members,
      serverNow: new Date().toISOString(),
    },
  });
});

const reserveSchema = z.object({
  tanggal: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  jemaatIds: z.array(z.string().uuid()).min(1).max(20),
});

meIbadahRouter.post('/:id/reservasi', async (req, res) => {
  const u = me(req);
  const { tanggal, jemaatIds } = reserveSchema.parse(req.body ?? {});
  const { ibadah, occurrences } = await loadReservable(req.params.id);
  const occ = pickOccurrence(occurrences, tanggal)!;
  if (occ.cancelled) throw new ApiError(400, 'RESERVASI_CANCELLED', 'Ibadah di tanggal ini dibatalkan.');
  if (!occ.open) throw new ApiError(400, 'RESERVASI_CLOSED', 'Reservasi sudah ditutup karena ibadah sudah dimulai.');

  const tgl = new Date(`${tanggal}T00:00:00.000Z`);
  const members = await reservableMembers(u.jemaatId, ibadah, tgl);
  const byId = new Map(members.map((m) => [m.id, m]));
  const unique = [...new Set(jemaatIds)];
  if (unique.some((id) => !byId.has(id))) throw BadRequest('Hanya bisa reservasi untuk Anda, keluarga, dan tamu Anda.');

  const now = new Date();
  const results: { jemaatId: string; namaLengkap: string; result: 'RESERVED' | 'ALREADY' | 'FAILED'; message?: string }[] = [];
  for (const id of unique) {
    const m = byId.get(id)!;
    if (!m.eligible) {
      results.push({ jemaatId: id, namaLengkap: m.namaLengkap, result: 'FAILED', message: 'Ibadah anak hanya untuk usia 13 tahun ke bawah' });
      continue;
    }
    if (m.status === 'RESERVE' || m.status === 'JOIN') {
      results.push({ jemaatId: id, namaLengkap: m.namaLengkap, result: 'ALREADY' });
      continue;
    }
    const guest = m.isTamu ? { invitedByJemaatId: u.jemaatId, guestSource: 'DIUNDANG' } : {};
    if (m.status === 'CANCEL' && m.reservasiId) {
      await prisma.reservasi.update({
        where: { id: m.reservasiId },
        data: { status: 'RESERVE', reservedAt: now, cancelledAt: null, ...guest },
      });
    } else {
      const kode = await generateUniqueKode(async (k) => !!(await prisma.reservasi.findUnique({ where: { kode: k } })));
      try {
        await prisma.reservasi.create({
          data: { jemaatId: id, ibadahId: ibadah.id, tanggalIbadah: tgl, status: 'RESERVE', kode, reservedAt: now, ...guest },
        });
      } catch (err: unknown) {
        // Balapan dengan perangkat lain / petugas → anggap sudah ada.
        if ((err as { code?: string }).code === 'P2002') {
          results.push({ jemaatId: id, namaLengkap: m.namaLengkap, result: 'ALREADY' });
          continue;
        }
        throw err;
      }
    }
    results.push({ jemaatId: id, namaLengkap: m.namaLengkap, result: 'RESERVED' });
  }

  const ok = results.filter((r) => r.result === 'RESERVED');
  if (ok.length) {
    audit(req, {
      action: 'CREATE',
      resource: 'reservasi',
      resourceLabel: `Reservasi mandiri: ${ok.map((r) => r.namaLengkap).join(', ')} → ${ibadah.nama} @ ${tanggal}`,
      metadata: { kind: 'self-reserve', ibadahId: ibadah.id, tanggal, jemaatIds: ok.map((r) => r.jemaatId) },
    });
  }
  res.json({
    success: true,
    data: { tanggal, results },
    message: ok.length ? `Reservasi berhasil untuk ${ok.length} orang.` : 'Tidak ada reservasi baru.',
  });
});

meIbadahRouter.post('/:id/reservasi/cancel', async (req, res) => {
  const u = me(req);
  const { tanggal, jemaatIds } = reserveSchema.parse(req.body ?? {});
  const { ibadah } = await loadReservable(req.params.id);
  const tgl = new Date(`${tanggal}T00:00:00.000Z`);
  const members = await reservableMembers(u.jemaatId, ibadah, tgl);
  const allowed = new Set(members.map((m) => m.id));
  const unique = [...new Set(jemaatIds)];
  if (unique.some((id) => !allowed.has(id))) throw BadRequest('Hanya bisa membatalkan reservasi Anda, keluarga, dan tamu Anda.');
  if (!canCancelReservasi({ status: 'RESERVE', tanggalIbadah: tgl }, ibadah.jamMulai)) {
    throw new ApiError(400, 'RESERVASI_CLOSED', 'Reservasi tidak bisa dibatalkan karena ibadah sudah dimulai.');
  }
  const upd = await prisma.reservasi.updateMany({
    where: { ibadahId: ibadah.id, tanggalIbadah: tgl, jemaatId: { in: unique }, status: 'RESERVE' },
    data: { status: 'CANCEL', cancelledAt: new Date() },
  });
  if (upd.count) {
    audit(req, {
      action: 'UPDATE',
      resource: 'reservasi',
      resourceLabel: `Batal reservasi mandiri (${upd.count}) → ${ibadah.nama} @ ${tanggal}`,
      metadata: { kind: 'self-reserve-cancel', ibadahId: ibadah.id, tanggal, jemaatIds: unique },
    });
  }
  res.json({
    success: true,
    data: { tanggal, cancelled: upd.count },
    message: upd.count ? `${upd.count} reservasi dibatalkan.` : 'Tidak ada reservasi yang bisa dibatalkan.',
  });
});
