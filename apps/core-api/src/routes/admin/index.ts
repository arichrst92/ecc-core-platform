import { Router } from 'express';
import { requireAuth, requireFulltimer } from '../../middleware/require-auth.js';
import { sinodeRouter } from './sinode.js';
import { cabangRouter } from './cabang.js';
import { jemaatRouter } from './jemaat.js';
import { roleRouter } from './role.js';
import { ibadahRouter } from './ibadah.js';
import { keluargaRouter } from './keluarga.js';
import { pelayananRouter } from './pelayanan.js';
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
adminRouter.use('/audit-log', auditLogRouter);
