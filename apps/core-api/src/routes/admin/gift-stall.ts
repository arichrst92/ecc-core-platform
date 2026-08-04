/**
 * Gift Stall — endpoints untuk apps/ckids web app.
 *
 * Modul 28. Fulltimer-only. Semua endpoint scope per cabang.
 *
 * Endpoints:
 *   GET  /admin/gift-stall/lookup-jemaat?kode=X&cabangId=Y  → jemaat + balance
 *   POST /admin/gift-stall/redeem                            → deduct point + stock
 *   POST /admin/gift-stall/hadiah/:id/add-stock              → increment stock
 *   POST /admin/gift-stall/adjust-point                       → manual koreksi
 *   GET  /admin/gift-stall/redeems?cabangId=&date=            → history
 *   GET  /admin/gift-stall/report/today?cabangId=             → summary hari ini
 */
import { Router } from 'express';
import { prisma } from '@ecc/database';
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
    actionUrl: `/ckids/anak/${anakId}/history`,
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
    actionUrl: `/ckids/anak/${anakId}`,
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

  const where: any = {};
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
      where: { cabangId, processedAt: { gte: today, lt: tomorrow } },
      orderBy: { processedAt: 'desc' },
      include: {
        jemaat: { select: { id: true, namaLengkap: true, fotoUrl: true } },
        hadiah: { select: { id: true, nama: true, fotoUrl: true } },
        processedBy: { select: { id: true, namaLengkap: true } },
      },
    }),
    prisma.hadiahRedeem.aggregate({
      where: { cabangId, processedAt: { gte: today, lt: tomorrow } },
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
