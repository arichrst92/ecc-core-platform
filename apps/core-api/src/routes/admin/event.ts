/**
 * Admin routes untuk Movement → Event.
 *
 * Pola yang dipakai banyak konsisten dengan _konten-factory.ts:
 *   - Slug auto-generate + ensureUnique
 *   - Audience scope (sinodeId / cabangId)
 *   - Hero image upload (sharp → webp)
 *
 * Tambahan event-spesifik:
 *   - QRIS image upload (info pembayaran per event)
 *   - Participation lifecycle (DAFTAR → MENUNGGU_VERIFIKASI → BAYAR → HADIR / BATAL)
 *   - Bukti transfer upload per participation + admin approval
 */
import { Router } from 'express';
import { prisma, type Prisma } from '@ecc/database';
import {
  createEventSchema,
  updateEventSchema,
  registerEventParticipationSchema,
  updateEventParticipationSchema,
  batchRegisterEventParticipationSchema,
  createEventDonationSchema,
  updateEventDonationSchema,
  linkEventPelayananSchema,
  assignEventVolunteerSchema,
  updateEventVolunteerSchema,
  eventCheckinSchema,
  paginationQuerySchema,
} from '@ecc/shared-types';
import { ApiError, BadRequest, Conflict, Forbidden, NotFound, Unauthorized } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import {
  saveContentHero,
  deleteContentHero,
  saveEventQris,
  deleteEventQris,
  saveEventBuktiTransfer,
  deleteEventBuktiTransfer,
  saveEventDonationBukti,
  deleteEventDonationBukti,
} from '../../lib/storage.js';
import { idOrSlugWhere } from '../../lib/id-or-slug.js';
import { getFamilyJemaatIds } from '../../lib/family-relation.js';
import { flexImageUpload } from '../../lib/image-upload.js';
import { createNotification } from '../../lib/notification.js';

export const eventRouter = Router();

// Upload pakai `flexImageUpload()` dari lib — accept field name fleksibel
// (foto/bukti/file/image), MIME lebih luas (HEIC/HEIF untuk iOS), max 5MB.

/**
 * Resolve approver jemaatId untuk approve action di event participation/donation.
 *
 * Approver field di EventParticipation + EventDonation relasi ke Jemaat
 * (bukan User). Kalau JWT stale (mis. setelah `prisma migrate reset` di local
 * dev), `req.user.jemaatId` bisa point ke jemaat yang sudah tidak ada di DB
 * → Prisma throw P2025 saat nested connect. Helper ini verify dulu — kalau
 * tidak ada, return undefined (approver field di-skip, audit trail tetap
 * jalan tanpa attribution).
 *
 * Catatan: kalau ini sering terjadi (production), pertimbangkan force logout
 * user. Untuk dev local, biar tidak block flow.
 */
async function resolveApproverJemaatId(
  req: import('express').Request,
): Promise<string | undefined> {
  const jemaatId = req.user?.jemaatId;
  if (!jemaatId) return undefined;
  const exists = await prisma.jemaat.findUnique({
    where: { id: jemaatId },
    select: { id: true },
  });
  if (!exists) {
    // JWT stale — jemaat tidak ada di DB. Skip approver attribution
    // supaya operasi tidak fail. Frontend tetap dapat success response.
    return undefined;
  }
  return jemaatId;
}

/**
 * Resolve Event by id (UUID) atau slug — throw NotFound kalau tidak ada.
 * Pakai untuk endpoint mobile-facing yang accept keduanya (mis. donations).
 *
 * Kalau langsung `prisma.event.findUnique({ where: { id: key } })`, Postgres
 * throw `invalid input syntax for type uuid` (P2023) saat key bukan UUID
 * (mis. slug "penggalangan-dana-2026").
 */
async function resolveEventByIdOrSlug(idOrSlug: string) {
  const event = await prisma.event.findFirst({ where: idOrSlugWhere(idOrSlug) });
  if (!event) throw NotFound('Event tidak ditemukan');
  return event;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 250);
}

async function ensureUniqueSlug(base: string, excludeId?: string): Promise<string> {
  let slug = base;
  let n = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const existing = await prisma.event.findUnique({ where: { slug } });
    if (!existing || existing.id === excludeId) return slug;
    n += 1;
    slug = `${base}-${n}`;
    if (n > 100) throw BadRequest('Tidak bisa generate slug unique');
  }
}

// ============================================================
//  Event CRUD
// ============================================================

eventRouter.get('/', async (req, res) => {
  const q = paginationQuerySchema.parse(req.query);
  const sinodeId = typeof req.query.sinodeId === 'string' ? req.query.sinodeId : undefined;
  const cabangId = typeof req.query.cabangId === 'string' ? req.query.cabangId : undefined;
  const tipeBayar = typeof req.query.tipeBayar === 'string' ? req.query.tipeBayar : undefined;
  const isPublishedRaw = req.query.isPublished;
  const isPublished =
    isPublishedRaw === 'true' ? true : isPublishedRaw === 'false' ? false : undefined;

  const where: Prisma.EventWhereInput = {};
  if (sinodeId) where.sinodeId = sinodeId;
  if (cabangId) where.cabangId = cabangId;
  if (typeof isPublished === 'boolean') where.isPublished = isPublished;
  if (tipeBayar && ['GRATIS', 'NOMINAL_TETAP', 'NOMINAL_BEBAS'].includes(tipeBayar)) {
    where.tipeBayar = tipeBayar as Prisma.EventWhereInput['tipeBayar'];
  }
  if (q.search) {
    where.OR = [
      { judul: { contains: q.search, mode: 'insensitive' } },
      { ringkasan: { contains: q.search, mode: 'insensitive' } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.event.findMany({
      where,
      skip: (q.page - 1) * q.limit,
      take: q.limit,
      orderBy: [{ tanggalMulai: 'desc' }, { createdAt: 'desc' }],
      include: {
        sinode: { select: { id: true, nama: true } },
        cabang: { select: { id: true, nama: true } },
        author: { select: { id: true, jemaat: { select: { namaLengkap: true } } } },
        // pesertaCount exclude BATAL (per backend-request-pesertacount-exclude-batal.md
        // 2026-09-01). Alias `partisipasiAll` return total termasuk BATAL untuk audit.
        _count: {
          select: {
            partisipasi: { where: { status: { not: 'BATAL' } } },
          },
        },
      },
    }),
    prisma.event.count({ where }),
  ]);

  const data = rows.map((r) => ({
    ...r,
    pesertaCount: r._count.partisipasi,
  }));

  res.json({
    success: true,
    data,
    meta: { page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit) },
  });
});

// Detail by id atau slug.
// Note: pakai helper `idOrSlugWhere` supaya tidak crash Postgres saat key
// adalah slug — kalau langsung `OR: [{id: key}, {slug: key}]` dan key bukan
// UUID, Postgres throw `invalid input syntax for type uuid`.
//
// Response include `myParticipation` field — partisipasi user current (atau
// null kalau belum daftar). Per request mobile 2026-05-21 `backend-request-
// event-participation-status.md`. Mobile pakai field ini sebagai source of
// truth untuk render CTA event detail ("Daftar Sekarang" vs "Lanjut Pembayaran"
// vs "Menunggu Verifikasi" dll) — daripada rely on local storage yang fragile
// di edge case (fresh install, device change, storage corruption).
eventRouter.get('/:idOrSlug', async (req, res) => {
  const key = req.params.idOrSlug;
  const item = await prisma.event.findFirst({
    where: idOrSlugWhere(key),
    include: {
      sinode: { select: { id: true, nama: true } },
      cabang: { select: { id: true, nama: true } },
      author: { select: { id: true, jemaat: { select: { id: true, namaLengkap: true } } } },
      // pesertaCount exclude BATAL (per backend-request-pesertacount-exclude-batal.md 2026-09-01).
      _count: {
        select: {
          partisipasi: { where: { status: { not: 'BATAL' } } },
        },
      },
    },
  });
  if (!item) throw NotFound('Event tidak ditemukan');

  // Resolve myParticipation kalau user authenticated.
  // Tetap include field-nya (null kalau belum daftar) supaya mobile bisa
  // distinguish "belum daftar" vs "field absent karena server outdated".
  let myParticipation: unknown = null;
  let familyParticipationsCount = 0;
  if (req.user) {
    const row = await prisma.eventParticipation.findUnique({
      where: { eventId_jemaatId: { eventId: item.id, jemaatId: req.user.jemaatId } },
      select: {
        id: true,
        eventId: true,
        jemaatId: true,
        status: true,
        nominalBayar: true,
        catatan: true,
        buktiTransferUrl: true,
        registeredAt: true,
        paidAt: true,
        attendedAt: true,
        cancelledAt: true,
      },
    });
    myParticipation = row ?? null;

    // familyParticipationsCount (mobile UI indicator "N pendaftaran")
    // include self + family, exclude BATAL. Cheap because scoped ke satu event.
    const familyIds = await getFamilyJemaatIds(req.user.jemaatId);
    familyParticipationsCount = await prisma.eventParticipation.count({
      where: {
        eventId: item.id,
        jemaatId: { in: Array.from(familyIds) },
        status: { not: 'BATAL' },
      },
    });
  }

  res.json({
    success: true,
    data: {
      ...item,
      pesertaCount: item._count.partisipasi,
      myParticipation,
      familyParticipationsCount,
    },
  });
});

eventRouter.post('/', async (req, res) => {
  if (!req.user) throw BadRequest('User tidak terautentikasi');

  // Verify author exists. JWT bisa stale kalau user terhapus dari DB (mis.
  // setelah `prisma migrate reset`). Tanpa cek ini akan dapat FK error
  // `event_author_id_fkey` yang membingungkan.
  const authorExists = await prisma.user.findUnique({
    where: { id: req.user.sub },
    select: { id: true },
  });
  if (!authorExists) {
    throw Unauthorized(
      'Sesi Anda tidak valid (user tidak ditemukan di database). ' +
        'Silakan logout dan login ulang.',
    );
  }

  const input = createEventSchema.parse(req.body);

  const baseSlug = input.slug ?? slugify(input.judul);
  const slug = await ensureUniqueSlug(baseSlug);

  // Auto-derive sinodeId dari cabangId
  let sinodeId = input.sinodeId;
  if (input.cabangId && !sinodeId) {
    const cabang = await prisma.cabangGereja.findUnique({
      where: { id: input.cabangId },
      select: { sinodeId: true },
    });
    sinodeId = cabang?.sinodeId;
  }

  const created = await prisma.event.create({
    data: {
      judul: input.judul,
      slug,
      ringkasan: input.ringkasan,
      deskripsi: input.deskripsi,
      videoUrl: input.videoUrl,
      tanggalMulai: new Date(input.tanggalMulai),
      tanggalSelesai: input.tanggalSelesai ? new Date(input.tanggalSelesai) : null,
      jamMulai: input.jamMulai ?? null,
      jamSelesai: input.jamSelesai ?? null,
      lokasi: input.lokasi,
      sinodeId,
      cabangId: input.cabangId,
      tipeBayar: input.tipeBayar,
      nominal: input.nominal ?? null,
      bankNama: input.bankNama,
      bankNomor: input.bankNomor,
      bankAtasNama: input.bankAtasNama,
      quotaPeserta: input.quotaPeserta ?? null,
      tags: input.tags ?? [],
      butuhKehadiran: input.butuhKehadiran ?? false,
      isPublished: input.isPublished ?? false,
      publishedAt: input.isPublished ? new Date() : null,
      authorId: req.user.sub,
    },
  });
  audit(req, {
    action: 'CREATE',
    resource: 'event',
    resourceId: created.id,
    resourceLabel: created.judul,
    after: created,
  });
  res.status(201).json({ success: true, data: created });
});

eventRouter.patch('/:id', async (req, res) => {
  const input = updateEventSchema.parse(req.body);
  const before = await prisma.event.findUnique({ where: { id: req.params.id } });
  if (!before) throw NotFound('Event tidak ditemukan');

  let slug = before.slug;
  if (input.slug && input.slug !== before.slug) {
    slug = await ensureUniqueSlug(input.slug, before.id);
  }

  let sinodeId = input.sinodeId;
  if (input.cabangId && !sinodeId) {
    const cabang = await prisma.cabangGereja.findUnique({
      where: { id: input.cabangId },
      select: { sinodeId: true },
    });
    sinodeId = cabang?.sinodeId;
  }

  const data: Prisma.EventUpdateInput = {
    judul: input.judul,
    slug,
    ringkasan: input.ringkasan,
    deskripsi: input.deskripsi,
    videoUrl: input.videoUrl,
    tanggalMulai: input.tanggalMulai ? new Date(input.tanggalMulai) : undefined,
    tanggalSelesai: input.tanggalSelesai ? new Date(input.tanggalSelesai) : undefined,
    jamMulai: input.jamMulai ?? undefined,
    jamSelesai: input.jamSelesai ?? undefined,
    lokasi: input.lokasi,
    sinode: sinodeId
      ? { connect: { id: sinodeId } }
      : input.sinodeId === undefined && input.cabangId === undefined
        ? undefined
        : { disconnect: true },
    cabang: input.cabangId
      ? { connect: { id: input.cabangId } }
      : input.cabangId === undefined
        ? undefined
        : { disconnect: true },
    tipeBayar: input.tipeBayar,
    nominal: input.nominal,
    bankNama: input.bankNama,
    bankNomor: input.bankNomor,
    bankAtasNama: input.bankAtasNama,
    quotaPeserta: input.quotaPeserta,
    tags: input.tags,
    butuhKehadiran: input.butuhKehadiran,
    isActive: input.isActive,
  };
  // Publish toggle: set/clear publishedAt
  if (input.isPublished === true && !before.isPublished) {
    data.isPublished = true;
    data.publishedAt = new Date();
  } else if (input.isPublished === false && before.isPublished) {
    data.isPublished = false;
    data.publishedAt = null;
  }

  const updated = await prisma.event.update({ where: { id: before.id }, data });
  audit(req, {
    action: 'UPDATE',
    resource: 'event',
    resourceId: updated.id,
    resourceLabel: updated.judul,
    before,
    after: updated,
  });
  res.json({ success: true, data: updated });
});

eventRouter.delete('/:id', async (req, res) => {
  const before = await prisma.event.findUnique({ where: { id: req.params.id } });
  if (!before) throw NotFound('Event tidak ditemukan');
  await prisma.event.delete({ where: { id: before.id } });
  // Cleanup files (best-effort, tidak block kalau gagal)
  await deleteContentHero('event', before.id).catch(() => {});
  await deleteEventQris(before.id).catch(() => {});
  audit(req, {
    action: 'DELETE',
    resource: 'event',
    resourceId: before.id,
    resourceLabel: before.judul,
    before,
  });
  res.status(204).end();
});

// ============================================================
//  Image uploads — hero + QRIS
// ============================================================

eventRouter.post('/:id/hero', flexImageUpload(), async (req, res) => {
  if (!req.file) throw BadRequest('File foto wajib (field name: foto)');
  const item = await prisma.event.findUnique({ where: { id: req.params.id } });
  if (!item) throw NotFound('Event tidak ditemukan');

  const heroImageUrl = await saveContentHero('event', item.id, req.file.buffer);
  const updated = await prisma.event.update({
    where: { id: item.id },
    data: { heroImageUrl },
    select: { id: true, heroImageUrl: true },
  });
  audit(req, {
    action: 'UPLOAD_PHOTO',
    resource: 'event',
    resourceId: item.id,
    resourceLabel: item.judul,
    metadata: { kind: 'hero-image', size: req.file.size },
  });
  res.json({ success: true, data: updated });
});

eventRouter.delete('/:id/hero', async (req, res) => {
  const item = await prisma.event.findUnique({ where: { id: req.params.id } });
  if (!item) throw NotFound('Event tidak ditemukan');
  await deleteContentHero('event', item.id);
  await prisma.event.update({ where: { id: item.id }, data: { heroImageUrl: null } });
  res.status(204).end();
});

eventRouter.post('/:id/qris', flexImageUpload(), async (req, res) => {
  if (!req.file) throw BadRequest('File foto wajib (field name: foto)');
  const item = await prisma.event.findUnique({ where: { id: req.params.id } });
  if (!item) throw NotFound('Event tidak ditemukan');

  const qrisImageUrl = await saveEventQris(item.id, req.file.buffer);
  const updated = await prisma.event.update({
    where: { id: item.id },
    data: { qrisImageUrl },
    select: { id: true, qrisImageUrl: true },
  });
  audit(req, {
    action: 'UPLOAD_PHOTO',
    resource: 'event',
    resourceId: item.id,
    resourceLabel: item.judul,
    metadata: { kind: 'qris-image', size: req.file.size },
  });
  res.json({ success: true, data: updated });
});

eventRouter.delete('/:id/qris', async (req, res) => {
  const item = await prisma.event.findUnique({ where: { id: req.params.id } });
  if (!item) throw NotFound('Event tidak ditemukan');
  await deleteEventQris(item.id);
  await prisma.event.update({ where: { id: item.id }, data: { qrisImageUrl: null } });
  res.status(204).end();
});

// ============================================================
//  Participation — list / register / update / upload bukti / approve
// ============================================================

// List peserta per event
eventRouter.get('/:id/peserta', async (req, res) => {
  const event = await prisma.event.findUnique({ where: { id: req.params.id } });
  if (!event) throw NotFound('Event tidak ditemukan');

  const statusFilter =
    typeof req.query.status === 'string' &&
    ['DAFTAR', 'MENUNGGU_VERIFIKASI', 'BAYAR', 'HADIR', 'BATAL'].includes(req.query.status)
      ? (req.query.status as Prisma.EventParticipationWhereInput['status'])
      : undefined;

  const data = await prisma.eventParticipation.findMany({
    where: { eventId: event.id, ...(statusFilter ? { status: statusFilter } : {}) },
    orderBy: [{ status: 'asc' }, { registeredAt: 'asc' }],
    include: {
      jemaat: {
        select: {
          id: true,
          namaLengkap: true,
          noHp: true,
          fotoUrl: true,
          cabang: { select: { id: true, nama: true } },
        },
      },
      approver: { select: { id: true, namaLengkap: true } },
    },
  });
  res.json({ success: true, data });
});

// Register peserta — idempotent + reactivate BATAL.
//
// Behavior berdasarkan existing row (eventId, jemaatId):
//   - Tidak ada → create baru, status DAFTAR. Response 201.
//   - Ada, status BATAL → reactivate (set ke DAFTAR, update nominal/catatan baru).
//                          Response 201, `meta.reactivated=true`.
//   - Ada, status DAFTAR/MENUNGGU_VERIFIKASI/BAYAR/HADIR → idempotent:
//     return existing tanpa modify. Response 200, `meta.alreadyRegistered=true`.
//     Mobile baca `data.status` untuk decide next step (mis. langsung navigate
//     ke upload bukti kalau status DAFTAR di event berbayar).
//
// Quota check: skip kalau existing non-BATAL (slot sudah ke-counted).
eventRouter.post('/:id/peserta', async (req, res) => {
  const event = await prisma.event.findUnique({
    where: { id: req.params.id },
    include: { _count: { select: { partisipasi: { where: { status: { not: 'BATAL' } } } } } },
  });
  if (!event) throw NotFound('Event tidak ditemukan');

  const input = registerEventParticipationSchema.parse(req.body);

  // Lookup existing dulu sebelum quota check — kalau user sudah terdaftar
  // (non-BATAL), tidak makan slot baru. Untuk BATAL, akan reactivate jadi
  // makan slot baru → tetap kena quota guard di bawah.
  const existing = await prisma.eventParticipation.findUnique({
    where: { eventId_jemaatId: { eventId: event.id, jemaatId: input.jemaatId } },
  });

  // Existing non-BATAL → 409 dengan details supaya mobile bisa show error
  // yang jelas + navigate ke step berikutnya. Bukan idempotent silent karena
  // user mungkin tidak sadar mereka sudah terdaftar.
  if (existing && existing.status !== 'BATAL') {
    const friendlyStatus = {
      DAFTAR: 'sudah terdaftar (belum bayar)',
      MENUNGGU_VERIFIKASI: 'sudah terdaftar dan bukti transfer sedang diverifikasi',
      BAYAR: 'sudah terdaftar dan pembayaran terverifikasi',
      HADIR: 'sudah hadir di event ini',
    }[existing.status as 'DAFTAR' | 'MENUNGGU_VERIFIKASI' | 'BAYAR' | 'HADIR'];

    const nextStep =
      existing.status === 'DAFTAR' || existing.status === 'MENUNGGU_VERIFIKASI'
        ? event.tipeBayar !== 'GRATIS'
          ? 'upload-bukti'
          : 'wait-attendance'
        : existing.status === 'BAYAR'
          ? 'wait-attendance'
          : 'attended';

    throw new ApiError(
      409,
      'ALREADY_REGISTERED',
      `Anda ${friendlyStatus} di event "${event.judul}".`,
      {
        participationId: existing.id,
        currentStatus: existing.status,
        nextStep,
        // Mobile UX: navigate ke screen sesuai nextStep
        //   upload-bukti      → buka screen upload bukti dengan participationId
        //   wait-attendance   → tampil "menunggu hari H"
        //   attended          → tampil "sudah hadir"
      },
    );
  }

  // Quota guard — applies untuk new registration & reactivate BATAL.
  if (event.quotaPeserta != null && event._count.partisipasi >= event.quotaPeserta) {
    throw Conflict(
      `Quota peserta ${event.quotaPeserta} sudah penuh untuk event "${event.judul}".`,
    );
  }

  // Validasi nominal
  let nominalBayar = input.nominalBayar;
  if (event.tipeBayar === 'NOMINAL_TETAP') {
    nominalBayar = nominalBayar ?? (event.nominal ? Number(event.nominal) : undefined);
  } else if (event.tipeBayar === 'NOMINAL_BEBAS') {
    const min = event.nominal ? Number(event.nominal) : 0;
    if (nominalBayar !== undefined && nominalBayar < min) {
      throw BadRequest(`Nominal minimum untuk event ini adalah ${min}`);
    }
  } else {
    nominalBayar = undefined;
  }

  // Reactivate BATAL — update row existing.
  if (existing && existing.status === 'BATAL') {
    const reactivated = await prisma.eventParticipation.update({
      where: { id: existing.id },
      data: {
        status: 'DAFTAR',
        nominalBayar: nominalBayar ?? null,
        catatan: input.catatan,
        cancelledAt: null,
      },
      include: { jemaat: { select: { namaLengkap: true } } },
    });
    audit(req, {
      action: 'UPDATE',
      resource: 'event_participation',
      resourceId: reactivated.id,
      resourceLabel: `${reactivated.jemaat.namaLengkap} @ ${event.judul} (reactivated)`,
      before: existing,
      after: reactivated,
      metadata: { kind: 'event-reactivate' },
    });
    return res.status(201).json({
      success: true,
      data: reactivated,
      meta: { reactivated: true, currentStatus: 'DAFTAR' },
    });
  }

  // New registration.
  const created = await prisma.eventParticipation.create({
    data: {
      eventId: event.id,
      jemaatId: input.jemaatId,
      status: 'DAFTAR',
      nominalBayar: nominalBayar ?? null,
      catatan: input.catatan,
    },
    include: { jemaat: { select: { namaLengkap: true } } },
  });
  audit(req, {
    action: 'CREATE',
    resource: 'event_participation',
    resourceId: created.id,
    resourceLabel: `${created.jemaat.namaLengkap} @ ${event.judul}`,
    after: created,
  });
  void createNotification({
    jemaatId: input.jemaatId,
    type: 'EVENT_REGISTERED',
    title: `Registrasi diterima: ${event.judul}`,
    body: event.tipeBayar !== 'GRATIS'
      ? `Anda terdaftar sebagai peserta. Silakan upload bukti transfer untuk konfirmasi.`
      : `Anda terdaftar sebagai peserta event gratis. Sampai jumpa di hari H!`,
    actionUrl: `/event/${event.id}`,
    metadata: {
      eventId: event.id,
      eventJudul: event.judul,
      participationId: created.id,
      nextStep: event.tipeBayar !== 'GRATIS' ? 'upload-bukti' : 'wait-attendance',
    },
  });
  res.status(201).json({
    success: true,
    data: created,
    meta: { alreadyRegistered: false, currentStatus: 'DAFTAR' },
  });
});

/**
 * Batch register peserta — daftar multiple jemaat sekaligus (mobile family flow).
 *
 * Pola partial-success: tiap jemaat di-create independently. Yang sukses
 * return di `successful`, yang gagal return di `failed` dengan reason.
 * Quota check di awal — kalau slot tersisa < jumlah request, tetap proceed
 * tapi sebagian akan gagal dengan code QUOTA_FULL.
 */
eventRouter.post('/:id/peserta/batch', async (req, res) => {
  const input = batchRegisterEventParticipationSchema.parse(req.body);
  const event = await prisma.event.findUnique({
    where: { id: req.params.id },
    include: { _count: { select: { partisipasi: { where: { status: { not: 'BATAL' } } } } } },
  });
  if (!event) throw NotFound('Event tidak ditemukan');

  const currentCount = event._count.partisipasi;
  const slotsLeft = event.quotaPeserta == null ? Infinity : event.quotaPeserta - currentCount;

  // Resolve nominal sesuai event tipe bayar
  function resolveNominal(): number | null {
    const requested = input.nominalBayarPerOrang;
    if (event!.tipeBayar === 'GRATIS') return null;
    if (event!.tipeBayar === 'NOMINAL_TETAP') {
      return event!.nominal ? Number(event!.nominal) : null;
    }
    // NOMINAL_BEBAS
    const min = event!.nominal ? Number(event!.nominal) : 0;
    return Math.max(min, requested ?? min);
  }
  const nominal = resolveNominal();

  const successful: unknown[] = [];
  const failed: { jemaatId: string; error: { code: string; message: string } }[] = [];

  // Dedupe input (cegah double-count slot)
  const uniqueIds = [...new Set(input.jemaatIds)];

  let acceptedSoFar = 0;
  for (const jemaatId of uniqueIds) {
    try {
      // Quota guard per row (live count berdasarkan slotsLeft - acceptedSoFar)
      if (acceptedSoFar >= slotsLeft) {
        failed.push({
          jemaatId,
          error: { code: 'QUOTA_FULL', message: 'Kuota peserta event sudah penuh.' },
        });
        continue;
      }
      // Cek existing (per backend-request-batch-reactivate-batal.md 2026-08-31):
      // BATAL → reactivate. Active status → reject as ALREADY_REGISTERED.
      const existing = await prisma.eventParticipation.findUnique({
        where: { eventId_jemaatId: { eventId: event.id, jemaatId } },
      });
      if (existing) {
        if (existing.status === 'BATAL') {
          const reactivated = await prisma.eventParticipation.update({
            where: { id: existing.id },
            data: {
              status: 'DAFTAR',
              registeredAt: new Date(),
              cancelledAt: null,
              nominalBayar: nominal,
              catatan: input.catatan,
              // Reset payment artifacts — user daftar ulang, mulai dari nol.
              buktiTransferUrl: null,
              paidAt: null,
              approvedAt: null,
              approver: { disconnect: true },
            },
            include: { jemaat: { select: { id: true, namaLengkap: true, kode: true } } },
          });
          successful.push(reactivated);
          acceptedSoFar += 1;
          continue;
        }
        failed.push({
          jemaatId,
          error: {
            code: 'ALREADY_REGISTERED',
            message: 'Jemaat sudah terdaftar aktif di event ini.',
          },
        });
        continue;
      }
      // Cek jemaat exists
      const jemaat = await prisma.jemaat.findUnique({
        where: { id: jemaatId },
        select: { id: true, namaLengkap: true },
      });
      if (!jemaat) {
        failed.push({
          jemaatId,
          error: { code: 'NOT_FOUND', message: 'Jemaat tidak ditemukan.' },
        });
        continue;
      }
      const created = await prisma.eventParticipation.create({
        data: {
          eventId: event.id,
          jemaatId,
          status: 'DAFTAR',
          nominalBayar: nominal,
          catatan: input.catatan,
        },
        include: { jemaat: { select: { id: true, namaLengkap: true, kode: true } } },
      });
      successful.push(created);
      acceptedSoFar += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      failed.push({ jemaatId, error: { code: 'INTERNAL', message: msg } });
    }
  }

  audit(req, {
    action: 'CREATE',
    resource: 'event_participation',
    resourceLabel: `Batch register ${successful.length} peserta @ ${event.judul}`,
    metadata: {
      kind: 'event-batch-register',
      eventId: event.id,
      requested: uniqueIds.length,
      successful: successful.length,
      failed: failed.length,
    },
  });

  res.status(201).json({ success: true, data: { successful, failed } });
});

// Stats kehadiran event — count by status + lastUpdated.
// Polling-friendly untuk scanner mode di mobile.
eventRouter.get('/:id/checkin/stats', async (req, res) => {
  const event = await prisma.event.findUnique({ where: { id: req.params.id } });
  if (!event) throw NotFound('Event tidak ditemukan');
  const grouped = await prisma.eventParticipation.groupBy({
    by: ['status'],
    where: { eventId: event.id },
    _count: { _all: true },
  });
  const byStatus = {
    DAFTAR: 0,
    MENUNGGU_VERIFIKASI: 0,
    BAYAR: 0,
    HADIR: 0,
    BATAL: 0,
  };
  for (const g of grouped) {
    byStatus[g.status] = g._count._all;
  }
  const total =
    byStatus.DAFTAR + byStatus.MENUNGGU_VERIFIKASI + byStatus.BAYAR + byStatus.HADIR;
  res.json({
    success: true,
    data: {
      eventId: event.id,
      quotaPeserta: event.quotaPeserta,
      total,
      hadir: byStatus.HADIR,
      byStatus,
      lastUpdated: new Date().toISOString(),
    },
  });
});

// ============================================================
//  Get-own-participation — GET /admin/event/:idOrSlug/peserta/me
// ============================================================
//
// Per request mobile (docs/backend-request-event-participation-status.md):
// mobile butuh standalone endpoint untuk refetch status partisipasi user
// di event tertentu, selain dari `myParticipation` field di event detail.
// Use case: refresh participation state setelah register/cancel tanpa
// re-fetch full event detail.
//
// Accept id atau slug (sama pola dengan GET detail).
//
// Response:
//   200 → participation row user
//   404 → user belum terdaftar di event ini
eventRouter.get('/:idOrSlug/peserta/me', async (req, res) => {
  if (!req.user) throw Unauthorized();
  const key = req.params.idOrSlug;

  const event = await prisma.event.findFirst({
    where: idOrSlugWhere(key),
    select: { id: true },
  });
  if (!event) throw NotFound('Event tidak ditemukan');

  const participation = await prisma.eventParticipation.findUnique({
    where: { eventId_jemaatId: { eventId: event.id, jemaatId: req.user.jemaatId } },
  });
  if (!participation) throw NotFound('Anda belum terdaftar di event ini.');

  res.json({ success: true, data: participation });
});

// ============================================================
//  Self-cancel — DELETE /admin/event/:id/peserta/me
// ============================================================
//
// Mobile-friendly endpoint untuk user batalkan registrasi sendiri tanpa
// perlu tahu participationId. Resolve dari JWT.
//
// HARUS di-register SEBELUM route `:participationId` (Express match in order).
// Kalau dibalik, Express akan treat "me" sebagai participationId → 404.
//
// Behavior:
//   - Tidak ada partisipasi   → 404 NOT_FOUND
//   - Status HADIR            → 400 BAD_REQUEST (sudah hadir, tidak bisa cancel)
//   - Status BATAL            → 200 idempotent, meta.alreadyCancelled=true
//   - Status DAFTAR / MENUNGGU_VERIFIKASI / BAYAR → set BATAL + cancelledAt
//
// Soft cancel: row tidak di-hard-delete supaya audit + history utuh.
// Slot kuota otomatis kembali available karena quota guard di POST /peserta
// filter `status: { not: 'BATAL' }`.
eventRouter.delete('/:id/peserta/me', async (req, res) => {
  if (!req.user) throw Unauthorized();
  const jemaatId = req.user.jemaatId;
  const eventId = req.params.id;

  const existing = await prisma.eventParticipation.findUnique({
    where: { eventId_jemaatId: { eventId, jemaatId } },
    include: {
      jemaat: { select: { namaLengkap: true } },
      event: { select: { judul: true } },
    },
  });
  if (!existing) {
    throw NotFound('Anda belum terdaftar di event ini.');
  }

  if (existing.status === 'HADIR') {
    throw BadRequest(
      'Anda sudah hadir di event ini — tidak bisa membatalkan partisipasi. ' +
        'Kalau ada kekeliruan, hubungi admin event.',
    );
  }

  // Idempotent — sudah BATAL, return current state tanpa modify.
  if (existing.status === 'BATAL') {
    return res.json({
      success: true,
      data: existing,
      meta: { alreadyCancelled: true },
    });
  }

  const cancelled = await prisma.eventParticipation.update({
    where: { id: existing.id },
    data: {
      status: 'BATAL',
      cancelledAt: new Date(),
    },
  });

  audit(req, {
    action: 'UPDATE',
    resource: 'event_participation',
    resourceId: cancelled.id,
    resourceLabel: `Self-cancel: ${existing.jemaat.namaLengkap} @ ${existing.event.judul}`,
    before: existing,
    after: cancelled,
    metadata: {
      kind: 'event-self-cancel',
      previousStatus: existing.status,
    },
  });

  res.json({ success: true, data: cancelled });
});

// ============================================================
//  Family multi-tracker — GET /admin/event/:idOrSlug/peserta/mine-and-family
// ============================================================
//
// Per backend-request-family-participation-list.md (2026-08-31).
//
// Return semua EventParticipation di event ini yg jemaatId-nya di family set
// (self + JemaatRelasi direct + spouse-transitive). Skip BATAL.
// Response include `isSelf` + `relationLabel` supaya mobile langsung render.
eventRouter.get('/:idOrSlug/peserta/mine-and-family', async (req, res) => {
  if (!req.user) throw Unauthorized();
  const selfId = req.user.jemaatId;
  const key = req.params.idOrSlug;

  const event = await prisma.event.findFirst({
    where: idOrSlugWhere(key),
    select: { id: true },
  });
  if (!event) throw NotFound('Event tidak ditemukan');

  const familyIds = await getFamilyJemaatIds(selfId);

  // Ambil relasi jemaat untuk label ("Istri", "Anak Laki-Laki", dst.)
  const relasi = await prisma.jemaatRelasi.findMany({
    where: { jemaatId: selfId, jemaatTerkaitId: { in: Array.from(familyIds) } },
    select: {
      jemaatTerkaitId: true,
      tipeRelasi: { select: { nama: true } },
    },
  });
  const relationLabelById = new Map<string, string>();
  for (const r of relasi) relationLabelById.set(r.jemaatTerkaitId, r.tipeRelasi.nama);

  const rows = await prisma.eventParticipation.findMany({
    where: {
      eventId: event.id,
      jemaatId: { in: Array.from(familyIds) },
      status: { not: 'BATAL' },
    },
    orderBy: { registeredAt: 'desc' },
    select: {
      id: true,
      eventId: true,
      jemaatId: true,
      status: true,
      nominalBayar: true,
      catatan: true,
      buktiTransferUrl: true,
      registeredAt: true,
      paidAt: true,
      attendedAt: true,
      cancelledAt: true,
      jemaat: { select: { id: true, namaLengkap: true, fotoUrl: true } },
    },
  });

  const participations = rows.map((r) => ({
    ...r,
    isSelf: r.jemaatId === selfId,
    relationLabel:
      r.jemaatId === selfId
        ? 'Diri sendiri'
        : relationLabelById.get(r.jemaatId) ?? 'Keluarga',
  }));

  res.json({ success: true, data: { participations } });
});

// ============================================================
//  Self/family cancel by participationId
//  POST /admin/event/:idOrSlug/peserta/:participationId/self-cancel
// ============================================================
//
// Per backend-request-family-participation-list.md (2026-08-31).
//
// Beda dgn admin `DELETE /:id/peserta/:participationId` (hard delete, admin
// only) — endpoint ini SOFT cancel dgn auth guard:
//   - Participation.jemaatId harus di family set requester.
// Behavior sama seperti `/peserta/me` (BATAL, cancelledAt, idempotent, tolak HADIR).
eventRouter.post('/:idOrSlug/peserta/:participationId/self-cancel', async (req, res) => {
  if (!req.user) throw Unauthorized();
  const selfId = req.user.jemaatId;
  const { idOrSlug, participationId } = req.params;

  const event = await prisma.event.findFirst({
    where: idOrSlugWhere(idOrSlug),
    select: { id: true, judul: true },
  });
  if (!event) throw NotFound('Event tidak ditemukan');

  const existing = await prisma.eventParticipation.findUnique({
    where: { id: participationId },
    include: { jemaat: { select: { namaLengkap: true } } },
  });
  if (!existing || existing.eventId !== event.id) {
    throw NotFound('Partisipasi tidak ditemukan di event ini.');
  }

  // Auth guard: participation harus milik self atau family
  const familyIds = await getFamilyJemaatIds(selfId);
  if (!familyIds.has(existing.jemaatId)) {
    throw Forbidden('Anda tidak berhak membatalkan partisipasi ini.');
  }

  if (existing.status === 'HADIR') {
    throw BadRequest(
      `${existing.jemaat.namaLengkap} sudah hadir di event ini — tidak bisa dibatalkan. Hubungi admin event.`,
    );
  }

  if (existing.status === 'BATAL') {
    return res.json({
      success: true,
      data: existing,
      meta: { alreadyCancelled: true },
    });
  }

  const cancelled = await prisma.eventParticipation.update({
    where: { id: existing.id },
    data: { status: 'BATAL', cancelledAt: new Date() },
  });

  audit(req, {
    action: 'UPDATE',
    resource: 'event_participation',
    resourceId: cancelled.id,
    resourceLabel: `Family-cancel: ${existing.jemaat.namaLengkap} @ ${event.judul}`,
    before: existing,
    after: cancelled,
    metadata: {
      kind: 'event-family-cancel',
      previousStatus: existing.status,
      cancelledBy: selfId,
      cancelledFor: existing.jemaatId,
    },
  });

  res.json({ success: true, data: cancelled, meta: { alreadyCancelled: false } });
});

// ============================================================
//  Event Donations — multi-payment per participation
// ============================================================
//
// Per patch 2026-05-21l (request mobile fundraising):
// Sub-table baru `EventDonation` untuk track tiap giving secara terpisah.
// Existing EventParticipation tetap (1 jemaat = 1 row registration), tapi
// payment data sekarang lebih ekspresif via EventDonation (1-to-many).
//
// Endpoints:
//   POST   /admin/event/:id/donations              — create donation (mobile / admin)
//   GET    /admin/event/:id/donations              — admin list semua (paginated)
//   GET    /admin/event/:id/donations/me           — mobile list own donations
//   GET    /admin/event/:id/donations/:donationId  — admin detail
//   PATCH  /admin/event/:id/donations/:donationId  — admin update (status/nominal)
//   POST   /admin/event/:id/donations/:donationId/bukti     — upload bukti
//   POST   /admin/event/:id/donations/:donationId/approve   — admin approve shortcut
//   DELETE /admin/event/:id/donations/:donationId           — admin / owner cancel
// ============================================================

// Helper: resolve OR create participation untuk donation (lazy upsert).
// Untuk fundraising NOMINAL_BEBAS, user bisa langsung donasi tanpa explicit
// register dulu. BE akan auto-create participation status DAFTAR.
async function ensureParticipation(eventId: string, jemaatId: string) {
  const existing = await prisma.eventParticipation.findUnique({
    where: { eventId_jemaatId: { eventId, jemaatId } },
  });
  if (existing) return existing;
  return prisma.eventParticipation.create({
    data: {
      eventId,
      jemaatId,
      status: 'DAFTAR',
    },
  });
}

// List semua donations event (admin view). Paginated, dengan info jemaat.
eventRouter.get('/:id/donations', async (req, res) => {
  const event = await resolveEventByIdOrSlug(req.params.id);

  const q = paginationQuerySchema.parse(req.query);
  const statusFilter =
    typeof req.query.status === 'string' &&
    ['MENUNGGU_VERIFIKASI', 'BAYAR', 'BATAL'].includes(req.query.status)
      ? (req.query.status as 'MENUNGGU_VERIFIKASI' | 'BAYAR' | 'BATAL')
      : undefined;

  const donationWhere: Prisma.EventDonationWhereInput = {
    participation: { eventId: event.id },
    ...(statusFilter ? { status: statusFilter } : {}),
  };

  // 1) Real EventDonation rows
  const [donationRows, donationTotal, donationSumAgg] = await Promise.all([
    prisma.eventDonation.findMany({
      where: donationWhere,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      include: {
        participation: {
          select: {
            id: true,
            jemaat: {
              select: { id: true, namaLengkap: true, noHp: true, fotoUrl: true },
            },
          },
        },
        approver: { select: { id: true, namaLengkap: true } },
      },
    }),
    prisma.eventDonation.count({ where: donationWhere }),
    prisma.eventDonation.aggregate({
      where: { participation: { eventId: event.id }, status: 'BAYAR' },
      _sum: { nominalBayar: true },
    }),
  ]);

  // 2) Synthesized rows dari EventParticipation legacy single-payment.
  //    Include participation yang punya buktiTransferUrl / paidAt tapi BELUM
  //    punya EventDonation row (dibedakan by participationId).
  //    Ini fix untuk kasus admin approve via /peserta/:pid/approve → cuma
  //    update participation, tidak create donation row → payment history kosong.
  const existingPartIds = new Set(donationRows.map((d) => d.participationId));
  const legacyParts = await prisma.eventParticipation.findMany({
    where: {
      eventId: event.id,
      OR: [
        { buktiTransferUrl: { not: null } },
        { paidAt: { not: null } },
        { status: { in: ['MENUNGGU_VERIFIKASI', 'BAYAR'] } },
      ],
    },
    orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
    include: {
      jemaat: { select: { id: true, namaLengkap: true, noHp: true, fotoUrl: true } },
      approver: { select: { id: true, namaLengkap: true } },
    },
  });

  const synthesized = legacyParts
    .filter((p) => !existingPartIds.has(p.id))
    .filter((p) => {
      // Map participation.status → donation-eligible status
      const mapped: 'MENUNGGU_VERIFIKASI' | 'BAYAR' | 'BATAL' | null =
        p.status === 'BAYAR' || p.status === 'HADIR'
          ? 'BAYAR'
          : p.status === 'MENUNGGU_VERIFIKASI'
            ? 'MENUNGGU_VERIFIKASI'
            : p.status === 'BATAL'
              ? 'BATAL'
              : null;
      if (!mapped) return false;
      return !statusFilter || statusFilter === mapped;
    })
    .map((p) => {
      const mapped =
        p.status === 'BAYAR' || p.status === 'HADIR'
          ? 'BAYAR'
          : p.status === 'MENUNGGU_VERIFIKASI'
            ? 'MENUNGGU_VERIFIKASI'
            : 'BATAL';
      return {
        // ID stable — pakai participationId prefix supaya FE bisa distinguish
        // (untuk approve/cancel button, FE fallback ke peserta endpoint).
        id: `virt-${p.id}`,
        participationId: p.id,
        nominalBayar: p.nominalBayar ?? '0',
        buktiTransferUrl: p.buktiTransferUrl,
        status: mapped as 'MENUNGGU_VERIFIKASI' | 'BAYAR' | 'BATAL',
        catatan: p.catatan,
        paidAt: p.paidAt,
        approvedAt: p.approvedAt,
        createdAt: p.createdAt,
        participation: { id: p.id, jemaat: p.jemaat },
        approver: p.approver,
        _synthesized: true as const,
      };
    });

  // 3) Merge + sort + paginate
  const merged = [
    ...donationRows.map((d) => ({ ...d, _synthesized: false as const })),
    ...synthesized,
  ].sort((a, b) => {
    // status ASC (MENUNGGU_VERIFIKASI < BAYAR < BATAL alphabet-wise not desired)
    // Custom priority: MENUNGGU_VERIFIKASI first, then BAYAR, then BATAL.
    const prio = { MENUNGGU_VERIFIKASI: 0, BAYAR: 1, BATAL: 2 };
    const pa = prio[a.status] ?? 99;
    const pb = prio[b.status] ?? 99;
    if (pa !== pb) return pa - pb;
    const ta = new Date(a.createdAt).getTime();
    const tb = new Date(b.createdAt).getTime();
    return tb - ta;
  });

  const total = merged.length;
  const paged = merged.slice((q.page - 1) * q.limit, q.page * q.limit);

  // Total confirmed = donation BAYAR + participation BAYAR (yg synthesized)
  const donationConfirmed = Number(donationSumAgg._sum.nominalBayar ?? 0);
  const partConfirmed = synthesized
    .filter((s) => s.status === 'BAYAR')
    .reduce((sum, s) => sum + Number(s.nominalBayar ?? 0), 0);
  const totalAmountConfirmed = donationConfirmed + partConfirmed;

  res.json({
    success: true,
    data: paged,
    meta: {
      page: q.page,
      limit: q.limit,
      total,
      totalPages: Math.ceil(total / q.limit) || 1,
      totalAmountConfirmed,
      // Debug info: berapa yang real vs synthesized (FE bisa show badge kalau mau)
      realCount: donationTotal,
      synthesizedCount: synthesized.length,
    },
  });
});

// List donations milik user current (mobile).
eventRouter.get('/:id/donations/me', async (req, res) => {
  if (!req.user) throw Unauthorized();
  const event = await resolveEventByIdOrSlug(req.params.id);

  const data = await prisma.eventDonation.findMany({
    where: {
      participation: { eventId: event.id, jemaatId: req.user.jemaatId },
    },
    orderBy: [{ createdAt: 'desc' }],
  });

  const totalConfirmed = data
    .filter((d) => d.status === 'BAYAR')
    .reduce((sum, d) => sum + Number(d.nominalBayar), 0);

  res.json({
    success: true,
    data,
    meta: {
      count: data.length,
      totalConfirmed,
    },
  });
});

// Create donation. Mobile flow: user di event fundraising tap "Beri Donasi" →
// POST /donations dengan nominal. BE auto-resolve/create participation.
//
// Validasi nominal per event.tipeBayar:
//   - GRATIS         → tolak (event gratis tidak perlu donation)
//   - NOMINAL_TETAP  → nominal harus == event.nominal
//   - NOMINAL_BEBAS  → nominal >= event.nominal (kalau di-set sebagai minimum)
eventRouter.post('/:id/donations', async (req, res) => {
  if (!req.user) throw Unauthorized();
  const event = await resolveEventByIdOrSlug(req.params.id);

  if (event.tipeBayar === 'GRATIS') {
    throw BadRequest(
      'Event ini gratis — tidak menerima donation. Tidak perlu kirim pembayaran.',
    );
  }

  const input = createEventDonationSchema.parse(req.body);

  // Validasi nominal
  if (event.tipeBayar === 'NOMINAL_TETAP') {
    const expected = event.nominal ? Number(event.nominal) : 0;
    if (Number(input.nominalBayar) !== expected) {
      throw BadRequest(
        `Event ini nominal tetap ${expected}. Nominal donation harus tepat ${expected}.`,
      );
    }
  } else if (event.tipeBayar === 'NOMINAL_BEBAS') {
    const min = event.nominal ? Number(event.nominal) : 0;
    if (Number(input.nominalBayar) < min) {
      throw BadRequest(`Nominal minimum untuk event ini adalah ${min}.`);
    }
  }

  // Resolve / create participation
  const participation = await ensureParticipation(event.id, req.user.jemaatId);

  const created = await prisma.eventDonation.create({
    data: {
      participationId: participation.id,
      nominalBayar: input.nominalBayar,
      catatan: input.catatan,
      status: 'MENUNGGU_VERIFIKASI', // default — naik ke BAYAR setelah admin approve
    },
  });

  audit(req, {
    action: 'CREATE',
    resource: 'event_donation',
    resourceId: created.id,
    resourceLabel: `Donation ${event.judul}: ${Number(input.nominalBayar)}`,
    after: created,
    metadata: { kind: 'event-donation-create', eventId: event.id },
  });

  res.status(201).json({ success: true, data: created });
});

// Detail donation
eventRouter.get('/:id/donations/:donationId', async (req, res) => {
  const event = await resolveEventByIdOrSlug(req.params.id);
  const donation = await prisma.eventDonation.findUnique({
    where: { id: req.params.donationId },
    include: {
      participation: {
        select: {
          id: true,
          eventId: true,
          jemaat: {
            select: { id: true, namaLengkap: true, noHp: true, fotoUrl: true },
          },
        },
      },
      approver: { select: { id: true, namaLengkap: true } },
    },
  });
  if (!donation || donation.participation.eventId !== event.id) {
    throw NotFound('Donation tidak ditemukan');
  }
  res.json({ success: true, data: donation });
});

// Update donation (admin: status / nominal / catatan)
eventRouter.patch('/:id/donations/:donationId', async (req, res) => {
  const event = await resolveEventByIdOrSlug(req.params.id);
  const before = await prisma.eventDonation.findUnique({
    where: { id: req.params.donationId },
    include: {
      participation: {
        select: {
          eventId: true,
          jemaat: { select: { namaLengkap: true } },
          event: { select: { judul: true } },
        },
      },
    },
  });
  if (!before || before.participation.eventId !== event.id) {
    throw NotFound('Donation tidak ditemukan');
  }
  const input = updateEventDonationSchema.parse(req.body);
  // approver relasi ke Jemaat — pakai jemaatId. Verify exist (cegah P2025).
  const approverJemaatId = await resolveApproverJemaatId(req);

  const data: Prisma.EventDonationUpdateInput = {
    nominalBayar: input.nominalBayar,
    catatan: input.catatan,
  };
  if (input.status && input.status !== before.status) {
    data.status = input.status;
    if (input.status === 'BAYAR') {
      data.paidAt = new Date();
      data.approver = approverJemaatId
        ? { connect: { id: approverJemaatId } }
        : { disconnect: true };
      data.approvedAt = new Date();
    } else if (input.status === 'BATAL') {
      // Tidak ada timestamp khusus untuk cancel
    }
  }

  const updated = await prisma.eventDonation.update({
    where: { id: before.id },
    data,
  });

  audit(req, {
    action: 'UPDATE',
    resource: 'event_donation',
    resourceId: updated.id,
    resourceLabel: `${before.participation.jemaat.namaLengkap} @ ${before.participation.event.judul}`,
    before,
    after: updated,
  });
  res.json({ success: true, data: updated });
});

// Upload bukti transfer per donation
eventRouter.post(
  '/:id/donations/:donationId/bukti',
  flexImageUpload(),
  async (req, res) => {
    if (!req.file) {
      const contentType = req.get('content-type') ?? '';
      const isMultipart = contentType.startsWith('multipart/form-data');
      throw BadRequest(
        isMultipart
          ? 'File bukti donation tidak ditemukan di body. Pastikan FormData.append pakai bentuk { uri, type, name }.'
          : `Content-Type "${contentType || '(kosong)'}" bukan multipart/form-data.`,
      );
    }

    const event = await resolveEventByIdOrSlug(String(req.params.id));
    const before = await prisma.eventDonation.findUnique({
      where: { id: req.params.donationId },
      include: {
        participation: {
          select: {
            eventId: true,
            jemaat: { select: { namaLengkap: true } },
            event: { select: { judul: true } },
          },
        },
      },
    });
    if (!before || before.participation.eventId !== event.id) {
      throw NotFound('Donation tidak ditemukan');
    }

    const buktiTransferUrl = await saveEventDonationBukti(before.id, req.file.buffer);
    // Auto-set ke MENUNGGU_VERIFIKASI kalau sebelumnya batal/draft
    const nextStatus = before.status === 'BATAL' ? 'MENUNGGU_VERIFIKASI' : before.status;

    const updated = await prisma.eventDonation.update({
      where: { id: before.id },
      data: { buktiTransferUrl, status: nextStatus },
    });

    audit(req, {
      action: 'UPLOAD_PHOTO',
      resource: 'event_donation',
      resourceId: before.id,
      resourceLabel: `bukti donation ${before.participation.jemaat.namaLengkap} @ ${before.participation.event.judul}`,
      metadata: { kind: 'event-donation-bukti', size: req.file.size },
    });

    res.json({ success: true, data: updated });
  },
);

// Approve shortcut — set status BAYAR
eventRouter.post('/:id/donations/:donationId/approve', async (req, res) => {
  const event = await resolveEventByIdOrSlug(req.params.id);
  const before = await prisma.eventDonation.findUnique({
    where: { id: req.params.donationId },
    include: {
      participation: {
        select: {
          eventId: true,
          jemaat: { select: { namaLengkap: true } },
          event: { select: { judul: true } },
        },
      },
    },
  });
  if (!before || before.participation.eventId !== event.id) {
    throw NotFound('Donation tidak ditemukan');
  }
  // approver relasi ke Jemaat — pakai jemaatId. Verify exist (cegah P2025).
  const approverJemaatId = await resolveApproverJemaatId(req);
  const now = new Date();
  const updated = await prisma.eventDonation.update({
    where: { id: before.id },
    data: {
      status: 'BAYAR',
      paidAt: now,
      approvedAt: now,
      approver: approverJemaatId ? { connect: { id: approverJemaatId } } : undefined,
    },
  });
  audit(req, {
    action: 'UPDATE',
    resource: 'event_donation',
    resourceId: before.id,
    resourceLabel: `approve donation ${before.participation.jemaat.namaLengkap} @ ${before.participation.event.judul}`,
    before,
    after: updated,
    metadata: { kind: 'event-donation-approve' },
  });
  res.json({ success: true, data: updated });
});

// Cancel donation (admin atau owner)
eventRouter.delete('/:id/donations/:donationId', async (req, res) => {
  if (!req.user) throw Unauthorized();
  const event = await resolveEventByIdOrSlug(req.params.id);
  const before = await prisma.eventDonation.findUnique({
    where: { id: req.params.donationId },
    include: {
      participation: {
        select: {
          eventId: true,
          jemaatId: true,
          jemaat: { select: { namaLengkap: true } },
          event: { select: { judul: true } },
        },
      },
    },
  });
  if (!before || before.participation.eventId !== event.id) {
    throw NotFound('Donation tidak ditemukan');
  }

  // Authorization: owner (jemaatId match) atau admin.
  // Untuk simplicity, semua user yang lewat /admin/* (JWT valid) di-allow.
  // RBAC strict bisa di-add via menu access middleware nanti.

  if (before.status === 'BATAL') {
    return res.json({
      success: true,
      data: before,
      meta: { alreadyCancelled: true },
    });
  }

  const updated = await prisma.eventDonation.update({
    where: { id: before.id },
    data: { status: 'BATAL' },
  });

  // Hapus file bukti kalau ada (best-effort)
  if (before.buktiTransferUrl) {
    await deleteEventDonationBukti(before.id).catch(() => {});
  }

  audit(req, {
    action: 'UPDATE',
    resource: 'event_donation',
    resourceId: before.id,
    resourceLabel: `cancel donation ${before.participation.jemaat.namaLengkap} @ ${before.participation.event.judul}`,
    before,
    after: updated,
    metadata: { kind: 'event-donation-cancel', previousStatus: before.status },
  });

  res.json({ success: true, data: updated });
});

// Update partisipasi (status, nominal, catatan)
eventRouter.patch('/:id/peserta/:participationId', async (req, res) => {
  const before = await prisma.eventParticipation.findUnique({
    where: { id: req.params.participationId },
    include: { event: { select: { id: true, judul: true } }, jemaat: { select: { namaLengkap: true } } },
  });
  if (!before || before.eventId !== req.params.id) {
    throw NotFound('Partisipasi tidak ditemukan');
  }

  const input = updateEventParticipationSchema.parse(req.body);
  // approver relasi ke Jemaat — pakai jemaatId. Verify exist (cegah P2025).
  const approverJemaatId = await resolveApproverJemaatId(req);

  // Lifecycle timestamps mengikuti transisi status
  const data: Prisma.EventParticipationUpdateInput = {
    nominalBayar: input.nominalBayar,
    catatan: input.catatan,
  };
  if (input.status && input.status !== before.status) {
    data.status = input.status;
    if (input.status === 'BAYAR') {
      data.paidAt = new Date();
      data.approver = approverJemaatId
        ? { connect: { id: approverJemaatId } }
        : { disconnect: true };
      data.approvedAt = new Date();
    } else if (input.status === 'HADIR') {
      data.attendedAt = new Date();
      // Kalau berbayar tapi belum BAYAR, beri warning lewat error
      if (
        before.status !== 'BAYAR' &&
        before.event &&
        // Event tipe bayar tetap berarti perlu BAYAR sebelum HADIR.
        // (Logic di sini bisa di-skip kalau admin sengaja toleran — tetap kasih warning di FE.)
        false
      ) {
        // intentionally no-op; toleransi bisnis
      }
    } else if (input.status === 'BATAL') {
      data.cancelledAt = new Date();
    }
  }

  const updated = await prisma.eventParticipation.update({
    where: { id: before.id },
    data,
  });
  audit(req, {
    action: 'UPDATE',
    resource: 'event_participation',
    resourceId: updated.id,
    resourceLabel: `${before.jemaat.namaLengkap} @ ${before.event.judul}`,
    before,
    after: updated,
  });
  res.json({ success: true, data: updated });
});

// Hapus partisipasi
eventRouter.delete('/:id/peserta/:participationId', async (req, res) => {
  const before = await prisma.eventParticipation.findUnique({
    where: { id: req.params.participationId },
    include: { event: { select: { id: true, judul: true } }, jemaat: { select: { namaLengkap: true } } },
  });
  if (!before || before.eventId !== req.params.id) {
    throw NotFound('Partisipasi tidak ditemukan');
  }
  await prisma.eventParticipation.delete({ where: { id: before.id } });
  await deleteEventBuktiTransfer(before.id).catch(() => {});
  audit(req, {
    action: 'DELETE',
    resource: 'event_participation',
    resourceId: before.id,
    resourceLabel: `${before.jemaat.namaLengkap} @ ${before.event.judul}`,
    before,
  });
  res.status(204).end();
});

// Upload bukti transfer (admin / mobile user upload atas nama jemaat).
// Auto-set status ke MENUNGGU_VERIFIKASI (kalau sebelumnya DAFTAR/BATAL).
//
// Body: multipart/form-data — field name fleksibel (foto/bukti/file/image
// semuanya diterima berkat flexImageUpload helper).
eventRouter.post(
  '/:id/peserta/:participationId/bukti',
  flexImageUpload(),
  async (req, res) => {
    if (!req.file) {
      // Helper sudah log diagnostic — lihat server log untuk info Content-Type
      // dan field names yang diterima.
      const contentType = req.get('content-type') ?? '';
      const isMultipart = contentType.startsWith('multipart/form-data');
      throw BadRequest(
        isMultipart
          ? 'File bukti transfer tidak ditemukan di body. Multipart diterima tapi file kosong — pastikan FormData.append pakai bentuk { uri, type, name } (BUKAN string plain).'
          : `Content-Type "${contentType || '(kosong)'}" bukan multipart/form-data. Mobile harus kirim FormData; JANGAN set header Content-Type manual (biarkan client auto-set dengan boundary).`,
      );
    }
    const before = await prisma.eventParticipation.findUnique({
      where: { id: req.params.participationId },
      include: { jemaat: { select: { namaLengkap: true } }, event: { select: { judul: true } } },
    });
    if (!before || before.eventId !== req.params.id) {
      throw NotFound('Partisipasi tidak ditemukan');
    }

    // Auth guard (per backend-request-family-participation-list.md 2026-08-31):
    // admin (Fulltimer) allowed always; jemaat user allowed only kalau
    // participation-nya di family set.
    if (req.user && !req.user.isFulltimer) {
      const familyIds = await getFamilyJemaatIds(req.user.jemaatId);
      if (!familyIds.has(before.jemaatId)) {
        throw Forbidden('Anda tidak berhak upload bukti untuk partisipasi ini.');
      }
    }

    const buktiTransferUrl = await saveEventBuktiTransfer(before.id, req.file.buffer);
    // Naikkan ke MENUNGGU_VERIFIKASI kalau belum BAYAR / HADIR
    const nextStatus =
      before.status === 'BAYAR' || before.status === 'HADIR' ? before.status : 'MENUNGGU_VERIFIKASI';

    const updated = await prisma.eventParticipation.update({
      where: { id: before.id },
      data: { buktiTransferUrl, status: nextStatus },
    });
    audit(req, {
      action: 'UPLOAD_PHOTO',
      resource: 'event_participation',
      resourceId: before.id,
      resourceLabel: `bukti ${before.jemaat.namaLengkap} @ ${before.event.judul}`,
      metadata: { kind: 'event-bukti', size: req.file.size },
    });
    res.json({ success: true, data: updated });
  },
);

// ============================================================
//  Check-in (hari H event)
// ============================================================
//
// POST /admin/event/:id/checkin  body { kode, force? }
//
// Workflow:
//   1. Validate event butuhKehadiran=true (kalau false, tolak).
//   2. Lookup jemaat by kode (case-insensitive).
//   3. Cek partisipasi (event, jemaat) — harus ada, status bukan BATAL.
//   4. Untuk berbayar: status harus BAYAR (kecuali `force=true`).
//   5. Set status HADIR, attendedAt=now. Idempotent: kalau sudah HADIR,
//      return data lama dengan flag alreadyCheckedIn=true.
eventRouter.post('/:id/checkin', async (req, res) => {
  const event = await prisma.event.findUnique({ where: { id: req.params.id } });
  if (!event) throw NotFound('Event tidak ditemukan');
  if (!event.butuhKehadiran) {
    throw BadRequest('Event ini tidak butuh kehadiran (absensi tidak aktif).');
  }

  // Authorization: user (fulltimer) harus terdaftar sebagai volunteer event ini
  // dengan canScanAttendance=true. Resolve userId → jemaatId → check.
  if (!req.user) throw Forbidden('User tidak terautentikasi');
  const callerUser = await prisma.user.findUnique({
    where: { id: req.user.sub },
    select: { jemaatId: true, jemaat: { select: { namaLengkap: true } } },
  });
  if (!callerUser) throw Forbidden('User tidak terkait jemaat');
  const isAuthorized = await prisma.eventPelayananPetugas.findFirst({
    where: {
      jemaatId: callerUser.jemaatId,
      canScanAttendance: true,
      eventPelayanan: { eventId: event.id },
    },
    select: { id: true },
  });
  if (!isAuthorized) {
    throw Forbidden(
      `${callerUser.jemaat.namaLengkap} tidak berwenang scan check-in event "${event.judul}". ` +
        'Hubungi admin event untuk minta akses sebagai authorized scanner.',
    );
  }

  const input = eventCheckinSchema.parse(req.body);

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

  const partisipasi = await prisma.eventParticipation.findUnique({
    where: { eventId_jemaatId: { eventId: event.id, jemaatId: jemaat.id } },
  });
  if (!partisipasi) {
    throw BadRequest(
      `${jemaat.namaLengkap} belum terdaftar sebagai peserta event "${event.judul}".`,
    );
  }
  if (partisipasi.status === 'BATAL') {
    throw BadRequest(
      `Partisipasi ${jemaat.namaLengkap} sudah dibatalkan — tidak bisa check-in.`,
    );
  }

  // Idempotent: sudah HADIR → return data tanpa update
  if (partisipasi.status === 'HADIR') {
    return res.json({
      success: true,
      data: { ...partisipasi, jemaat },
      meta: { alreadyCheckedIn: true },
    });
  }

  // Untuk event berbayar, wajib sudah BAYAR — kecuali admin force.
  if (event.tipeBayar !== 'GRATIS' && partisipasi.status !== 'BAYAR' && !input.force) {
    throw Conflict(
      `${jemaat.namaLengkap} belum melakukan pembayaran (status: ${partisipasi.status}). ` +
        `Approve bukti transfer dulu, atau kirim ulang dengan force=true untuk override.`,
    );
  }

  const now = new Date();
  const updated = await prisma.eventParticipation.update({
    where: { id: partisipasi.id },
    data: {
      status: 'HADIR',
      attendedAt: now,
    },
    include: {
      jemaat: { select: { id: true, namaLengkap: true, fotoUrl: true, noHp: true } },
    },
  });

  audit(req, {
    action: 'UPDATE',
    resource: 'event_participation',
    resourceId: updated.id,
    resourceLabel: `checkin ${jemaat.namaLengkap} @ ${event.judul}`,
    before: partisipasi,
    after: updated,
    metadata: { kind: 'event-checkin', kode: input.kode, force: input.force },
  });

  void createNotification({
    jemaatId: jemaat.id,
    type: 'EVENT_CHECKED_IN',
    title: `Kehadiran tercatat: ${event.judul}`,
    body: `Anda sudah check-in di event "${event.judul}" pada ${now.toLocaleString('id-ID')}. Terima kasih atas partisipasinya.`,
    actionUrl: `/event/${event.id}`,
    metadata: { eventId: event.id, eventJudul: event.judul, participationId: updated.id },
  });

  res.json({ success: true, data: updated, meta: { alreadyCheckedIn: false } });
});

// Approve = set status BAYAR + approvedBy + approvedAt + paidAt.
// Shortcut konvenien (versus PATCH manual).
eventRouter.post('/:id/peserta/:participationId/approve', async (req, res) => {
  const before = await prisma.eventParticipation.findUnique({
    where: { id: req.params.participationId },
    include: { jemaat: { select: { namaLengkap: true } }, event: { select: { judul: true } } },
  });
  if (!before || before.eventId !== req.params.id) {
    throw NotFound('Partisipasi tidak ditemukan');
  }
  // approver relasi ke Jemaat — pakai jemaatId. Verify jemaat exists supaya
  // tidak P2025 kalau JWT stale (mis. setelah prisma migrate reset).
  const approverJemaatId = await resolveApproverJemaatId(req);
  const now = new Date();
  const updated = await prisma.eventParticipation.update({
    where: { id: before.id },
    data: {
      status: 'BAYAR',
      paidAt: now,
      approvedAt: now,
      approver: approverJemaatId ? { connect: { id: approverJemaatId } } : undefined,
    },
  });
  audit(req, {
    action: 'UPDATE',
    resource: 'event_participation',
    resourceId: before.id,
    resourceLabel: `approve ${before.jemaat.namaLengkap} @ ${before.event.judul}`,
    before,
    after: updated,
    metadata: { kind: 'event-approve' },
  });
  void createNotification({
    jemaatId: before.jemaatId,
    type: 'EVENT_APPROVED',
    title: `Pendaftaran approved: ${before.event.judul}`,
    body: `Pembayaran Anda untuk event "${before.event.judul}" sudah dikonfirmasi. Sampai jumpa di hari H!`,
    actionUrl: `/event/${before.eventId}`,
    metadata: { eventId: before.eventId, eventJudul: before.event.judul, participationId: before.id },
  });
  res.json({ success: true, data: updated });
});

// ============================================================
//  Ministry & Volunteer (untuk event yang butuhKehadiran)
// ============================================================
// Pattern mirror /admin/pelayanan/ibadah-link/*. Tambahan: per-petugas flag
// `canScanAttendance` yang menentukan siapa yang berwenang scan QR di hari H.

// List pelayanan + petugas-nya untuk satu event
eventRouter.get('/:id/pelayanan', async (req, res) => {
  const event = await prisma.event.findUnique({ where: { id: req.params.id } });
  if (!event) throw NotFound('Event tidak ditemukan');
  const data = await prisma.eventPelayanan.findMany({
    where: { eventId: event.id },
    orderBy: { pelayanan: { nama: 'asc' } },
    include: {
      pelayanan: { select: { id: true, nama: true, deskripsi: true } },
      petugas: {
        orderBy: [
          { canScanAttendance: 'desc' },
          { pelayananRole: { level: 'desc' } },
          { jemaat: { namaLengkap: 'asc' } },
        ],
        include: {
          jemaat: {
            select: { id: true, namaLengkap: true, fotoUrl: true, noHp: true },
          },
          pelayananRole: { select: { id: true, nama: true, level: true } },
        },
      },
    },
  });
  res.json({ success: true, data });
});

// Link Pelayanan ke event
eventRouter.post('/:id/pelayanan', async (req, res) => {
  const event = await prisma.event.findUnique({ where: { id: req.params.id } });
  if (!event) throw NotFound('Event tidak ditemukan');
  const input = linkEventPelayananSchema.parse(req.body);
  const created = await prisma.eventPelayanan.create({
    data: { eventId: event.id, pelayananId: input.pelayananId },
    include: { pelayanan: { select: { nama: true } } },
  });
  audit(req, {
    action: 'CREATE',
    resource: 'event_pelayanan',
    resourceId: created.id,
    resourceLabel: `${created.pelayanan.nama} → ${event.judul}`,
    after: created,
  });
  res.status(201).json({ success: true, data: created });
});

// Unlink Pelayanan (cascade petugas)
eventRouter.delete('/:id/pelayanan/:linkId', async (req, res) => {
  const before = await prisma.eventPelayanan.findUnique({
    where: { id: req.params.linkId },
    include: { pelayanan: { select: { nama: true } }, event: { select: { judul: true } } },
  });
  if (!before || before.eventId !== req.params.id) {
    throw NotFound('Tautan pelayanan event tidak ditemukan');
  }
  await prisma.eventPelayanan.delete({ where: { id: before.id } });
  audit(req, {
    action: 'DELETE',
    resource: 'event_pelayanan',
    resourceId: before.id,
    resourceLabel: `${before.pelayanan.nama} → ${before.event.judul}`,
    before,
  });
  res.status(204).end();
});

// Assign volunteer (petugas) ke link pelayanan
eventRouter.post('/:id/pelayanan/:linkId/petugas', async (req, res) => {
  const link = await prisma.eventPelayanan.findUnique({
    where: { id: req.params.linkId },
    include: {
      pelayanan: { select: { id: true, nama: true } },
      event: { select: { id: true, judul: true } },
    },
  });
  if (!link || link.eventId !== req.params.id) {
    throw NotFound('Tautan pelayanan event tidak ditemukan');
  }
  const input = assignEventVolunteerSchema.parse(req.body);

  // Validate role belongs to pelayanan
  const role = await prisma.pelayananRole.findUnique({
    where: { id: input.pelayananRoleId },
  });
  if (!role) throw NotFound('Role tidak ditemukan');
  if (role.pelayananId !== link.pelayananId) {
    throw BadRequest(`Role "${role.nama}" bukan milik pelayanan ${link.pelayanan.nama}`);
  }

  const created = await prisma.eventPelayananPetugas.create({
    data: {
      eventPelayananId: link.id,
      jemaatId: input.jemaatId,
      pelayananRoleId: input.pelayananRoleId,
      canScanAttendance: input.canScanAttendance ?? false,
      catatan: input.catatan,
    },
    include: {
      jemaat: { select: { namaLengkap: true } },
      pelayananRole: { select: { nama: true } },
    },
  });
  audit(req, {
    action: 'CREATE',
    resource: 'event_pelayanan_petugas',
    resourceId: created.id,
    resourceLabel: `${created.jemaat.namaLengkap} (${created.pelayananRole.nama}) — ${link.pelayanan.nama} @ ${link.event.judul}`,
    after: created,
  });
  res.status(201).json({ success: true, data: created });
});

// Update volunteer (role / canScanAttendance / catatan)
eventRouter.patch('/:id/pelayanan/:linkId/petugas/:petugasId', async (req, res) => {
  const before = await prisma.eventPelayananPetugas.findUnique({
    where: { id: req.params.petugasId },
    include: {
      eventPelayanan: {
        include: {
          pelayanan: { select: { id: true, nama: true } },
          event: { select: { id: true, judul: true } },
        },
      },
      jemaat: { select: { namaLengkap: true } },
    },
  });
  if (
    !before ||
    before.eventPelayananId !== req.params.linkId ||
    before.eventPelayanan.eventId !== req.params.id
  ) {
    throw NotFound('Petugas event tidak ditemukan');
  }
  const input = updateEventVolunteerSchema.parse(req.body);

  if (input.pelayananRoleId) {
    const role = await prisma.pelayananRole.findUnique({
      where: { id: input.pelayananRoleId },
    });
    if (!role || role.pelayananId !== before.eventPelayanan.pelayananId) {
      throw BadRequest(
        `Role tidak terkait dengan pelayanan ${before.eventPelayanan.pelayanan.nama}`,
      );
    }
  }

  const updated = await prisma.eventPelayananPetugas.update({
    where: { id: before.id },
    data: input,
  });
  audit(req, {
    action: 'UPDATE',
    resource: 'event_pelayanan_petugas',
    resourceId: updated.id,
    resourceLabel: `${before.jemaat.namaLengkap} @ ${before.eventPelayanan.event.judul}`,
    before,
    after: updated,
  });
  res.json({ success: true, data: updated });
});

// Hapus volunteer
eventRouter.delete('/:id/pelayanan/:linkId/petugas/:petugasId', async (req, res) => {
  const before = await prisma.eventPelayananPetugas.findUnique({
    where: { id: req.params.petugasId },
    include: {
      eventPelayanan: {
        include: {
          pelayanan: { select: { nama: true } },
          event: { select: { id: true, judul: true } },
        },
      },
      jemaat: { select: { namaLengkap: true } },
    },
  });
  if (
    !before ||
    before.eventPelayananId !== req.params.linkId ||
    before.eventPelayanan.eventId !== req.params.id
  ) {
    throw NotFound('Petugas event tidak ditemukan');
  }
  await prisma.eventPelayananPetugas.delete({ where: { id: before.id } });
  audit(req, {
    action: 'DELETE',
    resource: 'event_pelayanan_petugas',
    resourceId: before.id,
    resourceLabel: `${before.jemaat.namaLengkap} — ${before.eventPelayanan.pelayanan.nama} @ ${before.eventPelayanan.event.judul}`,
    before,
  });
  res.status(204).end();
});
