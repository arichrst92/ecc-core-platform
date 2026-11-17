/**
 * Catatan saya (2.4.5) — catatan khotbah / Alkitab PRIBADI — /admin/me/catatan
 *
 *   GET    /?q=&cursor=  → { items[], nextCursor } terbaru dulu (30/halaman)
 *   GET    /:id
 *   POST   /             → { judul, isi, ayat?[], pengkhotbah?, tanggal?, ibadahId? }
 *   PATCH  /:id
 *   DELETE /:id
 *   POST   /gambar       → multipart (foto/file/image) → { url } (2.4.9)
 *
 * Gambar disisipkan di isi sebagai baris markdown `![gambar](url)` — menyatu
 * dengan teks. Gambar yang tidak lagi dipakai (dihapus dari isi / catatan
 * dihapus) ikut dihapus dari server.
 *
 * Hanya pemilik yang bisa membaca/mengubah — tidak ada endpoint portal.
 */
import { Router, type Request } from 'express';
import { z } from 'zod';
import { prisma } from '@ecc/database';
import { BadRequest, NotFound, Unauthorized } from '../../lib/errors.js';
import { DEFAULT_TZ, todayInTz } from '../../lib/tz.js';
import { flexImageUpload } from '../../lib/image-upload.js';
import { countCatatanImages, deleteCatatanImage, saveCatatanImage } from '../../lib/storage.js';
import { logger } from '../../lib/logger.js';

export const meCatatanRouter = Router();

const YMD = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal YYYY-MM-DD');
const ayatList = z.array(z.string().trim().min(1).max(60)).max(20);
const baseSchema = z.object({
  judul: z.string().trim().min(1, 'Judul wajib diisi').max(200),
  isi: z.string().max(20000).default(''),
  ayat: ayatList.default([]),
  pengkhotbah: z.string().trim().max(120).nullish(),
  tanggal: YMD.nullish(),
  ibadahId: z.string().uuid().nullish(),
});
const patchSchema = baseSchema.partial();

const select = {
  id: true,
  judul: true,
  isi: true,
  ayat: true,
  pengkhotbah: true,
  tanggal: true,
  ibadahId: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** Maks. gambar per catatan & total per jemaat. */
const MAX_IMG_PER_NOTE = 30;
const MAX_IMG_PER_JEMAAT = 2000;
const IMG_LINE = /!\[[^\]]*\]\((\/uploads\/catatan\/[0-9a-f-]{36}\/[0-9a-f]{32}\.webp)\)/g;
const imagesIn = (isi: string | null | undefined) => new Set([...(isi ?? '').matchAll(IMG_LINE)].map((m) => m[1]!));

function assertImageCount(isi: string) {
  if (imagesIn(isi).size > MAX_IMG_PER_NOTE) throw BadRequest(`Maksimal ${MAX_IMG_PER_NOTE} gambar per catatan.`);
}

/** Hapus file gambar yang sudah tidak dipakai catatan mana pun milik jemaat ini. */
async function cleanupImages(jemaatId: string, urls: Iterable<string>) {
  const list = [...urls];
  if (!list.length) return;
  const still = await prisma.catatanSaya.findMany({
    where: { jemaatId, OR: list.map((u) => ({ isi: { contains: u } })) },
    select: { isi: true },
  });
  const used = new Set(still.flatMap((r) => [...imagesIn(r.isi)]));
  for (const u of list) {
    if (used.has(u)) continue;
    await deleteCatatanImage(jemaatId, u).catch((err) => logger.warn({ err, u }, '[catatan] gagal hapus gambar'));
  }
}

function me(req: Request) {
  if (!req.user) throw Unauthorized();
  return req.user;
}

function toDate(ymd: string): Date {
  const d = new Date(`${ymd}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) throw BadRequest('Tanggal tidak valid');
  return d;
}

type Row = { tanggal: Date } & Record<string, unknown>;
const out = <T extends Row>(r: T) => ({ ...r, tanggal: r.tanggal.toISOString().slice(0, 10) });

async function own(jemaatId: string, id: string) {
  if (!z.string().uuid().safeParse(id).success) throw NotFound('Catatan tidak ditemukan');
  const n = await prisma.catatanSaya.findFirst({ where: { id, jemaatId }, select: { id: true } });
  if (!n) throw NotFound('Catatan tidak ditemukan');
  return n;
}

meCatatanRouter.get('/', async (req, res) => {
  const u = me(req);
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
  const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : null;
  const rows = await prisma.catatanSaya.findMany({
    where: {
      jemaatId: u.jemaatId,
      ...(q
        ? {
            OR: [
              { judul: { contains: q, mode: 'insensitive' } },
              { isi: { contains: q, mode: 'insensitive' } },
              { pengkhotbah: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: [{ tanggal: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
    ...(cursor && z.string().uuid().safeParse(cursor).success ? { cursor: { id: cursor }, skip: 1 } : {}),
    take: 31,
    select,
  });
  const items = rows.slice(0, 30).map(out);
  res.json({ success: true, data: { items, nextCursor: rows.length > 30 ? items[items.length - 1]!.id : null } });
});

meCatatanRouter.get('/:id', async (req, res) => {
  const u = me(req);
  await own(u.jemaatId, req.params.id!);
  const n = await prisma.catatanSaya.findUniqueOrThrow({ where: { id: req.params.id! }, select });
  res.json({ success: true, data: out(n) });
});

meCatatanRouter.post('/', async (req, res) => {
  const u = me(req);
  const input = baseSchema.parse(req.body ?? {});
  assertImageCount(input.isi);
  const count = await prisma.catatanSaya.count({ where: { jemaatId: u.jemaatId } });
  if (count >= 5000) throw BadRequest('Batas jumlah catatan tercapai');
  const n = await prisma.catatanSaya.create({
    data: {
      jemaatId: u.jemaatId,
      judul: input.judul,
      isi: input.isi,
      ayat: input.ayat,
      pengkhotbah: input.pengkhotbah || null,
      tanggal: input.tanggal ? toDate(input.tanggal) : todayInTz(DEFAULT_TZ),
      ibadahId: input.ibadahId ?? null,
    },
    select,
  });
  res.status(201).json({ success: true, data: out(n) });
});

meCatatanRouter.patch('/:id', async (req, res) => {
  const u = me(req);
  await own(u.jemaatId, req.params.id!);
  const input = patchSchema.parse(req.body ?? {});
  if (input.isi !== undefined) assertImageCount(input.isi);
  const before = input.isi !== undefined ? await prisma.catatanSaya.findUnique({ where: { id: req.params.id! }, select: { isi: true } }) : null;
  const n = await prisma.catatanSaya.update({
    where: { id: req.params.id! },
    data: {
      ...(input.judul !== undefined ? { judul: input.judul } : {}),
      ...(input.isi !== undefined ? { isi: input.isi } : {}),
      ...(input.ayat !== undefined ? { ayat: input.ayat } : {}),
      ...(input.pengkhotbah !== undefined ? { pengkhotbah: input.pengkhotbah || null } : {}),
      ...(input.tanggal ? { tanggal: toDate(input.tanggal) } : {}),
      ...(input.ibadahId !== undefined ? { ibadahId: input.ibadahId ?? null } : {}),
    },
    select,
  });
  if (before) {
    const now = imagesIn(n.isi);
    await cleanupImages(u.jemaatId, [...imagesIn(before.isi)].filter((x) => !now.has(x)));
  }
  res.json({ success: true, data: out(n) });
});

meCatatanRouter.delete('/:id', async (req, res) => {
  const u = me(req);
  await own(u.jemaatId, req.params.id!);
  const gone = await prisma.catatanSaya.delete({ where: { id: req.params.id! }, select: { isi: true } });
  await cleanupImages(u.jemaatId, imagesIn(gone.isi));
  res.json({ success: true });
});

/** Unggah gambar untuk disisipkan ke catatan (baru atau lama). */
meCatatanRouter.post('/gambar', flexImageUpload({ maxBytes: 12 * 1024 * 1024 }), async (req, res) => {
  const u = me(req);
  if (!req.file) throw BadRequest('File gambar wajib.');
  if ((await countCatatanImages(u.jemaatId)) >= MAX_IMG_PER_JEMAAT) {
    throw BadRequest('Batas penyimpanan gambar catatan tercapai. Hapus beberapa gambar lama dulu.');
  }
  const url = await saveCatatanImage(u.jemaatId, req.file.buffer);
  res.status(201).json({ success: true, data: { url } });
});
