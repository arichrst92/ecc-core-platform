/**
 * Resolusi Tahunan saya — mobile — /admin/me/resolusi
 *
 *   GET    /?tahun=2027   → { tahun, years, items, progress }
 *   POST   /              → { tahun, judul, kategori, catatan?, isDone? }
 *   PATCH  /:id           → { judul?, kategori?, catatan?, isDone? }
 *   DELETE /:id
 *   POST   /reorder       → { ids } (urutan dalam satu tahun)
 */
import { Router, type Request } from 'express';
import { prisma } from '@ecc/database';
import {
  createResolusiSchema,
  reorderResolusiSchema,
  resolusiTahunSchema,
  updateResolusiSchema,
} from '@ecc/shared-types';
import { NotFound, Unauthorized } from '../../lib/errors.js';
import { UUID_RE } from '../../lib/prayer.js';
import { loadResolusi, resolusiSelect } from '../../lib/resolusi.js';

export const meResolusiRouter = Router();

function me(req: Request) {
  if (!req.user) throw Unauthorized();
  return req.user;
}

async function loadOwn(req: Request) {
  const u = me(req);
  const id = String(req.params.id ?? '');
  if (!UUID_RE.test(id)) throw NotFound('Resolusi tidak ditemukan');
  const row = await prisma.resolusi.findFirst({ where: { id, jemaatId: u.jemaatId } });
  if (!row) throw NotFound('Resolusi tidak ditemukan');
  return { u, row };
}

meResolusiRouter.get('/', async (req, res) => {
  const u = me(req);
  const parsed = resolusiTahunSchema.safeParse(req.query.tahun);
  const tahun = parsed.success ? parsed.data : new Date().getFullYear();
  res.json({ success: true, data: await loadResolusi(u.jemaatId, tahun) });
});

meResolusiRouter.post('/', async (req, res) => {
  const u = me(req);
  const input = createResolusiSchema.parse(req.body ?? {});
  const last = await prisma.resolusi.findFirst({
    where: { jemaatId: u.jemaatId, tahun: input.tahun },
    orderBy: { urutan: 'desc' },
    select: { urutan: true },
  });
  const created = await prisma.resolusi.create({
    data: {
      jemaatId: u.jemaatId,
      tahun: input.tahun,
      judul: input.judul,
      catatan: input.catatan,
      kategori: input.kategori,
      isDone: input.isDone ?? false,
      doneAt: input.isDone ? new Date() : null,
      urutan: (last?.urutan ?? -1) + 1,
    },
    select: resolusiSelect,
  });
  res.status(201).json({ success: true, data: created });
});

meResolusiRouter.post('/reorder', async (req, res) => {
  const u = me(req);
  const { ids } = reorderResolusiSchema.parse(req.body ?? {});
  const owned = await prisma.resolusi.findMany({
    where: { id: { in: ids }, jemaatId: u.jemaatId },
    select: { id: true },
  });
  const ok = new Set(owned.map((o) => o.id));
  await prisma.$transaction(
    ids.filter((id) => ok.has(id)).map((id, i) => prisma.resolusi.update({ where: { id }, data: { urutan: i } })),
  );
  res.json({ success: true });
});

meResolusiRouter.patch('/:id', async (req, res) => {
  const { row } = await loadOwn(req);
  const input = updateResolusiSchema.parse(req.body ?? {});
  const doneChanged = input.isDone !== undefined && input.isDone !== row.isDone;
  const updated = await prisma.resolusi.update({
    where: { id: row.id },
    data: {
      judul: input.judul,
      kategori: input.kategori,
      // catatan: undefined di body → tidak diubah; null/'' → dikosongkan.
      catatan: 'catatan' in (req.body ?? {}) ? input.catatan : undefined,
      isDone: input.isDone,
      doneAt: doneChanged ? (input.isDone ? new Date() : null) : undefined,
    },
    select: resolusiSelect,
  });
  res.json({ success: true, data: updated });
});

meResolusiRouter.delete('/:id', async (req, res) => {
  const { row } = await loadOwn(req);
  await prisma.resolusi.delete({ where: { id: row.id } });
  res.json({ success: true });
});
