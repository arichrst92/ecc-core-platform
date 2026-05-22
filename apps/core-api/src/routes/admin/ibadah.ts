import { Router } from 'express';
import { prisma } from '@ecc/database';
import {
  createIbadahSchema,
  updateIbadahSchema,
  createKategoriIbadahSchema,
  updateKategoriIbadahSchema,
  cancelOccurrenceSchema,
  ibadahCheckinSchema,
  paginationQuerySchema,
} from '@ecc/shared-types';
import { NotFound, BadRequest, Forbidden, Conflict } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { generateOccurrences } from '../../lib/ibadah-occurrences.js';
import { generateUniqueKode } from '../../lib/kode-reservasi.js';

export const ibadahRouter = Router();

// ===== Kategori Ibadah =====
ibadahRouter.get('/kategori', async (req, res) => {
  const q = paginationQuerySchema.parse(req.query);
  const where = q.search
    ? { nama: { contains: q.search, mode: 'insensitive' as const } }
    : {};
  const [data, total] = await Promise.all([
    prisma.kategoriIbadah.findMany({
      where,
      skip: (q.page - 1) * q.limit,
      take: q.limit,
      orderBy: { [q.sortBy ?? 'nama']: q.sortOrder },
    }),
    prisma.kategoriIbadah.count({ where }),
  ]);
  res.json({
    success: true,
    data,
    meta: { page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit) },
  });
});

ibadahRouter.post('/kategori', async (req, res) => {
  const input = createKategoriIbadahSchema.parse(req.body);
  const created = await prisma.kategoriIbadah.create({ data: input });
  audit(req, { action: 'CREATE', resource: 'kategori_ibadah', resourceId: created.id, resourceLabel: created.nama, after: created });
  res.status(201).json({ success: true, data: created });
});

ibadahRouter.patch('/kategori/:id', async (req, res) => {
  const input = updateKategoriIbadahSchema.parse(req.body);
  const before = await prisma.kategoriIbadah.findUnique({ where: { id: req.params.id } });
  if (!before) throw NotFound('Kategori tidak ditemukan');
  const updated = await prisma.kategoriIbadah.update({ where: { id: req.params.id }, data: input });
  audit(req, { action: 'UPDATE', resource: 'kategori_ibadah', resourceId: updated.id, resourceLabel: updated.nama, before, after: updated });
  res.json({ success: true, data: updated });
});

ibadahRouter.delete('/kategori/:id', async (req, res) => {
  const before = await prisma.kategoriIbadah.findUnique({ where: { id: req.params.id } });
  if (!before) throw NotFound('Kategori tidak ditemukan');
  await prisma.kategoriIbadah.delete({ where: { id: req.params.id } });
  audit(req, { action: 'DELETE', resource: 'kategori_ibadah', resourceId: before.id, resourceLabel: before.nama, before });
  res.status(204).end();
});

// ===== Calendar — occurrences di rentang tanggal =====
ibadahRouter.get('/calendar', async (req, res) => {
  const fromStr = typeof req.query.from === 'string' ? req.query.from : undefined;
  const toStr = typeof req.query.to === 'string' ? req.query.to : undefined;
  if (!fromStr || !toStr) throw BadRequest('Query `from` dan `to` (YYYY-MM-DD) wajib');
  const from = new Date(fromStr);
  const to = new Date(toStr);
  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    throw BadRequest('Format tanggal harus YYYY-MM-DD');
  }
  // Limit range max 366 hari supaya tidak overload
  const DAY = 1000 * 60 * 60 * 24;
  if ((to.getTime() - from.getTime()) / DAY > 366) {
    throw BadRequest('Rentang max 366 hari');
  }
  // End-of-day untuk `to` supaya inclusive — pakai UTC supaya konsisten dengan
  // tanggalMulai (UTC midnight) & generator yang sekarang full-UTC.
  to.setUTCHours(23, 59, 59, 999);

  const cabangId = typeof req.query.cabangId === 'string' ? req.query.cabangId : undefined;
  const kategoriIbadahId = typeof req.query.kategoriIbadahId === 'string' ? req.query.kategoriIbadahId : undefined;

  const where: any = { isActive: true };
  if (cabangId) where.cabangId = cabangId;
  if (kategoriIbadahId) where.kategoriIbadahId = kategoriIbadahId;

  const ibadahs = await prisma.ibadah.findMany({
    where,
    include: {
      cabang: { select: { id: true, nama: true } },
      kategoriIbadah: { select: { id: true, nama: true } },
    },
  });

  // Ambil semua occurrence override (CANCELLED) di rentang ini → skip dari
  // calendar. Untuk performa cukup query satu shot dengan filter ibadahId IN.
  const ibadahIds = ibadahs.map((i) => i.id);
  const cancelledRows = ibadahIds.length
    ? await prisma.ibadahOccurrenceStatus.findMany({
        where: {
          ibadahId: { in: ibadahIds },
          tanggalIbadah: { gte: from, lte: to },
          status: 'CANCELLED',
        },
      })
    : [];
  const cancelledSet = new Set(
    cancelledRows.map((r) => `${r.ibadahId}:${r.tanggalIbadah.toISOString().slice(0, 10)}`),
  );

  // Generate occurrences per ibadah, flatten ke array tanggal+ibadah
  const events: {
    ibadahId: string;
    tanggal: string; // ISO YYYY-MM-DD
    nama: string;
    jamMulai: string;
    jamSelesai: string;
    cabang: { id: string; nama: string };
    kategoriIbadah: { id: string; nama: string };
    tipeJadwal: string;
    lokasi: string | null;
    isOnline: boolean;
  }[] = [];

  for (const i of ibadahs) {
    const dates = generateOccurrences(
      { tipeJadwal: i.tipeJadwal, tanggalMulai: i.tanggalMulai, hari: i.hari },
      from,
      to,
    );
    for (const d of dates) {
      const iso = d.toISOString().slice(0, 10);
      // Skip kalau occurrence ini ditiadakan
      if (cancelledSet.has(`${i.id}:${iso}`)) continue;
      events.push({
        ibadahId: i.id,
        tanggal: iso,
        nama: i.nama,
        jamMulai: i.jamMulai,
        jamSelesai: i.jamSelesai,
        cabang: i.cabang!,
        kategoriIbadah: i.kategoriIbadah!,
        tipeJadwal: i.tipeJadwal,
        lokasi: i.lokasi,
        isOnline: i.isOnline,
      });
    }
  }

  // Sort by tanggal + jam
  events.sort((a, b) => {
    if (a.tanggal !== b.tanggal) return a.tanggal.localeCompare(b.tanggal);
    return a.jamMulai.localeCompare(b.jamMulai);
  });

  res.json({ success: true, data: events, meta: { from: fromStr, to: toStr, count: events.length } });
});

// ===== Ibadah =====
ibadahRouter.get('/', async (req, res) => {
  const q = paginationQuerySchema.parse(req.query);
  const where = q.search
    ? { nama: { contains: q.search, mode: 'insensitive' as const } }
    : {};
  const [rows, total] = await Promise.all([
    prisma.ibadah.findMany({
      where,
      skip: (q.page - 1) * q.limit,
      take: q.limit,
      orderBy: [{ kategoriIbadah: { nama: 'asc' } }, { [q.sortBy ?? 'nama']: q.sortOrder }],
      include: {
        cabang: { select: { id: true, nama: true } },
        kategoriIbadah: { select: { id: true, nama: true } },
        // Nested count untuk hitung total petugas: sum dari semua ibadahPelayanan link
        ibadahPelayanan: { select: { _count: { select: { petugas: true } } } },
      },
    }),
    prisma.ibadah.count({ where }),
  ]);
  // Flatten: petugasCount = sum petugas dari semua linked pelayanan
  const data = rows.map((i) => {
    const { ibadahPelayanan, ...rest } = i;
    const petugasCount = ibadahPelayanan.reduce((sum, ip) => sum + ip._count.petugas, 0);
    const pelayananCount = ibadahPelayanan.length;
    return { ...rest, petugasCount, pelayananCount };
  });
  res.json({
    success: true,
    data,
    meta: { page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit) },
  });
});

ibadahRouter.get('/:id', async (req, res) => {
  const item = await prisma.ibadah.findUnique({
    where: { id: req.params.id },
    include: { cabang: true, kategoriIbadah: true },
  });
  if (!item) throw NotFound('Ibadah tidak ditemukan');
  res.json({ success: true, data: item });
});

ibadahRouter.post('/', async (req, res) => {
  const input = createIbadahSchema.parse(req.body);
  const data = { ...input, tanggalMulai: new Date(input.tanggalMulai) };
  const created = await prisma.ibadah.create({ data });
  audit(req, { action: 'CREATE', resource: 'ibadah', resourceId: created.id, resourceLabel: created.nama, after: created });
  res.status(201).json({ success: true, data: created });
});

ibadahRouter.patch('/:id', async (req, res) => {
  const input = updateIbadahSchema.parse(req.body);
  const data = {
    ...input,
    tanggalMulai: input.tanggalMulai ? new Date(input.tanggalMulai) : undefined,
  };
  const before = await prisma.ibadah.findUnique({ where: { id: req.params.id } });
  if (!before) throw NotFound('Ibadah tidak ditemukan');
  const updated = await prisma.ibadah.update({ where: { id: req.params.id }, data });
  audit(req, { action: 'UPDATE', resource: 'ibadah', resourceId: updated.id, resourceLabel: updated.nama, before, after: updated });
  res.json({ success: true, data: updated });
});

ibadahRouter.delete('/:id', async (req, res) => {
  const before = await prisma.ibadah.findUnique({ where: { id: req.params.id } });
  if (!before) throw NotFound('Ibadah tidak ditemukan');
  await prisma.ibadah.delete({ where: { id: req.params.id } });
  audit(req, { action: 'DELETE', resource: 'ibadah', resourceId: before.id, resourceLabel: before.nama, before });
  res.status(204).end();
});

// ============================================================
// Occurrence cancel / restore
// ============================================================
// Skenario: ibadah recurring (mis. Minggu Pagi) tetap diaktifkan, tapi satu
// tanggal tertentu ingin di-skip (mis. minggu yang bertepatan dengan Natal).
//
// Endpoint:
//   GET    /admin/ibadah/:id/occurrence/cancelled
//   POST   /admin/ibadah/:id/occurrence/:tanggal/cancel   (idempotent)
//   DELETE /admin/ibadah/:id/occurrence/:tanggal/cancel   (restore)
//
// Side effect saat cancel: semua reservasi dengan status RESERVE/JOIN pada
// (ibadahId, tanggal) di-set ke CANCEL dengan catatan alasan.
// ============================================================

function parseTanggal(input: string): Date {
  // Strict YYYY-MM-DD — return UTC midnight supaya konsisten dengan
  // @db.Date Prisma & generator occurrence.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    throw BadRequest('Format tanggal harus YYYY-MM-DD');
  }
  const d = new Date(input);
  if (isNaN(d.getTime())) throw BadRequest('Tanggal tidak valid');
  return d;
}

/**
 * "Today" sebagai calendar-date di TZ server (proses Node), di-construct
 * sebagai UTC midnight. Server ECC jalan di WIB → ini adalah hari ini-nya
 * jemaat. Tanpa konversi via Date.UTC, `setHours(0,0,0,0)` pada Date baru
 * akan return LOCAL midnight (UTC 17:00 hari sebelumnya di WIB), yang tidak
 * cocok dgn `tanggalIbadah` di DB (UTC midnight). Lihat ibadah-occurrences.ts.
 */
function todayAsUtcMidnight(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

ibadahRouter.get('/:id/occurrence/cancelled', async (req, res) => {
  const ibadah = await prisma.ibadah.findUnique({ where: { id: req.params.id } });
  if (!ibadah) throw NotFound('Ibadah tidak ditemukan');
  const data = await prisma.ibadahOccurrenceStatus.findMany({
    where: { ibadahId: req.params.id, status: 'CANCELLED' },
    orderBy: { tanggalIbadah: 'asc' },
  });
  res.json({ success: true, data });
});

ibadahRouter.post('/:id/occurrence/:tanggal/cancel', async (req, res) => {
  const ibadah = await prisma.ibadah.findUnique({ where: { id: req.params.id } });
  if (!ibadah) throw NotFound('Ibadah tidak ditemukan');
  const tanggalDate = parseTanggal(req.params.tanggal);
  const input = cancelOccurrenceSchema.parse(req.body ?? {});

  // Validasi: pastikan tanggal benar-benar adalah occurrence dari ibadah ini
  // (mencegah cancel tanggal sembarangan yang bahkan tidak terjadwal).
  const occurrences = generateOccurrences(
    { tipeJadwal: ibadah.tipeJadwal, tanggalMulai: ibadah.tanggalMulai, hari: ibadah.hari },
    tanggalDate,
    tanggalDate,
  );
  if (occurrences.length === 0) {
    throw BadRequest(
      `Tanggal ${req.params.tanggal} bukan jadwal ibadah "${ibadah.nama}".`,
    );
  }

  const reasonNote = input.catatan ?? 'Ibadah ditiadakan oleh admin';
  const userId = (req as any).user?.id as string | undefined;

  // Transaction: upsert occurrence status + auto-cancel reservasi aktif
  const { occurrence, cancelledReservations } = await prisma.$transaction(async (tx) => {
    const occurrence = await tx.ibadahOccurrenceStatus.upsert({
      where: {
        ibadahId_tanggalIbadah: { ibadahId: ibadah.id, tanggalIbadah: tanggalDate },
      },
      create: {
        ibadahId: ibadah.id,
        tanggalIbadah: tanggalDate,
        status: 'CANCELLED',
        catatan: input.catatan,
        createdBy: userId,
      },
      update: {
        status: 'CANCELLED',
        catatan: input.catatan,
      },
    });

    // Auto-cancel reservasi yang masih RESERVE / JOIN pada tanggal ini.
    // Catatan tetap mencantumkan alasan supaya jemaat tahu kalau dikomunikasikan.
    const updated = await tx.reservasi.updateMany({
      where: {
        ibadahId: ibadah.id,
        tanggalIbadah: tanggalDate,
        status: { in: ['RESERVE', 'JOIN'] },
      },
      data: {
        status: 'CANCEL',
        cancelledAt: new Date(),
        catatan: `[Ibadah ditiadakan] ${reasonNote}`,
      },
    });

    return { occurrence, cancelledReservations: updated.count };
  });

  audit(req, {
    action: 'CREATE',
    resource: 'ibadah_occurrence_status',
    resourceId: occurrence.id,
    resourceLabel: `${ibadah.nama} @ ${req.params.tanggal} — CANCELLED (${cancelledReservations} reservasi dibatalkan)`,
    after: occurrence,
  });

  // TODO(notif): trigger notifikasi ke jemaat yang reservasi-nya di-cancel.
  // Sistem notif belum ada; perlu epic terpisah. Untuk sekarang admin perlu
  // umumkan manual lewat channel lain.
  res.json({
    success: true,
    data: occurrence,
    meta: { cancelledReservations },
  });
});

ibadahRouter.delete('/:id/occurrence/:tanggal/cancel', async (req, res) => {
  const ibadah = await prisma.ibadah.findUnique({ where: { id: req.params.id } });
  if (!ibadah) throw NotFound('Ibadah tidak ditemukan');
  const tanggalDate = parseTanggal(req.params.tanggal);

  const existing = await prisma.ibadahOccurrenceStatus.findUnique({
    where: {
      ibadahId_tanggalIbadah: { ibadahId: ibadah.id, tanggalIbadah: tanggalDate },
    },
  });
  if (!existing) throw NotFound('Occurrence tersebut tidak ditandai dibatalkan');

  await prisma.ibadahOccurrenceStatus.delete({ where: { id: existing.id } });
  audit(req, {
    action: 'DELETE',
    resource: 'ibadah_occurrence_status',
    resourceId: existing.id,
    resourceLabel: `${ibadah.nama} @ ${req.params.tanggal} — restore`,
    before: existing,
  });
  // NOTE: Reservasi yang sudah di-cancel TIDAK auto-restore. Admin harus
  // menambahkan reservasi baru kalau perlu.
  res.status(204).end();
});

// ============================================================
// Check-in kehadiran ibadah via scan QR kode jemaat.
// ============================================================
// Berbeda dengan flow lama (kode reservasi per row), flow ini menggunakan
// `kode` STATIS milik jemaat — sama dengan event check-in. Jemaat cukup
// menunjukkan kartu QR mereka di setiap kehadiran.
//
// Workflow:
//   1. Authorization: user (fulltimer) harus terdaftar di IbadahPelayananPetugas
//      tied ke ibadah ini dengan canScanAttendance=true (permissive: tidak
//      peduli tanggalIbadah row petugas).
//   2. Tanggal default = hari ini, atau override via body.tanggalIbadah.
//      Validate tanggal harus jadwal valid occurrence ibadah ini (skip kalau
//      occurrence sudah CANCELLED).
//   3. Lookup jemaat by kode → cari Reservasi(ibadah, jemaat, tanggal).
//   4. Kalau ada reservasi: update status ke JOIN, joinedAt=now.
//      Kalau tidak ada: auto-create reservasi dengan status JOIN (walk-in
//      attendance). Tetap audit-friendly karena ada row di tabel reservasi.
//   5. Idempotent: kalau sudah JOIN, return alreadyCheckedIn=true.
// ============================================================

ibadahRouter.post('/:id/checkin', async (req, res) => {
  const ibadah = await prisma.ibadah.findUnique({ where: { id: req.params.id } });
  if (!ibadah) throw NotFound('Ibadah tidak ditemukan');

  // Authorization
  if (!req.user) throw Forbidden('User tidak terautentikasi');
  const callerUser = await prisma.user.findUnique({
    where: { id: req.user.sub },
    select: { jemaatId: true, jemaat: { select: { namaLengkap: true } } },
  });
  if (!callerUser) throw Forbidden('User tidak terkait jemaat');
  const isAuthorized = await prisma.ibadahPelayananPetugas.findFirst({
    where: {
      jemaatId: callerUser.jemaatId,
      canScanAttendance: true,
      ibadahPelayanan: { ibadahId: ibadah.id },
    },
    select: { id: true },
  });
  if (!isAuthorized) {
    throw Forbidden(
      `${callerUser.jemaat.namaLengkap} tidak berwenang scan check-in ibadah "${ibadah.nama}". ` +
        'Hubungi admin untuk minta akses sebagai authorized scanner.',
    );
  }

  const input = ibadahCheckinSchema.parse(req.body);

  // Resolve tanggal — default hari ini (UTC midnight, biar match @db.Date)
  let tanggalDate: Date;
  if (input.tanggalIbadah) {
    tanggalDate = parseTanggal(input.tanggalIbadah);
  } else {
    tanggalDate = todayAsUtcMidnight();
  }
  const tanggalIso = tanggalDate.toISOString().slice(0, 10);

  // Validate tanggal harus occurrence valid (sesuai jadwal recurring/ONCE)
  const occurrences = generateOccurrences(
    { tipeJadwal: ibadah.tipeJadwal, tanggalMulai: ibadah.tanggalMulai, hari: ibadah.hari },
    tanggalDate,
    tanggalDate,
  );
  if (occurrences.length === 0) {
    throw BadRequest(
      `Tanggal ${tanggalIso} bukan jadwal ibadah "${ibadah.nama}".`,
    );
  }

  // Cek apakah occurrence sudah ditiadakan
  const cancelled = await prisma.ibadahOccurrenceStatus.findUnique({
    where: {
      ibadahId_tanggalIbadah: { ibadahId: ibadah.id, tanggalIbadah: tanggalDate },
    },
  });
  if (cancelled && !input.force) {
    throw Conflict(
      `Ibadah "${ibadah.nama}" pada ${tanggalIso} sudah ditiadakan. ` +
        'Kirim ulang dengan force=true untuk tetap check-in.',
    );
  }

  // Lookup jemaat by kode
  const jemaat = await prisma.jemaat.findUnique({
    where: { kode: input.kode },
    select: { id: true, namaLengkap: true, fotoUrl: true, noHp: true, isActive: true },
  });
  if (!jemaat) {
    throw NotFound(`Kode jemaat "${input.kode}" tidak ditemukan.`);
  }
  if (!jemaat.isActive) {
    throw BadRequest(`Jemaat "${jemaat.namaLengkap}" sudah nonaktif — tidak bisa check-in.`);
  }

  // Cari reservasi existing
  const existing = await prisma.reservasi.findUnique({
    where: {
      jemaatId_ibadahId_tanggalIbadah: {
        jemaatId: jemaat.id,
        ibadahId: ibadah.id,
        tanggalIbadah: tanggalDate,
      },
    },
  });

  // Idempotent: sudah JOIN → return data tanpa update
  if (existing && existing.status === 'JOIN') {
    return res.json({
      success: true,
      data: { ...existing, jemaat },
      meta: { alreadyCheckedIn: true, walkIn: false },
    });
  }

  const now = new Date();
  let updated;
  if (existing) {
    // Update status existing (mungkin RESERVE atau CANCEL → JOIN)
    updated = await prisma.reservasi.update({
      where: { id: existing.id },
      data: {
        status: 'JOIN',
        joinedAt: now,
        cancelledAt: existing.status === 'CANCEL' ? null : existing.cancelledAt,
        checkedInBy: req.user.sub,
      },
      include: { jemaat: { select: { id: true, namaLengkap: true, fotoUrl: true, noHp: true } } },
    });
  } else {
    // Walk-in: auto-create reservasi dengan status JOIN
    const kodeReservasi = await generateUniqueKode(
      async (k) => !!(await prisma.reservasi.findUnique({ where: { kode: k } })),
    );
    updated = await prisma.reservasi.create({
      data: {
        jemaatId: jemaat.id,
        ibadahId: ibadah.id,
        tanggalIbadah: tanggalDate,
        kode: kodeReservasi,
        status: 'JOIN',
        joinedAt: now,
        checkedInBy: req.user.sub,
      },
      include: { jemaat: { select: { id: true, namaLengkap: true, fotoUrl: true, noHp: true } } },
    });
  }

  audit(req, {
    action: 'UPDATE',
    resource: 'reservasi',
    resourceId: updated.id,
    resourceLabel: `checkin ${jemaat.namaLengkap} @ ${ibadah.nama} (${tanggalIso})`,
    before: existing ?? null,
    after: updated,
    metadata: {
      kind: 'ibadah-checkin',
      kode: input.kode,
      walkIn: !existing,
      force: input.force,
    },
  });

  res.json({
    success: true,
    data: updated,
    meta: { alreadyCheckedIn: false, walkIn: !existing },
  });
});

// ============================================================
// Stats kehadiran ibadah per tanggal occurrence.
// ============================================================
// Polling-friendly untuk scanner mode mobile.
//   GET /admin/ibadah/:id/checkin/stats?tanggalIbadah=2026-05-19
//     → { reserved, joined, cancelled, walkIn, total, lastUpdated }
// ============================================================
ibadahRouter.get('/:id/checkin/stats', async (req, res) => {
  const ibadah = await prisma.ibadah.findUnique({ where: { id: req.params.id } });
  if (!ibadah) throw NotFound('Ibadah tidak ditemukan');

  // Tanggal default = hari ini (UTC midnight, biar match @db.Date)
  let tanggalDate: Date;
  const tanggalStr = typeof req.query.tanggalIbadah === 'string' ? req.query.tanggalIbadah : undefined;
  if (tanggalStr) {
    tanggalDate = parseTanggal(tanggalStr);
  } else {
    tanggalDate = todayAsUtcMidnight();
  }
  const tanggalIso = tanggalDate.toISOString().slice(0, 10);

  const grouped = await prisma.reservasi.groupBy({
    by: ['status'],
    where: { ibadahId: ibadah.id, tanggalIbadah: tanggalDate },
    _count: { _all: true },
  });
  const byStatus = { RESERVE: 0, JOIN: 0, CANCEL: 0 };
  for (const g of grouped) byStatus[g.status] = g._count._all;

  res.json({
    success: true,
    data: {
      ibadahId: ibadah.id,
      tanggalIbadah: tanggalIso,
      reserved: byStatus.RESERVE,
      joined: byStatus.JOIN,
      cancelled: byStatus.CANCEL,
      total: byStatus.RESERVE + byStatus.JOIN,
      lastUpdated: new Date().toISOString(),
    },
  });
});
