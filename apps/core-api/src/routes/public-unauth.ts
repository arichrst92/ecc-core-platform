/**
 * Public (unauthenticated) endpoints — diakses sebelum login.
 *
 * Berbeda dengan `/api/v1/*` (publicRouter) yang pakai API key untuk
 * cross-system integration, router ini truly public — no auth sama sekali.
 *
 * Use case:
 *   - Legal documents (Terms / Privacy) yang harus accessible di login/signup screen.
 *   - App version check yang harus accessible saat splash (sebelum login flow).
 *   - Guest mode browse (M24+M25): ibadah calendar, event, local-market, rekening.
 *
 * Mount di app.ts sebagai `/public/*`.
 */
import { Router } from 'express';
import { prisma } from '@ecc/database';
import {
  legalKeySchema,
  legalLanguageSchema,
  checkAppVersionQuerySchema,
  compareSemver,
  publicIbadahCalendarQuerySchema,
  publicEventQuerySchema,
  publicLocalMarketQuerySchema,
  publicKontenQuerySchema,
} from '@ecc/shared-types';
import { BadRequest, NotFound } from '../lib/errors.js';
import { publicBrowseLimiter } from '../middleware/rate-limit.js';
import { generateOccurrences } from '../lib/ibadah-occurrences.js';

export const publicUnauthRouter = Router();

// ============================================================
//  GET /public/app-config — tune-able runtime config untuk mobile
//  Mobile fetch saat splash + cache 1 jam. No auth.
//
//  Lihat docs/backend-request-face-confidence-threshold-and-telemetry.md
//  + docs/backend-request-diagnostics-error-endpoint.md untuk konteks.
// ============================================================
publicUnauthRouter.get('/app-config', async (_req, res) => {
  const row = await prisma.appConfig.findUnique({ where: { id: 'global' } });
  if (!row) {
    // Defensive: singleton belum di-seed (mis. migration belum jalan).
    // Return safe defaults supaya mobile tidak crash.
    return res.json({
      success: true,
      data: {
        faceMatchThreshold: 0.5,
        lowConfidenceWarnThreshold: 0.7,
        telemetrySamplingRate: 1.0,
        errorReportingEnabled: true,
      },
    });
  }
  res.json({
    success: true,
    data: {
      faceMatchThreshold: row.faceMatchThreshold,
      lowConfidenceWarnThreshold: row.lowConfidenceWarnThreshold,
      telemetrySamplingRate: row.telemetrySamplingRate,
      errorReportingEnabled: row.errorReportingEnabled,
    },
  });
});

// ============================================================
//  GET /public/maintenance — global maintenance flag
//  Mobile splash + periodic polling. No auth.
// ============================================================
publicUnauthRouter.get('/maintenance', async (_req, res) => {
  const row = await prisma.maintenanceMode.findUnique({
    where: { id: 'global' },
  });
  if (!row) {
    // Defensive: kalau singleton belum ada (migration belum dijalankan?),
    // return default off supaya mobile tetap berjalan.
    return res.json({
      success: true,
      data: {
        isEnabled: false,
        message: null,
        startedAt: null,
        estimatedEndAt: null,
      },
    });
  }
  // Auto-disable kalau estimatedEndAt sudah lewat. Tidak update DB (avoid
  // race + extra write); mobile cuma terima isEnabled=false. Admin perlu
  // explicit disable via portal supaya audit clean.
  let isEnabled = row.isEnabled;
  if (isEnabled && row.estimatedEndAt && row.estimatedEndAt.getTime() < Date.now()) {
    isEnabled = false;
  }
  res.json({
    success: true,
    data: {
      isEnabled,
      message: row.message,
      startedAt: row.startedAt,
      estimatedEndAt: row.estimatedEndAt,
    },
  });
});

// ============================================================
//  GET /public/legal/:key?lang=id|en
//  Mobile fetch Terms/Privacy. Fallback ke 'id' kalau lang yg di-minta
//  tidak tersedia.
// ============================================================
publicUnauthRouter.get('/legal/:key', async (req, res) => {
  const keyParsed = legalKeySchema.safeParse(req.params.key ?? '');
  if (!keyParsed.success) throw BadRequest('Key tidak valid (TERMS | PRIVACY).');
  const key = keyParsed.data;

  // Lang opsional, default 'id'.
  const langRaw = typeof req.query.lang === 'string' ? req.query.lang : 'id';
  const langParsed = legalLanguageSchema.safeParse(langRaw);
  const lang = langParsed.success ? langParsed.data : 'id';

  // Coba lang yg diminta dulu; fallback ke 'id' kalau tidak ada.
  // Pakai findFirst supaya bisa filter isPublished (findUnique hanya boleh
  // pakai unique fields).
  let doc = await prisma.legalDocument.findFirst({
    where: { key, language: lang, isPublished: true },
  });
  if (!doc && lang !== 'id') {
    doc = await prisma.legalDocument.findFirst({
      where: { key, language: 'id', isPublished: true },
    });
  }
  if (!doc) throw NotFound('Dokumen tidak ditemukan.');
  res.json({
    success: true,
    data: {
      key: doc.key,
      language: doc.language,
      title: doc.title,
      content: doc.content,
      version: doc.version,
      publishedAt: doc.publishedAt,
      updatedAt: doc.updatedAt,
    },
  });
});

// ============================================================
//  GET /public/app-version?platform=ios|android&currentVersion=1.0.0
//  Mobile check apakah ada update tersedia / force update.
// ============================================================
publicUnauthRouter.get('/app-version', async (req, res) => {
  const q = checkAppVersionQuerySchema.parse(req.query);

  const row = await prisma.appVersion.findFirst({
    where: { platform: q.platform, isPublished: true },
    orderBy: { publishedAt: 'desc' },
  });
  if (!row) {
    // Belum ada published row → tidak ada update prompt.
    return res.json({
      success: true,
      data: {
        platform: q.platform,
        latestVersion: null,
        minSupportedVersion: null,
        updateAvailable: false,
        forceUpdate: false,
        releaseNotes: null,
        downloadUrl: null,
        publishedAt: null,
      },
    });
  }

  let updateAvailable = false;
  let forceUpdate = false;
  if (q.currentVersion) {
    updateAvailable = compareSemver(q.currentVersion, row.latestVersion) < 0;
    forceUpdate = compareSemver(q.currentVersion, row.minSupportedVersion) < 0;
  }

  res.json({
    success: true,
    data: {
      platform: row.platform,
      latestVersion: row.latestVersion,
      minSupportedVersion: row.minSupportedVersion,
      updateAvailable,
      forceUpdate,
      releaseNotes: row.releaseNotes,
      downloadUrl: row.downloadUrl,
      publishedAt: row.publishedAt,
    },
  });
});

// ============================================================
//  Guest Mode endpoints — M24+M25 (browse-only tanpa signup)
//  Rate-limited 60/menit/IP via publicBrowseLimiter.
// ============================================================

// GET /public/ibadah/calendar?cabangId=&from=&to=
// Mirror /admin/ibadah/calendar tapi public — filter is_active=true AND
// is_public=true. Omit petugas + internal notes.
publicUnauthRouter.get('/ibadah/calendar', publicBrowseLimiter, async (req, res) => {
  const q = publicIbadahCalendarQuerySchema.parse(req.query);

  // Default range: dari today sampai +30 hari kalau tidak diset.
  const now = new Date();
  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const from = q.from ? new Date(q.from) : todayUtc;
  const to = q.to
    ? new Date(q.to)
    : new Date(from.getTime() + 30 * 24 * 60 * 60 * 1000);

  // Limit max 90 hari supaya guest tidak hammer server dengan range besar.
  const DAY = 1000 * 60 * 60 * 24;
  if ((to.getTime() - from.getTime()) / DAY > 90) {
    throw BadRequest('Rentang max 90 hari untuk guest endpoint');
  }
  to.setUTCHours(23, 59, 59, 999);

  const where: { isActive: true; isPublic: true; cabangId?: string } = {
    isActive: true,
    isPublic: true,
  };
  if (q.cabangId) where.cabangId = q.cabangId;

  const ibadahs = await prisma.ibadah.findMany({
    where,
    include: {
      cabang: { select: { id: true, nama: true } },
      kategoriIbadah: { select: { id: true, nama: true } },
    },
  });

  // Cancelled occurrence override
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

  const events: Array<{
    id: string;
    tanggal: string;
    jam: string;
    jamSelesai: string;
    judul: string;
    cabang: { id: string; nama: string };
    kategori: { id: string; nama: string };
    lokasi: string | null;
    isOnline: boolean;
    // URL streaming Zoom/YouTube — guest bisa lihat tanpa login (link
    // biasanya public di poster). Mobile gate "Akses Online" button.
    linkOnline: string | null;
  }> = [];

  for (const i of ibadahs) {
    const dates = generateOccurrences(
      { tipeJadwal: i.tipeJadwal, tanggalMulai: i.tanggalMulai, hari: i.hari },
      from,
      to,
    );
    for (const d of dates) {
      const iso = d.toISOString().slice(0, 10);
      if (cancelledSet.has(`${i.id}:${iso}`)) continue;
      events.push({
        id: i.id,
        tanggal: iso,
        jam: i.jamMulai,
        jamSelesai: i.jamSelesai,
        judul: i.nama,
        cabang: i.cabang!,
        kategori: i.kategoriIbadah!,
        lokasi: i.lokasi,
        isOnline: i.isOnline,
        linkOnline: i.linkOnline,
      });
    }
  }

  events.sort((a, b) => {
    if (a.tanggal !== b.tanggal) return a.tanggal.localeCompare(b.tanggal);
    return a.jam.localeCompare(b.jam);
  });

  res.json({
    success: true,
    data: events,
    meta: { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10), count: events.length },
  });
});

// GET /public/event?cabangId=&limit=&page=
// Future event yang isPublished + isActive + isPublic. Omit peserta + internal.
publicUnauthRouter.get('/event', publicBrowseLimiter, async (req, res) => {
  const q = publicEventQuerySchema.parse(req.query);

  const now = new Date();
  const where: {
    isActive: true;
    isPublic: true;
    isPublished: true;
    tanggalMulai: { gte: Date };
    cabangId?: string | null;
  } = {
    isActive: true,
    isPublic: true,
    isPublished: true,
    tanggalMulai: { gte: now },
  };
  if (q.cabangId) where.cabangId = q.cabangId;

  const [rows, total] = await Promise.all([
    prisma.event.findMany({
      where,
      orderBy: { tanggalMulai: 'asc' },
      skip: (q.page - 1) * q.limit,
      take: q.limit,
      select: {
        id: true,
        slug: true,
        judul: true,
        ringkasan: true,
        heroImageUrl: true,
        tanggalMulai: true,
        tanggalSelesai: true,
        jamMulai: true,
        jamSelesai: true,
        lokasi: true,
        tipeBayar: true,
        nominal: true,
        cabang: { select: { id: true, nama: true } },
      },
    }),
    prisma.event.count({ where }),
  ]);

  res.json({
    success: true,
    data: rows,
    meta: { page: q.page, limit: q.limit, total },
  });
});

// GET /public/local-market?cabangId=&industri=&tipeBisnis=&limit=&page=
// Filter isActive=true (showcase only). Omit owner contact details kalau ada.
publicUnauthRouter.get('/local-market', publicBrowseLimiter, async (req, res) => {
  const q = publicLocalMarketQuerySchema.parse(req.query);

  const where: {
    isActive: true;
    industri?: { contains: string; mode: 'insensitive' };
    tipeBisnis?: 'B2C' | 'B2B' | 'B2B2C';
    owner?: { cabangId: string };
  } = { isActive: true };
  // LocalBusiness tidak ada cabangId langsung — filter via owner jemaat.
  if (q.cabangId) where.owner = { cabangId: q.cabangId };
  if (q.industri) where.industri = { contains: q.industri, mode: 'insensitive' };
  if (q.tipeBisnis) where.tipeBisnis = q.tipeBisnis;

  const [rows, total] = await Promise.all([
    prisma.localBusiness.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * q.limit,
      take: q.limit,
      select: {
        id: true,
        nama: true,
        deskripsi: true,
        industri: true,
        tipeBisnis: true,
        heroImageUrl: true,
        logoUrl: true,
        companyProfileUrl: true,
        socialLinks: true,
        websiteUrl: true,
        whatsappUrl: true,
        isOnline: true,
        lokasi: true,
        // Owner: cuma kasih nama jemaat + cabang (no kontak details).
        owner: {
          select: {
            namaLengkap: true,
            cabang: { select: { id: true, nama: true } },
          },
        },
      },
    }),
    prisma.localBusiness.count({ where }),
  ]);

  res.json({
    success: true,
    data: rows,
    meta: { page: q.page, limit: q.limit, total },
  });
});

// GET /public/cabang/:id/rekening
// Info rekening cabang untuk guest persembahan tab. Filter isActive=true.
// Privacy: rekening info biasanya sudah print di buletin cabang (publik).
publicUnauthRouter.get('/cabang/:id/rekening', publicBrowseLimiter, async (req, res) => {
  const cabangId = req.params.id;
  if (!cabangId || !/^[0-9a-f-]{36}$/i.test(cabangId)) {
    throw BadRequest('cabangId tidak valid (UUID).');
  }

  // Verify cabang exists + active sebelum return rekening (jaga supaya guest
  // tidak enumerate UUID untuk discovery).
  const cabang = await prisma.cabangGereja.findFirst({
    where: { id: cabangId, isActive: true },
    select: { id: true, nama: true, kode: true },
  });
  if (!cabang) throw NotFound('Cabang tidak ditemukan atau nonaktif.');

  const rekening = await prisma.cabangRekening.findMany({
    where: { cabangId, isActive: true },
    orderBy: { purpose: 'asc' },
    select: {
      id: true,
      purpose: true,
      bankNama: true,
      bankNomor: true,
      bankAtasNama: true,
      qrisImageUrl: true,
      catatan: true,
    },
  });

  res.json({
    success: true,
    data: {
      cabang,
      rekening,
    },
  });
});

// ============================================================
//  Public Content — News & Renungan (M28 — guest home content)
//  Per docs/backend-request-public-content-news-renungan.md.
//  Rate-limit 60/menit/IP via publicBrowseLimiter.
// ============================================================

// GET /public/news?cabangId=&limit=&page=
// List news yang isPublished=true. Sort by publishedAt DESC.
publicUnauthRouter.get('/news', publicBrowseLimiter, async (req, res) => {
  const q = publicKontenQuerySchema.parse(req.query);

  const where: {
    tipe: 'NEWS';
    isPublished: true;
    cabangId?: string | null;
  } = { tipe: 'NEWS', isPublished: true };
  if (q.cabangId) where.cabangId = q.cabangId;

  const [rows, total] = await Promise.all([
    prisma.konten.findMany({
      where,
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      skip: (q.page - 1) * q.limit,
      take: q.limit,
      select: {
        id: true,
        slug: true,
        judul: true,
        ringkasan: true,
        heroImageUrl: true,
        publishedAt: true,
        tags: true,
        cabang: { select: { id: true, nama: true } },
        author: {
          select: {
            jemaat: { select: { namaLengkap: true } },
          },
        },
      },
    }),
    prisma.konten.count({ where }),
  ]);

  res.json({
    success: true,
    data: rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      judul: r.judul,
      ringkasan: r.ringkasan,
      heroImageUrl: r.heroImageUrl,
      tanggal: r.publishedAt,
      tags: r.tags,
      cabang: r.cabang,
      author: r.author?.jemaat ? { namaLengkap: r.author.jemaat.namaLengkap } : null,
    })),
    meta: { page: q.page, limit: q.limit, total },
  });
});

// GET /public/news/:id — detail single news. Filter isPublished=true.
// `id` boleh UUID atau slug supaya mobile bisa pakai URL-friendly path.
publicUnauthRouter.get('/news/:id', publicBrowseLimiter, async (req, res) => {
  const idOrSlug = req.params.id ?? '';
  if (!idOrSlug) throw BadRequest('ID/slug wajib.');

  const isUuid = /^[0-9a-f-]{36}$/i.test(idOrSlug);
  const row = await prisma.konten.findFirst({
    where: {
      tipe: 'NEWS',
      isPublished: true,
      ...(isUuid ? { id: idOrSlug } : { slug: idOrSlug }),
    },
    select: {
      id: true,
      slug: true,
      judul: true,
      ringkasan: true,
      konten: true,
      heroImageUrl: true,
      publishedAt: true,
      tags: true,
      viewCount: true,
      cabang: { select: { id: true, nama: true } },
      author: {
        select: {
          jemaat: { select: { namaLengkap: true } },
        },
      },
    },
  });
  if (!row) throw NotFound('News tidak ditemukan atau belum di-publish.');

  // Fire-and-forget view counter increment. Tidak block response.
  prisma.konten
    .update({ where: { id: row.id }, data: { viewCount: { increment: 1 } } })
    .catch(() => {});

  res.json({
    success: true,
    data: {
      id: row.id,
      slug: row.slug,
      judul: row.judul,
      ringkasan: row.ringkasan,
      konten: row.konten,
      heroImageUrl: row.heroImageUrl,
      tanggal: row.publishedAt,
      tags: row.tags,
      viewCount: row.viewCount + 1,
      cabang: row.cabang,
      author: row.author?.jemaat ? { namaLengkap: row.author.jemaat.namaLengkap } : null,
    },
  });
});

// GET /public/renungan?limit=&page=
// List renungan published. Global (cabangId di-ignore — renungan bukan
// scoped per cabang umumnya). Sort by tanggal DESC (atau publishedAt fallback).
publicUnauthRouter.get('/renungan', publicBrowseLimiter, async (req, res) => {
  const q = publicKontenQuerySchema.parse(req.query);

  const where: { tipe: 'RENUNGAN'; isPublished: true } = {
    tipe: 'RENUNGAN',
    isPublished: true,
  };
  // Renungan biasanya global — cabangId di-ignore by design (lihat schema doc).

  const [rows, total] = await Promise.all([
    prisma.konten.findMany({
      where,
      orderBy: [{ tanggal: 'desc' }, { publishedAt: 'desc' }],
      skip: (q.page - 1) * q.limit,
      take: q.limit,
      select: {
        id: true,
        slug: true,
        judul: true,
        ringkasan: true,
        ayatAlkitab: true,
        tanggal: true,
        publishedAt: true,
        author: {
          select: {
            jemaat: { select: { namaLengkap: true } },
          },
        },
      },
    }),
    prisma.konten.count({ where }),
  ]);

  res.json({
    success: true,
    data: rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      judul: r.judul,
      ringkasan: r.ringkasan,
      ayatAlkitab: r.ayatAlkitab,
      tanggal: r.tanggal ?? r.publishedAt,
      author: r.author?.jemaat ? { namaLengkap: r.author.jemaat.namaLengkap } : null,
    })),
    meta: { page: q.page, limit: q.limit, total },
  });
});

// GET /public/renungan/:id — detail renungan full body. Accept UUID atau slug.
publicUnauthRouter.get('/renungan/:id', publicBrowseLimiter, async (req, res) => {
  const idOrSlug = req.params.id ?? '';
  if (!idOrSlug) throw BadRequest('ID/slug wajib.');

  const isUuid = /^[0-9a-f-]{36}$/i.test(idOrSlug);
  const row = await prisma.konten.findFirst({
    where: {
      tipe: 'RENUNGAN',
      isPublished: true,
      ...(isUuid ? { id: idOrSlug } : { slug: idOrSlug }),
    },
    select: {
      id: true,
      slug: true,
      judul: true,
      ringkasan: true,
      konten: true,
      ayatAlkitab: true,
      tanggal: true,
      publishedAt: true,
      viewCount: true,
      author: {
        select: {
          jemaat: { select: { namaLengkap: true } },
        },
      },
    },
  });
  if (!row) throw NotFound('Renungan tidak ditemukan atau belum di-publish.');

  prisma.konten
    .update({ where: { id: row.id }, data: { viewCount: { increment: 1 } } })
    .catch(() => {});

  res.json({
    success: true,
    data: {
      id: row.id,
      slug: row.slug,
      judul: row.judul,
      ringkasan: row.ringkasan,
      konten: row.konten,
      ayatAlkitab: row.ayatAlkitab,
      tanggal: row.tanggal ?? row.publishedAt,
      viewCount: row.viewCount + 1,
      author: row.author?.jemaat ? { namaLengkap: row.author.jemaat.namaLengkap } : null,
    },
  });
});

// GET /public/event/:id — detail single event. Accept UUID atau slug.
// Filter isActive AND isPublic AND isPublished. Per
// docs/backend-request-public-event-detail.md (2026-05-24).
//
// Field omitted vs admin: peserta list, registration form, internal capacity,
// payment instructions detail. QRIS + bank info ditampilkan untuk transparency
// ke guest yang ingin lihat info pembayaran sebelum daftar.
publicUnauthRouter.get('/event/:id', publicBrowseLimiter, async (req, res) => {
  const idOrSlug = req.params.id ?? '';
  if (!idOrSlug) throw BadRequest('ID/slug wajib.');

  const isUuid = /^[0-9a-f-]{36}$/i.test(idOrSlug);
  const row = await prisma.event.findFirst({
    where: {
      isActive: true,
      isPublic: true,
      isPublished: true,
      ...(isUuid ? { id: idOrSlug } : { slug: idOrSlug }),
    },
    select: {
      id: true,
      slug: true,
      judul: true,
      ringkasan: true,
      deskripsi: true,
      heroImageUrl: true,
      videoUrl: true,
      tanggalMulai: true,
      tanggalSelesai: true,
      jamMulai: true,
      jamSelesai: true,
      lokasi: true,
      tipeBayar: true,
      nominal: true,
      qrisImageUrl: true,
      bankNama: true,
      bankNomor: true,
      bankAtasNama: true,
      tags: true,
      viewCount: true,
      cabang: { select: { id: true, nama: true } },
    },
  });
  if (!row) throw NotFound('Event tidak ditemukan atau belum di-publish.');

  // Fire-and-forget view counter increment. Tidak block response.
  prisma.event
    .update({ where: { id: row.id }, data: { viewCount: { increment: 1 } } })
    .catch(() => {});

  res.json({
    success: true,
    data: {
      ...row,
      viewCount: row.viewCount + 1,
    },
  });
});

// ============================================================
//  GET /public/website-content — CMS content untuk landing site
//  Mobile + landing fetch saat splash + cache 10 menit. No auth.
//
//  Response: map of { [key]: { contentType, content } } untuk semua
//  active sections. Landing landing/lib parse + render dengan fallback
//  ke hard-coded kalau key tidak ada.
// ============================================================
publicUnauthRouter.get('/website-content', publicBrowseLimiter, async (_req, res) => {
  const rows = await prisma.websiteSection.findMany({
    where: { isActive: true },
    select: { key: true, contentType: true, content: true },
  });

  const data: Record<string, { contentType: string; content: string }> = {};
  for (const r of rows) {
    data[r.key] = { contentType: r.contentType, content: r.content };
  }

  res.json({ success: true, data });
});
