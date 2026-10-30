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
  changePhoneRequestSchema,
  changePhoneVerifySchema,
  meUpdateHomecellAreaSchema,
  type FamilyRole,
} from '@ecc/shared-types';
import { generateOtp, getOtpExpiry, hashOtp, sendOtpViaWhatsApp, verifyOtpHash } from '@ecc/auth';
import { otpRequestLimiter, authVerifyLimiter } from '../../middleware/rate-limit.js';
import { BadRequest, Conflict, Forbidden, NotFound, Unauthorized } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { saveProfilePhoto } from '../../lib/storage.js';
import { generateUniqueKode } from '../../lib/kode-reservasi.js';
import { flexImageUpload } from '../../lib/image-upload.js';
import { upsertJemaatRelasi, tipeNamaToBroadRole } from '../../lib/family-relation.js';
import { meVisitRouter } from './me-visit.js';
import { meIbadahRouter } from './me-ibadah.js';
import { meEventCheckinRouter } from './me-event-checkin.js';
import { meEventTiketRouter } from './me-event-tiket.js';
import { meFeedbackRouter } from './me-feedback.js';
import { meTamuRouter } from './me-tamu.js';
import { meHomecellRouter } from './me-homecell.js';
import { mePrivacyRouter } from './me-privacy.js';
import { meConsentRouter } from './me-consent.js';
import { meExportRouter } from './me-export.js';
import { meCommPrefsRouter } from './me-comm-prefs.js';
import { meReviewRouter } from './me-review.js';
import { meSpiritualJourneyRouter } from './me-spiritual-journey.js';
import { privacyGate } from '../../lib/privacy.js';
import { activeWindow, isActiveRow, relationFor } from '../../lib/my-reservasi.js';
import { resolveIbadahDuties } from '../../lib/ibadah-duty.js';
import { tzOr } from '../../lib/tz.js';
import { canCancelReservasi } from '../../lib/reservasi-window.js';
import { ibadahTicketCheckin, venueInfo, venuePoint } from '../../lib/self-checkin.js';
import { familyOf } from '../../lib/family.js';
import { sertifikatSelect } from './jemaat-sertifikat.js';
import { meBusinessRouter, meLocalMarketRouter } from './me-business.js';
import { mePrayerRouter } from './me-prayer.js';
import { meResolusiRouter } from './me-resolusi.js';
import { meBible365Router } from './me-bible365.js';
import { meWorshipRouter } from './me-worship.js';

export const meRouter = Router();

// Sub-router untuk Movement → Visit (scan QR antar jemaat).
// Mount dulu di atas supaya path /me/visits ke-resolve sebelum route lain.
meRouter.use('/visits', meVisitRouter);
// Homecell untuk semua jemaat: browse, terdekat, join request, approve (leader).
meRouter.use('/homecell', meHomecellRouter);
meRouter.use('/privacy', mePrivacyRouter);
meRouter.use('/consent', meConsentRouter);
meRouter.use('/export', meExportRouter);
meRouter.use('/communication', meCommPrefsRouter);
meRouter.use('/reviews', meReviewRouter);
meRouter.use('/spiritual-journey', meSpiritualJourneyRouter);
// Self check-in ibadah (saya + keluarga) → me-ibadah.ts
meRouter.use('/ibadah', meIbadahRouter);
// Self check-in event (saya + keluarga terdaftar) → me-event-checkin.ts
meRouter.use('/event-checkin', meEventCheckinRouter);
// Tiket event saya (lintas event) — Reservasi Saya tab Event.
meRouter.use('/event-tiket', meEventTiketRouter);
// Kritik & Saran saya → me-feedback.ts
meRouter.use('/feedback', meFeedbackRouter);
// Doa (prayer request) saya + tugas petugas doa → me-prayer.ts
meRouter.use('/prayer', mePrayerRouter);
// Resolusi tahunan saya → me-resolusi.ts
meRouter.use('/resolusi', meResolusiRouter);
// Bible 365 (program baca Alkitab 365 hari) → me-bible365.ts
meRouter.use('/bible365', meBible365Router);
// ECC Worship (album & lagu) → me-worship.ts
meRouter.use('/worship', meWorshipRouter);
// Tamu saya (non-anggota yang saya ajak) → me-tamu.ts
meRouter.use('/tamu', meTamuRouter);
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

// (Helper upsertJemaatRelasi + tipeNamaToBroadRole di-extract ke
// ../../lib/family-relation.ts supaya bisa dipakai portal /admin/keluarga juga.)

// ============================================================
//  Profile (self)
// ============================================================

// GET /admin/me/sertifikat — sertifikat milik jemaat login (read-only, untuk
// ditampilkan di profil mobile). Dikelola admin lewat portal.
meRouter.get('/sertifikat', async (req, res) => {
  const jemaatId = assertJemaatId(req);
  const data = await prisma.jemaatSertifikat.findMany({
    where: { jemaatId },
    orderBy: [{ tanggal: 'desc' }, { createdAt: 'desc' }],
    select: sertifikatSelect,
  });
  res.json({ success: true, data });
});

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
    // Pekerjaan & pernikahan: null / '' = kosongkan, undefined = tidak diubah.
    statusPekerjaan: input.statusPekerjaan === undefined ? undefined : input.statusPekerjaan || null,
    namaKantor: input.namaKantor === undefined ? undefined : input.namaKantor || null,
    statusPernikahan: input.statusPernikahan === undefined ? undefined : input.statusPernikahan || null,
    tanggalPernikahan:
      input.tanggalPernikahan === undefined ? undefined : input.tanggalPernikahan ? new Date(input.tanggalPernikahan) : null,
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

// ============================================================
// Ganti no HP sendiri — OTP dikirim ke nomor BARU (WhatsApp).
//   POST /admin/me/phone/request-otp { noHp }
//   POST /admin/me/phone/verify      { noHp, kode }
// Memakai OtpVerification purpose ONBOARDING_ADD_NOHP (verifikasi nomor
// baru untuk jemaat yang sudah login) — tanpa migrasi enum.
// ============================================================
const PHONE_OTP_PURPOSE = 'ONBOARDING_ADD_NOHP' as const;

async function assertPhoneFree(jemaatId: string, noHp: string) {
  const me = await prisma.jemaat.findUnique({ where: { id: jemaatId }, select: { noHp: true } });
  if (me?.noHp === noHp) throw BadRequest('Nomor ini sudah menjadi nomor Anda.');
  const other = await prisma.jemaat.findUnique({ where: { noHp }, select: { id: true } });
  if (other && other.id !== jemaatId) {
    throw Conflict('Nomor HP sudah dipakai jemaat lain. Hubungi admin gereja kalau ini nomor Anda.');
  }
}

meRouter.post('/phone/request-otp', otpRequestLimiter, async (req, res) => {
  const jemaatId = assertJemaatId(req);
  const { noHp } = changePhoneRequestSchema.parse(req.body ?? {});
  await assertPhoneFree(jemaatId, noHp);

  const recent = await prisma.otpVerification.findFirst({
    where: { noHp, purpose: PHONE_OTP_PURPOSE, usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  const cooldown = Number(process.env.OTP_RESEND_COOLDOWN_SECONDS ?? 60);
  if (recent && Date.now() - recent.createdAt.getTime() < cooldown * 1000) {
    throw BadRequest(`Mohon tunggu ${cooldown} detik sebelum meminta kode baru.`);
  }
  const otp = generateOtp();
  await prisma.otpVerification.create({
    data: {
      noHp,
      kodeHash: await hashOtp(otp),
      purpose: PHONE_OTP_PURPOSE,
      expiresAt: getOtpExpiry(),
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    },
  });
  await sendOtpViaWhatsApp(noHp, otp);
  res.json({ success: true, message: 'Kode verifikasi dikirim via WhatsApp ke nomor baru.', data: { noHp } });
});

meRouter.post('/phone/verify', authVerifyLimiter, async (req, res) => {
  const jemaatId = assertJemaatId(req);
  const { noHp, kode } = changePhoneVerifySchema.parse(req.body ?? {});
  const record = await prisma.otpVerification.findFirst({
    where: { noHp, purpose: PHONE_OTP_PURPOSE, usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  if (!record) throw Unauthorized('Kode tidak ditemukan atau sudah kedaluwarsa. Minta kode baru.');
  const maxAttempts = Number(process.env.OTP_MAX_ATTEMPTS ?? 3);
  if (record.attempts >= maxAttempts) throw Unauthorized('Terlalu banyak percobaan. Minta kode baru.');
  if (!(await verifyOtpHash(kode, record.kodeHash))) {
    await prisma.otpVerification.update({ where: { id: record.id }, data: { attempts: { increment: 1 } } });
    throw Unauthorized('Kode salah.');
  }
  await prisma.otpVerification.update({ where: { id: record.id }, data: { usedAt: new Date() } });

  await assertPhoneFree(jemaatId, noHp);
  const before = await prisma.jemaat.findUnique({ where: { id: jemaatId }, select: { noHp: true, namaLengkap: true } });
  let updated;
  try {
    updated = await prisma.jemaat.update({ where: { id: jemaatId }, data: { noHp }, select: { id: true, noHp: true } });
  } catch {
    throw Conflict('Nomor HP sudah dipakai jemaat lain.');
  }
  audit(req, {
    action: 'UPDATE',
    resource: 'jemaat',
    resourceId: jemaatId,
    resourceLabel: `Ganti no HP sendiri: ${before?.namaLengkap ?? ''}`,
    before: { noHp: before?.noHp ?? null },
    after: { noHp },
    metadata: { kind: 'self-change-phone' },
  });
  res.json({ success: true, message: 'Nomor HP berhasil diganti. Gunakan nomor baru untuk login berikutnya.', data: updated });
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
              mingguKe: true,
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

// ============================================================
//  Group membership — list group yg current jemaat ikut (module 23)
// ============================================================
// Untuk mobile "My Groups" tab: group aktif tempat saya anggota aktif ATAU PIC.
// `isPic` = saya PIC group tsb.
meRouter.get('/group-membership', async (req, res) => {
  const jemaatId = assertJemaatId(req);
  const groupInclude = {
    cabang: { select: { id: true, nama: true } },
    picJemaat: { select: { id: true, namaLengkap: true, fotoUrl: true } },
    _count: { select: { members: { where: { isActive: true } } } },
  } as const;
  const [memberships, picGroups] = await Promise.all([
    prisma.groupMember.findMany({
      where: { jemaatId, isActive: true },
      include: { group: { include: groupInclude } },
      orderBy: { tanggalBergabung: 'desc' },
    }),
    // Group yang saya pimpin (PIC) tapi belum tercatat sebagai anggota —
    // mis. group lama sebelum PIC otomatis jadi anggota.
    prisma.group.findMany({
      where: { picJemaatId: jemaatId, isActive: true, members: { none: { jemaatId, isActive: true } } },
      include: groupInclude,
      orderBy: { createdAt: 'desc' },
    }),
  ]);
  const data = [
    ...picGroups.map((g) => ({
      membershipId: `pic-${g.id}`,
      tanggalBergabung: g.createdAt,
      isPic: true,
      group: { ...g, memberCount: g._count.members },
    })),
    ...memberships
      .filter((m) => m.group.isActive)
      .map((m) => ({
        membershipId: m.id,
        tanggalBergabung: m.tanggalBergabung,
        isPic: m.group.picJemaatId === jemaatId,
        group: { ...m.group, memberCount: m.group._count.members },
      })),
  ];
  res.json({ success: true, data });
});

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

// PIC area mengubah nama & deskripsi area dari app.
meRouter.patch('/homecell-area/:id', async (req, res) => {
  const jemaatId = assertJemaatId(req);
  const input = meUpdateHomecellAreaSchema.parse(req.body ?? {});
  const before = await prisma.homecellArea.findUnique({ where: { id: req.params.id } });
  if (!before) throw NotFound('Homecell Area tidak ditemukan');
  if (!req.user?.isFulltimer && before.picJemaatId !== jemaatId) {
    throw Forbidden('Hanya PIC area ini yang dapat mengubahnya.');
  }
  try {
    const updated = await prisma.homecellArea.update({
      where: { id: before.id },
      data: {
        ...(input.nama !== undefined ? { nama: input.nama } : {}),
        ...(input.deskripsi !== undefined ? { deskripsi: input.deskripsi } : {}),
      },
      select: { id: true, nama: true, deskripsi: true },
    });
    audit(req, {
      action: 'UPDATE',
      resource: 'homecell_area',
      resourceId: updated.id,
      resourceLabel: `Area ${updated.nama} (app)`,
      before,
      after: updated,
    });
    res.json({ success: true, data: updated });
  } catch (e) {
    if ((e as { code?: string }).code === 'P2002') throw Conflict('Nama area sudah dipakai di cabang ini.');
    throw e;
  }
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

  const jemaatSelect = {
    id: true,
    namaLengkap: true,
    noHp: true,
    kode: true,
    fotoUrl: true,
    tanggalLahir: true,
    jenisKelamin: true,
    cabang: { select: { id: true, nama: true } },
    primaryGuardianId: true,
  } as const;

  // 1) Direct relations — row di JemaatRelasi where jemaatId = self.
  const directRows = await prisma.jemaatRelasi.findMany({
    where: { jemaatId },
    orderBy: { createdAt: 'desc' },
    include: {
      tipeRelasi: { select: { id: true, nama: true } },
      jemaatTerkait: { select: jemaatSelect },
    },
  });

  // 2) Transitive via spouse — kalau salah satu direct row itu pasangan
  //    (Suami/Istri), ambil relasi milik pasangan tsb supaya user bisa lihat
  //    anak/orang tua pasangan tanpa harus manual re-link.
  //    Contoh: W add C1,C2 sebagai Anak. W add H sebagai Suami. Login H:
  //    direct = [W (Istri)], viaSpouse = [C1 (Anak via W), C2 (Anak via W)].
  const spouseRows = directRows.filter((r) =>
    r.tipeRelasi.nama === 'Suami' || r.tipeRelasi.nama === 'Istri',
  );

  type SpouseRelExtra = {
    id: string;
    tipeRelasi: { id: string; nama: string };
    createdAt: Date;
    jemaatTerkait: {
      id: string;
      namaLengkap: string;
      noHp: string | null;
      kode: string | null;
      fotoUrl: string | null;
      tanggalLahir: Date | null;
      jenisKelamin: 'L' | 'P' | null;
      cabang: { id: string; nama: string } | null;
      primaryGuardianId: string | null;
    };
    _viaSpouse: { id: string; namaLengkap: string };
  };

  let viaSpouseRows: SpouseRelExtra[] = [];
  if (spouseRows.length > 0) {
    const directTargetIds = new Set(directRows.map((r) => r.jemaatTerkaitId));
    directTargetIds.add(jemaatId); // exclude self

    for (const sRow of spouseRows) {
      const spouseId = sRow.jemaatTerkaitId;
      const spouseFamily = await prisma.jemaatRelasi.findMany({
        where: {
          jemaatId: spouseId,
          NOT: { jemaatTerkaitId: { in: Array.from(directTargetIds) } },
          // Hanya include yg relevan sbg keluarga inti extended: anak, ortu,
          // saudara. Skip lain-lain (Suami/Istri lain, Wali, Lainnya)
          // supaya list tidak bocor kontak yg tidak related.
          tipeRelasi: {
            nama: {
              in: [
                'Anak Laki-Laki',
                'Anak Perempuan',
                'Ayah',
                'Ibu',
                'Saudara Kandung',
              ],
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        include: {
          tipeRelasi: { select: { id: true, nama: true } },
          jemaatTerkait: { select: jemaatSelect },
        },
      });

      for (const r of spouseFamily) {
        // Guard against duplicate: kalau anak sudah muncul via spouse A,
        // jangan re-tambah via spouse B (rare tapi mungkin edge case).
        if (directTargetIds.has(r.jemaatTerkaitId)) continue;
        directTargetIds.add(r.jemaatTerkaitId);
        viaSpouseRows.push({
          id: r.id,
          tipeRelasi: r.tipeRelasi,
          createdAt: r.createdAt,
          jemaatTerkait: r.jemaatTerkait,
          _viaSpouse: {
            id: sRow.jemaatTerkait.id,
            namaLengkap: sRow.jemaatTerkait.namaLengkap,
          },
        });
      }
    }
  }

  const directData = directRows.map((r) => ({
    id: r.id,
    role: tipeNamaToBroadRole(r.tipeRelasi.nama),
    tipeRelasi: r.tipeRelasi,
    isVerified: true,
    viaSpouse: null as null | { id: string; namaLengkap: string },
    createdAt: r.createdAt,
    jemaat: {
      ...r.jemaatTerkait,
      isDependent: r.jemaatTerkait.primaryGuardianId === jemaatId,
    },
  }));

  const spouseData = viaSpouseRows.map((r) => ({
    id: r.id,
    role: tipeNamaToBroadRole(r.tipeRelasi.nama),
    tipeRelasi: r.tipeRelasi,
    isVerified: true,
    viaSpouse: r._viaSpouse,
    createdAt: r.createdAt,
    jemaat: {
      ...r.jemaatTerkait,
      // Note: isDependent hanya true kalau primary guardian = self.
      // Untuk anak-via-pasangan, primaryGuardian biasanya pasangan, jadi false.
      isDependent: r.jemaatTerkait.primaryGuardianId === jemaatId,
    },
  }));

  // Privasi: no HP & tanggal lahir anggota keluarga dewasa mengikuti
  // pengaturan mereka (anak & tanggungan selalu terlihat oleh orang tua/wali).
  const all = [...directData, ...spouseData];
  const gate = await privacyGate(jemaatId, all.map((r) => r.jemaat.id));
  const data = all.map((r) => ({
    ...r,
    jemaat: {
      ...r.jemaat,
      noHp: gate.can(r.jemaat.id, 'noHp') ? r.jemaat.noHp : null,
      tanggalLahir: gate.can(r.jemaat.id, 'tanggalLahir') ? r.jemaat.tanggalLahir : null,
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

  const link = await upsertJemaatRelasi(jemaatId, target.id, input);
  audit(req, {
    action: 'CREATE',
    resource: 'jemaat_relasi',
    resourceId: link.id,
    resourceLabel: `${link.tipeRelasi.nama} ↔ ${target.namaLengkap}`,
    metadata: { kind: 'family-link-kode', via: 'kode', tipe: link.tipeRelasi.nama },
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

  const link = await upsertJemaatRelasi(jemaatId, target.id, input);
  audit(req, {
    action: 'CREATE',
    resource: 'jemaat_relasi',
    resourceId: link.id,
    resourceLabel: `${link.tipeRelasi.nama} ↔ ${target.namaLengkap}`,
    metadata: { kind: 'family-link-phone', via: 'phone', tipe: link.tipeRelasi.nama },
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

  const link = await upsertJemaatRelasi(jemaatId, created.id, input);

  audit(req, {
    action: 'CREATE',
    resource: 'jemaat',
    resourceId: created.id,
    resourceLabel: `Family register-new: ${created.namaLengkap} via ${me.namaLengkap}`,
    metadata: {
      kind: 'family-register-new',
      dependent: !input.noHp,
      tipe: link.tipeRelasi.nama,
    },
  });
  res.status(201).json({ success: true, data: { jemaat: created, family: link } });
});

meRouter.patch('/family/:jemaatId', async (req, res) => {
  const jemaatId = assertJemaatId(req);
  const targetId = req.params.jemaatId;
  const input = updateFamilyRelationSchema.parse(req.body);
  if (targetId === jemaatId) throw BadRequest('Tidak bisa update diri sendiri.');

  const before = await prisma.jemaatRelasi.findFirst({
    where: { jemaatId, jemaatTerkaitId: targetId },
    include: { tipeRelasi: true },
  });
  if (!before) throw NotFound('Relasi keluarga tidak ditemukan.');

  const link = await upsertJemaatRelasi(jemaatId, targetId, input);
  audit(req, {
    action: 'UPDATE',
    resource: 'jemaat_relasi',
    resourceId: link.id,
    resourceLabel: `update ${before.tipeRelasi.nama} → ${link.tipeRelasi.nama}`,
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
      email: true,
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
  if (!targetId) throw BadRequest('Path param :jemaatId wajib.');
  const input = editDependentJemaatSchema.parse(req.body);
  const before = await assertDependentGuardian(jemaatId, targetId);

  // Uniqueness check untuk noHp + email (kalau di-set ke value non-null) —
  // tolak kalau sudah dipakai jemaat lain yang aktif.
  // Skip kalau value sama dengan existing (no-op update).
  if (input.noHp !== undefined && input.noHp !== null && input.noHp !== before.noHp) {
    const conflict = await prisma.jemaat.findFirst({
      where: { noHp: input.noHp, isActive: true, NOT: { id: targetId } },
      select: { id: true, namaLengkap: true },
    });
    if (conflict) {
      throw Conflict(
        `Nomor HP ${input.noHp} sudah terdaftar di akun jemaat lain (${conflict.namaLengkap}).`,
      );
    }
  }
  if (input.email !== undefined && input.email !== null && input.email !== before.email) {
    const conflict = await prisma.jemaat.findFirst({
      where: { email: input.email, isActive: true, NOT: { id: targetId } },
      select: { id: true, namaLengkap: true },
    });
    if (conflict) {
      throw Conflict(
        `Email ${input.email} sudah terdaftar di akun jemaat lain (${conflict.namaLengkap}).`,
      );
    }
  }

  const data: Prisma.JemaatUpdateInput = {
    namaLengkap: input.namaLengkap,
    tanggalLahir: input.tanggalLahir ? new Date(input.tanggalLahir) : undefined,
    jenisKelamin: input.jenisKelamin ?? undefined,
    alamat: input.alamat ?? undefined,
  };
  // noHp / email: optional + nullable. Kirim explicit `null` untuk clear,
  // skip key (undefined) untuk tidak ubah.
  if (input.noHp !== undefined) data.noHp = input.noHp;
  if (input.email !== undefined) data.email = input.email;

  const updated = await prisma.jemaat.update({ where: { id: targetId }, data });

  // Detect promote event — dependent yang sebelumnya tidak punya noHp,
  // sekarang dapat noHp baru. Audit dengan kind khusus supaya analytics
  // bisa track conversion dependent → full member.
  const isPromote = !before.noHp && updated.noHp;
  audit(req, {
    action: 'UPDATE',
    resource: 'jemaat',
    resourceId: updated.id,
    resourceLabel: `${isPromote ? '[promote]' : 'Edit'} dependent: ${updated.namaLengkap}`,
    before,
    after: updated,
    metadata: {
      kind: isPromote ? 'dependent-promoted' : 'dependent-edit-mobile',
      guardianJemaatId: jemaatId,
    },
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

  const before = await prisma.jemaatRelasi.findFirst({
    where: { jemaatId, jemaatTerkaitId: targetId },
    include: { tipeRelasi: { select: { nama: true } } },
  });
  if (!before) throw NotFound('Relasi keluarga tidak ditemukan.');

  // Hapus kedua arah (reciprocal).
  await prisma.jemaatRelasi.deleteMany({
    where: {
      OR: [
        { jemaatId, jemaatTerkaitId: targetId },
        { jemaatId: targetId, jemaatTerkaitId: jemaatId },
      ],
    },
  });
  audit(req, {
    action: 'DELETE',
    resource: 'jemaat_relasi',
    resourceId: before.id,
    resourceLabel: `unlink family (${before.tipeRelasi.nama})`,
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
    select: { id: true, namaLengkap: true, noHp: true, isActive: true, user: { select: { id: true } } },
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
    // Right-to-delete propagation — PDP Law compliance.
    // Telemetry + error events keyed by noHp di-delete supaya user yg
    // self-deactivate tidak bisa di-correlate via diagnostics data.
    // Lihat:
    //   - docs/backend-request-face-confidence-threshold-and-telemetry.md (privacy)
    //   - docs/backend-request-diagnostics-error-endpoint.md (right-to-delete)
    let telemetryDeleted = 0;
    let errorEventsDeleted = 0;
    if (jemaat.noHp) {
      const t = await tx.faceTelemetryEvent.deleteMany({ where: { noHp: jemaat.noHp } });
      telemetryDeleted = t.count;
      const e = await tx.diagnosticsErrorEvent.deleteMany({ where: { userNoHp: jemaat.noHp } });
      errorEventsDeleted = e.count;
    }
    // ECC Worship: riwayat putar/unduh dianonimkan (angka statistik tetap).
    await tx.worshipPlay.updateMany({ where: { jemaatId: jemaat.id }, data: { jemaatId: null } });
    await tx.worshipDownload.updateMany({ where: { jemaatId: jemaat.id }, data: { jemaatId: null } });
    return { updated, revokedCount, telemetryDeleted, errorEventsDeleted };
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
      telemetryEventsDeleted: result.telemetryDeleted,
      errorEventsDeleted: result.errorEventsDeleted,
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

// ============================================================
//  Parent-side reservasi (M41 — mobile Kids Bundle)
// ============================================================

/**
 * GET /admin/me/reservasi — Reservasi Saya (mobile).
 *
 * Cakupan (lib/my-reservasi.ts): saya, anak saya (termasuk anak pasangan),
 * tanggungan saya, tamu yang saya bawa, dan keluarga yang saya self
 * check-in-kan. Reservasi yang di-scan usher TIDAK ikut ke usher.
 *
 * Query params (opsional):
 *   - ibadahId, tanggal (YYYY-MM-DD), status (RESERVE|JOIN|CANCEL)
 *   - activeOnly (default true): ibadah hari ini & mendatang (zona cabang) atau
 *     check-in < 24 jam. `false` = riwayat (100 terbaru).
 *
 * Tiap baris diberi `relation`: SELF | ANAK | TANGGUNGAN | TAMU | KELUARGA.
 */
meRouter.get('/reservasi', async (req, res) => {
  const jemaatId = assertJemaatId(req);
  const userId = req.user!.sub;
  const ibadahId = typeof req.query.ibadahId === 'string' ? req.query.ibadahId : undefined;
  const tanggalStr = typeof req.query.tanggal === 'string' ? req.query.tanggal : undefined;
  const status =
    typeof req.query.status === 'string' &&
    ['RESERVE', 'JOIN', 'CANCEL'].includes(req.query.status)
      ? (req.query.status as 'RESERVE' | 'JOIN' | 'CANCEL')
      : undefined;
  const activeOnly = req.query.activeOnly !== 'false';

  // Orang yang reservasinya saya pegang (anak, tanggungan, tamu).
  const [childIds, dependents, tamu] = await Promise.all([
    getMyChildrenIds(jemaatId),
    prisma.jemaat.findMany({ where: { primaryGuardianId: jemaatId }, select: { id: true } }),
    prisma.jemaatTamu.findMany({ where: { inviterId: jemaatId }, select: { tamuId: true } }),
  ]);
  const people = new Map<string, 'ANAK' | 'TANGGUNGAN' | 'TAMU'>();
  for (const t of tamu) people.set(t.tamuId, 'TAMU');
  for (const d of dependents) people.set(d.id, 'TANGGUNGAN');
  for (const c of childIds) people.set(c, 'ANAK');
  people.delete(jemaatId);

  const and: Prisma.ReservasiWhereInput[] = [
    {
      OR: [
        { jemaatId: { in: [jemaatId, ...people.keys()] } },
        // Keluarga yang saya self check-in-kan (bukan hasil scan usher).
        { checkedInBy: userId, checkinMethod: 'SELF' },
        { invitedByJemaatId: jemaatId },
      ],
    },
  ];
  if (ibadahId) and.push({ ibadahId });
  if (tanggalStr && /^\d{4}-\d{2}-\d{2}$/.test(tanggalStr)) and.push({ tanggalIbadah: new Date(`${tanggalStr}T00:00:00.000Z`) });
  if (status) and.push({ status });
  if (activeOnly && !tanggalStr) {
    const w = activeWindow();
    and.push({ OR: [{ tanggalIbadah: { gte: w.fromTanggal } }, { joinedAt: { gte: w.joinedSince } }] });
  }

  const rows = await prisma.reservasi.findMany({
    where: { AND: and },
    orderBy: [{ tanggalIbadah: 'desc' }, { joinedAt: { sort: 'desc', nulls: 'last' } }],
    take: 100,
    include: {
      jemaat: {
        select: { id: true, namaLengkap: true, kode: true, fotoUrl: true },
      },
      ibadah: {
        select: {
          id: true,
          nama: true,
          jamMulai: true,
          jamSelesai: true,
          lokasi: true,
          isKidsIbadah: true,
          requiresCheckout: true,
          latitude: true,
          longitude: true,
          selfCheckinRadiusM: true,
          cabang: { select: { id: true, nama: true, timezone: true, latitude: true, longitude: true } },
          kategoriIbadah: { select: { nama: true } },
        },
      },
    },
  });

  // Saring "aktif" per zona waktu cabang masing-masing ibadah.
  const now = new Date();
  const visible = activeOnly && !tanggalStr ? rows.filter((r) => isActiveRow(r, tzOr(r.ibadah.cabang.timezone), now)) : rows;
  res.json({
    success: true,
    data: visible.map((r) => {
      const tz = tzOr(r.ibadah.cabang.timezone);
      const { latitude, longitude, selfCheckinRadiusM, ...ibadahRest } = r.ibadah;
      const { latitude: _cl, longitude: _cg, ...cabangRest } = r.ibadah.cabang;
      return {
        ...r,
        // point: titik venue (ibadah, atau cabang) — untuk tombol Petunjuk arah di tiket.
        ibadah: { ...ibadahRest, cabang: cabangRest, timezone: tz, point: venuePoint({ latitude, longitude }, r.ibadah.cabang) },
        relation: relationFor(r, jemaatId, people),
        // Tiket: jendela self check-in tanggal ini + kebutuhan lokasi (radius).
        selfCheckin: {
          ...ibadahTicketCheckin(r.ibadah, r.tanggalIbadah, tz),
          venue: venueInfo(selfCheckinRadiusM, venuePoint({ latitude, longitude }, r.ibadah.cabang)),
        },
        // Reservasi (RESERVE) bisa dibatalkan sampai jam mulai ibadah (zona cabang).
        canCancel: canCancelReservasi(r, r.ibadah.jamMulai, now, tz),
      };
    }),
  });
});

/**
 * POST /admin/me/reservasi/:id/cancel — batalkan reservasi (status RESERVE)
 * milik saya / keluarga / tamu saya, sampai jam mulai ibadah.
 */
meRouter.post('/reservasi/:id/cancel', async (req, res) => {
  const jemaatId = assertJemaatId(req);
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) throw NotFound('Reservasi tidak ditemukan');
  const r = await prisma.reservasi.findUnique({
    where: { id: req.params.id },
    include: {
      ibadah: { select: { nama: true, jamMulai: true, cabang: { select: { timezone: true } } } },
      jemaat: { select: { namaLengkap: true } },
    },
  });
  if (!r) throw NotFound('Reservasi tidak ditemukan');
  const fam = await familyOf(jemaatId);
  if (r.jemaatId !== jemaatId && !fam.has(r.jemaatId) && r.invitedByJemaatId !== jemaatId) {
    throw NotFound('Reservasi tidak ditemukan');
  }
  if (r.status !== 'RESERVE') throw BadRequest('Hanya reservasi berstatus Terdaftar yang bisa dibatalkan.');
  if (!canCancelReservasi(r, r.ibadah.jamMulai, new Date(), tzOr(r.ibadah.cabang.timezone))) {
    throw BadRequest('Reservasi tidak bisa dibatalkan karena ibadah sudah dimulai.');
  }
  const updated = await prisma.reservasi.update({
    where: { id: r.id },
    data: { status: 'CANCEL', cancelledAt: new Date() },
  });
  audit(req, {
    action: 'UPDATE',
    resource: 'reservasi',
    resourceId: r.id,
    resourceLabel: `Batal reservasi mandiri: ${r.jemaat.namaLengkap} → ${r.ibadah.nama}`,
    metadata: { kind: 'self-reserve-cancel' },
    before: r,
    after: updated,
  });
  res.json({ success: true, data: updated, message: 'Reservasi dibatalkan.' });
});

// ============================================================
//  CKids parent endpoints (M42 — mobile CKids Tab)
// ============================================================

/**
 * Helper: get list anak dari JemaatRelasi (post-family-refactor).
 * Tipe anak = "Anak Laki-Laki", "Anak Perempuan", atau backward-compat
 * "Anak" (dari data legacy sebelum granular seed).
 */
const CHILD_RELASI = ['Anak Laki-Laki', 'Anak Perempuan', 'Anak'];

/**
 * Anak requester = relasi anak langsung + anak milik pasangan (spouse-transitive),
 * sama dgn definisi family set di /admin/me/family & /peserta/mine-and-family.
 * Per backend-request-ckids-spouse-children.md (2026-10-12): sebelumnya hanya
 * relasi langsung → akun pasangan yg tidak menambahkan anak dapat [] / 403.
 */
async function getMyChildrenIds(parentJemaatId: string): Promise<string[]> {
  const direct = await prisma.jemaatRelasi.findMany({
    where: {
      jemaatId: parentJemaatId,
      tipeRelasi: { nama: { in: [...CHILD_RELASI, 'Suami', 'Istri'] } },
    },
    select: { jemaatTerkaitId: true, tipeRelasi: { select: { nama: true } } },
  });

  const childIds = new Set<string>();
  const spouseIds: string[] = [];
  for (const r of direct) {
    if (CHILD_RELASI.includes(r.tipeRelasi.nama)) childIds.add(r.jemaatTerkaitId);
    else spouseIds.push(r.jemaatTerkaitId);
  }

  if (spouseIds.length > 0) {
    const viaSpouse = await prisma.jemaatRelasi.findMany({
      where: {
        jemaatId: { in: spouseIds },
        tipeRelasi: { nama: { in: CHILD_RELASI } },
      },
      select: { jemaatTerkaitId: true },
    });
    for (const r of viaSpouse) childIds.add(r.jemaatTerkaitId);
  }

  childIds.delete(parentJemaatId);
  return [...childIds];
}

/**
 * GET /admin/me/children-points — list balance point semua anak parent
 * per cabang. Untuk CKids Tab mobile.
 *
 * Return flat list [{anak, cabang, balance, lastUpdate}], 1 row per (anak, cabang).
 * Anak tanpa balance record di cabang → skip (bukan return 0).
 */
meRouter.get('/children-points', async (req, res) => {
  const parentId = assertJemaatId(req);
  const anakIds = await getMyChildrenIds(parentId);

  if (anakIds.length === 0) {
    return res.json({ success: true, data: [] });
  }

  const balances = await prisma.jemaatPointBalance.findMany({
    where: { jemaatId: { in: anakIds } },
    orderBy: { updatedAt: 'desc' },
    include: {
      jemaat: {
        select: { id: true, namaLengkap: true, kode: true, fotoUrl: true },
      },
      cabang: { select: { id: true, nama: true } },
    },
  });

  const data = balances.map((b) => ({
    anak: b.jemaat,
    cabang: b.cabang,
    balance: b.balance,
    lastUpdate: b.updatedAt,
  }));

  res.setHeader('Cache-Control', 'private, max-age=60');
  res.json({ success: true, data });
});

/**
 * GET /admin/me/children-redeem-history?jemaatId=<anakId>&limit=20
 *
 * Parent lihat redeem history salah satu anak. Guard: verify jemaatId
 * benar-benar anak requester (via JemaatRelasi).
 */
meRouter.get('/children-redeem-history', async (req, res) => {
  const parentId = assertJemaatId(req);
  const targetJemaatId =
    typeof req.query.jemaatId === 'string' ? req.query.jemaatId : undefined;
  const limitRaw = typeof req.query.limit === 'string' ? Number(req.query.limit) : 20;
  const limit = Math.min(Math.max(limitRaw || 20, 1), 100);
  if (!targetJemaatId) throw BadRequest('jemaatId required');

  // Guard: pastikan targetJemaatId adalah anak requester
  const anakIds = await getMyChildrenIds(parentId);
  if (!anakIds.includes(targetJemaatId)) {
    throw Forbidden('jemaatId bukan anak Anda');
  }

  const rows = await prisma.hadiahRedeem.findMany({
    // Penukaran yang dibatalkan admin tidak ditampilkan (point sudah kembali).
    where: { jemaatId: targetJemaatId, cancelledAt: null },
    orderBy: { processedAt: 'desc' },
    take: limit,
    include: {
      hadiah: { select: { id: true, nama: true, fotoUrl: true } },
      cabang: { select: { id: true, nama: true } },
      processedBy: { select: { id: true, namaLengkap: true } },
    },
  });

  res.json({ success: true, data: rows });
});

// ============================================================
//  In-App Notifications (Modul 30) — mobile bell icon feed
// ============================================================

/**
 * GET /admin/me/notifications
 * List notifikasi user (paginated, sort by createdAt desc).
 * Query: limit (default 20, max 100), before (createdAt ISO untuk cursor).
 */
meRouter.get('/notifications', async (req, res) => {
  const jemaatId = assertJemaatId(req);
  const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? '20'), 10) || 20, 1), 100);
  const before = typeof req.query.before === 'string' ? new Date(req.query.before) : undefined;

  const where: { jemaatId: string; createdAt?: { lt: Date } } = { jemaatId };
  if (before && !isNaN(before.getTime())) where.createdAt = { lt: before };

  const rows = await prisma.notification.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
  });

  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? data[data.length - 1]?.createdAt.toISOString() : null;

  res.json({
    success: true,
    data,
    meta: { limit, hasMore, nextCursor },
  });
});

/**
 * GET /admin/me/notifications/unread-count
 * Cache 10s supaya polling 30s tidak hit DB tiap request.
 */
meRouter.get('/notifications/unread-count', async (req, res) => {
  const jemaatId = assertJemaatId(req);
  const count = await prisma.notification.count({
    where: { jemaatId, readAt: null },
  });
  res.setHeader('Cache-Control', 'private, max-age=10');
  res.json({ success: true, data: { count } });
});

/**
 * POST /admin/me/notifications/:id/read
 * Mark 1 notification as read. Idempotent.
 */
meRouter.post('/notifications/:id/read', async (req, res) => {
  const jemaatId = assertJemaatId(req);
  const row = await prisma.notification.findUnique({ where: { id: req.params.id } });
  if (!row) throw NotFound('Notifikasi tidak ditemukan');
  if (row.jemaatId !== jemaatId) throw Forbidden('Bukan notifikasi Anda');

  if (row.readAt) return res.json({ success: true, data: row });

  const updated = await prisma.notification.update({
    where: { id: req.params.id },
    data: { readAt: new Date() },
  });
  res.json({ success: true, data: updated });
});

/**
 * POST /admin/me/notifications/mark-all-read
 * Mark semua notif user sebagai read.
 */
meRouter.post('/notifications/mark-all-read', async (req, res) => {
  const jemaatId = assertJemaatId(req);
  const result = await prisma.notification.updateMany({
    where: { jemaatId, readAt: null },
    data: { readAt: new Date() },
  });
  res.json({ success: true, data: { markedRead: result.count } });
});

// ============================================================
//  GET /admin/me/ministry-schedule?from=&to=
// ============================================================
//
// Per backend-request-ministry-schedule-roster.md (2026-09-02).
// Cross-ministry: return semua PelayananScheduleAssignment untuk requester,
// grouped by tanggal. Include co-servants (assignment lain di schedule yg sama).
// Default window: today → +4 weeks.
meRouter.get('/ministry-schedule', async (req, res) => {
  const jemaatId = assertJemaatId(req);

  const fromRaw = req.query.from;
  const toRaw = req.query.to;
  const from =
    typeof fromRaw === 'string' && fromRaw ? new Date(fromRaw) : new Date();
  const to =
    typeof toRaw === 'string' && toRaw
      ? new Date(toRaw)
      : new Date(Date.now() + 28 * 24 * 60 * 60 * 1000);
  if (isNaN(from.getTime())) throw BadRequest('Query `from` tidak valid.');
  if (isNaN(to.getTime())) throw BadRequest('Query `to` tidak valid.');
  to.setHours(23, 59, 59, 999);

  const rows = await prisma.pelayananScheduleAssignment.findMany({
    where: {
      jemaatId,
      schedule: { tanggal: { gte: from, lte: to } },
    },
    include: {
      pelayananRole: { select: { id: true, nama: true, level: true } },
      schedule: {
        include: {
          pelayanan: { select: { id: true, nama: true } },
          ibadah: {
            select: {
              id: true,
              nama: true,
              jamMulai: true,
              jamSelesai: true,
              lokasi: true,
              cabang: { select: { timezone: true } },
            },
          },
          assignments: {
            where: { jemaatId: { not: jemaatId } },
            include: {
              jemaat: { select: { id: true, namaLengkap: true, fotoUrl: true } },
              pelayananRole: { select: { nama: true } },
            },
          },
        },
      },
    },
    orderBy: { schedule: { tanggal: 'asc' } },
  });

  const assignments = rows.map((r) => ({
    id: r.id,
    tanggal: r.schedule.tanggal,
    ibadahId: r.schedule.ibadahId,
    ibadahNama: r.schedule.ibadah?.nama ?? null,
    ibadahJamMulai: r.schedule.ibadah?.jamMulai ?? null,
    ibadahJamSelesai: r.schedule.ibadah?.jamSelesai ?? null,
    ibadahLokasi: r.schedule.ibadah?.lokasi ?? null,
    timezone: r.schedule.ibadah?.cabang?.timezone ?? null,
    ministryId: r.schedule.pelayanan.id,
    ministryNama: r.schedule.pelayanan.nama,
    posisi: r.pelayananRole.nama,
    posisiLevel: r.pelayananRole.level,
    notes: r.notes,
    coServants: r.schedule.assignments.map((c) => ({
      jemaatId: c.jemaatId,
      namaLengkap: c.jemaat.namaLengkap,
      fotoUrl: c.jemaat.fotoUrl,
      posisi: c.pelayananRole.nama,
    })),
    source: 'ROSTER' as const,
  }));

  // Petugas tetap ibadah (Ibadah → Pelayanan → Petugas, "pelayan default"),
  // diturunkan ke tiap tanggal occurrence. Roster (PelayananSchedule) untuk
  // pelayanan + ibadah + tanggal yang sama didahulukan (tidak dobel).
  const links = await prisma.ibadahPelayanan.findMany({
    where: { petugas: { some: { jemaatId } } },
    select: {
      pelayanan: { select: { id: true, nama: true } },
      ibadah: {
        select: {
          id: true,
          nama: true,
          jamMulai: true,
          jamSelesai: true,
          lokasi: true,
          isActive: true,
          tipeJadwal: true,
          mingguKe: true,
          tanggalMulai: true,
          hari: true,
          cabang: { select: { timezone: true } },
        },
      },
      petugas: {
        select: {
          id: true,
          jemaatId: true,
          tanggalIbadah: true,
          catatan: true,
          pelayananRole: { select: { nama: true, level: true } },
          jemaat: { select: { id: true, namaLengkap: true, fotoUrl: true } },
        },
      },
    },
  });
  let teamDuties: ReturnType<typeof resolveIbadahDuties> = [];
  if (links.length) {
    const fromDay = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
    const toDay = new Date(Date.UTC(to.getFullYear(), to.getMonth(), to.getDate()));
    const ibadahIds = links.map((l) => l.ibadah.id);
    const [cancelledRows, rosters] = await Promise.all([
      prisma.ibadahOccurrenceStatus.findMany({
        where: { ibadahId: { in: ibadahIds }, status: 'CANCELLED', tanggalIbadah: { gte: fromDay, lte: toDay } },
        select: { ibadahId: true, tanggalIbadah: true },
      }),
      prisma.pelayananSchedule.findMany({
        where: { ibadahId: { in: ibadahIds }, tanggal: { gte: fromDay, lte: toDay } },
        select: { ibadahId: true, pelayananId: true, tanggal: true },
      }),
    ]);
    const cancelled = new Set(cancelledRows.map((c) => `${c.ibadahId}:${c.tanggalIbadah.toISOString().slice(0, 10)}`));
    const rosterKey = new Set(rosters.map((r) => `${r.ibadahId}:${r.pelayananId}:${r.tanggal.toISOString().slice(0, 10)}`));
    teamDuties = resolveIbadahDuties(
      links.map((l) => ({
        ibadah: l.ibadah,
        pelayanan: l.pelayanan,
        rows: l.petugas.map((p) => ({
          id: p.id,
          jemaatId: p.jemaatId,
          tanggalIbadah: p.tanggalIbadah,
          catatan: p.catatan,
          role: p.pelayananRole,
          jemaat: p.jemaat,
        })),
      })),
      jemaatId,
      fromDay,
      toDay,
      cancelled,
    ).filter((d) => !rosterKey.has(`${d.ibadahId}:${d.ministryId}:${d.tanggal}`));
  }
  const allAssignments = [...assignments, ...teamDuties].sort((a, b) =>
    String(a.tanggal instanceof Date ? a.tanggal.toISOString() : a.tanggal).localeCompare(
      String(b.tanggal instanceof Date ? b.tanggal.toISOString() : b.tanggal),
    ),
  );

  // Petugas event (EventPelayananPetugas) yang event-nya beririsan dengan
  // jendela waktu — ditampilkan di "Jadwal Pelayanan Saya".
  const eventRows = await prisma.eventPelayananPetugas.findMany({
    where: {
      jemaatId,
      eventPelayanan: {
        event: {
          isActive: true,
          tanggalMulai: { lte: to },
          OR: [{ tanggalSelesai: { gte: from } }, { tanggalSelesai: null, tanggalMulai: { gte: from } }],
        },
      },
    },
    include: {
      pelayananRole: { select: { nama: true, level: true } },
      eventPelayanan: {
        include: {
          pelayanan: { select: { id: true, nama: true } },
          event: {
            select: {
              id: true,
              judul: true,
              tanggalMulai: true,
              tanggalSelesai: true,
              jamMulai: true,
              jamSelesai: true,
              lokasi: true,
              cabang: { select: { id: true, nama: true, timezone: true } },
            },
          },
        },
      },
    },
    orderBy: { eventPelayanan: { event: { tanggalMulai: 'asc' } } },
  });
  const events = eventRows.map((r) => ({
    id: r.id,
    eventId: r.eventPelayanan.event.id,
    judul: r.eventPelayanan.event.judul,
    tanggalMulai: r.eventPelayanan.event.tanggalMulai,
    tanggalSelesai: r.eventPelayanan.event.tanggalSelesai,
    jamMulai: r.eventPelayanan.event.jamMulai,
    jamSelesai: r.eventPelayanan.event.jamSelesai,
    lokasi: r.eventPelayanan.event.lokasi,
    cabang: r.eventPelayanan.event.cabang,
    ministryId: r.eventPelayanan.pelayanan.id,
    ministryNama: r.eventPelayanan.pelayanan.nama,
    posisi: r.pelayananRole.nama,
    posisiLevel: r.pelayananRole.level,
    canScanAttendance: r.canScanAttendance,
    catatan: r.catatan,
  }));

  res.json({ success: true, data: { assignments: allAssignments, events } });
});
