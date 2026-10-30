import { Router } from 'express';
import { requireAuth } from '../../middleware/require-auth.js';
import { sinodeRouter } from './sinode.js';
import { cabangRouter } from './cabang.js';
import { jemaatRouter } from './jemaat.js';
import { roleRouter } from './role.js';
import { ibadahRouter } from './ibadah.js';
import { keluargaRouter } from './keluarga.js';
import { pelayananRouter } from './pelayanan.js';
import { reservasiRouter } from './reservasi.js';
import { createKontenRouter } from './_konten-factory.js';
import { homecellAreaRouter } from './homecell-area.js';
import { homecellRouter } from './homecell.js';
import { eventRouter } from './event.js';
import { apiKeyRouter } from './api-key.js';
import { auditLogRouter } from './audit-log.js';
import { meRouter } from './me.js';
import { branchChangeRouter } from './branch-change.js';
import { ministryRouter } from './ministry.js';
import { itMinisterTeamRouter } from './it-minister-team.js';
import { waConfigRouter } from './wa-config.js';
import { jemaatPublicRouter } from './jemaat-public.js';
import { visitRouter } from './visit.js';
import { localBusinessRouter } from './local-business.js';
import { legalRouter } from './legal.js';
import { complianceRouter } from './compliance.js';
import { reviewsRouter } from './reviews.js';
import { appVersionRouter } from './app-version.js';
import { maintenanceRouter } from './maintenance.js';
import { serverHealthRouter } from './server-health.js';
import { maintenanceModeRouter } from './maintenance-mode.js';
import { credentialRouter } from './credential.js';
import { diagnosticsAdminRouter } from './diagnostics.js';
import { websiteContentRouter } from './website-content.js';
import { groupRouter } from './group.js';
import { feedbackRouter } from './feedback.js';
import { prayerRequestRouter } from './prayer-request.js';
import { bible365AdminRouter } from './bible365.js';
import { analyticsRouter } from './analytics.js';
import { jemaatResolusiRouter } from './jemaat-resolusi.js';
import { worshipAdminRouter } from './worship.js';
import { reportRouter } from './report.js';
import { spiritualJourneyRouter } from './spiritual-journey.js';
import { tamuRouter } from './tamu.js';
import { shiftsoftSyncRouter } from './shiftsoft-sync.js';
import { hadiahRouter } from './hadiah.js';
import { giftStallRouter } from './gift-stall.js';
import { elsaRouter } from './elsa.js';
import { planningRouter } from './planning.js';
import { jemaatConsolidationRouter } from './jemaat-consolidation.js';
import { jemaatSertifikatRouter } from './jemaat-sertifikat.js';

export const adminRouter = Router();

// Semua /admin/* wajib JWT. Sebelumnya juga requireFulltimer, tapi gate
// itu dicabut — semua role yang punya akun valid bisa akses portal.
adminRouter.use(requireAuth);

// /admin/me/* — self-service mobile endpoints (HARUS sebelum /jemaat untuk
// jaga-jaga kalau ada path collision).
adminRouter.use('/me', meRouter);

// Ministry (Pelayanan) — mobile-friendly read-only. Patch 2026-05-22.
adminRouter.use('/ministry', ministryRouter);
adminRouter.use('/it-minister-team', itMinisterTeamRouter);
adminRouter.use('/wa-config', waConfigRouter);

adminRouter.use('/sinode', sinodeRouter);
adminRouter.use('/cabang', cabangRouter);
// Public profile (mobile tap-to-view) — HARUS sebelum /jemaat agar tidak
// kepecet ke jemaatRouter (which is admin-CRUD). Patch 2026-05-22.
adminRouter.use('/jemaat-public', jemaatPublicRouter);
// Konsolidasi data jemaat dari spreadsheet (preview + apply, human check). Fulltimer only.
adminRouter.use('/jemaat-consolidation', jemaatConsolidationRouter);
// Sertifikat jemaat (gambar/PDF) — sebelum jemaatRouter.
adminRouter.use('/jemaat/:jemaatId/sertifikat', jemaatSertifikatRouter);
// Resolusi tahunan jemaat (read-only) — sebelum jemaatRouter.
adminRouter.use('/jemaat/:jemaatId/resolusi', jemaatResolusiRouter);
adminRouter.use('/jemaat', jemaatRouter);
// Kritik & Saran jemaat (inbox admin portal).
adminRouter.use('/feedback', feedbackRouter);
// Prayer Request (Doa) — inbox, assign petugas, konfigurasi role petugas.
adminRouter.use('/prayer-request', prayerRequestRouter);
adminRouter.use('/bible365', bible365AdminRouter);
// Analitik Els App (halaman, aktif sekarang, performa API).
adminRouter.use('/analytics', analyticsRouter);
// ECC Worship — album, lagu, sinkron lirik (Elsa), statistik.
adminRouter.use('/worship', worshipAdminRouter);
// Laporan kehadiran ibadah & event (ringkasan, tren, tamu, export).
adminRouter.use('/report', reportRouter);
adminRouter.use('/spiritual-journey', spiritualJourneyRouter);
adminRouter.use('/tamu', tamuRouter);
adminRouter.use('/role', roleRouter);
adminRouter.use('/ibadah', ibadahRouter);
adminRouter.use('/keluarga', keluargaRouter);
adminRouter.use('/pelayanan', pelayananRouter);
adminRouter.use('/reservasi', reservasiRouter);
adminRouter.use('/news', createKontenRouter('NEWS'));
adminRouter.use('/renungan', createKontenRouter('RENUNGAN'));
adminRouter.use('/homecell-area', homecellAreaRouter);
adminRouter.use('/homecell', homecellRouter);
// Group (module 23 — generic grouping, terpisah dari Homecell).
// Support hierarchy N-level + public/private + invitation join code.
adminRouter.use('/group', groupRouter);
adminRouter.use('/event', eventRouter);
adminRouter.use('/visit', visitRouter);
adminRouter.use('/local-business', localBusinessRouter);
adminRouter.use('/legal', legalRouter);
adminRouter.use('/compliance', complianceRouter);
adminRouter.use('/reviews', reviewsRouter);
adminRouter.use('/app-version', appVersionRouter);
adminRouter.use('/maintenance', maintenanceRouter);
adminRouter.use('/server-health', serverHealthRouter);
adminRouter.use('/maintenance-mode', maintenanceModeRouter);
adminRouter.use('/credential', credentialRouter);
adminRouter.use('/diagnostics', diagnosticsAdminRouter);
adminRouter.use('/website-content', websiteContentRouter);
// Shiftsoft Sync (Developer Tools) — trigger + monitor migration script async.
// Fulltimer-only (guard di dalam router).
adminRouter.use('/shiftsoft-sync', shiftsoftSyncRouter);
// CKids (Modul 28) — Hadiah katalog master + Gift Stall (redeem POS).
adminRouter.use('/hadiah', hadiahRouter);
adminRouter.use('/gift-stall', giftStallRouter);
// Modul 31 — Elsa (Els Agentic) AI chat agent untuk data ECC.
// Fulltimer-only (guard di dalam router). Powered by Anthropic Claude.
adminRouter.use('/elsa', elsaRouter);
// Modul 32 — Planning Backlog (apps/planning @ planning.eccchurch.global).
// Internal dev tool untuk IT Minister Team. Hirarki Epic → Story → Task + Sprint.
// Gate: IT Minister Team membership (lib/rbac-planning.ts).
adminRouter.use('/planning', planningRouter);
adminRouter.use('/branch-change-request', branchChangeRouter);
adminRouter.use('/sinode-api-key', apiKeyRouter);
adminRouter.use('/audit-log', auditLogRouter);
