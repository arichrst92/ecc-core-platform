/**
 * Gift Stall — endpoints untuk apps/ckids web app.
 *
 * Modul 28. Fulltimer-only. Semua endpoint scope per cabang.
 *
 * Endpoints:
 *   GET  /admin/gift-stall/lookup-jemaat?kode=X&cabangId=Y  → jemaat + balance
 *   GET  /admin/gift-stall/balance?jemaatId=&cabangId=        → balance point anak
 *   POST /admin/gift-stall/redeem                            → deduct point + stock
 *   POST /admin/gift-stall/hadiah/:id/add-stock              → increment stock
 *   POST /admin/gift-stall/adjust-point                       → manual koreksi
 *   GET  /admin/gift-stall/redeems?cabangId=&date=&status=&q= → history
 *   POST /admin/gift-stall/redeems/:id/cancel                 → batal (+ ganti hadiah)
 *   GET  /admin/gift-stall/report/today?cabangId=             → summary hari ini
 */
import { Router } from 'express';
import { prisma } from '@ecc/database';
import { z } from 'zod';
import {
  addStockSchema,
  redeemHadiahSchema,
  adjustPointSchema,
  lookupJemaatByKodeSchema,
} from '@ecc/shared-types';
import { requireFulltimer } from '../../middleware/require-auth.js';
import { BadRequest, NotFound } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import {
  createNotificationBatch,
  resolveGuardianJemaatIds,
} from '../../lib/notification.js';

export const giftStallRouter = Router();
giftStallRouter.use(requireFulltimer);

// ============================================================
// GET /admin/gift-stall/lookup-jemaat
// Query: ?kode=ABCD1234&cabangId=<uuid>
// Return jemaat + balance di cabang tsb.
// ============================================================
giftStallRouter.get('/lookup-jemaat', async (req, res) => {
  const kode = typeof req.query.kode === 'string' ? req.query.kode : '';
  const cabangId = typeof req.query.cabangId === 'string' ? req.query.cabangId : '';
  const parsed = lookupJemaatByKodeSchema.parse({ kode, cabangId });

  const jemaat = await prisma.jemaat.findUnique({
    where: { kode: parsed.kode.toUpperCase() },
    select: {
      id: true,
      namaLengkap: true,
      noHp: true,
      fotoUrl: true,
      tanggalLahir: true,
      cabangId: true,
      cabang: { select: { nama: true } },
      isActive: true,
    },
  });
  if (!jemaat) throw NotFound(`Kode "${parsed.kode}" tidak ditemukan`);
  if (!jemaat.isActive) throw BadRequest('Jemaat tidak aktif');

  const balance = await prisma.jemaatPointBalance.findUnique({
    where: {
      jemaatId_cabangId: { jemaatId: jemaat.id, cabangId: parsed.cabangId },
    },
    select: { balance: true, updatedAt: true },
  });

  res.json({
    success: true,
    data: {
      jemaat,
      cabangId: parsed.cabangId,
      balance: balance?.balance ?? 0,
      lastUpdate: balance?.updatedAt ?? null,
    },
  });
});

// ============================================================
// GET /admin/gift-stall/balance?jemaatId=&cabangId=  → { balance }
// (dipakai modal batal / ganti hadiah)
// ============================================================
giftStallRouter.get('/balance', async (req, res) => {
  const { jemaatId, cabangId } = z
    .object({ jemaatId: z.string().uuid(), cabangId: z.string().uuid() })
    .parse(req.query);
  const b = await prisma.jemaatPointBalance.findUnique({
    where: { jemaatId_cabangId: { jemaatId, cabangId } },
    select: { balance: true },
  });
  res.json({ success: true, data: { balance: b?.balance ?? 0 } });
});

// ============================================================
// POST /admin/gift-stall/redeem
// Body: { jemaatId, hadiahId, note? }
// Atomic: deduct point + decrement stock + insert PointTransaction + HadiahRedeem.
// ============================================================
giftStallRouter.post('/redeem', async (req, res) => {
  const { jemaatId, hadiahId, note } = redeemHadiahSchema.parse(req.body);
  const adminId = req.user?.jemaatId;
  if (!adminId) throw BadRequest('Admin tidak punya jemaatId');

  const hadiah = await prisma.hadiahKatalog.findUnique({
    where: { id: hadiahId },
    include: { cabang: { select: { id: true, nama: true } } },
  });
  if (!hadiah) throw NotFound('Hadiah tidak ditemukan');
  if (!hadiah.isActive) throw BadRequest('Hadiah tidak aktif');
  if (hadiah.stock <= 0) throw BadRequest('Stock hadiah habis');

  const jemaat = await prisma.jemaat.findUnique({
    where: { id: jemaatId },
    select: { id: true, namaLengkap: true, isActive: true },
  });
  if (!jemaat || !jemaat.isActive) throw BadRequest('Jemaat tidak valid');

  const balance = await prisma.jemaatPointBalance.findUnique({
    where: { jemaatId_cabangId: { jemaatId, cabangId: hadiah.cabangId } },
  });
  const currentBalance = balance?.balance ?? 0;
  if (currentBalance < hadiah.pointCost) {
    throw BadRequest(
      `Point tidak cukup. Balance ${currentBalance}, butuh ${hadiah.pointCost}.`,
    );
  }

  // Atomic transaction: stock -1, balance -pointCost, insert tx + redeem.
  const result = await prisma.$transaction(async (tx) => {
    // Decrement stock (re-check dalam transaction untuk avoid race)
    const stockUpdate = await tx.hadiahKatalog.update({
      where: { id: hadiahId },
      data: { stock: { decrement: 1 } },
    });
    if (stockUpdate.stock < 0) {
      throw new Error('Stock race — retry');
    }

    // Deduct balance
    await tx.jemaatPointBalance.upsert({
      where: { jemaatId_cabangId: { jemaatId, cabangId: hadiah.cabangId } },
      create: { jemaatId, cabangId: hadiah.cabangId, balance: -hadiah.pointCost },
      update: { balance: { decrement: hadiah.pointCost } },
    });

    // Create redeem record dengan snapshot
    const redeem = await tx.hadiahRedeem.create({
      data: {
        jemaatId,
        cabangId: hadiah.cabangId,
        hadiahId: hadiah.id,
        pointDeducted: hadiah.pointCost,
        hadiahNama: hadiah.nama,
        hadiahFotoUrl: hadiah.fotoUrl,
        processedById: adminId,
        note: note ?? null,
      },
    });

    // Insert PointTransaction (SPEND)
    await tx.pointTransaction.create({
      data: {
        jemaatId,
        cabangId: hadiah.cabangId,
        type: 'SPEND',
        amount: -hadiah.pointCost,
        source: 'REDEEM',
        referenceId: redeem.id,
        note: note ?? `Redeem ${hadiah.nama}`,
        createdById: adminId,
      },
    });

    return redeem;
  });

  audit(req, {
    action: 'CREATE',
    resource: 'hadiah_redeem',
    resourceId: result.id,
    resourceLabel: `Redeem ${hadiah.nama} untuk ${jemaat.namaLengkap} (-${hadiah.pointCost} pts)`,
    metadata: { jemaatId, hadiahId, pointDeducted: hadiah.pointCost },
  });

  // Notif guardian anak — transparency + anti-fraud
  const newBalance = currentBalance - hadiah.pointCost;
  void notifyGiftRedeemed(jemaat.id, jemaat.namaLengkap, hadiah.nama, hadiah.pointCost, newBalance, result.id);

  res.status(201).json({
    success: true,
    data: {
      redeem: result,
      newBalance,
      newStock: hadiah.stock - 1,
    },
    message: `Redeem berhasil. Sisa balance: ${newBalance}`,
  });
});

// ============================================================
// POST /admin/gift-stall/hadiah/:id/add-stock
// Body: { quantity, note? }
// ============================================================
giftStallRouter.post('/hadiah/:id/add-stock', async (req, res) => {
  const { quantity, note } = addStockSchema.parse(req.body);
  const adminId = req.user?.jemaatId;
  if (!adminId) throw BadRequest('Admin tidak punya jemaatId');

  const hadiah = await prisma.hadiahKatalog.findUnique({
    where: { id: req.params.id },
  });
  if (!hadiah) throw NotFound('Hadiah tidak ditemukan');

  const updated = await prisma.hadiahKatalog.update({
    where: { id: hadiah.id },
    data: { stock: { increment: quantity } },
  });

  audit(req, {
    action: 'UPDATE',
    resource: 'hadiah_katalog',
    resourceId: hadiah.id,
    resourceLabel: `[stock] ${hadiah.nama} +${quantity} → ${updated.stock}`,
    metadata: { quantity, note, prevStock: hadiah.stock, newStock: updated.stock },
    before: hadiah,
    after: updated,
  });

  res.json({
    success: true,
    data: updated,
    message: `Stock ${hadiah.nama}: ${hadiah.stock} → ${updated.stock} (+${quantity})`,
  });
});

// ============================================================
// POST /admin/gift-stall/adjust-point (manual koreksi admin)
// ============================================================
giftStallRouter.post('/adjust-point', async (req, res) => {
  const { jemaatId, cabangId, amount, note } = adjustPointSchema.parse(req.body);
  const adminId = req.user?.jemaatId;
  if (!adminId) throw BadRequest('Admin tidak punya jemaatId');

  const jemaat = await prisma.jemaat.findUnique({
    where: { id: jemaatId },
    select: { id: true, namaLengkap: true, isActive: true },
  });
  if (!jemaat || !jemaat.isActive) throw BadRequest('Jemaat tidak valid');

  const result = await prisma.$transaction(async (tx) => {
    const balance = await tx.jemaatPointBalance.upsert({
      where: { jemaatId_cabangId: { jemaatId, cabangId } },
      create: { jemaatId, cabangId, balance: amount },
      update: { balance: { increment: amount } },
    });
    const txRow = await tx.pointTransaction.create({
      data: {
        jemaatId,
        cabangId,
        type: 'ADJUST',
        amount,
        source: 'MANUAL_ADJUST',
        note,
        createdById: adminId,
      },
    });
    return { balance, txRow };
  });

  audit(req, {
    action: 'UPDATE',
    resource: 'jemaat_point_balance',
    resourceLabel: `[adjust] ${jemaat.namaLengkap}: ${amount > 0 ? '+' : ''}${amount} pts → ${result.balance.balance}`,
    metadata: { jemaatId, cabangId, amount, note, newBalance: result.balance.balance },
  });

  void notifyPointAdjusted(jemaat.id, jemaat.namaLengkap, amount, result.balance.balance, note);

  res.json({ success: true, data: result });
});

// ============================================================
//  Notification helpers (Modul 30)
// ============================================================

/**
 * Notif guardian anak saat redeem hadiah. Transparency + anti-fraud.
 */
async function notifyGiftRedeemed(
  anakId: string,
  anakNama: string,
  hadiahNama: string,
  pointCost: number,
  newBalance: number,
  redeemId: string,
): Promise<void> {
  const guardians = await resolveGuardianJemaatIds(anakId);
  if (guardians.length === 0) return;
  await createNotificationBatch(guardians, {
    type: 'GIFT_REDEEMED',
    title: `${anakNama} tukar ${hadiahNama}`,
    body: `-${pointCost} pts. Balance sekarang: ${newBalance} pts.`,
    actionUrl: '/ckids',
    metadata: { anakId, redeemId, hadiahNama, pointCost, newBalance },
  });
}

/**
 * Notif guardian anak saat point manual di-adjust admin (+/-).
 */
async function notifyPointAdjusted(
  anakId: string,
  anakNama: string,
  amount: number,
  newBalance: number,
  note: string | null | undefined,
): Promise<void> {
  const guardians = await resolveGuardianJemaatIds(anakId);
  if (guardians.length === 0) return;
  const sign = amount > 0 ? '+' : '';
  await createNotificationBatch(guardians, {
    type: 'POINT_ADJUSTED',
    title: `${anakNama} ${sign}${amount} point (koreksi admin)`,
    body: `${note ? `${note}. ` : ''}Balance sekarang: ${newBalance} pts.`,
    actionUrl: '/ckids',
    metadata: { anakId, amount, newBalance, note, source: 'MANUAL_ADJUST' },
  });
}

// ============================================================
// GET /admin/gift-stall/redeems?cabangId=&date=&hadiahId=&adminId=
// Filter redeem history.
// ============================================================
giftStallRouter.get('/redeems', async (req, res) => {
  const cabangId = typeof req.query.cabangId === 'string' ? req.query.cabangId : undefined;
  const dateStr = typeof req.query.date === 'string' ? req.query.date : undefined;
  const hadiahId = typeof req.query.hadiahId === 'string' ? req.query.hadiahId : undefined;
  const adminId = typeof req.query.adminId === 'string' ? req.query.adminId : undefined;
  const status = typeof req.query.status === 'string' ? req.query.status : 'all';
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';

  const where: any = {};
  // status: all | active (belum dibatalkan) | cancelled
  if (status === 'active') where.cancelledAt = null;
  if (status === 'cancelled') where.cancelledAt = { not: null };
  if (q) {
    where.OR = [
      { jemaat: { namaLengkap: { contains: q, mode: 'insensitive' } } },
      { jemaat: { kode: { startsWith: q.toUpperCase() } } },
      { hadiahNama: { contains: q, mode: 'insensitive' } },
    ];
  }
  if (cabangId) where.cabangId = cabangId;
  if (hadiahId) where.hadiahId = hadiahId;
  if (adminId) where.processedById = adminId;
  if (dateStr) {
    const day = new Date(dateStr);
    const nextDay = new Date(day.getTime() + 24 * 60 * 60 * 1000);
    where.processedAt = { gte: day, lt: nextDay };
  }

  const items = await prisma.hadiahRedeem.findMany({
    where,
    orderBy: { processedAt: 'desc' },
    take: 200,
    include: {
      jemaat: { select: { id: true, namaLengkap: true, fotoUrl: true } },
      hadiah: { select: { id: true, nama: true } },
      processedBy: { select: { id: true, namaLengkap: true } },
      cancelledBy: { select: { id: true, namaLengkap: true } },
      cabang: { select: { id: true, nama: true } },
    },
  });

  res.json({ success: true, data: items });
});

// ============================================================
// GET /admin/gift-stall/report/today?cabangId=<uuid>
// Summary + list transaksi hari ini.
// ============================================================
giftStallRouter.get('/report/today', async (req, res) => {
  const cabangId = typeof req.query.cabangId === 'string' ? req.query.cabangId : undefined;
  if (!cabangId) throw BadRequest('cabangId required');

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

  const [redeems, agg] = await Promise.all([
    prisma.hadiahRedeem.findMany({
      where: { cabangId, processedAt: { gte: today, lt: tomorrow }, cancelledAt: null },
      orderBy: { processedAt: 'desc' },
      include: {
        jemaat: { select: { id: true, namaLengkap: true, fotoUrl: true } },
        hadiah: { select: { id: true, nama: true, fotoUrl: true } },
        processedBy: { select: { id: true, namaLengkap: true } },
      },
    }),
    prisma.hadiahRedeem.aggregate({
      where: { cabangId, processedAt: { gte: today, lt: tomorrow }, cancelledAt: null },
      _count: { id: true },
      _sum: { pointDeducted: true },
    }),
  ]);

  const uniqueJemaat = new Set(redeems.map((r) => r.jemaatId)).size;
  // Top hadiah hari ini
  const hadiahCount = new Map<string, { nama: string; count: number }>();
  for (const r of redeems) {
    const cur = hadiahCount.get(r.hadiahId);
    if (cur) cur.count += 1;
    else hadiahCount.set(r.hadiahId, { nama: r.hadiahNama, count: 1 });
  }
  const topHadiah = [...hadiahCount.values()].sort((a, b) => b.count - a.count).slice(0, 5);

  res.json({
    success: true,
    data: {
      date: today.toISOString().slice(0, 10),
      cabangId,
      summary: {
        totalRedeem: agg._count.id ?? 0,
        totalPointSpent: agg._sum.pointDeducted ?? 0,
        uniqueJemaat,
      },
      topHadiah,
      redeems,
    },
  });
});

// ============================================================
// POST /admin/gift-stall/redeems/:id/cancel
// Body: { reason?, replaceHadiahId? }
//   Batalkan penukaran: point dikembalikan ke anak & stok hadiah +1.
//   Dengan replaceHadiahId → sekaligus ditukar ke hadiah lain (satu
//   transaksi; gagal semua kalau stok / point tidak cukup).
// ============================================================
const cancelSchema = z.object({
  reason: z.string().trim().max(500).optional(),
  replaceHadiahId: z.string().uuid().optional(),
});

giftStallRouter.post('/redeems/:id/cancel', async (req, res) => {
  const { reason, replaceHadiahId } = cancelSchema.parse(req.body ?? {});
  const adminId = req.user?.jemaatId;
  if (!adminId) throw BadRequest('Admin tidak punya jemaatId');

  const old = await prisma.hadiahRedeem.findUnique({
    where: { id: req.params.id },
    include: { jemaat: { select: { id: true, namaLengkap: true } } },
  });
  if (!old) throw NotFound('Penukaran tidak ditemukan');
  if (old.cancelledAt) throw BadRequest('Penukaran ini sudah dibatalkan.');

  const newHadiah = replaceHadiahId
    ? await prisma.hadiahKatalog.findUnique({ where: { id: replaceHadiahId } })
    : null;
  if (replaceHadiahId) {
    if (!newHadiah) throw NotFound('Hadiah pengganti tidak ditemukan');
    if (newHadiah.id === old.hadiahId) throw BadRequest('Hadiah pengganti sama dengan hadiah sebelumnya.');
    if (newHadiah.cabangId !== old.cabangId) throw BadRequest('Hadiah pengganti harus dari cabang yang sama.');
    if (!newHadiah.isActive) throw BadRequest('Hadiah pengganti tidak aktif');
    if (newHadiah.stock <= 0) throw BadRequest(`Stok "${newHadiah.nama}" habis`);
  }

  const balance = await prisma.jemaatPointBalance.findUnique({
    where: { jemaatId_cabangId: { jemaatId: old.jemaatId, cabangId: old.cabangId } },
  });
  const afterRefund = (balance?.balance ?? 0) + old.pointDeducted;
  if (newHadiah && afterRefund < newHadiah.pointCost) {
    throw BadRequest(
      `Point tidak cukup untuk "${newHadiah.nama}". Setelah dikembalikan: ${afterRefund}, butuh ${newHadiah.pointCost}.`,
    );
  }

  const label = reason ? `: ${reason}` : '';
  const result = await prisma.$transaction(async (tx) => {
    // Klaim atomik — cegah dobel batal dari dua perangkat.
    const claim = await tx.hadiahRedeem.updateMany({
      where: { id: old.id, cancelledAt: null },
      data: { cancelledAt: new Date(), cancelledById: adminId, cancelReason: reason ?? null },
    });
    if (claim.count === 0) throw BadRequest('Penukaran ini sudah dibatalkan.');

    // Kembalikan stok & point.
    await tx.hadiahKatalog.update({ where: { id: old.hadiahId }, data: { stock: { increment: 1 } } });
    await tx.jemaatPointBalance.upsert({
      where: { jemaatId_cabangId: { jemaatId: old.jemaatId, cabangId: old.cabangId } },
      create: { jemaatId: old.jemaatId, cabangId: old.cabangId, balance: old.pointDeducted },
      update: { balance: { increment: old.pointDeducted } },
    });
    await tx.pointTransaction.create({
      data: {
        jemaatId: old.jemaatId,
        cabangId: old.cabangId,
        type: 'EARN',
        amount: old.pointDeducted,
        source: 'REDEEM_CANCEL',
        referenceId: old.id,
        note: `Batal tukar ${old.hadiahNama}${label}`,
        createdById: adminId,
      },
    });

    let replacement = null as null | { id: string; hadiahNama: string; pointDeducted: number };
    if (newHadiah) {
      const stock = await tx.hadiahKatalog.update({
        where: { id: newHadiah.id },
        data: { stock: { decrement: 1 } },
      });
      if (stock.stock < 0) throw BadRequest(`Stok "${newHadiah.nama}" habis`);
      const bal = await tx.jemaatPointBalance.update({
        where: { jemaatId_cabangId: { jemaatId: old.jemaatId, cabangId: old.cabangId } },
        data: { balance: { decrement: newHadiah.pointCost } },
      });
      if (bal.balance < 0) throw BadRequest('Point tidak cukup');
      const r = await tx.hadiahRedeem.create({
        data: {
          jemaatId: old.jemaatId,
          cabangId: old.cabangId,
          hadiahId: newHadiah.id,
          pointDeducted: newHadiah.pointCost,
          hadiahNama: newHadiah.nama,
          hadiahFotoUrl: newHadiah.fotoUrl,
          processedById: adminId,
          note: `Pengganti ${old.hadiahNama}`,
        },
      });
      await tx.pointTransaction.create({
        data: {
          jemaatId: old.jemaatId,
          cabangId: old.cabangId,
          type: 'SPEND',
          amount: -newHadiah.pointCost,
          source: 'REDEEM',
          referenceId: r.id,
          note: `Redeem ${newHadiah.nama} (ganti ${old.hadiahNama})`,
          createdById: adminId,
        },
      });
      await tx.hadiahRedeem.update({ where: { id: old.id }, data: { replacedByRedeemId: r.id } });
      replacement = { id: r.id, hadiahNama: r.hadiahNama, pointDeducted: r.pointDeducted };
    }

    const finalBal = await tx.jemaatPointBalance.findUnique({
      where: { jemaatId_cabangId: { jemaatId: old.jemaatId, cabangId: old.cabangId } },
      select: { balance: true },
    });
    return { replacement, newBalance: finalBal?.balance ?? 0 };
  });

  audit(req, {
    action: 'UPDATE',
    resource: 'hadiah_redeem',
    resourceId: old.id,
    resourceLabel: result.replacement
      ? `Ganti hadiah ${old.jemaat.namaLengkap}: ${old.hadiahNama} → ${result.replacement.hadiahNama}`
      : `Batal tukar ${old.hadiahNama} untuk ${old.jemaat.namaLengkap} (+${old.pointDeducted} pts)`,
    metadata: { reason, replaceHadiahId, replacementRedeemId: result.replacement?.id ?? null },
  });

  // Kabari orang tua / wali — transparansi.
  void (async () => {
    const guardians = await resolveGuardianJemaatIds(old.jemaatId);
    if (!guardians.length) return;
    await createNotificationBatch(guardians, {
      type: result.replacement ? 'GIFT_REDEEMED' : 'POINT_ADJUSTED',
      title: result.replacement
        ? `${old.jemaat.namaLengkap} ganti hadiah: ${old.hadiahNama} → ${result.replacement.hadiahNama}`
        : `Penukaran ${old.hadiahNama} dibatalkan`,
      body: result.replacement
        ? `+${old.pointDeducted} / -${result.replacement.pointDeducted} pts. Balance sekarang: ${result.newBalance} pts.`
        : `${old.pointDeducted} pts dikembalikan ke ${old.jemaat.namaLengkap}. Balance sekarang: ${result.newBalance} pts.`,
      actionUrl: '/ckids',
      metadata: { anakId: old.jemaatId, redeemId: old.id, replacementRedeemId: result.replacement?.id ?? null },
    });
  })().catch(() => {});

  res.json({
    success: true,
    data: { cancelledId: old.id, refunded: old.pointDeducted, ...result },
    message: result.replacement
      ? `Diganti ke ${result.replacement.hadiahNama}. Sisa point: ${result.newBalance}`
      : `Dibatalkan. ${old.pointDeducted} point dikembalikan. Sisa point: ${result.newBalance}`,
  });
});
