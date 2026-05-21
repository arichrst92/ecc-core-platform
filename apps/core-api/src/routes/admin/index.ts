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

export const adminRouter = Router();

// Semua /admin/* wajib JWT. Sebelumnya juga requireFulltimer, tapi gate
// itu dicabut — semua role yang punya akun valid bisa akses portal.
adminRouter.use(requireAuth);

// /admin/me/* — self-service mobile endpoints (HARUS sebelum /jemaat untuk
// jaga-jaga kalau ada path collision).
adminRouter.use('/me', meRouter);

adminRouter.use('/sinode', sinodeRouter);
adminRouter.use('/cabang', cabangRouter);
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
adminRouter.use('/branch-change-request', branchChangeRouter);
adminRouter.use('/sinode-api-key', apiKeyRouter);
adminRouter.use('/audit-log', auditLogRouter);
