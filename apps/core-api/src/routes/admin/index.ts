import { Router } from 'express';
import { requireAuth } from '../../middleware/require-auth.js';
import { sinodeRouter } from './sinode.js';
import { cabangRouter } from './cabang.js';
import { jemaatRouter } from './jemaat.js';
import { pendingCountsRouter } from './pending-counts.js';
import { needsFillCountsRouter } from './needs-fill-counts.js';
import { jemaatDuplicateRouter } from './jemaat-duplicate.js';
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
import { mapViewRouter } from './map-view.js';
import { onboardingConfigRouter } from './onboarding-config.js';
import { auditLogRouter } from './audit-log.js';
import { meRouter } from './me.js';
import { branchChangeRouter } from './branch-change.js';
import { ministryRouter } from './ministry.js';
import { itMinisterTeamRouter } from './it-minister-team.js';
import { waConfigRouter } from './wa-config.js';
import { announcementRouter } from './announcement.js';
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
import { spiritualJourneyRequestRouter } from './spiritual-journey-request.js';
import { tamuRouter } from './tamu.js';
import { homecellMaterialRouter } from './homecell-material.js';
import { shiftsoftSyncRouter } from './shiftsoft-sync.js';
import { hadiahRouter } from './hadiah.js';
import { giftStallRouter } from './gift-stall.js';
import { ckidsAccessRouter } from './ckids-access.js';
import { dataAnakRouter } from './data-anak.js';
import { elsaRouter } from './elsa.js';
import { planningRouter } from './planning.js';
import { jemaatConsolidationRouter } from './jemaat-consolidation.js';
import { jemaatSertifikatRouter } from './jemaat-sertifikat.js';
import { apiTokenRouter } from './api-token.js';
import { devDocsRouter } from './dev-docs.js';
import { Forbidden } from '../../lib/errors.js';
import { fullGuard, hasMenuAccessFor, isReadMethod, menuGuard, writeGuard } from '../../middleware/require-menu.js';
import { isItTeamMember } from '../../lib/rbac-planning.js';
import { Unauthorized } from '../../lib/errors.js';
import type { RequestHandler } from 'express';

export const adminRouter = Router();

/**
 * Team IT Minister: ubah = Role Access menu Team IT Minister. Lihat daftar =
 * menu Team IT Minister / Ticketing Tools, atau anggota tim (dipakai Ticketing
 * Tools untuk memilih assignee). GET /me (cek keanggotaan sendiri) terbuka.
 */
const itMinisterTeamGuard: RequestHandler = (req, _res, next) => {
  if (!req.user) return next(Unauthorized());
  if (!isReadMethod(req.method)) return menuGuard(() => ({ menus: ['it-minister-team'] }))(req, _res, next);
  if (req.path === '/me') return next();
  Promise.all([
    hasMenuAccessFor(req.user, 'it-minister-team'),
    hasMenuAccessFor(req.user, 'planning-backlog'),
    isItTeamMember(req.user.jemaatId),
  ])
    .then((r) => (r.some(Boolean) ? next() : next(Forbidden('Anda tidak punya akses ke menu ini (it-minister-team).'))))
    .catch(next);
};

// Semua /admin/* wajib JWT. Sebelumnya juga requireFulltimer, tapi gate
// itu dicabut — semua role yang punya akun valid bisa akses portal.
adminRouter.use(requireAuth);

// Token API pribadi (otomasi / agentic AI) tidak boleh mengubah akun pemiliknya
// sendiri (/admin/me: hapus akun, ganti nomor, dsb) — cukup baca.
adminRouter.use('/me', (req, _res, next) => {
  if (req.pat && req.method !== 'GET') return next(Forbidden('Token API tidak boleh mengubah akun pribadi — gunakan Portal / app.'));
  next();
});

// Developer Tools: token API pribadi (Team IT Minister) & unduhan dokumentasi.
adminRouter.use('/api-token', apiTokenRouter);
adminRouter.use('/dev-docs', devDocsRouter);

// /admin/me/* — self-service mobile endpoints (HARUS sebelum /jemaat untuk
// jaga-jaga kalau ada path collision).
adminRouter.use('/me', meRouter);

// Ministry (Pelayanan) — mobile-friendly read-only. Patch 2026-05-22.
adminRouter.use('/ministry', ministryRouter);
adminRouter.use('/it-minister-team', itMinisterTeamGuard, itMinisterTeamRouter);
adminRouter.use('/wa-config', fullGuard('wa-config'), waConfigRouter);
// Broadcast → Announcement (menu 'announcement').
adminRouter.use('/announcement', announcementRouter);
// Badge menu Portal — jumlah request menunggu tindakan admin.
adminRouter.use('/pending-counts', pendingCountsRouter);
adminRouter.use('/needs-fill-counts', needsFillCountsRouter);

adminRouter.use('/sinode', writeGuard('sinode'), sinodeRouter);
adminRouter.use('/cabang', writeGuard('cabang'), cabangRouter);
// Public profile (mobile tap-to-view) — HARUS sebelum /jemaat agar tidak
// kepecet ke jemaatRouter (which is admin-CRUD). Patch 2026-05-22.
adminRouter.use('/jemaat-public', jemaatPublicRouter);
// Konsolidasi data jemaat dari spreadsheet (preview + apply, human check). Fulltimer only.
adminRouter.use('/jemaat-consolidation', jemaatConsolidationRouter);
// Kandidat akun ganda (pendaftar baru mirip data lama) — sebelum jemaatRouter.
adminRouter.use('/jemaat-duplicate', jemaatDuplicateRouter);
// Sertifikat jemaat (gambar/PDF) — sebelum jemaatRouter.
adminRouter.use('/jemaat/:jemaatId/sertifikat', fullGuard('jemaat', 'spiritual-journey'), jemaatSertifikatRouter);
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
adminRouter.use('/spiritual-journey-request', spiritualJourneyRequestRouter);
adminRouter.use('/spiritual-journey', spiritualJourneyRouter);
adminRouter.use('/tamu', tamuRouter);
adminRouter.use('/role', menuGuard((req) => {
    // Pengaturan akses (Role Access) = menu role-access; penugasan role ke jemaat
    // dari detail jemaat; daftar role (GET /) terbuka untuk filter halaman Portal.
    if (req.path.includes('/access')) return { menus: ['role-access'] };
    if (req.path.startsWith('/assign')) return { menus: ['jemaat', 'role-jemaat'] };
    return isReadMethod(req.method) ? null : { menus: ['role-jemaat'] };
  }), roleRouter);
adminRouter.use('/ibadah', menuGuard((req) => {
    // Scan check-in punya pengecekan sendiri (petugas scan / admin Kehadiran).
    if (/^\/[^/]+\/checkin(\/stats)?$/.test(req.path)) return null;
    if (req.path.startsWith('/kategori')) return isReadMethod(req.method) ? null : { menus: ['kategori-ibadah'] };
    if (isReadMethod(req.method)) return null; // jadwal & detail dipakai app jemaat
    return { menus: ['ibadah'] };
  }), ibadahRouter);
adminRouter.use('/keluarga', menuGuard((req) => {
    if (req.path.startsWith('/tipe')) return isReadMethod(req.method) ? null : { menus: ['tipe-relasi'] };
    return { menus: ['jemaat'] }; // relasi keluarga dikelola admin di detail jemaat
  }), keluargaRouter);
adminRouter.use('/pelayanan', pelayananRouter);
adminRouter.use('/reservasi', reservasiRouter);
adminRouter.use('/news', writeGuard('news'), createKontenRouter('NEWS'));
adminRouter.use('/renungan', writeGuard('renungan'), createKontenRouter('RENUNGAN'));
adminRouter.use('/homecell-area', homecellAreaRouter);
// Community → Homecell Material (materi pertemuan untuk pemimpin homecell).
adminRouter.use('/homecell-material', homecellMaterialRouter);
adminRouter.use('/homecell', homecellRouter);
// Group (module 23 — generic grouping, terpisah dari Homecell).
// Support hierarchy N-level + public/private + invitation join code.
adminRouter.use('/group', groupRouter);
adminRouter.use('/event', eventRouter);
adminRouter.use('/visit', fullGuard('visit'), visitRouter);
adminRouter.use('/local-business', localBusinessRouter);
adminRouter.use('/legal', writeGuard('legal'), legalRouter);
adminRouter.use('/compliance', complianceRouter);
adminRouter.use('/reviews', reviewsRouter);
adminRouter.use('/app-version', writeGuard('app-version'), appVersionRouter);
adminRouter.use('/maintenance', fullGuard('maintenance'), maintenanceRouter);
adminRouter.use('/server-health', fullGuard('server-health'), serverHealthRouter);
adminRouter.use('/maintenance-mode', writeGuard('maintenance-mode'), maintenanceModeRouter);
// Credential: Role Access menu + master password (lapis ganda, di router).
adminRouter.use('/credential', fullGuard('credential'), credentialRouter);
adminRouter.use('/diagnostics', diagnosticsAdminRouter);
adminRouter.use('/website-content', fullGuard('website-content'), websiteContentRouter);
// Shiftsoft Sync (Developer Tools) — trigger + monitor migration script async.
// Fulltimer-only (guard di dalam router).
adminRouter.use('/shiftsoft-sync', fullGuard('shiftsoft-sync'), shiftsoftSyncRouter);
// CKids (Modul 28) — Hadiah katalog master + Gift Stall (redeem POS).
adminRouter.use('/hadiah', hadiahRouter);
adminRouter.use('/gift-stall', giftStallRouter);
adminRouter.use('/ckids-access', ckidsAccessRouter);
adminRouter.use('/data-anak', dataAnakRouter);
// Modul 31 — Elsa (Els Agentic) AI chat agent untuk data ECC.
// Fulltimer-only (guard di dalam router). Powered by Anthropic Claude.
adminRouter.use('/elsa', elsaRouter);
// Modul 32 — Planning Backlog (apps/planning @ planning.eccchurch.global).
// Internal dev tool untuk IT Minister Team. Hirarki Epic → Story → Task + Sprint.
// Gate: IT Minister Team membership (lib/rbac-planning.ts).
adminRouter.use('/planning', planningRouter);
adminRouter.use('/branch-change-request', fullGuard('jemaat'), branchChangeRouter);
adminRouter.use('/sinode-api-key', fullGuard('api-key'), apiKeyRouter);
adminRouter.use('/audit-log', fullGuard('audit-log'), auditLogRouter);
// Map View — pin cabang & homecell di peta (menu map-view)
adminRouter.use('/map-view', mapViewRouter);
// Onboarding Config — role otomatis saat daftar/onboarding di app
adminRouter.use('/onboarding-config', onboardingConfigRouter);
