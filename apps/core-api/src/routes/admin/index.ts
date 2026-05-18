import { Router } from 'express';
import { requireAuth, requireFulltimer } from '../../middleware/require-auth.js';
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
import { auditLogRouter } from './audit-log.js';

export const adminRouter = Router();

// Semua /admin/* wajib JWT + role Fulltimer
adminRouter.use(requireAuth, requireFulltimer);

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
adminRouter.use('/audit-log', auditLogRouter);
