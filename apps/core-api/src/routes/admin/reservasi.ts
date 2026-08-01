import { Router } from 'express';
import { prisma, type Prisma } from '@ecc/database';
import {
  createReservasiSchema,
  updateReservasiStatusSchema,
  bulkReserveSchema,
  checkinByKodeSchema,
  checkoutByKodeSchema,
  pickupByKodeSchema,
  walkInReservasiSchema,
  awardPointSchema,
  paginationQuerySchema,
} from '@ecc/shared-types';
import { BadRequest, NotFound } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { generateUniqueKode } from '../../lib/kode-reservasi.js';

export const reservasiRouter = Router();

// ===== List dengan filter =====

reservasiRouter.get('/', async (req, res) => {
  const q = paginationQuerySchema.parse(req.query);
  const ibadahId = typeof req.query.ibadahId === 'string' ? req.query.ibadahId : undefined;
  const jemaatId = typeof req.query.jemaatId === 'string' ? req.query.jemaatId : undefined;
  const status =
    typeof req.query.status === 'string' && ['RESERVE', 'JOIN', 'CANCEL'].includes(req.query.status)
      ? (req.query.status as 'RESERVE' | 'JOIN' | 'CANCEL')
      : undefined;
  const tanggal = typeof req.query.tanggal === 'string' ? req.query.tanggal : undefined;

  const where: Prisma.ReservasiWhereInput = {};
  if (ibadahId) where.ibadahId = ibadahId;
  if (jemaatId) where.jemaatId = jemaatId;
  if (status) where.status = status;
  if (tanggal) where.tanggalIbadah = new Date(tanggal);
  if (q.search) {
    where.OR = [
      { kode: { contains: q.search.toUpperCase() } },
      { jemaat: { namaLengkap: { contains: q.search, mode: 'insensitive' } } },
    ];
  }

  const [data, total] = await Promise.all([
    prisma.reservasi.findMany({
      where,
      skip: (q.page - 1) * q.limit,
      take: q.limit,
      orderBy: [{ tanggalIbadah: 'desc' }, { reservedAt: 'desc' }],
      include: {
        jemaat: { select: { id: true, namaLengkap: true, fotoUrl: true, noHp: true } },
        ibadah: { select: { id: true, nama: true } },
      },
    }),
    prisma.reservasi.count({ where }),
  ]);

  res.json({
    success: true,
    data,
    meta: { page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit) },
  });
});

// ===== Get by kode (lookup utility) =====

reservasiRouter.get('/by-kode/:kode', async (req, res) => {
  const item = await prisma.reservasi.findUnique({
    where: { kode: req.params.kode.toUpperCase() },
    include: {
      jemaat: { select: { id: true, namaLengkap: true, fotoUrl: true, noHp: true } },
      ibadah: { select: { id: true, nama: true, jamMulai: true, jamSelesai: true } },
    },
  });
  if (!item) throw NotFound('Reservasi tidak ditemukan');
  res.json({ success: true, data: item });
});

// ===== Detail =====

reservasiRouter.get('/:id', async (req, res) => {
  const item = await prisma.reservasi.findUnique({
    where: { id: req.params.id },
    include: {
      jemaat: { select: { id: true, namaLengkap: true, fotoUrl: true, noHp: true } },
      ibadah: { select: { id: true, nama: true, jamMulai: true, jamSelesai: true } },
    },
  });
  if (!item) throw NotFound('Reservasi tidak ditemukan');
  res.json({ success: true, data: item });
});

// ===== Create =====

reservasiRouter.post('/', async (req, res) => {
  const input = createReservasiSchema.parse(req.body);

  const kode = await generateUniqueKode(async (k) => {
    const existing = await prisma.reservasi.findUnique({ where: { kode: k } });
    return !!existing;
  });

  try {
    const created = await prisma.reservasi.create({
      data: {
        ...input,
        tanggalIbadah: new Date(input.tanggalIbadah),
        kode,
        status: 'RESERVE',
      },
      include: {
        jemaat: { select: { namaLengkap: true } },
        ibadah: { select: { nama: true } },
      },
    });
    const label = `${created.jemaat.namaLengkap} → ${created.ibadah.nama} @ ${input.tanggalIbadah}`;
    audit(req, {
      action: 'CREATE',
      resource: 'reservasi',
      resourceId: created.id,
      resourceLabel: label,
      after: created,
    });
    res.status(201).json({ success: true, data: created });
  } catch (err: any) {
    // Handle unique constraint (already reserved for this ibadah+tanggal)
    if (err.code === 'P2002') {
      throw BadRequest('Jemaat ini sudah reservasi untuk ibadah & tanggal yang sama');
    }
    throw err;
  }
});

// ===== Bulk Reserve =====

reservasiRouter.post('/bulk', async (req, res) => {
  const input = bulkReserveSchema.parse(req.body);
  const created: { id: string; kode: string; jemaatId: string }[] = [];
  const skipped: { jemaatId: string; reason: string }[] = [];

  for (const jemaatId of input.jemaatIds) {
    try {
      const kode = await generateUniqueKode(async (k) => {
        const existing = await prisma.reservasi.findUnique({ where: { kode: k } });
        return !!existing;
      });
      const r = await prisma.reservasi.create({
        data: {
          jemaatId,
          ibadahId: input.ibadahId,
          tanggalIbadah: new Date(input.tanggalIbadah),
          kode,
          status: 'RESERVE',
        },
        select: { id: true, kode: true, jemaatId: true },
      });
      created.push(r);
    } catch (err: any) {
      if (err.code === 'P2002') {
        skipped.push({ jemaatId, reason: 'sudah reservasi' });
      } else {
        skipped.push({ jemaatId, reason: err.message ?? 'unknown' });
      }
    }
  }

  audit(req, {
    action: 'CREATE',
    resource: 'reservasi',
    resourceLabel: `Bulk reserve ${created.length} jemaat`,
    metadata: { ibadahId: input.ibadahId, tanggalIbadah: input.tanggalIbadah, createdCount: created.length, skippedCount: skipped.length },
  });
  res.status(201).json({ success: true, data: { created, skipped } });
});

// ===== Update Status (admin manual) =====

reservasiRouter.patch('/:id/status', async (req, res) => {
  const input = updateReservasiStatusSchema.parse(req.body);
  const before = await prisma.reservasi.findUnique({
    where: { id: req.params.id },
    include: { jemaat: { select: { namaLengkap: true } }, ibadah: { select: { nama: true } } },
  });
  if (!before) throw NotFound('Reservasi tidak ditemukan');

  const now = new Date();
  const data: Prisma.ReservasiUpdateInput = { status: input.status, catatan: input.catatan };
  if (input.status === 'JOIN' && !before.joinedAt) data.joinedAt = now;
  if (input.status === 'CANCEL' && !before.cancelledAt) data.cancelledAt = now;
  if (input.status === 'RESERVE') {
    // reset timestamps kalau dibalikin
    data.joinedAt = null;
    data.cancelledAt = null;
  }

  const updated = await prisma.reservasi.update({ where: { id: req.params.id }, data });
  const label = `${before.jemaat.namaLengkap} → ${before.ibadah.nama}: ${before.status} → ${input.status}`;
  audit(req, {
    action: 'UPDATE',
    resource: 'reservasi',
    resourceId: updated.id,
    resourceLabel: label,
    before,
    after: updated,
  });
  res.json({ success: true, data: updated });
});

// ===== Check-in by kode (admin scanner — sama logic dengan public mobile) =====

reservasiRouter.post('/checkin', async (req, res) => {
  const { kode } = checkinByKodeSchema.parse(req.body);
  const item = await prisma.reservasi.findUnique({
    where: { kode: kode.toUpperCase() },
    include: {
      jemaat: { select: { namaLengkap: true } },
      ibadah: { select: { nama: true, isKidsIbadah: true } },
    },
  });
  if (!item) throw NotFound('Kode reservasi tidak ditemukan');
  if (item.status === 'CANCEL') throw BadRequest('Reservasi sudah dibatalkan');
  if (item.status === 'JOIN') {
    return res.json({
      success: true,
      data: item,
      message: `Sudah check-in sebelumnya (${item.joinedAt?.toISOString()})`,
    });
  }

  // Modul 27 — kalau ibadah anak, generate 6-digit pickup code unique
  // dalam occurrence (ibadah + tanggal). Retry up to 5x kalau collision.
  let pickupCode: string | null = null;
  if (item.ibadah.isKidsIbadah) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = String(Math.floor(100000 + Math.random() * 900000));
      const existing = await prisma.reservasi.findFirst({
        where: {
          ibadahId: item.ibadahId,
          tanggalIbadah: item.tanggalIbadah,
          pickupCode: candidate,
        },
        select: { id: true },
      });
      if (!existing) {
        pickupCode = candidate;
        break;
      }
    }
    if (!pickupCode) {
      throw BadRequest('Gagal generate pickup code — occurrence penuh (>900k anak?). Retry.');
    }
  }

  const updated = await prisma.reservasi.update({
    where: { id: item.id },
    data: {
      status: 'JOIN',
      joinedAt: new Date(),
      checkedInBy: req.user?.sub,
      pickupCode,
    },
  });
  audit(req, {
    action: 'UPDATE',
    resource: 'reservasi',
    resourceId: updated.id,
    resourceLabel: `Check-in: ${item.jemaat.namaLengkap} → ${item.ibadah.nama}${pickupCode ? ` (pickup ${pickupCode})` : ''}`,
    metadata: { method: 'admin-scanner', pickupCode: pickupCode ?? undefined },
    before: item,
    after: updated,
  });
  res.json({
    success: true,
    data: updated,
    message: pickupCode
      ? `Check-in berhasil. Kode jemput: ${pickupCode} — sampaikan ke parent`
      : 'Check-in berhasil',
  });
});

// ===== Checkout by kode (Modul 26 — admin scanner mirror check-in) =====
//
// Guard chain:
//   - Reservasi must exist by kode
//   - Ibadah.requiresCheckout must be true (opt-in per ibadah)
//   - Status must be JOIN (sudah check-in)
//   - checkedOutAt must be null (belum di-checkout)
// Idempotent: sudah checkout return success dengan pesan info.
reservasiRouter.post('/checkout', async (req, res) => {
  const { kode } = checkoutByKodeSchema.parse(req.body);
  const item = await prisma.reservasi.findUnique({
    where: { kode: kode.toUpperCase() },
    include: {
      jemaat: { select: { namaLengkap: true } },
      ibadah: { select: { nama: true, requiresCheckout: true } },
    },
  });
  if (!item) throw NotFound('Kode reservasi tidak ditemukan');
  if (!item.ibadah.requiresCheckout) {
    throw BadRequest('Ibadah ini tidak require checkout — skip aja.');
  }
  if (item.status === 'CANCEL') throw BadRequest('Reservasi sudah dibatalkan');
  if (item.status !== 'JOIN') {
    throw BadRequest('Jemaat belum check-in — tidak bisa checkout.');
  }
  if (item.checkedOutAt) {
    return res.json({
      success: true,
      data: item,
      message: `Sudah checkout sebelumnya (${item.checkedOutAt.toISOString()})`,
    });
  }

  const updated = await prisma.reservasi.update({
    where: { id: item.id },
    data: {
      checkedOutAt: new Date(),
      checkedOutBy: req.user?.sub,
    },
  });
  audit(req, {
    action: 'UPDATE',
    resource: 'reservasi',
    resourceId: updated.id,
    resourceLabel: `Checkout: ${item.jemaat.namaLengkap} ← ${item.ibadah.nama}`,
    metadata: { method: 'admin-scanner-checkout' },
    before: item,
    after: updated,
  });
  res.json({ success: true, data: updated, message: 'Checkout berhasil' });
});

// ===== Pickup Anak by Kode Jemput (Modul 27) =====
//
// Admin scan/input 6-digit pickup code + (opsional) scan QR jemaat parent
// yang jemput. Backend validate + set pickedUpAt.
//
// Guard chain:
//   - pickupCode ditemukan di occurrence hari ini (scope: latest 24h supaya
//     kode kemarin gak reused hari ini)
//   - Reservasi belum di-pickup (pickedUpAt IS NULL)
//   - Reservasi status JOIN (sudah check-in)
//   - Ibadah must isKidsIbadah=true
reservasiRouter.post('/pickup', async (req, res) => {
  const { pickupCode, kodeReservasi, pickedUpByJemaatId } = pickupByKodeSchema.parse(req.body);

  // Lookup by pickupCode. Kalau kodeReservasi dikirim, extra validation
  // untuk pastikan match anak yg benar (defensive against typo).
  const now = new Date();
  const yesterdayStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const candidates = await prisma.reservasi.findMany({
    where: {
      pickupCode,
      status: 'JOIN',
      pickedUpAt: null,
      joinedAt: { gte: yesterdayStart },
      ibadah: { isKidsIbadah: true },
    },
    include: {
      jemaat: { select: { id: true, namaLengkap: true, fotoUrl: true } },
      ibadah: { select: { nama: true } },
    },
    orderBy: { joinedAt: 'desc' },
  });

  if (candidates.length === 0) {
    throw NotFound(
      'Kode jemput tidak ditemukan atau sudah kadaluarsa. Cek kode di app parent.',
    );
  }

  // Kalau kodeReservasi dikirim, filter match — safety guard.
  let target = candidates[0]!;
  if (kodeReservasi) {
    const match = candidates.find((c) => c.kode === kodeReservasi.toUpperCase());
    if (!match) {
      throw BadRequest(
        'Kode reservasi anak tidak match dgn kode jemput. Cek ulang kode QR anak.',
      );
    }
    target = match;
  } else if (candidates.length > 1) {
    // 6-digit random punya risk kecil collision cross-ibadah dalam 24h.
    // Kalau ambiguous, minta admin kirim kodeReservasi juga.
    throw BadRequest(
      `Multiple match untuk kode ${pickupCode}. Scan QR anak juga untuk disambiguate.`,
    );
  }

  // Validate pickedUpByJemaatId exist kalau dikirim.
  if (pickedUpByJemaatId) {
    const parent = await prisma.jemaat.findUnique({
      where: { id: pickedUpByJemaatId },
      select: { id: true },
    });
    if (!parent) throw BadRequest('Jemaat parent tidak ditemukan');
  }

  const updated = await prisma.reservasi.update({
    where: { id: target.id },
    data: {
      pickedUpAt: new Date(),
      pickedUpByJemaatId: pickedUpByJemaatId ?? null,
    },
  });

  audit(req, {
    action: 'UPDATE',
    resource: 'reservasi',
    resourceId: updated.id,
    resourceLabel: `Pickup anak: ${target.jemaat.namaLengkap} ← ${target.ibadah.nama} (kode ${pickupCode})`,
    metadata: { pickupCode, method: 'admin-pickup', pickedUpByJemaatId },
    before: target,
    after: updated,
  });

  res.json({
    success: true,
    data: {
      reservasi: updated,
      anak: target.jemaat,
      ibadahNama: target.ibadah.nama,
    },
    message: `Anak ${target.jemaat.namaLengkap} berhasil di-pickup`,
  });
});

// ===== Award Point (Modul 28 — Point earn saat kids ibadah check-in) =====
//
// Body: { reservasiId, amount, note? }
// Award point ke jemaat berdasarkan reservasi kids ibadah. Cuma valid kalau:
//   - Reservasi.status = JOIN (sudah check-in)
//   - Ibadah.isKidsIbadah = true
//   - Belum pernah di-award point untuk reservasi ini (idempotent guard via
//     source=KEHADIRAN_KIDS + referenceId=reservasiId)
reservasiRouter.post('/award-point', async (req, res) => {
  const { reservasiId, amount, note } = awardPointSchema.parse(req.body);
  const adminId = req.user?.jemaatId;
  if (!adminId) throw BadRequest('Admin tidak punya jemaatId');

  const reservasi = await prisma.reservasi.findUnique({
    where: { id: reservasiId },
    include: {
      jemaat: { select: { id: true, namaLengkap: true, cabangId: true } },
      ibadah: { select: { nama: true, isKidsIbadah: true, cabangId: true } },
    },
  });
  if (!reservasi) throw NotFound('Reservasi tidak ditemukan');
  if (reservasi.status !== 'JOIN') throw BadRequest('Jemaat belum check-in');
  if (!reservasi.ibadah.isKidsIbadah) {
    throw BadRequest('Point cuma untuk ibadah anak (isKidsIbadah=true)');
  }

  // Idempotency guard
  const existing = await prisma.pointTransaction.findFirst({
    where: {
      source: 'KEHADIRAN_KIDS',
      referenceId: reservasiId,
    },
  });
  if (existing) {
    throw BadRequest(`Point sudah pernah di-award (${existing.amount} pts, ${existing.createdAt.toISOString()})`);
  }

  const cabangId = reservasi.ibadah.cabangId;

  const result = await prisma.$transaction(async (tx) => {
    const balance = await tx.jemaatPointBalance.upsert({
      where: { jemaatId_cabangId: { jemaatId: reservasi.jemaatId, cabangId } },
      create: { jemaatId: reservasi.jemaatId, cabangId, balance: amount },
      update: { balance: { increment: amount } },
    });
    const txRow = await tx.pointTransaction.create({
      data: {
        jemaatId: reservasi.jemaatId,
        cabangId,
        type: 'EARN',
        amount,
        source: 'KEHADIRAN_KIDS',
        referenceId: reservasiId,
        note: note ?? `Kehadiran ${reservasi.ibadah.nama}`,
        createdById: adminId,
      },
    });
    return { balance, txRow };
  });

  audit(req, {
    action: 'CREATE',
    resource: 'point_transaction',
    resourceId: result.txRow.id,
    resourceLabel: `+${amount} pts untuk ${reservasi.jemaat.namaLengkap} (${reservasi.ibadah.nama})`,
    metadata: { reservasiId, amount, newBalance: result.balance.balance },
  });

  res.status(201).json({
    success: true,
    data: {
      transaction: result.txRow,
      newBalance: result.balance.balance,
    },
    message: `+${amount} point untuk ${reservasi.jemaat.namaLengkap}. Balance: ${result.balance.balance}`,
  });
});

// ===== Walk-in check-in / checkout / pickup (Modul 28-K) =====
//
// Universal endpoint — jemaat identified by jemaatId (from scan QR profile
// atau search by nama), ibadah context dari admin selector.
//
// Backend do upsert Reservasi based on action:
//   - checkin: create Reservasi kalau belum ada, atau flip RESERVE→JOIN kalau
//     sudah reserved. Auto-generate kode reservasi + pickup code (kids).
//   - checkout: cari Reservasi existing → set checkedOutAt.
//   - pickup: cari kids Reservasi → set pickedUpAt (skip validate pickup code
//     karena admin verify secara fisik lewat scan QR anak).
reservasiRouter.post('/walk-in', async (req, res) => {
  const { jemaatId, ibadahId, tanggalIbadah, action } = walkInReservasiSchema.parse(req.body);
  const adminId = req.user?.sub;

  const jemaat = await prisma.jemaat.findUnique({
    where: { id: jemaatId },
    select: { id: true, namaLengkap: true, isActive: true, kode: true },
  });
  if (!jemaat) throw NotFound('Jemaat tidak ditemukan');
  if (!jemaat.isActive) throw BadRequest('Jemaat tidak aktif');

  const ibadah = await prisma.ibadah.findUnique({
    where: { id: ibadahId },
    select: {
      id: true,
      nama: true,
      isActive: true,
      isKidsIbadah: true,
      requiresCheckout: true,
    },
  });
  if (!ibadah || !ibadah.isActive) throw BadRequest('Ibadah tidak valid / tidak aktif');

  const tanggal = new Date(tanggalIbadah);
  const now = new Date();

  // Lookup existing reservasi untuk (jemaat, ibadah, tanggal).
  const existing = await prisma.reservasi.findUnique({
    where: {
      jemaatId_ibadahId_tanggalIbadah: {
        jemaatId,
        ibadahId,
        tanggalIbadah: tanggal,
      },
    },
  });

  // ═══════════ CHECK-IN ═══════════
  if (action === 'checkin') {
    if (existing) {
      if (existing.status === 'CANCEL') {
        throw BadRequest('Reservasi sudah dibatalkan — tidak bisa check-in');
      }
      if (existing.status === 'JOIN') {
        return res.json({
          success: true,
          data: { reservasi: existing, jemaat, ibadahNama: ibadah.nama },
          message: `Sudah check-in sebelumnya (${existing.joinedAt?.toISOString()})`,
        });
      }
      // Status = RESERVE → flip ke JOIN
      let pickupCode: string | null = null;
      if (ibadah.isKidsIbadah) {
        pickupCode = await generateUniquePickupCode(ibadahId, tanggal);
      }
      const updated = await prisma.reservasi.update({
        where: { id: existing.id },
        data: {
          status: 'JOIN',
          joinedAt: now,
          checkedInBy: adminId,
          pickupCode,
        },
      });
      audit(req, {
        action: 'UPDATE',
        resource: 'reservasi',
        resourceId: updated.id,
        resourceLabel: `Walk-in check-in: ${jemaat.namaLengkap} → ${ibadah.nama}`,
        metadata: { method: 'walk-in', flip: 'RESERVE→JOIN', pickupCode },
        before: existing,
        after: updated,
      });
      return res.json({
        success: true,
        data: { reservasi: updated, jemaat, ibadahNama: ibadah.nama, pickupCode },
        message: pickupCode
          ? `Check-in berhasil. Kode jemput: ${pickupCode}`
          : 'Check-in berhasil',
      });
    }
    // No existing — create baru dgn status JOIN
    const kode = await generateUniqueKode(async (k) => {
      const r = await prisma.reservasi.findUnique({ where: { kode: k } });
      return !!r;
    });
    let pickupCode: string | null = null;
    if (ibadah.isKidsIbadah) {
      pickupCode = await generateUniquePickupCode(ibadahId, tanggal);
    }
    const created = await prisma.reservasi.create({
      data: {
        jemaatId,
        ibadahId,
        tanggalIbadah: tanggal,
        status: 'JOIN',
        kode,
        joinedAt: now,
        checkedInBy: adminId,
        pickupCode,
      },
    });
    audit(req, {
      action: 'CREATE',
      resource: 'reservasi',
      resourceId: created.id,
      resourceLabel: `Walk-in check-in: ${jemaat.namaLengkap} → ${ibadah.nama}`,
      metadata: { method: 'walk-in-create', pickupCode },
      after: created,
    });
    return res.status(201).json({
      success: true,
      data: { reservasi: created, jemaat, ibadahNama: ibadah.nama, pickupCode },
      message: pickupCode
        ? `Check-in berhasil. Kode jemput: ${pickupCode}`
        : 'Check-in berhasil',
    });
  }

  // ═══════════ CHECKOUT ═══════════
  if (action === 'checkout') {
    if (!existing) throw NotFound('Jemaat belum check-in di ibadah ini');
    if (existing.status !== 'JOIN') throw BadRequest('Jemaat belum check-in');
    if (!ibadah.requiresCheckout) {
      throw BadRequest('Ibadah ini tidak require checkout');
    }
    if (existing.checkedOutAt) {
      return res.json({
        success: true,
        data: existing,
        message: `Sudah checkout sebelumnya (${existing.checkedOutAt.toISOString()})`,
      });
    }
    const updated = await prisma.reservasi.update({
      where: { id: existing.id },
      data: { checkedOutAt: now, checkedOutBy: adminId },
    });
    audit(req, {
      action: 'UPDATE',
      resource: 'reservasi',
      resourceId: updated.id,
      resourceLabel: `Walk-in checkout: ${jemaat.namaLengkap} ← ${ibadah.nama}`,
      metadata: { method: 'walk-in' },
      before: existing,
      after: updated,
    });
    return res.json({
      success: true,
      data: { reservasi: updated, jemaat, ibadahNama: ibadah.nama },
      message: 'Checkout berhasil',
    });
  }

  // ═══════════ PICKUP ═══════════
  if (action === 'pickup') {
    if (!existing) throw NotFound('Jemaat belum check-in — tidak bisa pickup');
    if (!ibadah.isKidsIbadah) throw BadRequest('Ibadah ini bukan ibadah anak');
    if (existing.status !== 'JOIN') throw BadRequest('Jemaat belum check-in');
    if (existing.pickedUpAt) {
      return res.json({
        success: true,
        data: existing,
        message: `Sudah di-pickup sebelumnya (${existing.pickedUpAt.toISOString()})`,
      });
    }
    const updated = await prisma.reservasi.update({
      where: { id: existing.id },
      data: { pickedUpAt: now },
    });
    audit(req, {
      action: 'UPDATE',
      resource: 'reservasi',
      resourceId: updated.id,
      resourceLabel: `Walk-in pickup: ${jemaat.namaLengkap} ← ${ibadah.nama}`,
      metadata: { method: 'walk-in-pickup' },
      before: existing,
      after: updated,
    });
    return res.json({
      success: true,
      data: { reservasi: updated, jemaat, ibadahNama: ibadah.nama },
      message: `Anak ${jemaat.namaLengkap} berhasil di-pickup`,
    });
  }

  throw BadRequest(`Unknown action: ${action}`);
});

/**
 * Helper: generate 6-digit pickup code unique dalam (ibadah, tanggal) occurrence.
 * Retry sampai 5x kalau collision.
 */
async function generateUniquePickupCode(
  ibadahId: string,
  tanggalIbadah: Date,
): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = String(Math.floor(100000 + Math.random() * 900000));
    const existing = await prisma.reservasi.findFirst({
      where: { ibadahId, tanggalIbadah, pickupCode: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
  }
  throw BadRequest('Gagal generate pickup code — occurrence penuh, retry');
}

// ===== Delete =====

reservasiRouter.delete('/:id', async (req, res) => {
  const before = await prisma.reservasi.findUnique({
    where: { id: req.params.id },
    include: { jemaat: { select: { namaLengkap: true } }, ibadah: { select: { nama: true } } },
  });
  if (!before) throw NotFound('Reservasi tidak ditemukan');
  await prisma.reservasi.delete({ where: { id: req.params.id } });
  audit(req, {
    action: 'DELETE',
    resource: 'reservasi',
    resourceId: before.id,
    resourceLabel: `${before.jemaat.namaLengkap} @ ${before.ibadah.nama}`,
    before,
  });
  res.status(204).end();
});
