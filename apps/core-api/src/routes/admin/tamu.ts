/**
 * Tamu (portal) — /admin/tamu
 *
 *   GET   /       → daftar tamu (pernah diundang / walk-in) + pengundang,
 *                   kehadiran, status efektif. ?status=&cabangId=&search=&page=
 *   GET   /summary→ jumlah per status
 *   PATCH /:id    → { status?, catatan?, followupById? } status & petugas follow-up
 *   GET   /export → ?format=pdf|csv, mengikuti filter yang sama
 *
 * Tamu = jemaat isTamu ATAU pernah ditambahkan sebagai tamu oleh jemaat lain
 * (supaya yang sudah daftar Els App tetap terlacak sebagai "Sudah terdaftar").
 * Akses: fulltimer, atau menu "tamu" (read / write).
 */
import { Router, type Request } from 'express';
import { prisma, type Prisma } from '@ecc/database';
import { z } from 'zod';
import { ApiError, BadRequest, Forbidden, NotFound, Unauthorized } from '../../lib/errors.js';
import { syncEventRoleForStatus } from '../../lib/event-role.js';
import { esc, sendCsv, sendPrintHtml, summaryCards } from '../../lib/print-report.js';
import { audit } from '../../lib/audit.js';
import { resolveJemaatAccess } from '../../lib/menu-access.js';
import { noHpSchema } from '@ecc/shared-types';
import { generateUniqueKode } from '../../lib/kode-reservasi.js';
import { resolveTamu } from '../../lib/tamu.js';
import { generateUniquePickupCode } from './reservasi.js';
import {
  TAMU_STATUSES,
  TAMU_STATUS_LABEL,
  effectiveTamuStatus,
  tamuAttendance,
  tamuHasAttended,
  type TamuStatus,
} from '../../lib/tamu-status.js';

export const tamuRouter = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function assertAccess(req: Request, level: 'read' | 'write') {
  if (!req.user) throw Unauthorized();
  if (req.user.isFulltimer) return;
  const m = (await resolveJemaatAccess(req.user.jemaatId)).menuAccess['tamu'];
  if (!(level === 'read' ? m?.canRead : m?.canWrite)) throw Forbidden('Anda tidak punya akses ke menu Tamu.');
}

/** Tambah tamu: menu Tamu (tulis) atau petugas CKids (menu gift-stall). */
async function assertAddGuestAccess(req: Request) {
  if (!req.user) throw Unauthorized();
  if (req.user.isFulltimer) return;
  const acc = (await resolveJemaatAccess(req.user.jemaatId)).menuAccess;
  if (acc['tamu']?.canWrite || acc['gift-stall']?.canRead) return;
  throw Forbidden('Anda tidak punya akses untuk menambah tamu.');
}

async function loadTamu(req: Request) {
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const cabangId = typeof req.query.cabangId === 'string' && UUID_RE.test(req.query.cabangId) ? req.query.cabangId : undefined;
  // followupBy: <uuid> = ditangani orang ini | 'none' = belum ada petugas follow-up
  const fu = typeof req.query.followupBy === 'string' ? req.query.followupBy : '';
  // sumber=homecell → hanya tamu yang dicatat dari homecell.
  const sumber = typeof req.query.sumber === 'string' ? req.query.sumber : '';
  const where: Prisma.JemaatWhereInput = {
    OR: [{ isTamu: true }, { diundangSebagaiTamu: { some: {} } }, { tamuHomecell: { some: {} } }],
    ...(sumber === 'homecell' ? { tamuHomecell: { some: {} } } : {}),
    ...(cabangId ? { cabangId } : {}),
    ...(fu === 'none' ? { tamuFollowupById: null } : UUID_RE.test(fu) ? { tamuFollowupById: fu } : {}),
    ...(search
      ? {
          AND: [
            {
              OR: [
                { namaLengkap: { contains: search, mode: 'insensitive' } },
                { noHp: { contains: search.replace(/\D/g, '') || search } },
                { diundangSebagaiTamu: { some: { inviter: { namaLengkap: { contains: search, mode: 'insensitive' } } } } },
                { tamuHomecell: { some: { homecell: { nama: { contains: search, mode: 'insensitive' } } } } },
              ],
            },
          ],
        }
      : {}),
  };
  const rows = await prisma.jemaat.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 5000,
    select: {
      id: true,
      namaLengkap: true,
      noHp: true,
      kode: true,
      isTamu: true,
      tanggalLahir: true,
      createdAt: true,
      tamuStatus: true,
      tamuStatusUpdatedAt: true,
      tamuCatatan: true,
      tamuFollowupAt: true,
      tamuFollowupBy: { select: { id: true, namaLengkap: true, noHp: true } },
      cabang: { select: { id: true, nama: true } },
      diundangSebagaiTamu: {
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true, inviter: { select: { id: true, namaLengkap: true, noHp: true } } },
      },
      tamuHomecell: {
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true, catatan: true, homecell: { select: { id: true, nama: true } } },
      },
    },
  });
  const att = await tamuAttendance(rows.map((r) => r.id));
  return rows.map((r) => {
    const a = att.get(r.id);
    const status = effectiveTamuStatus({ stored: r.tamuStatus, isTamu: r.isTamu, hasAttended: tamuHasAttended(a) });
    return {
      id: r.id,
      namaLengkap: r.namaLengkap,
      noHp: r.noHp,
      kode: r.kode,
      isTamu: r.isTamu,
      // Tamu anak = tamu tanpa no HP (dicatat dari portal).
      isAnak: r.isTamu && !r.noHp,
      tanggalLahir: r.tanggalLahir,
      cabang: r.cabang,
      pertamaDicatat: r.diundangSebagaiTamu[0]?.createdAt ?? r.createdAt,
      pengundang: r.diundangSebagaiTamu.map((x) => ({ ...x.inviter, sejak: x.createdAt })),
      homecell: r.tamuHomecell.map((x) => ({ ...x.homecell, sejak: x.createdAt, catatan: x.catatan })),
      kehadiran: a?.kehadiran ?? 0,
      kehadiranHomecell: a?.kehadiranHomecell ?? 0,
      terakhirHomecell: a?.terakhirHomecell ?? null,
      terakhirHadir: a?.terakhirHadir ?? null,
      terakhirAcara: a?.terakhirAcara ?? null,
      status,
      statusLabel: TAMU_STATUS_LABEL[status],
      statusTersimpan: r.tamuStatus,
      statusDiubah: r.tamuStatusUpdatedAt,
      catatan: r.tamuCatatan,
      followupBy: r.tamuFollowupBy,
      followupSejak: r.tamuFollowupAt,
    };
  });
}

tamuRouter.get('/', async (req, res) => {
  await assertAccess(req, 'read');
  const status = typeof req.query.status === 'string' ? req.query.status : '';
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
  const all = await loadTamu(req);
  const counts = Object.fromEntries(TAMU_STATUSES.map((s) => [s, all.filter((x) => x.status === s).length])) as Record<TamuStatus, number>;
  const filtered = (TAMU_STATUSES as readonly string[]).includes(status) ? all.filter((x) => x.status === status) : all;
  // Daftar petugas follow-up yang sedang menangani tamu (untuk filter).
  const followupPeople = await prisma.jemaat.findMany({
    where: { tamuDifollowup: { some: {} } },
    orderBy: { namaLengkap: 'asc' },
    select: { id: true, namaLengkap: true },
  });
  res.json({
    success: true,
    data: filtered.slice((page - 1) * limit, page * limit),
    meta: {
      page,
      limit,
      total: filtered.length,
      totalPages: Math.ceil(filtered.length / limit),
      counts,
      totalAll: all.length,
      statusOptions: TAMU_STATUSES.map((s) => ({ value: s, label: TAMU_STATUS_LABEL[s] })),
      followupPeople,
    },
  });
});

// ============================================================
// Tambah tamu dari portal → ibadah (reservasi / hadir) atau event (daftar / hadir)
// ============================================================
//   GET  /ibadah-options → ibadah aktif
//   GET  /event-options  → event aktif yang belum lewat
//   POST /               → { tujuan: IBADAH|EVENT, jenis: DEWASA|ANAK, nama,
//                            noHp?, tanggalLahir?, ... }
//     IBADAH: { ibadahId, tanggalIbadah, aksi: RESERVE|CHECKIN }
//     EVENT : { eventId, aksi: DAFTAR|CHECKIN, pembayaran?, nominal?, force? }
// DEWASA wajib no HP (kunci tamu berulang; no HP jemaat → jemaat itu yang
// dicatat). ANAK tanpa no HP; tamu anak yang sama dikenali dari nama +
// tanggal lahir + cabang. Ibadah anak (CKids) hanya menerima tamu ANAK.
tamuRouter.get('/ibadah-options', async (req, res) => {
  await assertAccess(req, 'write');
  const rows = await prisma.ibadah.findMany({
    where: { isActive: true },
    orderBy: [{ cabang: { nama: 'asc' } }, { nama: 'asc' }],
    select: { id: true, nama: true, jamMulai: true, jamSelesai: true, hari: true, tipeJadwal: true, isKidsIbadah: true, cabang: { select: { id: true, nama: true } } },
  });
  res.json({ success: true, data: rows });
});

tamuRouter.get('/event-options', async (req, res) => {
  await assertAccess(req, 'write');
  const since = new Date(Date.now() - 2 * 24 * 3600_000);
  const rows = await prisma.event.findMany({
    where: {
      isActive: true,
      OR: [{ tanggalSelesai: { gte: since } }, { tanggalSelesai: null, tanggalMulai: { gte: since } }],
    },
    orderBy: { tanggalMulai: 'asc' },
    take: 300,
    select: {
      id: true,
      judul: true,
      tanggalMulai: true,
      tanggalSelesai: true,
      jamMulai: true,
      tipeBayar: true,
      nominal: true,
      butuhKehadiran: true,
      quotaPeserta: true,
      isPublished: true,
      cabang: { select: { id: true, nama: true } },
      _count: { select: { partisipasi: { where: { status: { not: 'BATAL' } } } } },
    },
  });
  res.json({
    success: true,
    data: rows.map(({ _count, nominal, ...e }) => ({ ...e, nominal: nominal != null ? Number(nominal) : null, peserta: _count.partisipasi })),
  });
});

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal YYYY-MM-DD');
const createSchema = z
  .object({
    // DATA = hanya buat/cari record tamu (dipakai scanner CKids, lalu check-in biasa).
    tujuan: z.enum(['IBADAH', 'EVENT', 'DATA']).default('IBADAH'),
    cabangId: z.string().uuid().optional(),
    jenis: z.enum(['DEWASA', 'ANAK']),
    nama: z.string().trim().min(2, 'Nama tamu minimal 2 karakter').max(255),
    noHp: z.string().trim().optional().nullable(),
    tanggalLahir: ymd.optional().nullable(),
    // IBADAH
    ibadahId: z.string().uuid().optional(),
    tanggalIbadah: ymd.optional(),
    // EVENT
    eventId: z.string().uuid().optional(),
    pembayaran: z.enum(['BELUM', 'TUNAI', 'TRANSFER', 'QRIS', 'GRATIS']).optional(),
    nominal: z.coerce.number().nonnegative().optional(),
    force: z.boolean().optional(),
    aksi: z.enum(['RESERVE', 'DAFTAR', 'CHECKIN']).default('RESERVE'),
  })
  .superRefine((v, ctx) => {
    if (v.jenis === 'DEWASA' && !noHpSchema.safeParse(v.noHp ?? '').success) {
      ctx.addIssue({ code: 'custom', path: ['noHp'], message: 'No HP tamu dewasa wajib diisi dengan benar' });
    }
    if (v.tujuan === 'IBADAH' && (!v.ibadahId || !v.tanggalIbadah)) {
      ctx.addIssue({ code: 'custom', path: ['ibadahId'], message: 'Pilih ibadah dan tanggalnya' });
    }
    if (v.tujuan === 'DATA' && !v.cabangId) {
      ctx.addIssue({ code: 'custom', path: ['cabangId'], message: 'Cabang wajib' });
    }
    if (v.tujuan === 'EVENT' && !v.eventId) {
      ctx.addIssue({ code: 'custom', path: ['eventId'], message: 'Pilih event' });
    }
  });
type CreateInput = z.infer<typeof createSchema>;

/** Cari / buat record tamu (dewasa via no HP, anak via nama + tgl lahir + cabang). */
async function resolveGuest(input: CreateInput, cabangId: string) {
  if (input.jenis === 'DEWASA') {
    const r = await resolveTamu({ nama: input.nama, noHp: noHpSchema.parse(input.noHp) }, cabangId);
    return { tamu: r.tamu, created: r.created, member: r.member };
  }
  const lahir = input.tanggalLahir ? new Date(`${input.tanggalLahir}T00:00:00.000Z`) : null;
  const found = await prisma.jemaat.findFirst({
    where: { isTamu: true, noHp: null, cabangId, namaLengkap: { equals: input.nama, mode: 'insensitive' }, tanggalLahir: lahir },
    select: { id: true, namaLengkap: true, kode: true, isActive: true },
  });
  if (found) {
    if (!found.isActive) await prisma.jemaat.update({ where: { id: found.id }, data: { isActive: true } });
    return { tamu: found, created: false, member: false };
  }
  const kode = await generateUniqueKode(async (k) => !!(await prisma.jemaat.findUnique({ where: { kode: k } })));
  const tamu = await prisma.jemaat.create({
    data: { cabangId, namaLengkap: input.nama, noHp: null, tanggalLahir: lahir, kode, isTamu: true, isActive: true, tanggalBergabung: new Date() },
    select: { id: true, namaLengkap: true, kode: true },
  });
  return { tamu, created: true, member: false };
}

tamuRouter.post('/', async (req, res) => {
  await assertAddGuestAccess(req);
  const input = createSchema.parse(req.body ?? {});
  if (input.tujuan === 'EVENT') return addGuestToEvent(req, res, input);
  if (input.tujuan === 'DATA') {
    const { tamu, created, member } = await resolveGuest(input, input.cabangId!);
    const j = await prisma.jemaat.findUnique({
      where: { id: tamu.id },
      select: { id: true, namaLengkap: true, noHp: true, kode: true, fotoUrl: true, tanggalLahir: true },
    });
    audit(req, {
      action: 'CREATE',
      resource: 'jemaat_tamu',
      resourceId: tamu.id,
      resourceLabel: `Tamu ${input.jenis === 'ANAK' ? 'anak' : 'dewasa'} ${tamu.namaLengkap}${created ? ' (baru)' : ''} — scanner`,
      metadata: { kind: 'tamu-data', jenis: input.jenis, tamuBaru: created, isMember: member },
    });
    return res.status(created ? 201 : 200).json({
      success: true,
      data: { jemaat: j, isMember: member, isReturning: !created && !member },
      message: member
        ? `${tamu.namaLengkap} ternyata sudah terdaftar sebagai jemaat.`
        : created
          ? `Tamu ${tamu.namaLengkap} ditambahkan.`
          : `Tamu ${tamu.namaLengkap} sudah pernah tercatat — data lama dipakai.`,
    });
  }

  const ibadah = await prisma.ibadah.findUnique({
    where: { id: input.ibadahId! },
    select: { id: true, nama: true, isActive: true, isKidsIbadah: true, cabangId: true },
  });
  if (!ibadah || !ibadah.isActive) throw BadRequest('Ibadah tidak valid / tidak aktif');
  if (ibadah.isKidsIbadah && input.jenis !== 'ANAK') throw BadRequest('Ibadah anak (CKids) hanya untuk tamu anak.');

  const { tamu, created, member } = await resolveGuest(input, ibadah.cabangId);

  // Reservasi (RESERVE) atau langsung hadir (JOIN)
  const tanggal = new Date(`${input.tanggalIbadah}T00:00:00.000Z`);
  const now = new Date();
  const existing = await prisma.reservasi.findUnique({
    where: { jemaatId_ibadahId_tanggalIbadah: { jemaatId: tamu.id, ibadahId: ibadah.id, tanggalIbadah: tanggal } },
  });
  const guestData = member ? {} : { guestSource: 'WALK_IN' };
  const newKode = () => generateUniqueKode(async (k) => !!(await prisma.reservasi.findUnique({ where: { kode: k } })));
  let reservasi;
  if (existing?.status === 'JOIN') {
    reservasi = existing;
  } else if (input.aksi === 'CHECKIN') {
    const pickupCode = ibadah.isKidsIbadah ? (existing?.pickupCode ?? (await generateUniquePickupCode(ibadah.id, tanggal))) : null;
    const data = { status: 'JOIN' as const, joinedAt: now, cancelledAt: null, checkedInBy: req.user?.sub ?? null, checkinMethod: 'MANUAL', pickupCode, ...guestData };
    reservasi = existing
      ? await prisma.reservasi.update({ where: { id: existing.id }, data })
      : await prisma.reservasi.create({ data: { ...data, jemaatId: tamu.id, ibadahId: ibadah.id, tanggalIbadah: tanggal, kode: await newKode() } });
  } else {
    reservasi = existing
      ? await prisma.reservasi.update({ where: { id: existing.id }, data: { status: 'RESERVE', cancelledAt: null, ...guestData } })
      : await prisma.reservasi.create({
          data: { jemaatId: tamu.id, ibadahId: ibadah.id, tanggalIbadah: tanggal, status: 'RESERVE', kode: await newKode(), ...guestData },
        });
  }

  audit(req, {
    action: 'CREATE',
    resource: 'reservasi',
    resourceId: reservasi.id,
    resourceLabel: `Tamu ${input.jenis === 'ANAK' ? 'anak' : 'dewasa'} ${tamu.namaLengkap} → ${ibadah.nama} (${input.aksi === 'CHECKIN' ? 'hadir' : 'reservasi'})`,
    metadata: { kind: 'portal-tamu', tujuan: 'IBADAH', jenis: input.jenis, tamuBaru: created, isMember: member },
  });

  const hadir = reservasi.status === 'JOIN';
  res.status(201).json({
    success: true,
    data: {
      tujuan: 'IBADAH',
      tamu: { id: tamu.id, namaLengkap: tamu.namaLengkap, kode: tamu.kode },
      status: hadir ? 'HADIR' : 'RESERVASI',
      pickupCode: reservasi.pickupCode,
      isMember: member,
      isReturning: !created && !member,
      acaraNama: ibadah.nama,
    },
    message: member
      ? `${tamu.namaLengkap} ternyata sudah terdaftar sebagai jemaat — ${hadir ? 'tercatat hadir' : 'reservasi dibuat'}.`
      : `Tamu ${tamu.namaLengkap} ${hadir ? 'tercatat hadir' : 'direservasikan'} di ${ibadah.nama}.`,
  });
});

/**
 * Tamu event: DAFTAR (terdaftar; event berbayar bisa langsung dicatat lunas
 * bila pembayaran diterima petugas) atau CHECKIN (langsung hadir — event
 * harus mencatat kehadiran). Kuota penuh → 409 QUOTA_FULL kecuali force.
 */
async function addGuestToEvent(req: Request, res: import('express').Response, input: CreateInput) {
  const event = await prisma.event.findUnique({ where: { id: input.eventId! } });
  if (!event || !event.isActive) throw BadRequest('Event tidak valid / tidak aktif');
  const checkin = input.aksi === 'CHECKIN';
  if (checkin && !event.butuhKehadiran) throw BadRequest('Event ini tidak mencatat kehadiran — pilih "Daftarkan".');
  const paid = event.tipeBayar !== 'GRATIS';
  const pembayaran = paid ? (input.pembayaran ?? 'BELUM') : 'GRATIS';
  if (checkin && paid && pembayaran === 'BELUM') {
    throw BadRequest('Event berbayar: pilih pembayaran yang diterima (Tunai/Transfer/QRIS) atau Gratis untuk mencatat hadir.');
  }

  const cabangId =
    event.cabangId ??
    (req.user?.jemaatId ? (await prisma.jemaat.findUnique({ where: { id: req.user.jemaatId }, select: { cabangId: true } }))?.cabangId : null);
  if (!cabangId) throw BadRequest('Cabang tamu tidak bisa ditentukan untuk event tingkat sinode.');

  const { tamu, created, member } = await resolveGuest(input, cabangId);

  const existing = await prisma.eventParticipation.findUnique({
    where: { eventId_jemaatId: { eventId: event.id, jemaatId: tamu.id } },
  });
  if (existing && existing.status === 'HADIR') {
    throw new ApiError(409, 'ALREADY', `${tamu.namaLengkap} sudah tercatat hadir di event ini.`);
  }
  if (existing && existing.status !== 'BATAL' && !checkin) {
    throw new ApiError(409, 'ALREADY', `${tamu.namaLengkap} sudah terdaftar di event ini.`);
  }
  if ((!existing || existing.status === 'BATAL') && event.quotaPeserta != null && !input.force) {
    const count = await prisma.eventParticipation.count({ where: { eventId: event.id, status: { not: 'BATAL' } } });
    if (count >= event.quotaPeserta) {
      throw new ApiError(409, 'QUOTA_FULL', 'Kuota peserta penuh. Tetap masukkan tamu ini?');
    }
  }

  const now = new Date();
  const lunas = paid && pembayaran !== 'BELUM';
  const nominal =
    event.tipeBayar === 'NOMINAL_TETAP' ? Number(event.nominal ?? 0) : Math.max(Number(event.nominal ?? 0), input.nominal ?? 0);
  const status = checkin ? 'HADIR' : lunas ? 'BAYAR' : 'DAFTAR';
  const approverJemaatId = req.user?.jemaatId ?? null;
  const data = {
    status: status as 'HADIR' | 'BAYAR' | 'DAFTAR',
    cancelledAt: null,
    ...(checkin ? { attendedAt: now, checkinMethod: 'MANUAL' } : {}),
    ...(lunas ? { paidAt: now } : {}),
    ...(member ? {} : { guestSource: 'WALK_IN', invitedByJemaatId: null }),
  };
  const participation = existing
    ? await prisma.eventParticipation.update({ where: { id: existing.id }, data })
    : await prisma.eventParticipation.create({
        data: { ...data, eventId: event.id, jemaatId: tamu.id, nominalBayar: paid ? nominal : null },
      });
  if (lunas && pembayaran !== 'GRATIS' && nominal > 0) {
    await prisma.eventDonation.create({
      data: {
        participationId: participation.id,
        nominalBayar: nominal,
        status: 'BAYAR',
        paidAt: now,
        approvedBy: approverJemaatId,
        approvedAt: now,
        catatan: `Tamu dari portal — diterima petugas (${pembayaran})`,
      },
    });
  }
  await syncEventRoleForStatus(event, tamu.id, status);
  audit(req, {
    action: 'CREATE',
    resource: 'event_participation',
    resourceId: participation.id,
    resourceLabel: `Tamu ${input.jenis === 'ANAK' ? 'anak' : 'dewasa'} ${tamu.namaLengkap} @ ${event.judul} (${checkin ? 'hadir' : 'daftar'})`,
    metadata: { kind: 'portal-tamu', tujuan: 'EVENT', jenis: input.jenis, pembayaran, force: !!input.force, tamuBaru: created, isMember: member },
  });
  const label = checkin ? 'tercatat hadir' : lunas ? 'terdaftar (lunas)' : paid ? 'terdaftar (belum bayar)' : 'terdaftar';
  res.status(201).json({
    success: true,
    data: {
      tujuan: 'EVENT',
      tamu: { id: tamu.id, namaLengkap: tamu.namaLengkap, kode: tamu.kode },
      status,
      pickupCode: null,
      isMember: member,
      isReturning: !created && !member,
      acaraNama: event.judul,
    },
    message: member
      ? `${tamu.namaLengkap} ternyata sudah terdaftar sebagai jemaat — ${label}.`
      : `Tamu ${tamu.namaLengkap} ${label} di ${event.judul}.`,
  });
}

const patchSchema = z.object({
  status: z.enum(TAMU_STATUSES).optional(),
  catatan: z.string().trim().max(2000).nullish(),
  /** Petugas follow-up (jemaat). null = lepas. */
  followupById: z.string().uuid().nullable().optional(),
});

tamuRouter.patch('/:id', async (req, res) => {
  await assertAccess(req, 'write');
  if (!UUID_RE.test(req.params.id)) throw NotFound('Tamu tidak ditemukan');
  const input = patchSchema.parse(req.body ?? {});
  const before = await prisma.jemaat.findUnique({
    where: { id: req.params.id },
    select: { id: true, namaLengkap: true, tamuStatus: true, tamuCatatan: true, tamuFollowupById: true },
  });
  if (!before) throw NotFound('Tamu tidak ditemukan');
  if (input.followupById) {
    const fu = await prisma.jemaat.findUnique({ where: { id: input.followupById }, select: { isActive: true, isTamu: true } });
    if (!fu || !fu.isActive || fu.isTamu) throw BadRequest('Petugas follow-up harus jemaat aktif.');
    if (input.followupById === before.id) throw BadRequest('Petugas follow-up tidak boleh tamu itu sendiri.');
  }
  const data: Prisma.JemaatUpdateInput = {};
  if (input.status) {
    data.tamuStatus = input.status;
    data.tamuStatusUpdatedAt = new Date();
    data.tamuStatusUpdatedById = req.user!.jemaatId;
  }
  if (input.catatan !== undefined) data.tamuCatatan = input.catatan || null;
  if (input.followupById !== undefined && input.followupById !== before.tamuFollowupById) {
    data.tamuFollowupBy = input.followupById ? { connect: { id: input.followupById } } : { disconnect: true };
    data.tamuFollowupAt = input.followupById ? new Date() : null;
    // Menugaskan petugas = sedang di-follow-up (kecuali status sudah diatur eksplisit / sudah terdaftar).
    if (input.followupById && !input.status && before.tamuStatus !== 'TERDAFTAR') {
      data.tamuStatus = 'FOLLOWUP';
      data.tamuStatusUpdatedAt = new Date();
      data.tamuStatusUpdatedById = req.user!.jemaatId;
    }
  }
  const updated = await prisma.jemaat.update({
    where: { id: before.id },
    data,
    select: {
      id: true,
      tamuStatus: true,
      tamuCatatan: true,
      tamuStatusUpdatedAt: true,
      tamuFollowupAt: true,
      tamuFollowupBy: { select: { id: true, namaLengkap: true } },
    },
  });
  audit(req, {
    action: 'UPDATE',
    resource: 'tamu_status',
    resourceId: before.id,
    resourceLabel: `Tamu ${before.namaLengkap}: ${before.tamuStatus ?? 'DIUNDANG'} → ${updated.tamuStatus ?? 'DIUNDANG'}${
      updated.tamuFollowupBy ? ` · follow-up: ${updated.tamuFollowupBy.namaLengkap}` : ''
    }`,
    before,
    after: updated,
  });
  res.json({ success: true, data: updated });
});

// ============================================================
//  EXPORT ?format=pdf|csv — filter sama dengan daftar
// ============================================================
tamuRouter.get('/export', async (req, res) => {
  await assertAccess(req, 'read');
  const status = typeof req.query.status === 'string' ? req.query.status : '';
  const all = await loadTamu(req);
  const rows = (TAMU_STATUSES as readonly string[]).includes(status) ? all.filter((x) => x.status === status) : all;
  const tgl = (d: Date | string | null | undefined) =>
    d ? new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' }) : '—';
  const stamp = new Date().toISOString().slice(0, 10);

  if (req.query.format === 'csv') {
    sendCsv(res, `tamu-${stamp}.csv`, [
      ['Nama', 'No HP', 'Cabang', 'Diundang oleh', 'Dicatat', 'Kehadiran ibadah/event', 'Terakhir hadir', 'Acara terakhir', 'Kehadiran homecell', 'Homecell terakhir', 'Status', 'Difollow-up oleh', 'Catatan'],
      ...rows.map((t) => [
        t.namaLengkap,
        t.noHp ?? '',
        t.cabang?.nama ?? '',
        t.pengundang.map((p) => p.namaLengkap).join('; ') || 'Walk-in',
        tgl(t.pertamaDicatat),
        t.kehadiran,
        t.terakhirHadir ? tgl(t.terakhirHadir) : '',
        t.terakhirAcara?.nama ?? '',
        t.kehadiranHomecell,
        t.terakhirHomecell ? `${t.terakhirHomecell.nama} (${tgl(t.terakhirHomecell.tanggal)})` : '',
        t.statusLabel,
        t.followupBy?.namaLengkap ?? '',
        t.catatan ?? '',
      ]),
    ]);
    return;
  }

  // Label filter untuk judul
  const labels: string[] = [];
  if ((TAMU_STATUSES as readonly string[]).includes(status)) labels.push(`Status: ${TAMU_STATUS_LABEL[status as TamuStatus]}`);
  const cabangId = typeof req.query.cabangId === 'string' && UUID_RE.test(req.query.cabangId) ? req.query.cabangId : null;
  if (cabangId) {
    const c = await prisma.cabangGereja.findUnique({ where: { id: cabangId }, select: { nama: true } });
    if (c) labels.push(`Cabang: ${c.nama}`);
  }
  const fu = typeof req.query.followupBy === 'string' ? req.query.followupBy : '';
  if (fu === 'none') labels.push('Belum ada petugas follow-up');
  else if (UUID_RE.test(fu)) {
    const j = await prisma.jemaat.findUnique({ where: { id: fu }, select: { namaLengkap: true } });
    if (j) labels.push(`Follow-up: ${j.namaLengkap}`);
  }
  if (typeof req.query.search === 'string' && req.query.search.trim()) labels.push(`Cari: "${req.query.search.trim()}"`);

  const count = (s: TamuStatus) => rows.filter((x) => x.status === s).length;
  const body = `
${summaryCards([
  ['Total tamu', rows.length],
  [TAMU_STATUS_LABEL.DIUNDANG, count('DIUNDANG')],
  [TAMU_STATUS_LABEL.TERLIBAT, count('TERLIBAT')],
  [TAMU_STATUS_LABEL.FOLLOWUP, count('FOLLOWUP')],
  [TAMU_STATUS_LABEL.TERDAFTAR, count('TERDAFTAR')],
])}
<h2>Daftar tamu (${rows.length})</h2>
<table><thead><tr><th>Tamu</th><th>Diundang oleh</th><th>Kehadiran</th><th>Status</th><th>Difollow-up oleh</th><th>Catatan</th></tr></thead><tbody>${rows
    .map(
      (t) => `<tr>
<td><b>${esc(t.namaLengkap)}</b><br><span class="muted">${esc(t.noHp ?? 'Tanpa no HP')} · ${esc(t.cabang?.nama ?? '')}<br>dicatat ${esc(tgl(t.pertamaDicatat))}</span></td>
<td>${t.pengundang.length ? t.pengundang.map((p) => esc(p.namaLengkap)).join('<br>') : '<span class="muted">Walk-in</span>'}</td>
<td>${t.kehadiran ? `${t.kehadiran}× · ${esc(tgl(t.terakhirHadir))}${t.terakhirAcara ? `<br><span class="muted">${esc(t.terakhirAcara.nama)}</span>` : ''}` : t.kehadiranHomecell ? '' : '<span class="muted">Belum hadir</span>'}${
  t.kehadiranHomecell && t.terakhirHomecell
    ? `${t.kehadiran ? '<br>' : ''}Homecell ${t.kehadiranHomecell}× · ${esc(tgl(t.terakhirHomecell.tanggal))}<br><span class="muted">${esc(t.terakhirHomecell.nama)}</span>`
    : ''
}</td>
<td>${esc(t.statusLabel)}</td>
<td>${t.followupBy ? `${esc(t.followupBy.namaLengkap)}${t.followupSejak ? `<br><span class="muted">sejak ${esc(tgl(t.followupSejak))}</span>` : ''}` : '<span class="muted">—</span>'}</td>
<td>${esc(t.catatan ?? '')}</td>
</tr>`,
    )
    .join('')}</tbody></table>`;
  sendPrintHtml(req, res, 'Laporan Tamu', null, labels, body, '');
});
