/**
 * Mobile-app-centric self-service endpoints under /admin/me/*.
 *
 * Semua endpoint di sini operate terhadap "jemaat current" (req.user.jemaatId),
 * tidak butuh role admin/fulltimer — siapapun yang punya akun valid bisa pakai.
 *
 * Cakupan endpoint:
 *   - GET    /admin/me                          → profil diri (Jemaat + User)
 *   - PATCH  /admin/me                          → self-edit profile (subset field)
 *   - POST   /admin/me/foto                     → upload foto profile (multipart)
 *   - GET    /admin/me/stats                    → streak + summary (M2)
 *   - GET    /admin/me/scanner-events           → event yang user-nya scanner (M7)
 *   - GET    /admin/me/scanner-ibadah           → ibadah yang user-nya scanner (M7)
 *   - GET    /admin/me/homecell-managed         → homecell user-nya PIC (M9)
 *   - GET    /admin/me/homecell-area-managed    → area user-nya PIC (M9)
 *
 *   - GET    /admin/me/family                   → list family network
 *   - POST   /admin/me/family/link-by-kode      → link via scan QR kode
 *   - POST   /admin/me/family/link-by-phone     → link via no HP
 *   - POST   /admin/me/family/register-new      → register jemaat baru + auto-link
 *   - PATCH  /admin/me/family/:jemaatId         → update role relasi
 *   - DELETE /admin/me/family/:jemaatId         → unlink
 *
 *   - GET    /admin/me/branch-change-requests   → list request user (riwayat)
 *   - POST   /admin/me/branch-change-request    → submit request pindah cabang
 */
import { Router } from 'express';
import { prisma, Prisma } from '@ecc/database';
import {
  selfEditJemaatSchema,
  editDependentJemaatSchema,
  linkFamilyByKodeSchema,
  linkFamilyByPhoneSchema,
  registerFamilyNewSchema,
  updateFamilyRelationSchema,
  createBranchChangeRequestSchema,
  deleteMyAccountSchema,
  type FamilyRole,
} from '@ecc/shared-types';
import { BadRequest, Conflict, NotFound, Unauthorized } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { saveProfilePhoto } from '../../lib/storage.js';
import { generateUniqueKode } from '../../lib/kode-reservasi.js';
import { flexImageUpload } from '../../lib/image-upload.js';
import { meVisitRouter } from './me-visit.js';
import { meBusinessRouter, meLocalMarketRouter } from './me-business.js';

export const meRouter = Router();

// Sub-router untuk Movement → Visit (scan QR antar jemaat).
// Mount dulu di atas supaya path /me/visits ke-resolve sebelum route lain.
meRouter.use('/visits', meVisitRouter);
// Local Business — CRUD owner + browse public.
meRouter.use('/businesses', meBusinessRouter);
meRouter.use('/local-market', meLocalMarketRouter);

// Upload pakai flexImageUpload() dari lib/image-upload.ts (lebih lenient:
// field name agnostic + accept HEIC dari iOS).

// ============================================================
//  Helpers
// ============================================================

/** Helper: assert authenticated + return jemaatId. */
function assertJemaatId(req: Parameters<Parameters<typeof meRouter.get>[1]>[0]): string {
  if (!req.user) throw Unauthorized();
  return req.user.jemaatId;
}

/** Reciprocal role: A -[role]→ B ⇒ B -[reciprocal]→ A. */
function reciprocalRole(role: FamilyRole): FamilyRole {
  switch (role) {
    case 'SPOUSE':
      return 'SPOUSE';
    case 'CHILD':
      return 'PARENT';
    case 'PARENT':
      return 'CHILD';
    case 'SIBLING':
      return 'SIBLING';
  }
}

/**
 * Create reciprocal family link (auto-verify per decision 2026-05-19).
 * Idempotent: kalau row sudah ada, update role kalau berbeda.
 */
async function upsertFamilyLink(
  jemaatAId: string,
  jemaatBId: string,
  role: FamilyRole,
  createdBy: string,
) {
  if (jemaatAId === jemaatBId) throw BadRequest('Tidak bisa link ke diri sendiri.');

  const reciprocal = reciprocalRole(role);
  // Pakai transaction untuk konsistensi.
  return prisma.$transaction(async (tx) => {
    const a = await tx.familyRelation.upsert({
      where: { jemaatAId_jemaatBId: { jemaatAId, jemaatBId } },
      create: { jemaatAId, jemaatBId, role, isVerified: true, createdBy },
      update: { role, isVerified: true },
    });
    await tx.familyRelation.upsert({
      where: { jemaatAId_jemaatBId: { jemaatAId: jemaatBId, jemaatBId: jemaatAId } },
      create: {
        jemaatAId: jemaatBId,
        jemaatBId: jemaatAId,
        role: reciprocal,
        isVerified: true,
        createdBy,
      },
      update: { role: reciprocal, isVerified: true },
    });
    return a;
  });
}

// ============================================================
//  Profile (self)
// ============================================================

meRouter.get('/', async (req, res) => {
  const jemaatId = assertJemaatId(req);
  let jemaat = await prisma.jemaat.findUnique({
    where: { id: jemaatId },
    include: {
      cabang: { select: { id: true, nama: true, kode: true } },
      jemaatRoles: {
        where: { isActive: true },
        include: { role: true, subRole: true, subRoleStatus: true },
      },
      homecellMembership: {
        where: { isActive: true },
        include: {
          homecell: {
            select: {
              id: true,
              nama: true,
              area: { select: { id: true, nama: true } },
            },
          },
        },
      },
      // Ministry membership (Pelayanan via JemaatPelayanan junction).
      // Patch 2026-05-22 per request mobile ministry-endpoints.md.
      jemaatPelayanan: {
        where: { isActive: true },
        include: {
          pelayanan: { select: { id: true, nama: true, deskripsi: true } },
          pelayananRole: { select: { id: true, nama: true, level: true } },
        },
        orderBy: { tanggalMulai: 'desc' },
      },
      user: { select: { id: true, fotoUrl: true, faceEnrolledAt: true } },
    },
  });
  if (!jemaat) throw NotFound('Jemaat tidak ditemukan');

  // Patch 2026-05-22 (#4 Issue 1): self-heal kode kosong. Kalau jemaat lama
  // belum punya kode (legacy data), generate on-the-fly + persist. Idempotent.
  if (!jemaat.kode) {
    const newKode = await generateUniqueKode(
      async (k) => !!(await prisma.jemaat.findUnique({ where: { kode: k } })),
    );
    jemaat = await prisma.jemaat.update({
      where: { id: jemaatId },
      data: { kode: newKode },
      include: {
        cabang: { select: { id: true, nama: true, kode: true } },
        jemaatRoles: {
          where: { isActive: true },
          include: { role: true, subRole: true, subRoleStatus: true },
        },
        homecellMembership: {
          where: { isActive: true },
          include: {
            homecell: {
              select: {
                id: true,
                nama: true,
                area: { select: { id: true, nama: true } },
              },
            },
          },
        },
        jemaatPelayanan: {
          where: { isActive: true },
          include: {
            pelayanan: { select: { id: true, nama: true, deskripsi: true } },
            pelayananRole: { select: { id: true, nama: true, level: true } },
          },
          orderBy: { tanggalMulai: 'desc' },
        },
        user: { select: { id: true, fotoUrl: true, faceEnrolledAt: true } },
      },
    });
  }

  // Shape response — flatten jemaatPelayanan → ministries (mobile-friendly).
  const ministries = jemaat.jemaatPelayanan.map((jp) => ({
    id: jp.id,
    pelayananId: jp.pelayananId,
    nama: jp.pelayanan.nama,
    deskripsi: jp.pelayanan.deskripsi,
    posisi: jp.pelayananRole.nama,
    posisiLevel: jp.pelayananRole.level,
    tanggalMulai: jp.tanggalMulai,
  }));

  res.json({
    success: true,
    data: {
      ...jemaat,
      ministries,
    },
  });
});

meRouter.patch('/', async (req, res) => {
  const jemaatId = assertJemaatId(req);
  const input = selfEditJemaatSchema.parse(req.body);

  const before = await prisma.jemaat.findUnique({ where: { id: jemaatId } });
  if (!before) throw NotFound('Jemaat tidak ditemukan');

  // Patch 2026-05-22: cabangId boleh di-update langsung (direct-branch-change).
  // Validate cabang exists + active. Pindahkan ke cabang yang sama = no-op (skip).
  let cabangIdToUpdate: string | undefined;
  if (input.cabangId && input.cabangId !== before.cabangId) {
    const targetCabang = await prisma.cabangGereja.findUnique({
      where: { id: input.cabangId },
      select: { id: true, nama: true, isActive: true },
    });
    if (!targetCabang) throw BadRequest('Cabang tujuan tidak ditemukan.');
    if (!targetCabang.isActive) throw BadRequest('Cabang tujuan nonaktif.');
    cabangIdToUpdate = input.cabangId;
  }

  const data: Prisma.JemaatUpdateInput = {
    namaLengkap: input.namaLengkap,
    email: input.email ?? undefined,
    tanggalLahir: input.tanggalLahir ? new Date(input.tanggalLahir) : undefined,
    jenisKelamin: input.jenisKelamin ?? undefined,
    alamat: input.alamat ?? undefined,
    cabang: cabangIdToUpdate ? { connect: { id: cabangIdToUpdate } } : undefined,
  };
  const updated = await prisma.jemaat.update({ where: { id: jemaatId }, data });

  // Separate audit row untuk branch change supaya ops bisa filter by resource
  // type. Existing self-edit audit tetap capture full before/after.
  if (cabangIdToUpdate) {
    audit(req, {
      action: 'UPDATE',
      resource: 'jemaat_cabang',
      resourceId: updated.id,
      resourceLabel: `Pindah cabang: ${updated.namaLengkap}`,
      before: { cabangId: before.cabangId },
      after: { cabangId: updated.cabangId },
      metadata: {
        kind: 'direct-branch-change-mobile',
        fromCabangId: before.cabangId,
        toCabangId: updated.cabangId,
      },
    });
  }

  audit(req, {
    action: 'UPDATE',
    resource: 'jemaat',
    resourceId: updated.id,
    resourceLabel: `Self-edit: ${updated.namaLengkap}`,
    before,
    after: updated,
    metadata: { kind: 'self-edit-mobile' },
  });
  res.json({ success: true, data: updated });
});

meRouter.post('/foto', flexImageUpload(), async (req, res) => {
  const jemaatId = assertJemaatId(req);
  if (!req.file) {
    throw BadRequest(
      'File foto wajib. Kirim sebagai multipart/form-data dengan field name "foto" (atau "file" / "image").',
    );
  }
  const fotoUrl = await saveProfilePhoto('jemaat', jemaatId, req.file.buffer);
  const updated = await prisma.jemaat.update({
    where: { id: jemaatId },
    data: { fotoUrl },
    select: { id: true, fotoUrl: true },
  });
  audit(req, {
    action: 'UPLOAD_PHOTO',
    resource: 'jemaat',
    resourceId: jemaatId,
    metadata: { kind: 'self-foto-mobile', size: req.file.size },
  });
  res.json({ success: true, data: updated });
});

// ============================================================
//  Stats (streak + summary)
// ============================================================
//
// streakWeeks = jumlah minggu berturut-turut (paling baru → ke belakang) di mana
// jemaat punya ≥ 1 Reservasi status=JOIN. Streak break kalau ada gap (minggu
// kosong) > 1.
//
// Window evaluasi: 52 minggu terakhir (max streak yang ditampilkan = 52).
// ============================================================

function startOfIsoWeek(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  const day = out.getDay(); // 0 = Sunday
  const mondayOffset = (day + 6) % 7;
  out.setDate(out.getDate() - mondayOffset);
  return out;
}

function isoWeekKey(d: Date): string {
  const s = startOfIsoWeek(d);
  return `${s.getFullYear()}-W${String(Math.floor(s.getTime() / (7 * 24 * 60 * 60 * 1000))).slice(-4)}`;
}

meRouter.get('/stats', async (req, res) => {
  const jemaatId = assertJemaatId(req);

  // 1. Streak — ambil reservasi JOIN 52 minggu terakhir
  const sinceStreak = new Date();
  sinceStreak.setDate(sinceStreak.getDate() - 52 * 7);
  const joins = await prisma.reservasi.findMany({
    where: {
      jemaatId,
      status: 'JOIN',
      tanggalIbadah: { gte: sinceStreak },
    },
    select: { tanggalIbadah: true },
    orderBy: { tanggalIbadah: 'desc' },
  });

  const weekSet = new Set<string>();
  for (const r of joins) {
    weekSet.add(isoWeekKey(r.tanggalIbadah));
  }
  // Hitung streak: mulai dari minggu ini, hitung berturut-turut ke belakang.
  let streakWeeks = 0;
  let cursor = startOfIsoWeek(new Date());
  for (let i = 0; i < 52; i++) {
    const key = isoWeekKey(cursor);
    if (weekSet.has(key)) {
      streakWeeks += 1;
      cursor = new Date(cursor.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else {
      // Toleransi: kalau minggu ini belum hadir tapi minggu lalu hadir, jangan
      // break streak (counted from start of last hadir week).
      if (streakWeeks > 0) break;
      cursor = new Date(cursor.getTime() - 7 * 24 * 60 * 60 * 1000);
      // boleh 1x skip kalau belum start, untuk handle "minggu ini belum sempat hadir".
      if (i > 0) break;
    }
  }

  // 2. Attended this year (reservasi JOIN)
  const startOfYear = new Date(new Date().getFullYear(), 0, 1);
  const attendedThisYear = await prisma.reservasi.count({
    where: { jemaatId, status: 'JOIN', tanggalIbadah: { gte: startOfYear } },
  });

  // 3. Event participation count (status != BATAL)
  const eventsJoined = await prisma.eventParticipation.count({
    where: { jemaatId, status: { not: 'BATAL' } },
  });

  // 4. Homecell membership count (active)
  const homecellsActive = await prisma.homecellMember.count({
    where: { jemaatId, isActive: true },
  });

  res.json({
    success: true,
    data: {
      streakWeeks,
      attendedThisYear,
      eventsJoined,
      homecellsActive,
      totalAttended: joins.length,
    },
  });
});

// ============================================================
//  Scanner endpoints (M7)
// ============================================================
//
// User yang ditandai canScanAttendance=true di event/ibadah pelayanan petugas
// dapat scan QR kode jemaat di endpoint POST /admin/{event,ibadah}/:id/checkin.
// Endpoint ini list semua event/ibadah yang user-nya scanner — mobile pakai
// untuk hint "Anda authorized scanner di X event ini".
// ============================================================

meRouter.get('/scanner-events', async (req, res) => {
  const jemaatId = assertJemaatId(req);
  const rows = await prisma.eventPelayananPetugas.findMany({
    where: { jemaatId, canScanAttendance: true },
    include: {
      eventPelayanan: {
        include: {
          pelayanan: { select: { nama: true } },
          event: {
            select: {
              id: true,
              judul: true,
              slug: true,
              tanggalMulai: true,
              tanggalSelesai: true,
              lokasi: true,
              butuhKehadiran: true,
            },
          },
        },
      },
      pelayananRole: { select: { nama: true, level: true } },
    },
    orderBy: { eventPelayanan: { event: { tanggalMulai: 'desc' } } },
  });
  const data = rows
    .filter((r) => r.eventPelayanan.event.butuhKehadiran)
    .map((r) => ({
      eventId: r.eventPelayanan.event.id,
      judul: r.eventPelayanan.event.judul,
      slug: r.eventPelayanan.event.slug,
      tanggalMulai: r.eventPelayanan.event.tanggalMulai,
      tanggalSelesai: r.eventPelayanan.event.tanggalSelesai,
      lokasi: r.eventPelayanan.event.lokasi,
      pelayananNama: r.eventPelayanan.pelayanan.nama,
      role: r.pelayananRole.nama,
      level: r.pelayananRole.level,
    }));
  res.json({ success: true, data });
});

meRouter.get('/scanner-ibadah', async (req, res) => {
  const jemaatId = assertJemaatId(req);
  const rows = await prisma.ibadahPelayananPetugas.findMany({
    where: { jemaatId, canScanAttendance: true },
    include: {
      ibadahPelayanan: {
        include: {
          pelayanan: { select: { nama: true } },
          ibadah: {
            select: {
              id: true,
              nama: true,
              cabangId: true,
              tipeJadwal: true,
              hari: true,
              jamMulai: true,
              jamSelesai: true,
              lokasi: true,
              kategoriIbadah: { select: { nama: true } },
            },
          },
        },
      },
      pelayananRole: { select: { nama: true, level: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Dedupe by ibadahId (banyak link via pelayanan berbeda)
  const seen = new Set<string>();
  const data: unknown[] = [];
  for (const r of rows) {
    const ib = r.ibadahPelayanan.ibadah;
    if (seen.has(ib.id)) continue;
    seen.add(ib.id);
    data.push({
      ibadahId: ib.id,
      nama: ib.nama,
      cabangId: ib.cabangId,
      tipeJadwal: ib.tipeJadwal,
      hari: ib.hari,
      jamMulai: ib.jamMulai,
      jamSelesai: ib.jamSelesai,
      lokasi: ib.lokasi,
      kategori: ib.kategoriIbadah.nama,
      pelayananNama: r.ibadahPelayanan.pelayanan.nama,
      role: r.pelayananRole.nama,
      level: r.pelayananRole.level,
    });
  }
  res.json({ success: true, data });
});

// ============================================================
//  Homecell managed (M9)
// ============================================================

meRouter.get('/homecell-managed', async (req, res) => {
  const jemaatId = assertJemaatId(req);
  const data = await prisma.homecell.findMany({
    where: { picJemaatId: jemaatId, isActive: true },
    include: {
      area: { select: { id: true, nama: true, cabang: { select: { id: true, nama: true } } } },
      _count: { select: { members: { where: { isActive: true } } } },
    },
    orderBy: { nama: 'asc' },
  });
  res.json({ success: true, data: data.map((r) => ({ ...r, memberCount: r._count.members })) });
});

meRouter.get('/homecell-area-managed', async (req, res) => {
  const jemaatId = assertJemaatId(req);
  const data = await prisma.homecellArea.findMany({
    where: { picJemaatId: jemaatId, isActive: true },
    include: {
      cabang: { select: { id: true, nama: true } },
      _count: { select: { homecells: true } },
    },
    orderBy: { nama: 'asc' },
  });
  res.json({ success: true, data: data.map((r) => ({ ...r, homecellCount: r._count.homecells })) });
});

// ============================================================
//  Family management (M5, auto-verify)
// ============================================================

meRouter.get('/family', async (req, res) => {
  const jemaatId = assertJemaatId(req);
  // List semua family relation di mana user adalah jemaatA.
  // jemaatB info di-include.
  const rows = await prisma.familyRelation.findMany({
    where: { jemaatAId: jemaatId },
    orderBy: { createdAt: 'desc' },
    include: {
      jemaatB: {
        select: {
          id: true,
          namaLengkap: true,
          noHp: true,
          kode: true,
          fotoUrl: true,
          tanggalLahir: true,
          jenisKelamin: true,
          cabang: { select: { id: true, nama: true } },
          // tandai dependent (anak balita) lewat presence primaryGuardianId === user current
          primaryGuardianId: true,
        },
      },
    },
  });
  const data = rows.map((r: any) => ({
    id: r.id,
    role: r.role,
    isVerified: r.isVerified,
    createdAt: r.createdAt,
    jemaat: {
      ...r.jemaatB,
      isDependent: r.jemaatB.primaryGuardianId === jemaatId,
    },
  }));
  res.json({ success: true, data });
});

meRouter.post('/family/link-by-kode', async (req, res) => {
  const jemaatId = assertJemaatId(req);
  const input = linkFamilyByKodeSchema.parse(req.body);
  const target = await prisma.jemaat.findUnique({
    where: { kode: input.kode },
    select: { id: true, namaLengkap: true, kode: true, isActive: true },
  });
  if (!target) throw NotFound(`Kode jemaat "${input.kode}" tidak ditemukan.`);
  // Inactive (self-deactivated) jemaat tidak boleh di-link sebagai family.
  if (!target.isActive) {
    throw BadRequest(`Jemaat "${target.namaLengkap}" sudah nonaktif. Hubungi admin.`);
  }
  if (target.id === jemaatId) throw BadRequest('Tidak bisa link diri sendiri.');

  const link = await upsertFamilyLink(jemaatId, target.id, input.role, jemaatId);
  audit(req, {
    action: 'CREATE',
    resource: 'family_relation',
    resourceId: link.id,
    resourceLabel: `${input.role} ↔ ${target.namaLengkap}`,
    metadata: { kind: 'family-link-kode', via: 'kode' },
  });
  res.status(201).json({ success: true, data: { ...link, target } });
});

meRouter.post('/family/link-by-phone', async (req, res) => {
  const jemaatId = assertJemaatId(req);
  const input = linkFamilyByPhoneSchema.parse(req.body);
  const target = await prisma.jemaat.findUnique({
    where: { noHp: input.noHp },
    select: { id: true, namaLengkap: true, noHp: true, isActive: true },
  });
  if (!target) throw NotFound(`No HP "${input.noHp}" tidak ditemukan.`);
  if (!target.isActive) {
    throw BadRequest(`Jemaat "${target.namaLengkap}" sudah nonaktif. Hubungi admin.`);
  }
  if (target.id === jemaatId) throw BadRequest('Tidak bisa link diri sendiri.');

  const link = await upsertFamilyLink(jemaatId, target.id, input.role, jemaatId);
  audit(req, {
    action: 'CREATE',
    resource: 'family_relation',
    resourceId: link.id,
    resourceLabel: `${input.role} ↔ ${target.namaLengkap}`,
    metadata: { kind: 'family-link-phone', via: 'phone' },
  });
  res.status(201).json({ success: true, data: { ...link, target } });
});

meRouter.post('/family/register-new', async (req, res) => {
  const jemaatId = assertJemaatId(req);
  const input = registerFamilyNewSchema.parse(req.body);
  const me = await prisma.jemaat.findUnique({
    where: { id: jemaatId },
    select: { cabangId: true, namaLengkap: true },
  });
  if (!me) throw NotFound('Jemaat current tidak ditemukan');

  const cabangId = input.cabangId ?? me.cabangId;
  const cabang = await prisma.cabangGereja.findUnique({
    where: { id: cabangId },
    select: { isActive: true },
  });
  if (!cabang?.isActive) throw BadRequest('Cabang tidak valid.');

  if (input.noHp) {
    const existing = await prisma.jemaat.findUnique({
      where: { noHp: input.noHp },
      select: { isActive: true },
    });
    if (existing) {
      if (!existing.isActive) {
        throw Conflict(
          'Nomor HP sudah terdaftar tapi statusnya nonaktif. Hubungi admin cabang untuk reaktivasi.',
        );
      }
      throw Conflict('Nomor HP sudah terdaftar — gunakan link-by-phone.');
    }
  }

  const kode = await generateUniqueKode(
    async (k) => !!(await prisma.jemaat.findUnique({ where: { kode: k } })),
  );

  const created = await prisma.jemaat.create({
    data: {
      cabangId,
      namaLengkap: input.namaLengkap,
      kode,
      noHp: input.noHp,
      tanggalLahir: input.tanggalLahir ? new Date(input.tanggalLahir) : undefined,
      jenisKelamin: input.jenisKelamin ?? undefined,
      alamat: input.alamat,
      tanggalBergabung: new Date(),
      primaryGuardianId: input.noHp ? null : jemaatId, // dependent kalau no noHp
      registeredViaJemaatId: jemaatId,
      isActive: true,
    },
    select: { id: true, namaLengkap: true, kode: true, noHp: true },
  });

  const link = await upsertFamilyLink(jemaatId, created.id, input.role, jemaatId);

  audit(req, {
    action: 'CREATE',
    resource: 'jemaat',
    resourceId: created.id,
    resourceLabel: `Family register-new: ${created.namaLengkap} via ${me.namaLengkap}`,
    metadata: { kind: 'family-register-new', dependent: !input.noHp },
  });
  res.status(201).json({ success: true, data: { jemaat: created, family: link } });
});

meRouter.patch('/family/:jemaatId', async (req, res) => {
  const jemaatId = assertJemaatId(req);
  const targetId = req.params.jemaatId;
  const input = updateFamilyRelationSchema.parse(req.body);
  if (targetId === jemaatId) throw BadRequest('Tidak bisa update diri sendiri.');

  const before = await prisma.familyRelation.findUnique({
    where: { jemaatAId_jemaatBId: { jemaatAId: jemaatId, jemaatBId: targetId } },
  });
  if (!before) throw NotFound('Relasi keluarga tidak ditemukan.');

  const link = await upsertFamilyLink(jemaatId, targetId, input.role, jemaatId);
  audit(req, {
    action: 'UPDATE',
    resource: 'family_relation',
    resourceId: link.id,
    resourceLabel: `${input.role} update`,
    before,
    after: link,
  });
  res.json({ success: true, data: link });
});

// ============================================================
//  Dependent profile edit + foto (Patch 2026-05-22, M5)
// ============================================================
// Parent (primaryGuardian) bisa edit basic profile + foto dependent (anak
// balita / lansia tanpa HP). Authorization: target.primaryGuardianId ===
// current jemaatId + target.noHp IS NULL (artinya bonafide dependent, bukan
// adult yang harus self-edit).
//
// Per request mobile profile-edit-completeness.md.

/**
 * Helper: resolve target dependent + verify current user adalah primaryGuardian.
 * Throws 403 kalau bukan guardian, 400 kalau target bukan dependent (punya HP).
 */
async function assertDependentGuardian(currentJemaatId: string, targetJemaatId: string) {
  if (currentJemaatId === targetJemaatId) {
    throw BadRequest('Endpoint ini untuk edit dependent — pakai /admin/me untuk self-edit.');
  }
  const target = await prisma.jemaat.findUnique({
    where: { id: targetJemaatId },
    select: {
      id: true,
      namaLengkap: true,
      noHp: true,
      primaryGuardianId: true,
      fotoUrl: true,
      tanggalLahir: true,
      jenisKelamin: true,
      alamat: true,
    },
  });
  if (!target) throw NotFound('Jemaat dependent tidak ditemukan.');
  if (target.primaryGuardianId !== currentJemaatId) {
    throw Unauthorized(
      'Hanya primary guardian yang boleh edit profile dependent ini.',
    );
  }
  if (target.noHp) {
    throw BadRequest(
      'Target punya nomor HP sendiri — bukan dependent. Mereka harus self-edit via /admin/me.',
    );
  }
  return target;
}

meRouter.patch('/family/:jemaatId/profile', async (req, res) => {
  const jemaatId = assertJemaatId(req);
  const targetId = req.params.jemaatId;
  const input = editDependentJemaatSchema.parse(req.body);
  const before = await assertDependentGuardian(jemaatId, targetId);

  const data: Prisma.JemaatUpdateInput = {
    namaLengkap: input.namaLengkap,
    tanggalLahir: input.tanggalLahir ? new Date(input.tanggalLahir) : undefined,
    jenisKelamin: input.jenisKelamin ?? undefined,
    alamat: input.alamat ?? undefined,
  };
  const updated = await prisma.jemaat.update({ where: { id: targetId }, data });
  audit(req, {
    action: 'UPDATE',
    resource: 'jemaat',
    resourceId: updated.id,
    resourceLabel: `Edit dependent: ${updated.namaLengkap}`,
    before,
    after: updated,
    metadata: { kind: 'dependent-edit-mobile', guardianJemaatId: jemaatId },
  });
  res.json({ success: true, data: updated });
});

meRouter.post('/family/:jemaatId/foto', flexImageUpload(), async (req, res) => {
  const jemaatId = assertJemaatId(req);
  const targetId = req.params.jemaatId;
  if (!targetId) throw BadRequest('Path param :jemaatId wajib.');
  if (!req.file) {
    throw BadRequest(
      'File foto wajib. Kirim sebagai multipart/form-data dengan field name "foto" (atau "file" / "image").',
    );
  }
  await assertDependentGuardian(jemaatId, targetId);

  const fotoUrl = await saveProfilePhoto('jemaat', targetId, req.file.buffer);
  const updated = await prisma.jemaat.update({
    where: { id: targetId },
    data: { fotoUrl },
    select: { id: true, fotoUrl: true },
  });
  audit(req, {
    action: 'UPLOAD_PHOTO',
    resource: 'jemaat',
    resourceId: targetId,
    metadata: {
      kind: 'dependent-foto-mobile',
      guardianJemaatId: jemaatId,
      size: req.file.size,
    },
  });
  res.json({ success: true, data: updated });
});

meRouter.delete('/family/:jemaatId', async (req, res) => {
  const jemaatId = assertJemaatId(req);
  const targetId = req.params.jemaatId;
  if (targetId === jemaatId) throw BadRequest('Tidak bisa unlink diri sendiri.');

  // Hapus kedua arah supaya tidak menggantung.
  const before = await prisma.familyRelation.findUnique({
    where: { jemaatAId_jemaatBId: { jemaatAId: jemaatId, jemaatBId: targetId } },
  });
  if (!before) throw NotFound('Relasi keluarga tidak ditemukan.');

  await prisma.$transaction([
    prisma.familyRelation.deleteMany({
      where: { jemaatAId: jemaatId, jemaatBId: targetId },
    }),
    prisma.familyRelation.deleteMany({
      where: { jemaatAId: targetId, jemaatBId: jemaatId },
    }),
  ]);
  audit(req, {
    action: 'DELETE',
    resource: 'family_relation',
    resourceId: before.id,
    resourceLabel: `unlink family`,
    before,
  });
  res.status(204).end();
});

// ============================================================
//  Branch change request (M6)
// ============================================================

meRouter.get('/branch-change-requests', async (req, res) => {
  const jemaatId = assertJemaatId(req);
  const data = await prisma.branchChangeRequest.findMany({
    where: { jemaatId },
    orderBy: { createdAt: 'desc' },
    include: {
      // Note: relation name di schema = currentCabangId tidak punya relation
      // explicit (cuma id string). Tampilkan via lookup tambahan.
    },
  });
  res.json({ success: true, data });
});

meRouter.post('/branch-change-request', async (req, res) => {
  const jemaatId = assertJemaatId(req);
  const input = createBranchChangeRequestSchema.parse(req.body);

  const me = await prisma.jemaat.findUnique({
    where: { id: jemaatId },
    select: { cabangId: true, namaLengkap: true },
  });
  if (!me) throw NotFound('Jemaat current tidak ditemukan');
  if (me.cabangId === input.targetCabangId) {
    throw BadRequest('Cabang tujuan sama dengan cabang saat ini.');
  }
  const target = await prisma.cabangGereja.findUnique({
    where: { id: input.targetCabangId },
    select: { isActive: true, nama: true },
  });
  if (!target?.isActive) throw BadRequest('Cabang tujuan tidak valid atau nonaktif.');

  // Cek pending sudah ada? Tolak duplicate.
  const pending = await prisma.branchChangeRequest.findFirst({
    where: { jemaatId, status: 'PENDING' },
  });
  if (pending) {
    throw Conflict('Sudah ada permohonan pindah cabang yang masih PENDING.');
  }

  const created = await prisma.branchChangeRequest.create({
    data: {
      jemaatId,
      currentCabangId: me.cabangId,
      targetCabangId: input.targetCabangId,
      reason: input.reason,
      status: 'PENDING',
    },
  });
  audit(req, {
    action: 'CREATE',
    resource: 'branch_change_request',
    resourceId: created.id,
    resourceLabel: `${me.namaLengkap} → ${target.nama}`,
    after: created,
  });
  res.status(201).json({ success: true, data: created });
});

// ============================================================
//  DELETE /admin/me — self-deactivate (soft delete)
// ============================================================
// Requirement: Apple/Google store compliance — app dengan account creation
// wajib provide delete-account flow. Implementasi soft delete:
//   1. Validate confirmText match "HAPUS AKUN SAYA" (Zod literal)
//   2. Set jemaat.isActive=false + deactivatedAt + deactivationReason
//   3. Revoke semua RefreshToken user → force logout dari semua device
//   4. Audit log
//
// Reactivation hanya via portal admin (toggle isActive=true), tidak dari
// mobile. Existing access token masih valid sampai expiry (~15 min) — tapi
// karena refresh sudah revoked, session naturally expire.
//
// Data preserved (tidak di-delete): kehadiran, event participation, visit,
// family relation, local business (hidden via isActive filter), donation.
meRouter.delete('/', async (req, res) => {
  const jemaatId = assertJemaatId(req);
  const input = deleteMyAccountSchema.parse(req.body ?? {});

  const jemaat = await prisma.jemaat.findUnique({
    where: { id: jemaatId },
    select: { id: true, namaLengkap: true, isActive: true, user: { select: { id: true } } },
  });
  if (!jemaat) throw NotFound('Jemaat tidak ditemukan');
  if (!jemaat.isActive) {
    throw Conflict('Akun sudah dinonaktifkan sebelumnya.');
  }

  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.jemaat.update({
      where: { id: jemaat.id },
      data: {
        isActive: false,
        deactivatedAt: now,
        deactivationReason: input.reason ?? null,
      },
      select: { id: true, isActive: true, deactivatedAt: true },
    });
    // Revoke semua refresh token aktif → force logout dari semua device.
    // Access token short-lived (~15min) tetap valid sampai expiry; refresh
    // tidak bisa lagi, jadi session naturally berakhir.
    let revokedCount = 0;
    if (jemaat.user?.id) {
      const r = await tx.refreshToken.updateMany({
        where: { userId: jemaat.user.id, revokedAt: null },
        data: { revokedAt: now },
      });
      revokedCount = r.count;
    }
    return { updated, revokedCount };
  });

  audit(req, {
    action: 'DELETE',
    resource: 'jemaat',
    resourceId: jemaat.id,
    resourceLabel: `[self-deactivate] ${jemaat.namaLengkap}`,
    metadata: {
      kind: 'self-deactivate',
      reason: input.reason ?? null,
      revokedSessions: result.revokedCount,
    },
  });

  res.json({
    success: true,
    data: {
      jemaatId: jemaat.id,
      deactivatedAt: result.updated.deactivatedAt,
      message:
        'Akun berhasil dinonaktifkan. Anda akan ter-logout dari semua device. ' +
        'Hubungi admin cabang untuk reaktivasi.',
      revokedSessions: result.revokedCount,
    },
  });
});
