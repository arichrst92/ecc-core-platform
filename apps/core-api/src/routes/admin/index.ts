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
import { jemaatPublicRouter } from './jemaat-public.js';
import { visitRouter } from './visit.js';
import { localBusinessRouter } from './local-business.js';
import { legalRouter } from './legal.js';
import { appVersionRouter } from './app-version.js';
import { maintenanceRouter } from './maintenance.js';

export const adminRouter = Router();

// Semua /admin/* wajib JWT. Sebelumnya juga requireFulltimer, tapi gate
// itu dicabut — semua role yang punya akun valid bisa akses portal.
adminRouter.use(requireAuth);

// /admin/me/* — self-service mobile endpoints (HARUS sebelum /jemaat untuk
// jaga-jaga kalau ada path collision).
adminRouter.use('/me', meRouter);

// Ministry (Pelayanan) — mobile-friendly read-only. Patch 2026-05-22.
adminRouter.use('/ministry', ministryRouter);

adminRouter.use('/sinode', sinodeRouter);
adminRouter.use('/cabang', cabangRouter);
// Public profile (mobile tap-to-view) — HARUS sebelum /jemaat agar tidak
// kepecet ke jemaatRouter (which is admin-CRUD). Patch 2026-05-22.
adminRouter.use('/jemaat-public', jemaatPublicRouter);
adminRouter.use('/jemaat', jemaatRouter);
adminRouter.use('/role', roleRouter);
adminRouter.use('/ibadah', ibadahRouter);
adminRouter.use('/keluarga', keluargaRouter);
adminRouter.use('/pelayanan', pelayananRouter);
adminRouter.use('/reservasi', reservasiRouter);
adminRouter.use('/news', createKontenRouter('NEWS'));
adminRouter.use('/renungan', createKontenRouter('RENUNGAN'));
adminRouter.use('/homecell-area', homecellAreaRouter);
adminRouter.use('/homecell', homecellRouter);
adminRouter.use('/event', eventRouter);
adminRouter.use('/visit', visitRouter);
adminRouter.use('/local-business', localBusinessRouter);
adminRouter.use('/legal', legalRouter);
adminRouter.use('/app-version', appVersionRouter);
adminRouter.use('/maintenance', maintenanceRouter);
adminRouter.use('/branch-change-request', branchChangeRouter);
adminRouter.use('/sinode-api-key', apiKeyRouter);
adminRouter.use('/audit-log', auditLogRouter);
