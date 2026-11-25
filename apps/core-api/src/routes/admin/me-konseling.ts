/**
 * Konseling — app jemaat 2.5.1 (Profil → Konseling), 2026-12. Mount /admin/me/konseling.
 *
 *   GET  /                         permintaan saya + isKonselor + jumlah tugas aktif
 *   POST /                         ajukan (pokok masalah, harapan, usulan jadwal, preferensi, izin kontak)
 *   GET  /assigned?status=         [konselor] permintaan yang ditugaskan ke saya
 *   GET  /assigned/:id             [konselor] detail + kontak jemaat
 *   POST /assigned/:id/schedule    [konselor] tetapkan jadwal { jadwalFinal, catatanKonselor }
 *   POST /assigned/:id/done        [konselor] tandai selesai
 *   POST /assigned/:id/release     [konselor] kembalikan ke admin { alasan }
 *   GET  /:id                      detail permintaan saya
 *   POST /:id/cancel               batalkan permintaan saya { alasan }
 */
import { Router, type Request } from 'express';
import { prisma } from '@ecc/database';
import { cancelKonselingSchema, createKonselingSchema, doneKonselingSchema, scheduleKonselingSchema } from '@ecc/shared-types';
import { BadRequest, Forbidden, NotFound, Unauthorized } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import {
  OPEN_STATUSES,
  UUID_RE,
  fmtWaktu,
  isKonselor,
  konselorView,
  notifyJemaat,
  notifyKonselor,
  ownerView,
  peopleMap,
} from '../../lib/konseling.js';

export const meKonselingRouter = Router();

function me(req: Request) {
  if (!req.user) throw Unauthorized();
  return req.user.jemaatId;
}
const pid = (v: string | undefined) => {
  if (!v || !UUID_RE.test(v)) throw NotFound('Permintaan konseling tidak ditemukan');
  return v;
};

meKonselingRouter.get('/', async (req, res) => {
  const jemaatId = me(req);
  const [rows, konselor] = await Promise.all([
    prisma.konselingRequest.findMany({ where: { jemaatId }, orderBy: { createdAt: 'desc' }, take: 50 }),
    isKonselor(jemaatId),
  ]);
  const people = await peopleMap(rows.map((r) => r.konselorId));
  const assignedOpen = konselor
    ? await prisma.konselingRequest.count({ where: { konselorId: jemaatId, status: { in: ['DITUGASKAN', 'DIJADWALKAN'] } } })
    : 0;
  res.json({ success: true, data: { items: rows.map((r) => ownerView(r, people)), isKonselor: konselor, assignedOpen } });
});

meKonselingRouter.post('/', async (req, res) => {
  const jemaatId = me(req);
  const input = createKonselingSchema.parse(req.body ?? {});
  const j = await prisma.jemaat.findUnique({ where: { id: jemaatId }, select: { cabangId: true, noHp: true, email: true } });
  if (!j) throw NotFound('Akun tidak ditemukan');
  if (!j.noHp && !j.email) throw BadRequest('Lengkapi nomor HP atau email di profil supaya konselor bisa menghubungi Anda.');
  const open = await prisma.konselingRequest.count({ where: { jemaatId, status: { in: OPEN_STATUSES } } });
  if (open >= 3) throw BadRequest('Anda masih punya 3 permintaan konseling yang berjalan. Selesaikan atau batalkan dulu.');
  const r = await prisma.konselingRequest.create({
    data: {
      jemaatId,
      cabangId: j.cabangId,
      pokokMasalah: input.pokokMasalah,
      harapan: input.harapan,
      jadwalUsulan: input.jadwalUsulan ?? null,
      catatanJadwal: input.catatanJadwal ?? null,
      preferensiGender: input.preferensiGender,
      kontakNoHp: j.noHp,
      kontakEmail: j.email,
      kontakDisetujuiAt: new Date(),
    },
  });
  audit(req, { action: 'CREATE', resource: 'konseling_request', resourceId: r.id, resourceLabel: 'Permintaan konseling' });
  res.status(201).json({ success: true, data: ownerView(r, new Map()) });
});

// ------------------------------------------------------------------ konselor

async function loadAssigned(req: Request) {
  const jemaatId = me(req);
  const r = await prisma.konselingRequest.findUnique({ where: { id: pid(req.params.id) } });
  if (!r || r.konselorId !== jemaatId) throw NotFound('Permintaan konseling tidak ditemukan');
  return { r, jemaatId };
}

meKonselingRouter.get('/assigned', async (req, res) => {
  const jemaatId = me(req);
  if (!(await isKonselor(jemaatId))) throw Forbidden('Menu ini hanya untuk konselor.');
  const st = String(req.query.status ?? 'aktif');
  const rows = await prisma.konselingRequest.findMany({
    where: { konselorId: jemaatId, status: st === 'riwayat' ? { in: ['SELESAI', 'DIBATALKAN'] } : { in: ['DITUGASKAN', 'DIJADWALKAN'] } },
    orderBy: [{ jadwalFinal: 'asc' }, { assignedAt: 'desc' }],
    take: 100,
  });
  res.json({ success: true, data: await Promise.all(rows.map((r) => konselorView(r))) });
});

meKonselingRouter.get('/assigned/:id', async (req, res) => {
  const { r } = await loadAssigned(req);
  res.json({ success: true, data: await konselorView(r) });
});

meKonselingRouter.post('/assigned/:id/schedule', async (req, res) => {
  const { r } = await loadAssigned(req);
  if (!['DITUGASKAN', 'DIJADWALKAN'].includes(r.status)) throw BadRequest('Permintaan ini sudah selesai / dibatalkan.');
  const input = scheduleKonselingSchema.parse(req.body ?? {});
  if (input.jadwalFinal.getTime() < Date.now() - 60 * 60_000) throw BadRequest('Jadwal tidak boleh di masa lalu.');
  const u = await prisma.konselingRequest.update({
    where: { id: r.id },
    data: { status: 'DIJADWALKAN', jadwalFinal: input.jadwalFinal, catatanKonselor: input.catatanKonselor ?? null },
  });
  const k = (await peopleMap([r.konselorId])).get(r.konselorId!);
  notifyJemaat(
    r.jemaatId,
    'KONSELING_SCHEDULED',
    'Jadwal konseling ditetapkan',
    `${k?.namaLengkap ?? 'Konselor'} menjadwalkan konseling ${fmtWaktu(input.jadwalFinal)}.${input.catatanKonselor ? ` ${input.catatanKonselor}` : ''}`,
    r.id,
  );
  audit(req, { action: 'UPDATE', resource: 'konseling_request', resourceId: r.id, resourceLabel: 'Konseling dijadwalkan' });
  res.json({ success: true, data: await konselorView(u) });
});

meKonselingRouter.post('/assigned/:id/done', async (req, res) => {
  const { r } = await loadAssigned(req);
  if (!['DITUGASKAN', 'DIJADWALKAN'].includes(r.status)) throw BadRequest('Permintaan ini sudah selesai / dibatalkan.');
  const input = doneKonselingSchema.parse(req.body ?? {});
  const u = await prisma.konselingRequest.update({
    where: { id: r.id },
    data: { status: 'SELESAI', selesaiAt: new Date(), ...(input.catatanKonselor ? { catatanKonselor: input.catatanKonselor } : {}) },
  });
  notifyJemaat(r.jemaatId, 'KONSELING_UPDATED', 'Konseling selesai', 'Konseling Anda ditandai selesai oleh konselor. Tuhan memberkati.', r.id);
  audit(req, { action: 'UPDATE', resource: 'konseling_request', resourceId: r.id, resourceLabel: 'Konseling selesai' });
  res.json({ success: true, data: await konselorView(u) });
});

meKonselingRouter.post('/assigned/:id/release', async (req, res) => {
  const { r } = await loadAssigned(req);
  if (!['DITUGASKAN', 'DIJADWALKAN'].includes(r.status)) throw BadRequest('Permintaan ini sudah selesai / dibatalkan.');
  const { alasan } = cancelKonselingSchema.parse(req.body ?? {});
  await prisma.konselingRequest.update({
    where: { id: r.id },
    data: { status: 'BARU', konselorId: null, assignedAt: null, assignedById: null, jadwalFinal: null, catatanKonselor: null },
  });
  notifyJemaat(r.jemaatId, 'KONSELING_UPDATED', 'Konselor sedang diganti', 'Permintaan konseling Anda akan ditugaskan ke konselor lain. Mohon menunggu.', r.id);
  audit(req, { action: 'UPDATE', resource: 'konseling_request', resourceId: r.id, resourceLabel: 'Konselor mengembalikan permintaan', metadata: { alasan: alasan ?? null } });
  res.json({ success: true, data: { released: true } });
});

// ------------------------------------------------------------------ milik saya

meKonselingRouter.get('/:id', async (req, res) => {
  const jemaatId = me(req);
  const r = await prisma.konselingRequest.findUnique({ where: { id: pid(req.params.id) } });
  if (!r || r.jemaatId !== jemaatId) throw NotFound('Permintaan konseling tidak ditemukan');
  res.json({ success: true, data: ownerView(r, await peopleMap([r.konselorId])) });
});

meKonselingRouter.post('/:id/cancel', async (req, res) => {
  const jemaatId = me(req);
  const r = await prisma.konselingRequest.findUnique({ where: { id: pid(req.params.id) } });
  if (!r || r.jemaatId !== jemaatId) throw NotFound('Permintaan konseling tidak ditemukan');
  if (!OPEN_STATUSES.includes(r.status)) throw BadRequest('Permintaan ini sudah selesai / dibatalkan.');
  const { alasan } = cancelKonselingSchema.parse(req.body ?? {});
  const u = await prisma.konselingRequest.update({
    where: { id: r.id },
    data: { status: 'DIBATALKAN', dibatalkanAt: new Date(), dibatalkanOleh: 'JEMAAT', alasanBatal: alasan ?? null },
  });
  if (r.konselorId) notifyKonselor(r.konselorId, 'Konseling dibatalkan jemaat', 'Jemaat membatalkan permintaan konseling yang ditugaskan kepada Anda.', r.id);
  audit(req, { action: 'UPDATE', resource: 'konseling_request', resourceId: r.id, resourceLabel: 'Konseling dibatalkan jemaat' });
  res.json({ success: true, data: ownerView(u, await peopleMap([u.konselorId])) });
});
