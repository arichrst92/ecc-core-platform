import { Router } from 'express';
import { prisma } from '@ecc/database';
import { requireApiKey } from '../../middleware/require-api-key.js';

/**
 * Public/consumer endpoints — dipakai aplikasi lain di ekosistem ECC
 * (mobile app, attendance system, dst). Auth via API key, di-scope per sinode.
 *
 * Default: read-only. Belum expose write operations sampai use case spesifik
 * memang membutuhkannya.
 */
export const publicRouter = Router();

publicRouter.use(requireApiKey);

publicRouter.get('/cabang', async (req, res) => {
  const data = await prisma.cabangGereja.findMany({
    where: { sinodeId: req.apiKey!.sinodeId, isActive: true },
    select: { id: true, nama: true, kode: true, alamat: true, kontak: true },
  });
  res.json({ success: true, data });
});

publicRouter.get('/ibadah', async (req, res) => {
  const data = await prisma.ibadah.findMany({
    where: { cabang: { sinodeId: req.apiKey!.sinodeId }, isActive: true },
    include: {
      cabang: { select: { id: true, nama: true } },
      kategoriIbadah: { select: { id: true, nama: true } },
    },
  });
  res.json({ success: true, data });
});

publicRouter.get('/jemaat/:id', async (req, res) => {
  const data = await prisma.jemaat.findFirst({
    where: { id: req.params.id, cabang: { sinodeId: req.apiKey!.sinodeId } },
    select: {
      id: true,
      namaLengkap: true,
      email: true,
      noHp: true,
      fotoUrl: true,
      cabang: { select: { id: true, nama: true } },
    },
  });
  if (!data) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND' } });
    return;
  }
  res.json({ success: true, data });
});
