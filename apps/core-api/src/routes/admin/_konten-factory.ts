/**
 * Factory untuk routes konten (news & renungan share semua logic CRUD).
 *
 * Tipe ditentukan saat factory create (mis. createKontenRouter('NEWS')).
 * Endpoint auto-filter & auto-set tipe.
 */
import { Router } from 'express';
import multer from 'multer';
import { prisma, type Prisma } from '@ecc/database';
import {
  createKontenSchema,
  updateKontenSchema,
  paginationQuerySchema,
} from '@ecc/shared-types';
import { BadRequest, NotFound } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { saveContentHero, deleteContentHero, type ContentKind } from '../../lib/storage.js';

const UPLOAD_OPTIONS = {
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 }, // 5 MB
  fileFilter: (_req: unknown, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    const ok = ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype);
    if (!ok) return cb(new Error(`Tipe file tidak didukung: ${file.mimetype}`));
    cb(null, true);
  },
};

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 250);
}

async function ensureUniqueSlug(base: string, excludeId?: string): Promise<string> {
  let slug = base;
  let n = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const existing = await prisma.konten.findUnique({ where: { slug } });
    if (!existing || existing.id === excludeId) return slug;
    n += 1;
    slug = `${base}-${n}`;
    if (n > 100) throw BadRequest('Tidak bisa generate slug unique');
  }
}

export function createKontenRouter(tipe: 'NEWS' | 'RENUNGAN'): Router {
  const router = Router();
  const kind: ContentKind = tipe === 'NEWS' ? 'news' : 'renungan';
  const upload = multer(UPLOAD_OPTIONS);

  // ===== List =====
  router.get('/', async (req, res) => {
    const q = paginationQuerySchema.parse(req.query);
    const sinodeId = typeof req.query.sinodeId === 'string' ? req.query.sinodeId : undefined;
    const cabangId = typeof req.query.cabangId === 'string' ? req.query.cabangId : undefined;
    const isPublished = req.query.isPublished === 'true' ? true : req.query.isPublished === 'false' ? false : undefined;

    const where: Prisma.KontenWhereInput = { tipe };
    if (sinodeId) where.sinodeId = sinodeId;
    if (cabangId) where.cabangId = cabangId;
    if (typeof isPublished === 'boolean') where.isPublished = isPublished;
    if (q.search) {
      where.OR = [
        { judul: { contains: q.search, mode: 'insensitive' } },
        { ringkasan: { contains: q.search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      prisma.konten.findMany({
        where,
        skip: (q.page - 1) * q.limit,
        take: q.limit,
        orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
        include: {
          author: { select: { id: true, jemaat: { select: { namaLengkap: true, fotoUrl: true } } } },
          sinode: { select: { id: true, nama: true } },
          cabang: { select: { id: true, nama: true } },
        },
      }),
      prisma.konten.count({ where }),
    ]);

    res.json({
      success: true,
      data,
      meta: { page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit) },
    });
  });

  // ===== Detail by id atau slug =====
  router.get('/:idOrSlug', async (req, res) => {
    const key = req.params.idOrSlug;
    const item = await prisma.konten.findFirst({
      where: {
        tipe,
        OR: [{ id: key }, { slug: key }],
      },
      include: {
        author: { select: { id: true, jemaat: { select: { namaLengkap: true, fotoUrl: true } } } },
        sinode: { select: { id: true, nama: true } },
        cabang: { select: { id: true, nama: true } },
      },
    });
    if (!item) throw NotFound(`${tipe} tidak ditemukan`);
    res.json({ success: true, data: item });
  });

  // ===== Create =====
  router.post('/', async (req, res) => {
    if (!req.user) throw BadRequest('User tidak terautentikasi');
    const input = createKontenSchema.parse(req.body);

    // Generate slug kalau kosong
    const baseSlug = input.slug ?? slugify(input.judul);
    const slug = await ensureUniqueSlug(baseSlug);

    // Auto-derive sinodeId dari cabangId kalau cabangId set tapi sinodeId tidak
    let sinodeId = input.sinodeId;
    if (input.cabangId && !sinodeId) {
      const cabang = await prisma.cabangGereja.findUnique({
        where: { id: input.cabangId },
        select: { sinodeId: true },
      });
      sinodeId = cabang?.sinodeId;
    }

    const created = await prisma.konten.create({
      data: {
        tipe,
        judul: input.judul,
        slug,
        ringkasan: input.ringkasan,
        konten: input.konten,
        sinodeId,
        cabangId: input.cabangId,
        tanggal: input.tanggal ? new Date(input.tanggal) : undefined,
        ayatAlkitab: input.ayatAlkitab,
        tags: input.tags ?? [],
        isPublished: input.isPublished ?? false,
        publishedAt: input.isPublished ? new Date() : null,
        authorId: req.user.sub,
      },
    });
    audit(req, {
      action: 'CREATE',
      resource: `konten.${tipe.toLowerCase()}`,
      resourceId: created.id,
      resourceLabel: created.judul,
      after: created,
    });
    res.status(201).json({ success: true, data: created });
  });

  // ===== Update =====
  router.patch('/:id', async (req, res) => {
    const input = updateKontenSchema.parse(req.body);
    const before = await prisma.konten.findFirst({ where: { id: req.params.id, tipe } });
    if (!before) throw NotFound(`${tipe} tidak ditemukan`);

    let slug = before.slug;
    if (input.slug && input.slug !== before.slug) {
      slug = await ensureUniqueSlug(input.slug, before.id);
    } else if (input.judul && input.judul !== before.judul && !input.slug) {
      // judul berubah & slug tidak di-override → keep slug lama (URL tidak break)
    }

    // Auto-derive sinodeId kalau cabangId di-set
    let sinodeId = input.sinodeId;
    if (input.cabangId && !sinodeId) {
      const cabang = await prisma.cabangGereja.findUnique({
        where: { id: input.cabangId },
        select: { sinodeId: true },
      });
      sinodeId = cabang?.sinodeId;
    }

    const data: Prisma.KontenUpdateInput = {
      ...input,
      slug,
      sinodeId,
      tanggal: input.tanggal ? new Date(input.tanggal) : undefined,
    };
    // Auto-set publishedAt kalau berubah jadi published
    if (input.isPublished === true && !before.isPublished) {
      data.publishedAt = new Date();
    }
    if (input.isPublished === false && before.isPublished) {
      data.publishedAt = null;
    }

    const updated = await prisma.konten.update({ where: { id: req.params.id }, data });
    audit(req, {
      action: 'UPDATE',
      resource: `konten.${tipe.toLowerCase()}`,
      resourceId: updated.id,
      resourceLabel: updated.judul,
      before,
      after: updated,
    });
    res.json({ success: true, data: updated });
  });

  // ===== Delete =====
  router.delete('/:id', async (req, res) => {
    const before = await prisma.konten.findFirst({ where: { id: req.params.id, tipe } });
    if (!before) throw NotFound(`${tipe} tidak ditemukan`);
    await prisma.konten.delete({ where: { id: req.params.id } });
    await deleteContentHero(kind, req.params.id); // cleanup file
    audit(req, {
      action: 'DELETE',
      resource: `konten.${tipe.toLowerCase()}`,
      resourceId: before.id,
      resourceLabel: before.judul,
      before,
    });
    res.status(204).end();
  });

  // ===== Upload hero image =====
  router.post('/:id/hero', upload.single('foto'), async (req, res) => {
    if (!req.file) throw BadRequest('File foto wajib (field name: foto)');
    const item = await prisma.konten.findFirst({ where: { id: req.params.id, tipe } });
    if (!item) throw NotFound(`${tipe} tidak ditemukan`);

    const heroImageUrl = await saveContentHero(kind, item.id, req.file.buffer);
    const updated = await prisma.konten.update({
      where: { id: item.id },
      data: { heroImageUrl },
      select: { id: true, heroImageUrl: true },
    });
    audit(req, {
      action: 'UPLOAD_PHOTO',
      resource: `konten.${tipe.toLowerCase()}`,
      resourceId: item.id,
      resourceLabel: item.judul,
      metadata: { kind: 'hero-image', size: req.file.size },
    });
    res.json({ success: true, data: updated });
  });

  router.delete('/:id/hero', async (req, res) => {
    const item = await prisma.konten.findFirst({ where: { id: req.params.id, tipe } });
    if (!item) throw NotFound(`${tipe} tidak ditemukan`);
    await deleteContentHero(kind, item.id);
    await prisma.konten.update({
      where: { id: item.id },
      data: { heroImageUrl: null },
    });
    audit(req, {
      action: 'UPLOAD_PHOTO',
      resource: `konten.${tipe.toLowerCase()}`,
      resourceId: item.id,
      resourceLabel: item.judul,
      metadata: { kind: 'hero-image-delete' },
    });
    res.status(204).end();
  });

  return router;
}
