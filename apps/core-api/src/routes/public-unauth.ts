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
  publicMinistryQuerySchema,
} from '@ecc/shared-types';
import { BadRequest, NotFound } from '../lib/errors.js';
import { hargaLabel, hitView, publicItemsOf, serializeItem } from '../lib/local-market.js';
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
        messageEn: null,
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
      messageEn: row.messageEn,
      startedAt: row.startedAt,
      estimatedEndAt: row.estimatedEndAt,
    },
  });
});

// ============================================================
//  GET /public/legal/:key?lang=id|en|ms
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

  // Coba lang yg diminta dulu, lalu fallback: ms → en → id, en → id.
  // Pakai findFirst supaya bisa filter isPublished.
  const chain = lang === 'ms' ? ['ms', 'en', 'id'] : lang === 'en' ? ['en', 'id'] : ['id'];
  let doc = null as Awaited<ReturnType<typeof prisma.legalDocument.findFirst>>;
  for (const l of chain) {
    doc = await prisma.legalDocument.findFirst({
      where: { key, language: l, isPublished: true },
    });
    if (doc) break;
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
        releaseNotesEn: null,
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
      releaseNotesEn: row.releaseNotesEn,
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
      cabang: { select: { id: true, nama: true, timezone: true } },
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
    urutan: number;
    // URL streaming Zoom/YouTube — guest bisa lihat tanpa login (link
    // biasanya public di poster). Mobile gate "Akses Online" button.
    linkOnline: string | null;
    // Detail untuk panel ibadah di website (eccchurch.global/ibadah).
    deskripsi: string | null;
    mapsUrl: string | null;
    isKidsIbadah: boolean;
    // Kapasitas seat (NULL = tidak diisi di Portal) & seat terisi =
    // reservasi aktif (RESERVE + JOIN) untuk tanggal itu.
    kapasitasSeat: number | null;
    terisi: number;
  }> = [];

  const filledRows = ibadahIds.length
    ? await prisma.reservasi.groupBy({
        by: ['ibadahId', 'tanggalIbadah'],
        where: {
          ibadahId: { in: ibadahIds },
          tanggalIbadah: { gte: from, lte: to },
          status: { in: ['RESERVE', 'JOIN'] },
        },
        _count: { _all: true },
      })
    : [];
  const filled = new Map(
    filledRows.map((r) => [`${r.ibadahId}:${r.tanggalIbadah.toISOString().slice(0, 10)}`, r._count._all]),
  );

  for (const i of ibadahs) {
    const dates = generateOccurrences(
      { tipeJadwal: i.tipeJadwal, tanggalMulai: i.tanggalMulai, hari: i.hari, mingguKe: i.mingguKe },
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
        urutan: i.urutan,
        linkOnline: i.linkOnline,
        deskripsi: i.deskripsi,
        mapsUrl: i.mapsUrl,
        isKidsIbadah: i.isKidsIbadah,
        kapasitasSeat: i.kapasitasSeat,
        terisi: filled.get(`${i.id}:${iso}`) ?? 0,
      });
    }
  }

  // tanggal → urutan (Portal) → jam
  events.sort((a, b) => {
    if (a.tanggal !== b.tanggal) return a.tanggal.localeCompare(b.tanggal);
    if (a.urutan !== b.urutan) return a.urutan - b.urutan;
    return a.jam.localeCompare(b.jam);
  });

  res.json({
    success: true,
    data: events,
    meta: { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10), count: events.length },
  });
});

// GET /public/ibadah/:id/petugas?tanggal=YYYY-MM-DD
// Petugas pelayanan satu pertemuan untuk panel website — HANYA foto, nama,
// peran (role) & nama pelayanan. Aturan sama dengan detail ibadah admin:
// petugas khusus tanggal itu REPLACE petugas default per pelayanan.
publicUnauthRouter.get('/ibadah/:id/petugas', publicBrowseLimiter, async (req, res) => {
  const id = req.params.id ?? '';
  const tanggal = typeof req.query.tanggal === 'string' ? req.query.tanggal : '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw NotFound('Ibadah tidak ditemukan');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) throw BadRequest('tanggal wajib (YYYY-MM-DD)');
  const ibadah = await prisma.ibadah.findFirst({
    where: { id, isActive: true, isPublic: true },
    select: {
      ibadahPelayanan: {
        select: {
          pelayanan: { select: { nama: true, isActive: true } },
          petugas: {
            where: { OR: [{ tanggalIbadah: null }, { tanggalIbadah: new Date(`${tanggal}T00:00:00Z`) }] },
            select: {
              tanggalIbadah: true,
              jemaat: { select: { id: true, namaLengkap: true, fotoUrl: true, isActive: true } },
              pelayananRole: { select: { nama: true, level: true } },
            },
          },
        },
      },
    },
  });
  if (!ibadah) throw NotFound('Ibadah tidak ditemukan');

  const out: { id: string; nama: string; fotoUrl: string | null; peran: string; pelayanan: string; level: number }[] = [];
  for (const link of ibadah.ibadahPelayanan) {
    if (!link.pelayanan.isActive) continue;
    const rows = link.petugas.filter((p) => p.jemaat.isActive);
    const overrides = rows.filter((p) => p.tanggalIbadah);
    for (const p of overrides.length ? overrides : rows.filter((r) => !r.tanggalIbadah)) {
      out.push({
        id: p.jemaat.id,
        nama: p.jemaat.namaLengkap,
        fotoUrl: p.jemaat.fotoUrl,
        peran: p.pelayananRole.nama,
        pelayanan: link.pelayanan.nama,
        level: p.pelayananRole.level,
      });
    }
  }
  // Pelayanan A→Z, lalu role senior dulu, lalu nama.
  out.sort(
    (a, b) => a.pelayanan.localeCompare(b.pelayanan) || b.level - a.level || a.nama.localeCompare(b.nama),
  );
  res.json({ success: true, data: out.map(({ level: _l, ...p }) => p) });
});

// GET /public/event?cabangId=&limit=&page=
// Future event yang isPublished + isActive + isPublic. Omit peserta + internal.
publicUnauthRouter.get('/event', publicBrowseLimiter, async (req, res) => {
  const q = publicEventQuerySchema.parse(req.query);

  const now = new Date();
  // Event "belum expired": kalau ada tanggalSelesai, pakai dia (multi-day
  // event yang masih berlangsung masih dianggap relevan). Kalau tidak ada
  // tanggalSelesai, fallback ke tanggalMulai.
  const where: {
    isActive: true;
    isPublic: true;
    isPublished: true;
    cabangId?: string | null;
    OR?: Array<Record<string, unknown>>;
  } = {
    isActive: true,
    isPublic: true,
    isPublished: true,
    OR: [
      { tanggalSelesai: { gte: now } },
      { tanggalSelesai: null, tanggalMulai: { gte: now } },
    ],
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
        deskripsi: true,
        heroImageUrl: true,
        tanggalMulai: true,
        tanggalSelesai: true,
        jamMulai: true,
        jamSelesai: true,
        lokasi: true,
        tipeBayar: true,
        nominal: true,
        // Kuota seat (website: progress bar). Terisi = pendaftar selain BATAL (sama dengan guard kuota).
        quotaPeserta: true,
        _count: { select: { partisipasi: { where: { status: { not: 'BATAL' } } } } },
        cabang: { select: { id: true, nama: true, timezone: true } },
      },
    }),
    prisma.event.count({ where }),
  ]);

  res.json({
    success: true,
    // Daftar cukup cuplikan deskripsi (kartu website); isi lengkap di GET /event/:id.
    data: rows.map(({ _count, ...r }) => ({
      ...r,
      pesertaCount: _count.partisipasi,
      deskripsi: r.deskripsi ? (r.deskripsi.length > 300 ? `${r.deskripsi.slice(0, 300).trimEnd()}…` : r.deskripsi) : null,
    })),
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
            cabang: { select: { id: true, nama: true, timezone: true } },
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

// GET /public/local-market/:id — detail single business.
// Filter isActive=true. Owner sengaja hanya kasih cabang (no PII jemaat).
// Field tambahan vs list: companyProfileUrl (PDF), socialLinks lengkap,
// deskripsi full (di list deskripsi sengaja singkat untuk card).
publicUnauthRouter.get('/local-market/:id', publicBrowseLimiter, async (req, res) => {
  const idOrSlug = req.params.id ?? '';
  if (!idOrSlug) throw BadRequest('ID wajib.');
  // Saat ini LocalBusiness gak punya field slug — accept UUID saja.
  if (!/^[0-9a-f-]{36}$/i.test(idOrSlug)) throw BadRequest('ID tidak valid.');

  const row = await prisma.localBusiness.findFirst({
    where: { id: idOrSlug, isActive: true },
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
      waAdmin: true,
      email: true,
      socialUsernames: true,
      marketplaceLinks: true,
      mapsUrl: true,
      isOnline: true,
      lokasi: true,
      createdAt: true,
      // Owner: cuma cabang (tidak include nama jemaat — privacy).
      owner: {
        select: {
          cabang: { select: { id: true, nama: true, timezone: true } },
        },
      },
    },
  });
  if (!row) throw NotFound('Bisnis tidak ditemukan atau nonaktif.');

  res.json({ success: true, data: { ...row, items: await publicItemsOf(row.id) } });
});

// GET /public/local-market/:id/item/:itemId — satu item katalog (web + OG image).
publicUnauthRouter.get('/local-market/:id/item/:itemId', publicBrowseLimiter, async (req, res) => {
  const { id = '', itemId = '' } = req.params as { id?: string; itemId?: string };
  if (!/^[0-9a-f-]{36}$/i.test(id) || !/^[0-9a-f-]{36}$/i.test(itemId)) throw BadRequest('ID tidak valid.');
  const item = await prisma.localBusinessItem.findFirst({
    where: { id: itemId, businessId: id, isActive: true, isHiddenByAdmin: false, business: { isActive: true } },
    include: {
      business: {
        select: { id: true, nama: true, logoUrl: true, heroImageUrl: true, waAdmin: true, email: true, industri: true, owner: { select: { cabang: { select: { nama: true } } } } },
      },
    },
  });
  if (!item) throw NotFound('Item tidak ditemukan atau nonaktif.');
  const { business, ...rest } = item;
  res.json({ success: true, data: { ...serializeItem(rest as typeof item), hargaLabel: hargaLabel(serializeItem(rest as typeof item)), business } });
});

// POST /public/local-market/:id/view  &  /public/local-market/:id/item/:itemId/view
// Hitung kunjungan dari web (dipanggil proxy landing /api/market-view). Pengunjung
// dikenali dari IP asli (header x-viewer-ip dari proxy) — dedupe 30 menit.
const UUID_RE = /^[0-9a-f-]{36}$/i;
function viewerKey(req: import('express').Request): string {
  const fwd = (req.get('x-viewer-ip') ?? '').split(',')[0]?.trim();
  return `ip:${fwd || req.ip || 'unknown'}`;
}
publicUnauthRouter.post('/local-market/:id/view', publicBrowseLimiter, async (req, res) => {
  const id = req.params.id ?? '';
  if (!UUID_RE.test(id)) throw BadRequest('ID tidak valid.');
  await hitView('biz', id, viewerKey(req));
  res.json({ success: true, data: { ok: true } });
});
publicUnauthRouter.post('/local-market/:id/item/:itemId/view', publicBrowseLimiter, async (req, res) => {
  const { id = '', itemId = '' } = req.params as { id?: string; itemId?: string };
  if (!UUID_RE.test(id) || !UUID_RE.test(itemId)) throw BadRequest('ID tidak valid.');
  const ok = await prisma.localBusinessItem.count({ where: { id: itemId, businessId: id } });
  if (ok) await hitView('item', itemId, viewerKey(req));
  res.json({ success: true, data: { ok: true } });
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
        cabang: { select: { id: true, nama: true, timezone: true } },
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
      cabang: { select: { id: true, nama: true, timezone: true } },
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
        heroImageUrl: true,
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
      heroImageUrl: r.heroImageUrl,
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
      heroImageUrl: true,
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
      heroImageUrl: row.heroImageUrl,
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
      quotaPeserta: true,
      _count: { select: { partisipasi: { where: { status: { not: 'BATAL' } } } } },
      cabang: { select: { id: true, nama: true, timezone: true } },
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
      ...(({ _count, ...rest }) => rest)(row),
      pesertaCount: row._count.partisipasi,
      viewCount: row.viewCount + 1,
    },
  });
});

// ============================================================
//  GET /public/ministry — list pelayanan/ministry (tanpa data jemaat)
//
//  Dipakai landing site untuk halaman Ministry. Showcase pelayanan
//  yang ada di gereja — nama, deskripsi, jumlah role, jumlah anggota
//  aktif. SENGAJA TIDAK include nama/foto jemaat anggotanya (privacy).
//
//  Filter: isActive=true. Sort by nama ASC.
//
//  Catatan: pakai plain `_count` (tanpa where filter) supaya kompatibel
//  dengan semua versi Prisma 5.x. Filter isActive untuk roles/members
//  dilakukan client-side: kita cuma return jumlah total — kalau perlu
//  presisi aktif vs nonaktif, expand ke 2 query terpisah.
// ============================================================
// GET /public/pastors — tim pastoral ECC untuk halaman "Tentang Kami".
// Anggota aktif pelayanan "Penggembalaan" dengan level posisi ≥ 8 (mis. Senior
// Pastor, Pastor). Hanya nama, foto, posisi, dan cabang — tanpa kontak.
publicUnauthRouter.get('/pastors', publicBrowseLimiter, async (_req, res) => {
  // Utama: daftar yang diatur admin di Portal → Konten Website (about.pastors).
  const section = await prisma.websiteSection.findUnique({ where: { key: 'about.pastors' } });
  if (section) {
    let list: { nama?: string; jabatan?: string; cabang?: string | null; fotoUrl?: string | null }[] = [];
    try {
      const parsed = JSON.parse(section.content);
      if (Array.isArray(parsed)) list = parsed;
    } catch {
      list = [];
    }
    return res.json({
      success: true,
      data: section.isActive
        ? list
            .filter((p) => p && typeof p.nama === 'string' && p.nama.trim())
            .map((p, i) => ({
              id: `cfg-${i}`,
              nama: p.nama!.trim(),
              fotoUrl: p.fotoUrl || null,
              posisi: p.jabatan?.trim() || '',
              level: 0,
              cabang: p.cabang ? { id: '', nama: p.cabang } : null,
            }))
        : [],
    });
  }
  // Cadangan (section belum ada): pelayanan Penggembalaan level ≥ 8.
  const rows = await prisma.jemaatPelayanan.findMany({
    where: {
      isActive: true,
      pelayanan: { nama: { equals: 'Penggembalaan', mode: 'insensitive' }, isActive: true },
      pelayananRole: { level: { gte: 8 }, isActive: true },
      jemaat: { isActive: true },
    },
    select: {
      jemaat: { select: { id: true, namaLengkap: true, fotoUrl: true, cabang: { select: { id: true, nama: true } } } },
      pelayananRole: { select: { nama: true, level: true } },
    },
  });
  // Satu orang satu kartu (posisi tertinggi).
  const best = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    const cur = best.get(r.jemaat.id);
    if (!cur || r.pelayananRole.level > cur.pelayananRole.level) best.set(r.jemaat.id, r);
  }
  const data = [...best.values()]
    .sort((a, b) => b.pelayananRole.level - a.pelayananRole.level || a.jemaat.namaLengkap.localeCompare(b.jemaat.namaLengkap))
    .map((r) => ({
      id: r.jemaat.id,
      nama: r.jemaat.namaLengkap,
      fotoUrl: r.jemaat.fotoUrl,
      posisi: r.pelayananRole.nama,
      level: r.pelayananRole.level,
      cabang: r.jemaat.cabang,
    }));
  res.json({ success: true, data });
});

// GET /public/homecell — struktur homecell untuk website (eccchurch.global/homecell).
// Cabang → Area (zona) → Homecell, dengan foto & nama PIC zona, pastor zona, dan
// PIC homecell. TANPA alamat, kontak, atau daftar anggota (privasi) — hanya
// jadwal, kategori, rentang usia, dan jumlah anggota aktif.
publicUnauthRouter.get('/homecell', publicBrowseLimiter, async (_req, res) => {
  const person = { select: { id: true, namaLengkap: true, fotoUrl: true, isActive: true } } as const;
  const areas = await prisma.homecellArea.findMany({
    where: { isActive: true, cabang: { isActive: true }, homecells: { some: { isActive: true } } },
    orderBy: [{ cabang: { nama: 'asc' } }, { nama: 'asc' }],
    select: {
      id: true,
      nama: true,
      cabang: { select: { id: true, nama: true, timezone: true } },
      picJemaat: person,
      pastors: { select: { jemaat: person } },
      homecells: {
        where: { isActive: true },
        orderBy: { nama: 'asc' },
        select: {
          id: true,
          nama: true,
          deskripsi: true,
          hari: true,
          jam: true,
          kategori: true,
          usiaMin: true,
          usiaMax: true,
          picJemaat: person,
          _count: { select: { members: { where: { isActive: true } } } },
        },
      },
    },
  });
  type P = { id: string; namaLengkap: string; fotoUrl: string | null; isActive: boolean } | null;
  const pub = (j: P) => (j && j.isActive ? { id: j.id, nama: j.namaLengkap, fotoUrl: j.fotoUrl } : null);
  res.json({
    success: true,
    data: areas.map((a) => ({
      id: a.id,
      nama: a.nama,
      cabang: a.cabang,
      pic: pub(a.picJemaat),
      pastors: a.pastors.map((p) => pub(p.jemaat)).filter((x): x is NonNullable<typeof x> => !!x),
      homecells: a.homecells.map((h) => ({
        id: h.id,
        nama: h.nama,
        deskripsi: h.deskripsi,
        hari: h.hari,
        jam: h.jam,
        kategori: h.kategori,
        usiaMin: h.usiaMin,
        usiaMax: h.usiaMax,
        memberCount: h._count.members,
        pic: pub(h.picJemaat),
      })),
    })),
  });
});

publicUnauthRouter.get('/ministry', publicBrowseLimiter, async (req, res) => {
  const q = publicMinistryQuerySchema.parse(req.query);

  const where = { isActive: true } as const;
  const [rows, total] = await Promise.all([
    prisma.pelayanan.findMany({
      where,
      orderBy: { nama: 'asc' },
      skip: (q.page - 1) * q.limit,
      take: q.limit,
      select: {
        id: true,
        nama: true,
        deskripsi: true,
        ikon: true,
        warna: true,
        _count: { select: { roles: true, jemaatPelayanan: true } },
      },
    }),
    prisma.pelayanan.count({ where }),
  ]);

  res.json({
    success: true,
    data: rows.map((r) => ({
      id: r.id,
      nama: r.nama,
      deskripsi: r.deskripsi,
      // Ikon & warna yang dipilih admin di Portal → Pelayanan (website & app sama).
      ikon: r.ikon,
      warna: r.warna,
      roleCount: r._count.roles,
      memberCount: r._count.jemaatPelayanan,
    })),
    meta: { page: q.page, limit: q.limit, total },
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

// ============================================================
//  GET /public/worship/songs/:id — info share lagu ECC Worship
//  (tanpa lirik & tanpa audio) untuk halaman eccchurch.global/worship/:id.
// ============================================================
publicUnauthRouter.get('/worship/songs/:id', publicBrowseLimiter, async (req, res) => {
  const id = String(req.params.id ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw NotFound('Lagu tidak ditemukan');
  const s = await prisma.worshipSong.findFirst({
    where: { id, isPublished: true, audioFile: { not: null }, album: { isPublished: true } },
    select: {
      id: true,
      judul: true,
      ciptaan: true,
      tahun: true,
      durasi: true,
      album: { select: { id: true, tipe: true, judul: true, coverUrl: true } },
    },
  });
  if (!s) throw NotFound('Lagu tidak ditemukan');
  const base = (process.env.PUBLIC_API_URL ?? `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  const cover = s.album.coverUrl ? (/^https?:/i.test(s.album.coverUrl) ? s.album.coverUrl : `${base}${s.album.coverUrl}`) : null;
  res.json({ success: true, data: { ...s, album: { ...s.album, coverUrl: cover } } });
});
