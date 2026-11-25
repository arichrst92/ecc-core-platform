/**
 * Universal Form — app jemaat (2.5.1) & Els App web, 2026-12.
 * Di-mount di /admin/me/forms.
 *
 *   GET    /by-source/:sourceType/:sourceId   kartu form di halaman konten (+ status per peserta)
 *   GET    /files/:fileId                     unduh file milik saya
 *   DELETE /files/:fileId                     hapus file yang belum terkirim
 *   GET    /responses/:rid                    jawaban saya (hanya-baca)
 *   GET    /:formId?src=TYPE:ID&subjek=ID     form untuk diisi (field, autofill, jawaban lama)
 *   POST   /:formId/files?fieldId=            unggah 1 file (multipart)
 *   POST   /:formId/signature                 { fieldId, strokes, width, height } → PNG
 *   POST   /:formId/submit                    { src, subjekJemaatId, jawaban }
 *
 * Event: hanya peserta terdaftar (saya, keluarga, tamu saya; event berbayar → lunas),
 * diisi per peserta. Autofill dari data peserta, diambil ulang saat kirim.
 */
import { Router, type Request } from 'express';
import fs from 'node:fs';
import { prisma, Prisma } from '@ecc/database';
import { UF_SOURCE_TYPES, ufIsInput, type UfAutofill, type UfValidasi } from '@ecc/shared-types';
import { BadRequest, Forbidden, NotFound, Unauthorized } from '../../lib/errors.js';
import { isMobileClient } from '../../lib/client-kind.js';
import {
  autofillFor,
  deleteUfFile,
  eventSubjects,
  hashJawaban,
  saveUfBuffer,
  signatureToPng,
  sourceTitles,
  sourceVisible,
  ufAcceptedExt,
  ufDeadline,
  ufExt,
  ufFilePath,
  ufUpload,
  ufWindow,
  validateAnswers,
  type Stroke,
  type UfFileRef,
  type UfSubject,
} from '../../lib/universal-form.js';

export const meUniversalFormRouter = Router();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function me(req: Request) {
  if (!req.user) throw Unauthorized();
  return req.user.jemaatId;
}

function parseSrc(raw: unknown): { sourceType: string; sourceId: string } {
  const [t, id] = String(raw ?? '').split(':');
  const sourceType = (t ?? '').toUpperCase();
  if (!(UF_SOURCE_TYPES as readonly string[]).includes(sourceType) || !UUID.test(id ?? '')) throw BadRequest('Sumber form tidak dikenal.');
  return { sourceType, sourceId: id! };
}

const clientInfo = (req: Request) => ({
  clientKind: isMobileClient(req) ? 'app' : 'web',
  appVersion: (req.get('x-app-version') ?? '').slice(0, 40) || null,
  ip: (req.ip ?? '').slice(0, 64) || null,
});

type Ctx = {
  form: Prisma.UniversalFormGetPayload<{ include: { fields: true } }>;
  embed: Prisma.UniversalFormEmbedGetPayload<object>;
  subjects: UfSubject[];
  self: UfSubject;
};

/** Form + sematan + daftar peserta yang boleh saya isikan. */
async function context(req: Request, formId: string, src: { sourceType: string; sourceId: string }): Promise<Ctx> {
  const jemaatId = me(req);
  const embed = await prisma.universalFormEmbed.findUnique({
    where: { formId_sourceType_sourceId: { formId, sourceType: src.sourceType, sourceId: src.sourceId } },
  });
  if (!embed) throw NotFound('Formulir tidak ditemukan');
  const form = await prisma.universalForm.findUnique({ where: { id: formId }, include: { fields: { orderBy: { urutan: 'asc' } } } });
  if (!form || form.status === 'DRAFT' || form.status === 'ARCHIVED') throw NotFound('Formulir tidak ditemukan');
  if (!(await sourceVisible(src.sourceType, src.sourceId, jemaatId))) throw NotFound('Formulir tidak ditemukan');
  const meRow = await prisma.jemaat.findUnique({ where: { id: jemaatId }, select: { namaLengkap: true, fotoUrl: true } });
  const self: UfSubject = { jemaatId, namaLengkap: meRow?.namaLengkap ?? '', fotoUrl: meRow?.fotoUrl ?? null, relasi: 'Saya' };
  const subjects = src.sourceType === 'EVENT' ? await eventSubjects(src.sourceId, jemaatId) : [self];
  if (!subjects.length) throw Forbidden('Formulir ini hanya untuk peserta terdaftar event ini.');
  return { form, embed, subjects, self };
}

const respView = (r: { id: string; status: string; statusAlasan: string | null; perbaikiSebelum: Date | null; submittedAt: Date; updatedAt: Date } | undefined | null) =>
  r ? { id: r.id, status: r.status, alasan: r.statusAlasan, perbaikiSebelum: r.perbaikiSebelum, submittedAt: r.submittedAt, updatedAt: r.updatedAt } : null;

// ------------------------------------------------------------------ kartu di konten

meUniversalFormRouter.get('/by-source/:sourceType/:sourceId', async (req, res) => {
  const jemaatId = me(req);
  const src = parseSrc(`${req.params.sourceType}:${req.params.sourceId}`);
  if (!(await sourceVisible(src.sourceType, src.sourceId, jemaatId))) {
    res.json({ success: true, data: [] });
    return;
  }
  const embeds = await prisma.universalFormEmbed.findMany({
    where: { sourceType: src.sourceType, sourceId: src.sourceId, form: { status: { in: ['OPEN', 'CLOSED'] } } },
    orderBy: { urutan: 'asc' },
    include: { form: { include: { fields: { where: { hidden: false }, select: { tipe: true } } } } },
  });
  if (!embeds.length) {
    res.json({ success: true, data: [] });
    return;
  }
  const meRow = await prisma.jemaat.findUnique({ where: { id: jemaatId }, select: { namaLengkap: true, fotoUrl: true } });
  const subjects: UfSubject[] =
    src.sourceType === 'EVENT'
      ? await eventSubjects(src.sourceId, jemaatId)
      : [{ jemaatId, namaLengkap: meRow?.namaLengkap ?? '', fotoUrl: meRow?.fotoUrl ?? null, relasi: 'Saya' }];
  if (!subjects.length) {
    res.json({ success: true, data: [] }); // event: kartu hanya untuk peserta terdaftar
    return;
  }
  const resp = await prisma.universalFormResponse.findMany({
    where: { formId: { in: embeds.map((e) => e.formId) }, sourceType: src.sourceType, sourceId: src.sourceId, subjekJemaatId: { in: subjects.map((s) => s.jemaatId) } },
    orderBy: { submittedAt: 'desc' },
  });
  const now = new Date();
  res.json({
    success: true,
    data: embeds.map((e) => {
      const f = e.form;
      const deadline = ufDeadline(f, e);
      return {
        formId: f.id,
        judul: f.judul,
        deskripsi: f.deskripsi,
        anonim: f.anonim,
        questionCount: f.fields.filter((x) => ufIsInput(x.tipe)).length,
        state: ufWindow(f, e, now),
        opensAt: f.bukaAt,
        deadline,
        autoCancel: e.autoCancel,
        multiResponse: f.multiResponse,
        allowEdit: f.allowEdit,
        perPeserta: src.sourceType === 'EVENT',
        subjects: subjects.map((s) => ({
          jemaatId: s.jemaatId,
          namaLengkap: s.namaLengkap,
          fotoUrl: s.fotoUrl,
          relasi: s.relasi,
          response: respView(resp.find((r) => r.formId === f.id && r.subjekJemaatId === s.jemaatId)),
        })),
      };
    }),
  });
});

// ------------------------------------------------------------------ file saya

meUniversalFormRouter.get('/files/:fileId', async (req, res) => {
  const jemaatId = me(req);
  const id = req.params.fileId ?? '';
  if (!UUID.test(id)) throw NotFound('File tidak ditemukan');
  const f = await prisma.universalFormFile.findUnique({ where: { id } });
  if (!f || f.uploaderJemaatId !== jemaatId) throw NotFound('File tidak ditemukan');
  const p = ufFilePath(f.storageName);
  if (!fs.existsSync(p)) throw NotFound('File sudah dihapus.');
  res.setHeader('Content-Type', f.mime);
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(f.originalName)}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.sendFile(p);
});

meUniversalFormRouter.delete('/files/:fileId', async (req, res) => {
  const jemaatId = me(req);
  const id = req.params.fileId ?? '';
  if (!UUID.test(id)) throw NotFound('File tidak ditemukan');
  const f = await prisma.universalFormFile.findUnique({ where: { id } });
  if (!f || f.uploaderJemaatId !== jemaatId) throw NotFound('File tidak ditemukan');
  // File yang sudah terkirim dilepas saat jawaban disimpan ulang (bukan dihapus di sini).
  if (!f.responseId) {
    await prisma.universalFormFile.delete({ where: { id } });
    await deleteUfFile(f.storageName);
  }
  res.json({ success: true, data: { deleted: true } });
});

// ------------------------------------------------------------------ jawaban saya

meUniversalFormRouter.get('/responses/:rid', async (req, res) => {
  const jemaatId = me(req);
  const id = req.params.rid ?? '';
  if (!UUID.test(id)) throw NotFound('Jawaban tidak ditemukan');
  const r = await prisma.universalFormResponse.findUnique({ where: { id }, include: { files: true } });
  if (!r || r.jemaatId !== jemaatId) throw NotFound('Jawaban tidak ditemukan');
  const form = await prisma.universalForm.findUnique({ where: { id: r.formId }, include: { fields: { orderBy: { urutan: 'asc' } } } });
  if (!form) throw NotFound('Jawaban tidak ditemukan');
  const subj = await prisma.jemaat.findUnique({ where: { id: r.subjekJemaatId }, select: { namaLengkap: true } });
  const titles = await sourceTitles([r]);
  res.json({
    success: true,
    data: {
      ...respView(r),
      formId: r.formId,
      judul: form.judul,
      src: r.sourceType ? `${r.sourceType}:${r.sourceId}` : null,
      konten: titles.get(r.sourceId ?? '') ?? null,
      subjek: { jemaatId: r.subjekJemaatId, namaLengkap: subj?.namaLengkap ?? '' },
      clientKind: r.clientKind,
      fields: form.fields.filter((f) => !f.hidden),
      jawaban: r.jawaban,
      autofill: r.autofill,
      files: r.files.map((f) => ({ id: f.id, fieldId: f.fieldId, kind: f.kind, originalName: f.originalName, mime: f.mime, sizeBytes: f.sizeBytes, meta: f.meta })),
    },
  });
});

// ------------------------------------------------------------------ form untuk diisi

meUniversalFormRouter.get('/:formId', async (req, res) => {
  const jemaatId = me(req);
  const formId = req.params.formId ?? '';
  if (!UUID.test(formId)) throw NotFound('Formulir tidak ditemukan');
  const src = parseSrc(req.query.src);
  const ctx = await context(req, formId, src);
  const subjekId = typeof req.query.subjek === 'string' && UUID.test(req.query.subjek) ? req.query.subjek : ctx.subjects[0]!.jemaatId;
  const subject = ctx.subjects.find((s) => s.jemaatId === subjekId);
  if (!subject) throw Forbidden('Peserta ini tidak terdaftar di event ini.');
  const fields = ctx.form.fields.filter((f) => !f.hidden);
  const keys = ctx.form.anonim ? [] : (fields.filter((f) => f.autofill).map((f) => f.autofill) as UfAutofill[]);
  const autofill = await autofillFor(subject.jemaatId, keys);
  const existing = await prisma.universalFormResponse.findFirst({
    where: { formId, sourceType: src.sourceType, sourceId: src.sourceId, subjekJemaatId: subject.jemaatId },
    orderBy: { submittedAt: 'desc' },
    include: { files: true },
  });
  const now = new Date();
  const state = ufWindow(ctx.form, ctx.embed, now);
  const fixOpen = existing?.status === 'NEEDS_FIX' && !!existing.perbaikiSebelum && existing.perbaikiSebelum > now;
  const titles = await sourceTitles([src]);
  res.json({
    success: true,
    data: {
      formId,
      src: `${src.sourceType}:${src.sourceId}`,
      konten: titles.get(src.sourceId) ?? null,
      judul: ctx.form.judul,
      deskripsi: ctx.form.deskripsi,
      anonim: ctx.form.anonim,
      pesanTerimaKasih: ctx.form.pesanTerimaKasih,
      state,
      opensAt: ctx.form.bukaAt,
      deadline: ufDeadline(ctx.form, ctx.embed),
      autoCancel: ctx.embed.autoCancel,
      multiResponse: ctx.form.multiResponse,
      allowEdit: ctx.form.allowEdit,
      // Boleh mengisi / mengubah sekarang?
      canSubmit:
        (state === 'OPEN' && (!existing || ctx.form.multiResponse || ctx.form.allowEdit || existing.status === 'NEEDS_FIX')) || fixOpen,
      subject: { jemaatId: subject.jemaatId, namaLengkap: subject.namaLengkap, relasi: subject.relasi },
      subjects: ctx.subjects.map((s) => ({ jemaatId: s.jemaatId, namaLengkap: s.namaLengkap, relasi: s.relasi })),
      signerName: ctx.self.namaLengkap,
      fields: fields.map((f) => ({
        id: f.id,
        tipe: f.tipe,
        label: f.label,
        petunjuk: f.petunjuk,
        wajib: f.wajib,
        opsi: f.opsi,
        validasi: f.validasi,
        autofill: f.autofill,
        gaya: f.gaya,
        // {nama_peserta} / {event} diganti di sini.
        isi: f.isi ? f.isi.replace(/\{nama_peserta\}/g, subject.namaLengkap).replace(/\{event\}/g, titles.get(src.sourceId) ?? '') : null,
      })),
      autofill,
      response: existing
        ? {
            ...respView(existing),
            jawaban: existing.jawaban,
            files: existing.files.map((f) => ({ id: f.id, fieldId: f.fieldId, kind: f.kind, originalName: f.originalName, mime: f.mime, sizeBytes: f.sizeBytes, meta: f.meta })),
          }
        : null,
    },
  });
});

// ------------------------------------------------------------------ unggah file & tanda tangan

async function fieldFor(formId: string, fieldId: unknown, tipe: 'FILE' | 'SIGNATURE') {
  const id = String(fieldId ?? '');
  if (!UUID.test(id)) throw BadRequest('Field tidak dikenal.');
  const f = await prisma.universalFormField.findUnique({ where: { id }, include: { form: { select: { id: true, status: true, anonim: true } } } });
  if (!f || f.formId !== formId || f.hidden || f.tipe !== tipe) throw BadRequest('Field tidak dikenal.');
  if (f.form.status !== 'OPEN') throw BadRequest('Formulir sudah ditutup.');
  return f;
}

meUniversalFormRouter.post('/:formId/files', ufUpload(), async (req, res) => {
  const jemaatId = me(req);
  const formId = req.params.formId ?? '';
  if (!UUID.test(formId)) throw NotFound('Formulir tidak ditemukan');
  const f = await fieldFor(formId, req.query.fieldId ?? req.body?.fieldId, 'FILE');
  const file = (req as unknown as { file?: Express.Multer.File }).file;
  if (!file) throw BadRequest('Pilih file untuk diunggah.');
  const v = (f.validasi ?? {}) as UfValidasi;
  const ext = ufExt(file.originalname, file.mimetype);
  const allowed = ufAcceptedExt(v.accept);
  if (!ext || !allowed.includes(ext)) throw BadRequest(`Jenis file tidak diterima. Gunakan: ${allowed.join(', ').toUpperCase()}.`);
  const maxMb = v.maxSizeMb ?? 10;
  if (file.size > maxMb * 1024 * 1024) throw BadRequest(`Ukuran file maksimal ${maxMb} MB.`);
  // Batasi sampah unggahan: maks 30 file belum terkirim per orang per form.
  const pending = await prisma.universalFormFile.count({ where: { formId, uploaderJemaatId: jemaatId, responseId: null } });
  if (pending >= 30) throw BadRequest('Terlalu banyak file yang belum dikirim. Kirim atau hapus dulu.');
  const saved = await saveUfBuffer(file.buffer, ext);
  const base = (file.originalname || `file.${saved.ext}`).replace(/[\\/]/g, '_').slice(0, 200);
  const name = saved.ext !== ext ? base.replace(/\.[^.]+$/, '') + `.${saved.ext}` : base;
  const row = await prisma.universalFormFile.create({
    data: { formId, fieldId: f.id, uploaderJemaatId: jemaatId, kind: 'FILE', storageName: saved.storageName, originalName: name, mime: saved.mime, sizeBytes: saved.size },
  });
  res.status(201).json({ success: true, data: { id: row.id, fieldId: row.fieldId, kind: row.kind, originalName: row.originalName, mime: row.mime, sizeBytes: row.sizeBytes } });
});

meUniversalFormRouter.post('/:formId/signature', async (req, res) => {
  const jemaatId = me(req);
  const formId = req.params.formId ?? '';
  if (!UUID.test(formId)) throw NotFound('Formulir tidak ditemukan');
  const f = await fieldFor(formId, req.body?.fieldId, 'SIGNATURE');
  if (f.form.anonim) throw BadRequest('Form anonim tidak memakai tanda tangan.');
  const strokes = Array.isArray(req.body?.strokes) ? (req.body.strokes as unknown[]).filter(Array.isArray).map((s) => (s as unknown[]).map(Number)) as Stroke[] : [];
  const png = await signatureToPng(strokes, Number(req.body?.width) || 600, Number(req.body?.height) || 300);
  const saved = await saveUfBuffer(png, 'png');
  const signer = await prisma.jemaat.findUnique({ where: { id: jemaatId }, select: { namaLengkap: true } });
  const ci = clientInfo(req);
  const row = await prisma.universalFormFile.create({
    data: {
      formId,
      fieldId: f.id,
      uploaderJemaatId: jemaatId,
      kind: 'SIGNATURE',
      storageName: saved.storageName,
      originalName: 'tanda-tangan.png',
      mime: 'image/png',
      sizeBytes: saved.size,
      meta: { signerJemaatId: jemaatId, signerName: signer?.namaLengkap ?? '', signedAt: new Date().toISOString(), ip: ci.ip, client: ci.clientKind, appVersion: ci.appVersion },
    },
  });
  res.status(201).json({ success: true, data: { id: row.id, fieldId: row.fieldId, kind: row.kind, originalName: row.originalName, mime: row.mime, sizeBytes: row.sizeBytes, meta: row.meta } });
});

// ------------------------------------------------------------------ kirim

meUniversalFormRouter.post('/:formId/submit', async (req, res) => {
  const jemaatId = me(req);
  const formId = req.params.formId ?? '';
  if (!UUID.test(formId)) throw NotFound('Formulir tidak ditemukan');
  const src = parseSrc(req.body?.src);
  const ctx = await context(req, formId, src);
  const subjekId = String(req.body?.subjekJemaatId ?? ctx.subjects[0]!.jemaatId);
  const subject = ctx.subjects.find((s) => s.jemaatId === subjekId);
  if (!subject) throw Forbidden('Peserta ini tidak terdaftar di event ini.');
  const now = new Date();
  const existing = ctx.form.multiResponse
    ? null
    : await prisma.universalFormResponse.findFirst({
        where: { formId, sourceType: src.sourceType, sourceId: src.sourceId, subjekJemaatId: subject.jemaatId },
        orderBy: { submittedAt: 'desc' },
        include: { files: true },
      });
  const state = ufWindow(ctx.form, ctx.embed, now);
  const fixOpen = existing?.status === 'NEEDS_FIX' && !!existing.perbaikiSebelum && existing.perbaikiSebelum > now;
  if (!fixOpen) {
    if (state === 'NOT_OPEN') throw BadRequest('Formulir belum dibuka.');
    if (state !== 'OPEN') throw BadRequest('Formulir sudah ditutup.');
    if (existing && existing.status === 'REJECTED') throw BadRequest('Jawaban ini sudah ditolak admin dan tidak bisa diubah.');
    if (existing && !ctx.form.allowEdit && existing.status !== 'NEEDS_FIX') throw BadRequest('Jawaban sudah terkirim dan tidak bisa diubah.');
  }
  if (!existing && ctx.form.kuota) {
    const n = await prisma.universalFormResponse.count({ where: { formId, status: { not: 'REJECTED' } } });
    if (n >= ctx.form.kuota) throw BadRequest('Kuota formulir sudah penuh.');
  }
  const fields = ctx.form.fields.filter((f) => !f.hidden);
  const myFiles = await prisma.universalFormFile.findMany({
    where: { formId, uploaderJemaatId: jemaatId, OR: [{ responseId: null }, ...(existing ? [{ responseId: existing.id }] : [])] },
    select: { id: true, fieldId: true, kind: true, uploaderJemaatId: true, responseId: true },
  });
  const fileMap = new Map<string, UfFileRef>(myFiles.map((f) => [f.id, f]));
  const raw = (req.body?.jawaban ?? {}) as Record<string, unknown>;
  const { jawaban, errors } = validateAnswers(fields, raw, fileMap, existing?.id ?? null);
  if (Object.keys(errors).length) {
    res.status(422).json({ success: false, error: { code: 'VALIDATION', message: 'Ada isian yang perlu diperbaiki.', fields: errors } });
    return;
  }
  const keys = ctx.form.anonim ? [] : (fields.filter((f) => f.autofill).map((f) => f.autofill) as UfAutofill[]);
  const autofill = await autofillFor(subject.jemaatId, keys);
  const hash = hashJawaban({ formId, subjekJemaatId: subject.jemaatId, jawaban, autofill });
  // Tanda tangan diikat ke isi: jawaban berubah → tanda tangan lama tidak berlaku.
  const sigFields = fields.filter((f) => f.tipe === 'SIGNATURE');
  if (existing && existing.jawabanHash !== hash) {
    for (const sf of sigFields) {
      const oldSig = (existing.jawaban as Record<string, unknown>)?.[sf.id];
      if (oldSig && jawaban[sf.id] === oldSig) {
        res.status(422).json({ success: false, error: { code: 'VALIDATION', message: 'Jawaban berubah — tanda tangani ulang.', fields: { [sf.id]: 'Jawaban berubah. Tanda tangani ulang.' } } });
        return;
      }
    }
  }
  const usedFileIds = Object.values(jawaban).flatMap((v) => (Array.isArray(v) ? v : [v])).map(String).filter((id) => fileMap.has(id));
  const ci = clientInfo(req);
  const result = await prisma.$transaction(async (tx) => {
    const data = {
      jawaban: jawaban as Prisma.InputJsonValue,
      autofill: autofill as Prisma.InputJsonValue,
      jawabanHash: hash,
      clientKind: ci.clientKind,
      appVersion: ci.appVersion,
      ip: ci.ip,
      jemaatId,
    };
    const r = existing
      ? await tx.universalFormResponse.update({
          where: { id: existing.id },
          data: { ...data, status: 'SUBMITTED', statusAlasan: null, perbaikiSebelum: null, editCount: { increment: 1 } },
        })
      : await tx.universalFormResponse.create({
          data: { ...data, formId, embedId: ctx.embed.id, sourceType: src.sourceType, sourceId: src.sourceId, subjekJemaatId: subject.jemaatId },
        });
    // Lampiran: yang dipakai → ditautkan; lampiran lama yang tidak dipakai lagi → dilepas & dihapus.
    if (usedFileIds.length) await tx.universalFormFile.updateMany({ where: { id: { in: usedFileIds } }, data: { responseId: r.id } });
    const dropped = existing ? existing.files.filter((f) => !usedFileIds.includes(f.id)) : [];
    if (dropped.length) await tx.universalFormFile.deleteMany({ where: { id: { in: dropped.map((f) => f.id) } } });
    // Bukti tanda tangan menyimpan hash isi yang ditandatangani.
    for (const sf of sigFields) {
      const sid = jawaban[sf.id];
      if (typeof sid === 'string') {
        const row = myFiles.find((x) => x.id === sid);
        if (row) {
          const cur = await tx.universalFormFile.findUnique({ where: { id: sid }, select: { meta: true } });
          await tx.universalFormFile.update({ where: { id: sid }, data: { meta: { ...((cur?.meta ?? {}) as object), jawabanHash: hash, responseId: r.id } } });
        }
      }
    }
    return { r, dropped };
  });
  for (const f of result.dropped) await deleteUfFile(f.storageName);
  res.status(existing ? 200 : 201).json({
    success: true,
    data: { id: result.r.id, status: result.r.status, pesanTerimaKasih: ctx.form.pesanTerimaKasih, edited: !!existing },
  });
});
