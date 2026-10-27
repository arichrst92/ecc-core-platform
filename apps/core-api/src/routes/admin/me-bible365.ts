/**
 * Bible 365 saya — mobile — /admin/me/bible365
 *
 *   GET    /                    → { plan: Plan & Summary | null, history[] }
 *   POST   /start               → { reminderTime? } mulai putaran baru (komitmen)
 *   POST   /stop                → hentikan plan aktif
 *   GET    /days/:day           → { day, date, chapters[{bookId,bab,read}], note }
 *   POST   /read                → { bookId, bab, read } centang / batal satu pasal
 *   POST   /days/:day/complete  → tandai semua pasal hari itu dibaca
 *   PUT    /notes/:day          → { isi, ayat? } simpan catatan (pribadi)
 *   DELETE /notes/:day
 *   GET    /notes?planId=&cursor= → jurnal (terbaru dulu, 30/halaman)
 *   PATCH  /reminder            → { reminderTime: "HH:MM" | null }
 */
import { Router, type Request } from 'express';
import { z } from 'zod';
import { prisma } from '@ecc/database';
import { BadRequest, Conflict, NotFound, Unauthorized } from '../../lib/errors.js';
import { DEFAULT_TZ, todayInTz } from '../../lib/tz.js';
import {
  TOTAL_CHAPTERS,
  TOTAL_DAYS,
  chaptersForDay,
  dayOfChapter,
  planSelect,
  planSummary,
} from '../../lib/bible365.js';

export const meBible365Router = Router();

const HHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Format jam HH:MM');
const startSchema = z.object({ reminderTime: HHMM.nullish() });
const readSchema = z.object({ bookId: z.number().int().min(1).max(66), bab: z.number().int().min(1).max(150), read: z.boolean() });
const noteSchema = z.object({ isi: z.string().trim().min(1, 'Catatan kosong').max(5000), ayat: z.string().trim().max(60).nullish() });
const reminderSchema = z.object({ reminderTime: HHMM.nullable() });

function me(req: Request) {
  if (!req.user) throw Unauthorized();
  return req.user;
}

function parseDay(v: unknown): number {
  const d = Number(v);
  if (!Number.isInteger(d) || d < 1 || d > TOTAL_DAYS) throw BadRequest('Hari tidak valid');
  return d;
}

async function activePlan(jemaatId: string) {
  return prisma.bible365Plan.findFirst({ where: { jemaatId, status: 'AKTIF' }, select: planSelect });
}

async function requireActive(jemaatId: string) {
  const p = await activePlan(jemaatId);
  if (!p) throw NotFound('Belum ada Bible 365 yang berjalan');
  return p;
}

/** Plan aktif + ringkasan; tandai SELESAI otomatis bila semua pasal terbaca. */
async function state(jemaatId: string) {
  const plan = await activePlan(jemaatId);
  const history = await prisma.bible365Plan.findMany({
    where: { jemaatId, status: { not: 'AKTIF' } },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: planSelect,
  });
  if (!plan) return { plan: null, history };
  const summary = await planSummary(plan.id, plan.startDate);
  return { plan: { ...plan, ...summary }, history };
}

async function maybeComplete(planId: string) {
  const n = await prisma.bible365Reading.count({ where: { planId } });
  if (n >= TOTAL_CHAPTERS) {
    await prisma.bible365Plan.updateMany({
      where: { id: planId, status: 'AKTIF' },
      data: { status: 'SELESAI', completedAt: new Date() },
    });
  }
}

meBible365Router.get('/', async (req, res) => {
  const u = me(req);
  res.json({ success: true, data: await state(u.jemaatId) });
});

meBible365Router.post('/start', async (req, res) => {
  const u = me(req);
  const input = startSchema.parse(req.body ?? {});
  if (await activePlan(u.jemaatId)) throw Conflict('Bible 365 Anda masih berjalan');
  const last = await prisma.bible365Plan.findFirst({
    where: { jemaatId: u.jemaatId },
    orderBy: { putaran: 'desc' },
    select: { putaran: true },
  });
  try {
    await prisma.bible365Plan.create({
      data: {
        jemaatId: u.jemaatId,
        putaran: (last?.putaran ?? 0) + 1,
        startDate: todayInTz(DEFAULT_TZ),
        reminderTime: input.reminderTime ?? null,
      },
    });
  } catch (e) {
    // Unique index parsial (satu AKTIF per jemaat) — permintaan ganda.
    if ((e as { code?: string }).code === 'P2002') throw Conflict('Bible 365 Anda masih berjalan');
    throw e;
  }
  res.status(201).json({ success: true, data: await state(u.jemaatId) });
});

meBible365Router.post('/stop', async (req, res) => {
  const u = me(req);
  const p = await requireActive(u.jemaatId);
  await prisma.bible365Plan.update({ where: { id: p.id }, data: { status: 'DIHENTIKAN', stoppedAt: new Date() } });
  res.json({ success: true, data: await state(u.jemaatId) });
});

meBible365Router.patch('/reminder', async (req, res) => {
  const u = me(req);
  const { reminderTime } = reminderSchema.parse(req.body ?? {});
  const p = await requireActive(u.jemaatId);
  await prisma.bible365Plan.update({ where: { id: p.id }, data: { reminderTime } });
  res.json({ success: true, data: { reminderTime } });
});

meBible365Router.get('/days/:day', async (req, res) => {
  const u = me(req);
  const day = parseDay(req.params.day);
  const p = await requireActive(u.jemaatId);
  const chapters = chaptersForDay(day);
  const [reads, note] = await Promise.all([
    prisma.bible365Reading.findMany({ where: { planId: p.id, day }, select: { bookId: true, bab: true } }),
    prisma.bible365Note.findUnique({
      where: { planId_day: { planId: p.id, day } },
      select: { isi: true, ayat: true, updatedAt: true },
    }),
  ]);
  const readSet = new Set(reads.map((r) => `${r.bookId}:${r.bab}`));
  const date = new Date(p.startDate.getTime() + (day - 1) * 86_400_000);
  res.json({
    success: true,
    data: {
      day,
      date: date.toISOString().slice(0, 10),
      chapters: chapters.map((c) => ({ ...c, read: readSet.has(`${c.bookId}:${c.bab}`) })),
      note,
    },
  });
});

meBible365Router.post('/read', async (req, res) => {
  const u = me(req);
  const input = readSchema.parse(req.body ?? {});
  const day = dayOfChapter(input.bookId, input.bab);
  if (!day) throw BadRequest('Pasal tidak valid');
  const p = await requireActive(u.jemaatId);
  if (input.read) {
    await prisma.bible365Reading.upsert({
      where: { planId_bookId_bab: { planId: p.id, bookId: input.bookId, bab: input.bab } },
      create: { planId: p.id, day, bookId: input.bookId, bab: input.bab },
      update: {},
    });
    await maybeComplete(p.id);
  } else {
    await prisma.bible365Reading.deleteMany({ where: { planId: p.id, bookId: input.bookId, bab: input.bab } });
  }
  res.json({ success: true, data: { day, ...(await planSummary(p.id, p.startDate)) } });
});

meBible365Router.post('/days/:day/complete', async (req, res) => {
  const u = me(req);
  const day = parseDay(req.params.day);
  const p = await requireActive(u.jemaatId);
  await prisma.bible365Reading.createMany({
    data: chaptersForDay(day).map((c) => ({ planId: p.id, day, bookId: c.bookId, bab: c.bab })),
    skipDuplicates: true,
  });
  await maybeComplete(p.id);
  res.json({ success: true, data: { day, ...(await planSummary(p.id, p.startDate)) } });
});

meBible365Router.put('/notes/:day', async (req, res) => {
  const u = me(req);
  const day = parseDay(req.params.day);
  const input = noteSchema.parse(req.body ?? {});
  const p = await requireActive(u.jemaatId);
  const note = await prisma.bible365Note.upsert({
    where: { planId_day: { planId: p.id, day } },
    create: { planId: p.id, day, isi: input.isi, ayat: input.ayat ?? null },
    update: { isi: input.isi, ayat: input.ayat ?? null },
    select: { day: true, isi: true, ayat: true, updatedAt: true },
  });
  res.json({ success: true, data: note });
});

meBible365Router.delete('/notes/:day', async (req, res) => {
  const u = me(req);
  const day = parseDay(req.params.day);
  const p = await requireActive(u.jemaatId);
  await prisma.bible365Note.deleteMany({ where: { planId: p.id, day } });
  res.json({ success: true });
});

/** Jurnal: catatan plan aktif (atau planId milik sendiri), terbaru dulu. */
meBible365Router.get('/notes', async (req, res) => {
  const u = me(req);
  const planId = typeof req.query.planId === 'string' ? req.query.planId : null;
  const plan = planId
    ? await prisma.bible365Plan.findFirst({ where: { id: planId, jemaatId: u.jemaatId }, select: { id: true, startDate: true } })
    : await prisma.bible365Plan.findFirst({
        where: { jemaatId: u.jemaatId },
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        select: { id: true, startDate: true },
      });
  if (!plan) return res.json({ success: true, data: { items: [], nextCursor: null } });
  const cursor = Number(req.query.cursor);
  const rows = await prisma.bible365Note.findMany({
    where: { planId: plan.id, ...(Number.isInteger(cursor) && cursor > 0 ? { day: { lt: cursor } } : {}) },
    orderBy: { day: 'desc' },
    take: 31,
    select: { day: true, isi: true, ayat: true, updatedAt: true },
  });
  const items = rows.slice(0, 30).map((n) => ({
    ...n,
    date: new Date(plan.startDate.getTime() + (n.day - 1) * 86_400_000).toISOString().slice(0, 10),
    chapters: chaptersForDay(n.day),
  }));
  res.json({ success: true, data: { items, nextCursor: rows.length > 30 ? items[items.length - 1]!.day : null } });
});
