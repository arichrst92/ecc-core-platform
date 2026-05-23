/**
 * Public (unauthenticated) endpoints — diakses sebelum login.
 *
 * Berbeda dengan `/api/v1/*` (publicRouter) yang pakai API key untuk
 * cross-system integration, router ini truly public — no auth sama sekali.
 *
 * Use case:
 *   - Legal documents (Terms / Privacy) yang harus accessible di login/signup screen.
 *   - App version check yang harus accessible saat splash (sebelum login flow).
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
} from '@ecc/shared-types';
import { BadRequest, NotFound } from '../lib/errors.js';

export const publicUnauthRouter = Router();

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
