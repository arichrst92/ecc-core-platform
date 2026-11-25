/**
 * Universal Form — Portal (Broadcast → Universal Form), 2026-12.
 *
 *   GET    /                                  daftar form (+ jumlah respons & sematan)
 *   GET    /options                           pilihan form untuk editor News/Event/Announcement
 *   POST   /                                  buat form (+ field)
 *   GET    /embeds/:sourceType/:sourceId      form yang disematkan di sebuah konten
 *   PUT    /embeds/:sourceType/:sourceId      atur sematan konten { forms: [{formId, batasAt, autoCancel}] }
 *   GET    /files/:fileId                     unduh lampiran / tanda tangan (privat)
 *   GET    /:id                               detail form (field + sematan)
 *   PUT    /:id                               simpan form + field (field berjawaban tidak dihapus → disembunyikan)
 *   POST   /:id/duplicate                     salin form (tanpa respons & sematan)
 *   DELETE /:id                               hapus form tanpa respons (yang berespons → arsipkan)
 *   GET    /:id/responses                     hasil + ringkasan per channel + peserta event belum isi
 *   GET    /:id/responses/:rid                detail respons
 *   POST   /:id/responses/:rid/review         minta perbaiki / tolak / batalkan pendaftaran / pulihkan
 *   GET    /:id/export?format=csv|pdf         ekspor hasil
 *
 * Hak akses: Role Access menu `universal-form`. Sematan juga boleh diatur oleh
 * yang punya akses tulis News / Event / Announcement.
 */
import { Router, type Request } from 'express';
import fs from 'node:fs';
import { prisma, Prisma } from '@ecc/database';
import {
  UF_AUTOFILL_LABEL,
  UF_FIX_DEFAULT_HOURS,
  UF_RESPONSE_STATUS_LABEL,
  UF_SOURCE_LABEL,
  UF_SOURCE_TYPES,
  ufEmbedListSchema,
  ufFormInputSchema,
  ufReviewSchema,
  type UfAutofill,
  type UfFieldInput,
} from '@ecc/shared-types';
import { requireMenu, hasMenuAccessFor } from '../../middleware/require-menu.js';
import { BadRequest, Forbidden, NotFound, Unauthorized } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { createNotification } from '../../lib/notification.js';
import { paymentStatusOf, requiresPayment } from '../../lib/event-payment.js';
import { esc, sendCsv, sendPrintHtml } from '../../lib/print-report.js';
import {
  answerText,
  deleteUfFile,
  sourceTitles,
  ufDeadline,
  ufFilePath,
} from '../../lib/universal-form.js';
import { cancelParticipation } from '../../lib/universal-form-jobs.js';

export const universalFormRouter = Router();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const R = requireMenu('universal-form', 'read');
const W = requireMenu('universal-form', 'write');
const D = requireMenu('universal-form', 'delete');
const SOURCE_MENU: Record<string, string> = { NEWS: 'news', EVENT: 'event', ANNOUNCEMENT: 'announcement' };

function uid(req: Request) {
  if (!req.user) throw Unauthorized();
  return req.user;
}
function pid(v: string | undefined) {
  if (!v || !UUID.test(v)) throw NotFound('Form tidak ditemukan');
  return v;
}

async function canAny(req: Request, keys: string[], level: 'read' | 'write') {
  for (const k of keys) if (await hasMenuAccessFor(req.user, k, level)) return true;
  return false;
}

/** Data field untuk prisma (tanpa id). */
function fieldData(f: UfFieldInput, urutan: number) {
  return {
    urutan,
    tipe: f.tipe,
    label: f.label || (f.tipe === 'INFO' ? '' : 'Pertanyaan'),
    petunjuk: f.petunjuk ?? null,
    wajib: f.tipe === 'INFO' ? false : f.wajib,
    opsi: f.opsi as Prisma.InputJsonValue,
    validasi: f.validasi as Prisma.InputJsonValue,
    autofill: f.tipe === 'TEXT' ? f.autofill ?? null : null,
    gaya: f.tipe === 'INFO' ? f.gaya ?? 'TEXT' : null,
    isi: f.tipe === 'INFO' || f.tipe === 'SIGNATURE' ? f.isi ?? null : null,
    hidden: f.hidden,
  };
}

function formData(input: ReturnType<typeof ufFormInputSchema.parse>) {
  return {
    judul: input.judul,
    deskripsi: input.deskripsi ?? null,
    status: input.status,
    anonim: input.anonim,
    bukaAt: input.bukaAt ?? null,
    tutupAt: input.tutupAt ?? null,
    multiResponse: input.multiResponse,
    allowEdit: input.allowEdit,
    kuota: input.kuota ?? null,
    pesanTerimaKasih: input.pesanTerimaKasih ?? null,
  };
}

// ------------------------------------------------------------------ daftar

universalFormRouter.get('/', R, async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const status = typeof req.query.status === 'string' ? req.query.status : '';
  const rows = await prisma.universalForm.findMany({
    where: {
      ...(q ? { judul: { contains: q, mode: 'insensitive' } } : {}),
      ...(status ? { status } : { status: { not: 'ARCHIVED' } }),
    },
    orderBy: { updatedAt: 'desc' },
    take: 500,
    select: {
      id: true,
      judul: true,
      status: true,
      anonim: true,
      bukaAt: true,
      tutupAt: true,
      updatedAt: true,
      _count: { select: { responses: true, embeds: true, fields: { where: { tipe: { not: 'INFO' }, hidden: false } } } },
    },
  });
  res.json({
    success: true,
    data: rows.map(({ _count, ...r }) => ({ ...r, responseCount: _count.responses, embedCount: _count.embeds, fieldCount: _count.fields })),
  });
});

universalFormRouter.get('/options', async (req, res) => {
  uid(req);
  if (!(await canAny(req, ['universal-form', 'news', 'event', 'announcement'], 'read'))) throw Forbidden('Anda tidak punya akses.');
  const rows = await prisma.universalForm.findMany({
    where: { status: { in: ['DRAFT', 'OPEN', 'CLOSED'] } },
    orderBy: { updatedAt: 'desc' },
    take: 300,
    select: { id: true, judul: true, status: true, anonim: true, tutupAt: true },
  });
  res.json({ success: true, data: rows });
});

universalFormRouter.post('/', W, async (req, res) => {
  const u = uid(req);
  const input = ufFormInputSchema.parse(req.body);
  const created = await prisma.universalForm.create({
    data: {
      ...formData(input),
      createdById: u.sub,
      updatedById: u.sub,
      fields: { create: input.fields.map((f, i) => fieldData(f, i)) },
    },
  });
  audit(req, { action: 'CREATE', resource: 'universal_form', resourceId: created.id, resourceLabel: created.judul, after: created });
  res.status(201).json({ success: true, data: { id: created.id } });
});

// ------------------------------------------------------------------ sematan per konten

function srcParams(req: Request) {
  const t = String(req.params.sourceType ?? '').toUpperCase();
  if (!(UF_SOURCE_TYPES as readonly string[]).includes(t)) throw BadRequest('Jenis konten tidak dikenal.');
  const id = req.params.sourceId ?? '';
  if (!UUID.test(id)) throw NotFound('Konten tidak ditemukan');
  return { sourceType: t, sourceId: id };
}

universalFormRouter.get('/embeds/:sourceType/:sourceId', async (req, res) => {
  uid(req);
  const { sourceType, sourceId } = srcParams(req);
  if (!(await canAny(req, ['universal-form', SOURCE_MENU[sourceType]!], 'read'))) throw Forbidden('Anda tidak punya akses.');
  const embeds = await prisma.universalFormEmbed.findMany({
    where: { sourceType, sourceId },
    orderBy: { urutan: 'asc' },
    select: {
      id: true,
      formId: true,
      batasAt: true,
      autoCancel: true,
      form: { select: { judul: true, status: true, anonim: true, tutupAt: true } },
    },
  });
  const counts = embeds.length
    ? await prisma.universalFormResponse.groupBy({
        by: ['formId', 'status'],
        where: { sourceType, sourceId, formId: { in: embeds.map((e) => e.formId) } },
        _count: { _all: true },
      })
    : [];
  res.json({
    success: true,
    data: embeds.map((e) => {
      const c = counts.filter((x) => x.formId === e.formId);
      return {
        ...e,
        responseCount: c.reduce((a, x) => a + x._count._all, 0),
        needsFixCount: c.find((x) => x.status === 'NEEDS_FIX')?._count._all ?? 0,
      };
    }),
  });
});

universalFormRouter.put('/embeds/:sourceType/:sourceId', async (req, res) => {
  uid(req);
  const { sourceType, sourceId } = srcParams(req);
  if (!(await canAny(req, ['universal-form', SOURCE_MENU[sourceType]!], 'write'))) throw Forbidden('Anda tidak punya akses mengubah sematan form.');
  const input = ufEmbedListSchema.parse(req.body);
  const ids = [...new Set(input.forms.map((f) => f.formId))];
  if (ids.length) {
    const n = await prisma.universalForm.count({ where: { id: { in: ids } } });
    if (n !== ids.length) throw BadRequest('Ada form yang tidak ditemukan.');
  }
  const before = await prisma.universalFormEmbed.findMany({ where: { sourceType, sourceId } });
  await prisma.$transaction(async (tx) => {
    await tx.universalFormEmbed.deleteMany({ where: { sourceType, sourceId, formId: { notIn: ids } } });
    for (const [i, f] of input.forms.entries()) {
      await tx.universalFormEmbed.upsert({
        where: { formId_sourceType_sourceId: { formId: f.formId, sourceType, sourceId } },
        create: { formId: f.formId, sourceType, sourceId, batasAt: f.batasAt ?? null, autoCancel: sourceType === 'EVENT' && f.autoCancel, urutan: i },
        update: { batasAt: f.batasAt ?? null, autoCancel: sourceType === 'EVENT' && f.autoCancel, urutan: i },
      });
    }
  });
  audit(req, { action: 'UPDATE', resource: 'universal_form_embed', resourceId: sourceId, resourceLabel: `${sourceType} ${sourceId}`, before, after: input });
  res.json({ success: true, data: { count: ids.length } });
});

// ------------------------------------------------------------------ file

universalFormRouter.get('/files/:fileId', R, async (req, res) => {
  const id = req.params.fileId ?? '';
  if (!UUID.test(id)) throw NotFound('File tidak ditemukan');
  const f = await prisma.universalFormFile.findUnique({ where: { id } });
  if (!f) throw NotFound('File tidak ditemukan');
  const p = ufFilePath(f.storageName);
  if (!fs.existsSync(p)) throw NotFound('File sudah dihapus (masa simpan berakhir).');
  res.setHeader('Content-Type', f.mime);
  res.setHeader('Content-Disposition', `${req.query.inline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(f.originalName)}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.sendFile(p);
});

// ------------------------------------------------------------------ detail / simpan

universalFormRouter.get('/:id', R, async (req, res) => {
  const id = pid(req.params.id);
  const f = await prisma.universalForm.findUnique({
    where: { id },
    include: {
      fields: { orderBy: { urutan: 'asc' } },
      embeds: { orderBy: { createdAt: 'asc' } },
      _count: { select: { responses: true } },
    },
  });
  if (!f) throw NotFound('Form tidak ditemukan');
  const titles = await sourceTitles(f.embeds);
  const perEmbed = await prisma.universalFormResponse.groupBy({ by: ['sourceType', 'sourceId'], where: { formId: id }, _count: { _all: true } });
  const answered = new Set<string>();
  if (f._count.responses) {
    const rows = await prisma.universalFormResponse.findMany({ where: { formId: id }, select: { jawaban: true }, take: 5000 });
    for (const r of rows) for (const k of Object.keys((r.jawaban ?? {}) as object)) answered.add(k);
  }
  const { _count, embeds, fields, ...rest } = f;
  res.json({
    success: true,
    data: {
      ...rest,
      responseCount: _count.responses,
      fields: fields.map((x) => ({ ...x, hasAnswers: answered.has(x.id) })),
      embeds: embeds.map((e) => ({
        ...e,
        judul: titles.get(e.sourceId) ?? '(konten dihapus)',
        responseCount: perEmbed.find((p) => p.sourceType === e.sourceType && p.sourceId === e.sourceId)?._count._all ?? 0,
      })),
    },
  });
});

universalFormRouter.put('/:id', W, async (req, res) => {
  const u = uid(req);
  const id = pid(req.params.id);
  const input = ufFormInputSchema.parse(req.body);
  const before = await prisma.universalForm.findUnique({ where: { id }, include: { fields: true, _count: { select: { responses: true } } } });
  if (!before) throw NotFound('Form tidak ditemukan');
  const hasResponses = before._count.responses > 0;
  if (hasResponses && before.anonim !== input.anonim)
    throw BadRequest('Pengaturan anonim tidak bisa diubah setelah ada respons.');
  const existing = new Map(before.fields.map((f) => [f.id, f]));
  for (const f of input.fields) {
    const old = f.id ? existing.get(f.id) : undefined;
    if (f.id && !old) throw BadRequest('Ada field yang tidak dikenal. Muat ulang halaman.');
    if (old && hasResponses && old.tipe !== f.tipe) throw BadRequest(`Jenis field "${old.label}" tidak bisa diubah karena sudah ada jawaban.`);
  }
  const keep = new Set(input.fields.filter((f) => f.id).map((f) => f.id!));
  await prisma.$transaction(async (tx) => {
    await tx.universalForm.update({ where: { id }, data: { ...formData(input), updatedById: u.sub } });
    const removed = before.fields.filter((f) => !keep.has(f.id));
    if (removed.length) {
      // Sudah ada respons → disembunyikan (data lama tetap terbaca di hasil).
      if (hasResponses) await tx.universalFormField.updateMany({ where: { id: { in: removed.map((f) => f.id) } }, data: { hidden: true, urutan: 9999 } });
      else await tx.universalFormField.deleteMany({ where: { id: { in: removed.map((f) => f.id) } } });
    }
    for (const [i, f] of input.fields.entries()) {
      if (f.id) await tx.universalFormField.update({ where: { id: f.id }, data: fieldData(f, i) });
      else await tx.universalFormField.create({ data: { ...fieldData(f, i), formId: id } });
    }
  });
  audit(req, { action: 'UPDATE', resource: 'universal_form', resourceId: id, resourceLabel: input.judul, before, after: input });
  res.json({ success: true, data: { id } });
});

universalFormRouter.post('/:id/duplicate', W, async (req, res) => {
  const u = uid(req);
  const id = pid(req.params.id);
  const f = await prisma.universalForm.findUnique({ where: { id }, include: { fields: { where: { hidden: false }, orderBy: { urutan: 'asc' } } } });
  if (!f) throw NotFound('Form tidak ditemukan');
  const copy = await prisma.universalForm.create({
    data: {
      judul: `${f.judul} (salinan)`.slice(0, 200),
      deskripsi: f.deskripsi,
      status: 'DRAFT',
      anonim: f.anonim,
      multiResponse: f.multiResponse,
      allowEdit: f.allowEdit,
      kuota: f.kuota,
      pesanTerimaKasih: f.pesanTerimaKasih,
      createdById: u.sub,
      updatedById: u.sub,
      fields: {
        create: f.fields.map((x, i) => ({
          urutan: i,
          tipe: x.tipe,
          label: x.label,
          petunjuk: x.petunjuk,
          wajib: x.wajib,
          opsi: x.opsi as Prisma.InputJsonValue,
          validasi: x.validasi as Prisma.InputJsonValue,
          autofill: x.autofill,
          gaya: x.gaya,
          isi: x.isi,
        })),
      },
    },
  });
  audit(req, { action: 'CREATE', resource: 'universal_form', resourceId: copy.id, resourceLabel: copy.judul });
  res.status(201).json({ success: true, data: { id: copy.id } });
});

universalFormRouter.delete('/:id', D, async (req, res) => {
  const id = pid(req.params.id);
  const f = await prisma.universalForm.findUnique({ where: { id }, include: { _count: { select: { responses: true } }, files: { select: { storageName: true } } } });
  if (!f) throw NotFound('Form tidak ditemukan');
  if (f._count.responses > 0) throw BadRequest('Form sudah punya respons — arsipkan saja (status Arsip) supaya data tetap tersimpan.');
  await prisma.universalForm.delete({ where: { id } });
  for (const x of f.files) await deleteUfFile(x.storageName);
  audit(req, { action: 'DELETE', resource: 'universal_form', resourceId: id, resourceLabel: f.judul, before: f });
  res.json({ success: true, data: { deleted: true } });
});

// ------------------------------------------------------------------ hasil

type ResultFilter = { sourceType?: string; sourceId?: string; status?: string; cabangId?: string; q?: string };

async function loadResults(formId: string, filter: ResultFilter) {
  const form = await prisma.universalForm.findUnique({
    where: { id: formId },
    include: { fields: { orderBy: { urutan: 'asc' } }, embeds: true },
  });
  if (!form) throw NotFound('Form tidak ditemukan');
  const where: Prisma.UniversalFormResponseWhereInput = {
    formId,
    ...(filter.sourceType ? { sourceType: filter.sourceType } : {}),
    ...(filter.sourceId ? { sourceId: filter.sourceId } : {}),
    ...(filter.status ? { status: filter.status } : {}),
  };
  const responses = await prisma.universalFormResponse.findMany({
    where,
    orderBy: { submittedAt: 'desc' },
    take: 5000,
    include: { files: { select: { id: true, originalName: true, kind: true, mime: true, sizeBytes: true, fieldId: true } } },
  });
  const people = new Set<string>();
  for (const r of responses) {
    people.add(r.jemaatId);
    people.add(r.subjekJemaatId);
  }
  const jem = people.size
    ? await prisma.jemaat.findMany({ where: { id: { in: [...people] } }, select: { id: true, namaLengkap: true, kode: true, cabangId: true, cabang: { select: { nama: true } } } })
    : [];
  const jm = new Map(jem.map((j) => [j.id, j]));
  const titles = await sourceTitles([...form.embeds, ...responses]);
  const inputFields = form.fields.filter((f) => f.tipe !== 'INFO');
  const q = (filter.q ?? '').toLowerCase();
  const rows = responses
    .map((r) => {
      const fileNames = new Map(r.files.map((f) => [f.id, f.originalName]));
      const jaw = (r.jawaban ?? {}) as Record<string, unknown>;
      const af = (r.autofill ?? {}) as Record<string, string>;
      const answers: Record<string, string> = {};
      for (const f of inputFields) answers[f.id] = f.autofill ? af[f.autofill] ?? '' : answerText(f, jaw[f.id], fileNames);
      const subj = jm.get(r.subjekJemaatId);
      return {
        id: r.id,
        status: r.status,
        statusAlasan: r.statusAlasan,
        perbaikiSebelum: r.perbaikiSebelum,
        submittedAt: r.submittedAt,
        updatedAt: r.updatedAt,
        editCount: r.editCount,
        clientKind: r.clientKind,
        appVersion: r.appVersion,
        channel: r.sourceType ? { sourceType: r.sourceType, sourceId: r.sourceId, judul: titles.get(r.sourceId ?? '') ?? '(konten dihapus)' } : null,
        pengisi: form.anonim ? null : { id: r.jemaatId, namaLengkap: jm.get(r.jemaatId)?.namaLengkap ?? '—' },
        subjek: form.anonim ? null : { id: r.subjekJemaatId, namaLengkap: subj?.namaLengkap ?? '—', kode: subj?.kode ?? null },
        cabang: form.anonim ? null : subj?.cabang?.nama ?? null,
        cabangId: subj?.cabangId ?? null,
        answers,
        files: r.files,
      };
    })
    .filter((r) => !filter.cabangId || r.cabangId === filter.cabangId)
    .filter((r) => !q || [r.subjek?.namaLengkap, r.pengisi?.namaLengkap, r.subjek?.kode, ...Object.values(r.answers)].some((x) => x && String(x).toLowerCase().includes(q)));
  return { form, rows, titles, inputFields };
}

/** Peserta event yang belum mengisi / perlu tindak lanjut (per sematan event). */
async function missingForEvents(form: { id: string; status: string; bukaAt: Date | null; tutupAt: Date | null; embeds: { id: string; sourceType: string; sourceId: string; batasAt: Date | null; autoCancel: boolean }[] }, onlySourceId?: string) {
  const now = new Date();
  const out: {
    eventId: string;
    participationId: string;
    jemaatId: string;
    namaLengkap: string;
    kode: string | null;
    state: 'BELUM_ISI' | 'PERLU_DIPERBAIKI';
    paid: boolean;
    deadline: Date | null;
    tindakLanjut: boolean;
  }[] = [];
  for (const e of form.embeds.filter((x) => x.sourceType === 'EVENT' && (!onlySourceId || x.sourceId === onlySourceId))) {
    const ev = await prisma.event.findUnique({ where: { id: e.sourceId }, select: { tipeBayar: true, nominal: true } });
    if (!ev) continue;
    const parts = await prisma.eventParticipation.findMany({
      where: { eventId: e.sourceId, status: { not: 'BATAL' } },
      select: { id: true, status: true, jemaatId: true, jemaat: { select: { namaLengkap: true, kode: true } }, donations: { select: { status: true } } },
    });
    const eligible = parts.filter((p) => !requiresPayment(ev) || paymentStatusOf(ev, p) === 'LUNAS');
    const resp = await prisma.universalFormResponse.findMany({
      where: { formId: form.id, sourceType: 'EVENT', sourceId: e.sourceId },
      select: { subjekJemaatId: true, status: true, perbaikiSebelum: true },
    });
    const byS = new Map(resp.map((r) => [r.subjekJemaatId, r]));
    const dl = ufDeadline(form, e);
    const paidEvent = requiresPayment(ev);
    for (const p of eligible) {
      const r = byS.get(p.jemaatId);
      if (r && r.status === 'SUBMITTED') continue;
      if (r && r.status === 'REJECTED') continue;
      const state = r ? 'PERLU_DIPERBAIKI' : 'BELUM_ISI';
      const lewat = state === 'BELUM_ISI' ? !!dl && now > dl : !!r?.perbaikiSebelum && now > r.perbaikiSebelum;
      out.push({
        eventId: e.sourceId,
        participationId: p.id,
        jemaatId: p.jemaatId,
        namaLengkap: p.jemaat.namaLengkap,
        kode: p.jemaat.kode,
        state,
        paid: paidEvent,
        deadline: state === 'BELUM_ISI' ? dl : r?.perbaikiSebelum ?? dl,
        // Event berbayar tidak dibatalkan otomatis → admin menindaklanjuti.
        tindakLanjut: paidEvent && lewat,
      });
    }
  }
  return out;
}

function filterOf(req: Request): ResultFilter {
  const s = (k: string) => (typeof req.query[k] === 'string' && req.query[k] ? String(req.query[k]) : undefined);
  return { sourceType: s('sourceType'), sourceId: s('sourceId'), status: s('status'), cabangId: s('cabangId'), q: s('q') };
}

universalFormRouter.get('/:id/responses', R, async (req, res) => {
  const id = pid(req.params.id);
  const filter = filterOf(req);
  const { form, rows } = await loadResults(id, filter);
  const all = await prisma.universalFormResponse.groupBy({ by: ['sourceType', 'sourceId', 'status'], where: { formId: id }, _count: { _all: true } });
  const titles = await sourceTitles([...form.embeds, ...all]);
  const channels = new Map<string, { sourceType: string | null; sourceId: string | null; judul: string; total: number; needsFix: number }>();
  for (const g of all) {
    const k = `${g.sourceType}:${g.sourceId}`;
    const c = channels.get(k) ?? { sourceType: g.sourceType, sourceId: g.sourceId, judul: titles.get(g.sourceId ?? '') ?? 'Langsung', total: 0, needsFix: 0 };
    c.total += g._count._all;
    if (g.status === 'NEEDS_FIX') c.needsFix += g._count._all;
    channels.set(k, c);
  }
  const missing = form.embeds.some((e) => e.sourceType === 'EVENT') && (!filter.sourceType || filter.sourceType === 'EVENT')
    ? await missingForEvents(form, filter.sourceId)
    : [];
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(200, Math.max(10, Number(req.query.pageSize) || 50));
  res.json({
    success: true,
    data: {
      form: { id: form.id, judul: form.judul, anonim: form.anonim, status: form.status },
      fields: form.fields.map((f) => ({ id: f.id, tipe: f.tipe, label: f.label, autofill: f.autofill, hidden: f.hidden })),
      summary: {
        total: all.reduce((a, g) => a + g._count._all, 0),
        needsFix: all.filter((g) => g.status === 'NEEDS_FIX').reduce((a, g) => a + g._count._all, 0),
        rejected: all.filter((g) => g.status === 'REJECTED').reduce((a, g) => a + g._count._all, 0),
        missing: missing.filter((m) => m.state === 'BELUM_ISI').length,
        tindakLanjut: missing.filter((m) => m.tindakLanjut).length,
        channels: [...channels.values()],
      },
      missing: form.anonim ? missing.map((m) => ({ ...m, namaLengkap: m.namaLengkap })) : missing,
      rows: rows.slice((page - 1) * pageSize, page * pageSize),
      total: rows.length,
      page,
      pageSize,
    },
  });
});

universalFormRouter.get('/:id/responses/:rid', R, async (req, res) => {
  const id = pid(req.params.id);
  const rid = pid(req.params.rid);
  const r = await prisma.universalFormResponse.findUnique({ where: { id: rid }, include: { files: true } });
  if (!r || r.formId !== id) throw NotFound('Respons tidak ditemukan');
  const form = await prisma.universalForm.findUnique({ where: { id }, include: { fields: { orderBy: { urutan: 'asc' } } } });
  if (!form) throw NotFound('Form tidak ditemukan');
  const ppl = await prisma.jemaat.findMany({
    where: { id: { in: [r.jemaatId, r.subjekJemaatId, ...(r.statusById ? [] : [])] } },
    select: { id: true, namaLengkap: true, kode: true, cabang: { select: { nama: true } } },
  });
  const pm = new Map(ppl.map((p) => [p.id, p]));
  const titles = await sourceTitles([r]);
  let participation: { id: string; status: string; payment: string } | null = null;
  if (r.sourceType === 'EVENT' && r.sourceId) {
    const ev = await prisma.event.findUnique({ where: { id: r.sourceId }, select: { tipeBayar: true, nominal: true } });
    const p = await prisma.eventParticipation.findUnique({
      where: { eventId_jemaatId: { eventId: r.sourceId, jemaatId: r.subjekJemaatId } },
      select: { id: true, status: true, donations: { select: { status: true } } },
    });
    if (ev && p) participation = { id: p.id, status: p.status, payment: paymentStatusOf(ev, p) };
  }
  const jaw = (r.jawaban ?? {}) as Record<string, unknown>;
  const af = (r.autofill ?? {}) as Record<string, string>;
  res.json({
    success: true,
    data: {
      id: r.id,
      status: r.status,
      statusLabel: UF_RESPONSE_STATUS_LABEL[r.status as keyof typeof UF_RESPONSE_STATUS_LABEL] ?? r.status,
      statusAlasan: r.statusAlasan,
      perbaikiSebelum: r.perbaikiSebelum,
      statusAt: r.statusAt,
      submittedAt: r.submittedAt,
      updatedAt: r.updatedAt,
      editCount: r.editCount,
      clientKind: r.clientKind,
      appVersion: r.appVersion,
      jawabanHash: r.jawabanHash,
      channel: r.sourceType ? { sourceType: r.sourceType, sourceId: r.sourceId, judul: titles.get(r.sourceId ?? '') ?? '(konten dihapus)' } : null,
      anonim: form.anonim,
      pengisi: form.anonim ? null : pm.get(r.jemaatId) ?? null,
      subjek: form.anonim ? null : pm.get(r.subjekJemaatId) ?? null,
      participation,
      items: form.fields
        .filter((f) => !f.hidden || jaw[f.id] !== undefined)
        .map((f) => ({
          fieldId: f.id,
          tipe: f.tipe,
          label: f.label,
          gaya: f.gaya,
          isi: f.isi,
          autofill: f.autofill,
          autofillLabel: f.autofill ? UF_AUTOFILL_LABEL[f.autofill as UfAutofill] : null,
          value: f.autofill ? af[f.autofill] ?? '' : jaw[f.id] ?? null,
          text: f.autofill ? af[f.autofill] ?? '' : answerText(f, jaw[f.id], new Map(r.files.map((x) => [x.id, x.originalName]))),
          files: r.files.filter((x) => x.fieldId === f.id).map((x) => ({ id: x.id, originalName: x.originalName, mime: x.mime, sizeBytes: x.sizeBytes, kind: x.kind, meta: x.meta })),
        })),
    },
  });
});

universalFormRouter.post('/:id/responses/:rid/review', W, async (req, res) => {
  const u = uid(req);
  const id = pid(req.params.id);
  const rid = pid(req.params.rid);
  const input = ufReviewSchema.parse(req.body);
  const r = await prisma.universalFormResponse.findUnique({ where: { id: rid } });
  if (!r || r.formId !== id) throw NotFound('Respons tidak ditemukan');
  const form = await prisma.universalForm.findUnique({ where: { id }, include: { embeds: true } });
  if (!form) throw NotFound('Form tidak ditemukan');
  const embed = form.embeds.find((e) => e.id === r.embedId) ?? null;
  const subj = await prisma.jemaat.findUnique({ where: { id: r.subjekJemaatId }, select: { namaLengkap: true } });
  const nama = subj?.namaLengkap ?? 'peserta';
  const now = new Date();
  const actionUrl = `/form/${id}?src=${r.sourceType ?? ''}:${r.sourceId ?? ''}&subjek=${r.subjekJemaatId}`;

  if (input.action === 'RESTORE') {
    await prisma.universalFormResponse.update({ where: { id: rid }, data: { status: 'SUBMITTED', statusAlasan: null, perbaikiSebelum: null, statusById: u.sub, statusAt: now } });
  } else if (input.action === 'NEEDS_FIX') {
    const dl = ufDeadline(form, embed);
    let sebelum = input.perbaikiSebelum ?? new Date(now.getTime() + UF_FIX_DEFAULT_HOURS * 3600000);
    if (dl && sebelum > dl) sebelum = dl;
    if (sebelum <= now) throw BadRequest('Batas perbaikan sudah lewat. Pilih waktu yang akan datang.');
    await prisma.universalFormResponse.update({ where: { id: rid }, data: { status: 'NEEDS_FIX', statusAlasan: input.alasan ?? null, perbaikiSebelum: sebelum, statusById: u.sub, statusAt: now } });
    void createNotification({
      jemaatId: r.jemaatId,
      type: 'FORM_NEEDS_FIX',
      title: `Formulir perlu diperbaiki: ${form.judul}`,
      body: `Jawaban untuk ${nama}: ${input.alasan}. Perbaiki sebelum ${sebelum.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' })} WIB.`,
      actionUrl,
      metadata: { formId: id, responseId: rid },
    });
  } else if (input.action === 'REJECT' || input.action === 'CANCEL_REGISTRATION') {
    await prisma.universalFormResponse.update({ where: { id: rid }, data: { status: 'REJECTED', statusAlasan: input.alasan ?? null, perbaikiSebelum: null, statusById: u.sub, statusAt: now } });
    if (input.action === 'CANCEL_REGISTRATION') {
      if (r.sourceType !== 'EVENT' || !r.sourceId) throw BadRequest('Pembatalan pendaftaran hanya untuk form di event.');
      if (!(await hasMenuAccessFor(req.user, 'event', 'write'))) throw Forbidden('Butuh akses tulis menu Event untuk membatalkan pendaftaran.');
      await cancelParticipation(r.sourceId, r.subjekJemaatId, r.jemaatId, input.alasan ?? '', 'FORM_ADMIN');
    } else {
      void createNotification({
        jemaatId: r.jemaatId,
        type: 'FORM_REJECTED',
        title: `Formulir ditolak: ${form.judul}`,
        body: `Jawaban untuk ${nama} ditolak: ${input.alasan}`,
        actionUrl,
        metadata: { formId: id, responseId: rid },
      });
    }
  }
  audit(req, { action: 'UPDATE', resource: 'universal_form_response', resourceId: rid, resourceLabel: `${form.judul} · ${nama} · ${input.action}`, before: r, after: input });
  res.json({ success: true, data: { ok: true } });
});

// ------------------------------------------------------------------ ekspor

universalFormRouter.get('/:id/export', R, async (req, res) => {
  const id = pid(req.params.id);
  const filter = filterOf(req);
  const { form, rows, inputFields } = await loadResults(id, filter);
  const format = String(req.query.format ?? 'csv');
  const slug = form.judul.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'form';
  const head = [
    ...(form.anonim ? [] : ['Nama peserta', 'Kode', 'Cabang', 'Diisi oleh']),
    'Channel',
    'Status',
    'Alasan',
    'Dikirim',
    'Lewat',
    ...inputFields.map((f) => f.label + (f.hidden ? ' (disembunyikan)' : '')),
  ];
  const fmt = (d: Date) => d.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' });
  const line = (r: (typeof rows)[number]) => [
    ...(form.anonim ? [] : [r.subjek?.namaLengkap ?? '', r.subjek?.kode ?? '', r.cabang ?? '', r.pengisi?.namaLengkap ?? '']),
    r.channel ? `${UF_SOURCE_LABEL[r.channel.sourceType as keyof typeof UF_SOURCE_LABEL] ?? r.channel.sourceType}: ${r.channel.judul}` : 'Langsung',
    UF_RESPONSE_STATUS_LABEL[r.status as keyof typeof UF_RESPONSE_STATUS_LABEL] ?? r.status,
    r.statusAlasan ?? '',
    fmt(r.submittedAt),
    r.clientKind === 'web' ? 'Els App web' : r.clientKind === 'portal' ? 'Portal' : `App ${r.appVersion ?? ''}`.trim(),
    ...inputFields.map((f) => r.answers[f.id] ?? ''),
  ];
  if (format === 'csv' || format === 'xlsx' || format === 'excel') {
    return sendCsv(res, `form-${slug}.csv`, [[form.judul], [], head, ...rows.map(line)]);
  }
  const table = `<table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows
    .map((r) => `<tr>${line(r).map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`)
    .join('')}</tbody></table>`;
  sendPrintHtml(req, res, `Hasil form: ${form.judul}`, null, [`${rows.length} respons`, form.anonim ? 'Form anonim' : null], table, '');
});
