/**
 * Sertifikat jemaat (admin portal).
 *
 *   GET    /admin/jemaat/:jemaatId/sertifikat
 *   POST   /admin/jemaat/:jemaatId/sertifikat            multipart: nama, tanggal (YYYY-MM-DD), file (gambar/PDF)
 *   PATCH  /admin/jemaat/:jemaatId/sertifikat/:id        multipart: nama?, tanggal?, file?
 *   DELETE /admin/jemaat/:jemaatId/sertifikat/:id
 *
 * Mobile (read-only): GET /admin/me/sertifikat (lihat me.ts).
 */
import { Router } from 'express';
import { prisma } from '@ecc/database';
import { z } from 'zod';
import { BadRequest, NotFound } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { flexDocumentUpload, isPdfFile } from '../../lib/document-upload.js';
import { deleteSertifikatFile, saveSertifikatFile } from '../../lib/storage.js';

export const jemaatSertifikatRouter = Router({ mergeParams: true });

const fields = {
  nama: z.string().trim().min(2, 'Nama sertifikat minimal 2 karakter').max(200),
  tanggal: z.string().date('Tanggal harus format YYYY-MM-DD'),
};
const createSchema = z.object(fields);
const updateSchema = z.object({ nama: fields.nama.optional(), tanggal: fields.tanggal.optional() });

/** :jemaatId dari path parent (mergeParams — tidak ter-typing otomatis). */
function jemaatIdOf(req: { params: unknown }): string {
  return (req.params as Record<string, string>).jemaatId ?? '';
}

export const sertifikatSelect = {
  id: true,
  nama: true,
  tanggal: true,
  fileUrl: true,
  fileMime: true,
  fileName: true,
  createdAt: true,
  updatedAt: true,
} as const;

async function storeFile(jemaatId: string, sertifikatId: string, file: Express.Multer.File) {
  const kind = isPdfFile(file.mimetype, file.originalname) ? 'pdf' : 'image';
  const saved = await saveSertifikatFile(jemaatId, sertifikatId, file.buffer, kind);
  return { fileUrl: saved.url, fileMime: saved.mime, fileName: file.originalname?.slice(0, 255) || null };
}

jemaatSertifikatRouter.get('/', async (req, res) => {
  const data = await prisma.jemaatSertifikat.findMany({
    where: { jemaatId: jemaatIdOf(req) },
    orderBy: [{ tanggal: 'desc' }, { createdAt: 'desc' }],
    select: sertifikatSelect,
  });
  res.json({ success: true, data });
});

jemaatSertifikatRouter.post('/', flexDocumentUpload(), async (req, res) => {
  const jemaatId = jemaatIdOf(req);
  const input = createSchema.parse(req.body);
  if (!req.file) throw BadRequest('File sertifikat (gambar atau PDF) wajib diupload.');
  const jemaat = await prisma.jemaat.findUnique({ where: { id: jemaatId }, select: { namaLengkap: true } });
  if (!jemaat) throw NotFound('Jemaat tidak ditemukan');

  const created = await prisma.jemaatSertifikat.create({
    data: { jemaatId, nama: input.nama, tanggal: new Date(input.tanggal) },
  });
  let row;
  try {
    row = await prisma.jemaatSertifikat.update({
      where: { id: created.id },
      data: await storeFile(jemaatId, created.id, req.file),
      select: sertifikatSelect,
    });
  } catch (err) {
    // File gagal diproses → jangan tinggalkan sertifikat tanpa file.
    await prisma.jemaatSertifikat.delete({ where: { id: created.id } }).catch(() => {});
    throw err;
  }
  audit(req, {
    action: 'CREATE',
    resource: 'jemaat_sertifikat',
    resourceId: row.id,
    resourceLabel: `${jemaat.namaLengkap}: ${row.nama}`,
    after: row,
  });
  res.status(201).json({ success: true, data: row });
});

jemaatSertifikatRouter.patch('/:id', flexDocumentUpload(), async (req, res) => {
  const jemaatId = jemaatIdOf(req);
  const before = await prisma.jemaatSertifikat.findUnique({ where: { id: req.params.id } });
  if (!before || before.jemaatId !== jemaatId) throw NotFound('Sertifikat tidak ditemukan');
  const input = updateSchema.parse(req.body);
  const row = await prisma.jemaatSertifikat.update({
    where: { id: before.id },
    data: {
      nama: input.nama,
      tanggal: input.tanggal ? new Date(input.tanggal) : undefined,
      ...(req.file ? await storeFile(jemaatId, before.id, req.file) : {}),
    },
    select: sertifikatSelect,
  });
  audit(req, {
    action: 'UPDATE',
    resource: 'jemaat_sertifikat',
    resourceId: row.id,
    resourceLabel: row.nama,
    before,
    after: row,
  });
  res.json({ success: true, data: row });
});

jemaatSertifikatRouter.delete('/:id', async (req, res) => {
  const jemaatId = jemaatIdOf(req);
  const before = await prisma.jemaatSertifikat.findUnique({ where: { id: req.params.id } });
  if (!before || before.jemaatId !== jemaatId) throw NotFound('Sertifikat tidak ditemukan');
  await prisma.jemaatSertifikat.delete({ where: { id: before.id } });
  await deleteSertifikatFile(jemaatId, before.id).catch(() => {});
  audit(req, {
    action: 'DELETE',
    resource: 'jemaat_sertifikat',
    resourceId: before.id,
    resourceLabel: before.nama,
    before,
  });
  res.status(204).end();
});
