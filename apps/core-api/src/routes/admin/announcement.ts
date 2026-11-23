/**
 * Portal → Broadcast → Announcement  (/admin/announcement, menu 'announcement')
 *
 *   GET    /                    daftar (?status=&q=&page=&limit=) + laporan per kanal
 *   GET    /targets?q=          pilihan penerima: cabang, area, homecell, + cari jemaat
 *   POST   /preview             { audience } → jumlah penerima (total / punya WA / punya email) + contoh
 *   POST   /                    buat draft
 *   GET    /:id                 detail + laporan
 *   PATCH  /:id                 ubah (hanya DRAFT / SCHEDULED)
 *   DELETE /:id                 hapus (bukan SENDING)
 *   POST   /:id/banner          unggah banner 16:9 (maks 5 MB)
 *   DELETE /:id/banner
 *   POST   /:id/send            { mode: 'now' | 'schedule', scheduledAt? }
 *   POST   /:id/cancel          batalkan jadwal → DRAFT
 *   POST   /:id/duplicate       salin jadi draft baru
 *   GET    /:id/recipients      daftar penerima + status per kanal (?channel=&status=&page=)
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma, Prisma } from '@ecc/database';
import { requireMenu } from '../../middleware/require-menu.js';
import { BadRequest, Conflict, NotFound, Unauthorized } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { flexImageUpload } from '../../lib/image-upload.js';
import { deleteAnnouncementBanner, saveAnnouncementBanner } from '../../lib/storage.js';
import {
  ANNOUNCEMENT_CHANNELS,
  announcementStats,
  emptyStats,
  makeSlug,
  parseLinks,
  previewAudience,
  publicPageUrl,
  tickAnnouncements,
  WA_DELAY_MS, ELS_APP_USER } from '../../lib/announcement.js';

export const announcementRouter = Router();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const audienceSchema = z.object({
  audienceMode: z.enum(['ALL', 'FILTER']).default('ALL'),
  combine: z.enum(['OR', 'AND']).default('OR'),
  cabangIds: z.array(z.string().uuid()).max(200).default([]),
  areaIds: z.array(z.string().uuid()).max(500).default([]),
  homecellIds: z.array(z.string().uuid()).max(1000).default([]),
  jemaatIds: z.array(z.string().uuid()).max(2000).default([]),
});
const linkSchema = z.object({ label: z.string().trim().min(1).max(60), url: z.string().trim().url().max(500).regex(/^https?:\/\//i, 'URL harus http(s)') });
const bodySchema = z
  .object({
    judul: z.string().trim().min(3, 'Judul minimal 3 karakter').max(200),
    isi: z.string().trim().min(1, 'Isi pesan wajib diisi').max(10_000),
    links: z.array(linkSchema).max(5).default([]),
    channels: z.array(z.enum(['IN_APP', 'WHATSAPP', 'EMAIL'])).min(1, 'Pilih minimal satu kanal').default(['IN_APP']),
    waProvider: z.enum(['auto', 'fonnte']).default('auto'),
  })
  .merge(audienceSchema);

const menuRead = requireMenu('announcement', 'read');
const menuWrite = requireMenu('announcement', 'write');
const menuDelete = requireMenu('announcement', 'delete');

function userId(req: { user?: { sub: string } }) {
  if (!req.user) throw Unauthorized();
  return req.user.sub;
}

function serialize<T extends { links: unknown; slug: string }>(a: T, stats = emptyStats()) {
  return { ...a, links: parseLinks(a.links), publicUrl: publicPageUrl(a.slug), stats };
}

// ---------------- daftar
announcementRouter.get('/', menuRead, async (req, res) => {
  const page = Math.max(1, Number(req.query.page ?? 1) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20) || 20));
  const status = typeof req.query.status === 'string' && req.query.status ? req.query.status.toUpperCase() : null;
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const where: Prisma.AnnouncementWhereInput = {
    ...(status ? { status: status === 'SENT' ? { in: ['SENT', 'SENDING'] } : status } : {}),
    ...(q ? { judul: { contains: q, mode: 'insensitive' } } : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.announcement.findMany({ where, orderBy: [{ updatedAt: 'desc' }], skip: (page - 1) * limit, take: limit }),
    prisma.announcement.count({ where }),
  ]);
  const stats = await announcementStats(rows.map((r) => r.id));
  res.json({
    success: true,
    data: rows.map((r) => serialize(r, stats.get(r.id) ?? emptyStats())),
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

// ---------------- pilihan penerima
announcementRouter.get('/targets', menuRead, async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const [cabang, areas, homecells, jemaat] = await Promise.all([
    prisma.cabangGereja.findMany({ where: { isActive: true }, select: { id: true, nama: true }, orderBy: { nama: 'asc' } }),
    prisma.homecellArea.findMany({
      where: { isActive: true },
      select: { id: true, nama: true, cabang: { select: { nama: true } } },
      orderBy: { nama: 'asc' },
    }),
    prisma.homecell.findMany({
      where: { isActive: true },
      select: { id: true, nama: true, area: { select: { nama: true, cabang: { select: { nama: true } } } } },
      orderBy: { nama: 'asc' },
    }),
    q.length >= 2
      ? prisma.jemaat.findMany({
          where: {
            isActive: true,
            isTamu: false,
            // Hanya jemaat yang sudah aktif di Els App (penerima pengumuman).
            ...ELS_APP_USER,
            OR: [{ namaLengkap: { contains: q, mode: 'insensitive' } }, { kode: { contains: q, mode: 'insensitive' } }],
          },
          select: { id: true, namaLengkap: true, kode: true, cabang: { select: { nama: true } } },
          orderBy: { namaLengkap: 'asc' },
          take: 20,
        })
      : Promise.resolve([]),
  ]);
  res.json({
    success: true,
    data: {
      cabang,
      areas: areas.map((a) => ({ id: a.id, nama: a.nama, cabang: a.cabang?.nama ?? null })),
      homecells: homecells.map((h) => ({ id: h.id, nama: h.nama, area: h.area?.nama ?? null, cabang: h.area?.cabang?.nama ?? null })),
      jemaat: jemaat.map((j) => ({ id: j.id, nama: j.namaLengkap, kode: j.kode, cabang: j.cabang?.nama ?? null })),
    },
  });
});

/** Nama untuk id yang tersimpan (chip di form saat mengubah). */
announcementRouter.post('/target-names', menuRead, async (req, res) => {
  const a = audienceSchema.parse(req.body ?? {});
  const [cabang, areas, homecells, jemaat] = await Promise.all([
    a.cabangIds.length ? prisma.cabangGereja.findMany({ where: { id: { in: a.cabangIds } }, select: { id: true, nama: true } }) : [],
    a.areaIds.length ? prisma.homecellArea.findMany({ where: { id: { in: a.areaIds } }, select: { id: true, nama: true } }) : [],
    a.homecellIds.length ? prisma.homecell.findMany({ where: { id: { in: a.homecellIds } }, select: { id: true, nama: true } }) : [],
    a.jemaatIds.length
      ? prisma.jemaat.findMany({ where: { id: { in: a.jemaatIds } }, select: { id: true, namaLengkap: true, kode: true } })
      : [],
  ]);
  res.json({ success: true, data: { cabang, areas, homecells, jemaat: jemaat.map((j) => ({ id: j.id, nama: j.namaLengkap, kode: j.kode })) } });
});

announcementRouter.post('/preview', menuRead, async (req, res) => {
  const a = audienceSchema.parse(req.body ?? {});
  const p = await previewAudience(a);
  res.json({ success: true, data: { ...p, waDelaySeconds: Math.round(WA_DELAY_MS / 1000) } });
});

// ---------------- CRUD
announcementRouter.post('/', menuWrite, async (req, res) => {
  const uid = userId(req);
  const input = bodySchema.parse(req.body ?? {});
  const created = await prisma.announcement.create({
    data: { ...input, links: input.links, slug: makeSlug(input.judul), status: 'DRAFT', createdById: uid, updatedById: uid },
  });
  audit(req, { action: 'CREATE', resource: 'announcement', resourceId: created.id, resourceLabel: created.judul, after: created });
  res.status(201).json({ success: true, data: serialize(created) });
});

async function findOr404(id: string | undefined) {
  if (!id || !UUID.test(id)) throw NotFound('Announcement tidak ditemukan');
  const a = await prisma.announcement.findUnique({ where: { id } });
  if (!a) throw NotFound('Announcement tidak ditemukan');
  return a;
}

announcementRouter.get('/:id', menuRead, async (req, res) => {
  const a = await findOr404(req.params.id);
  const stats = await announcementStats([a.id]);
  res.json({ success: true, data: serialize(a, stats.get(a.id) ?? emptyStats()) });
});

announcementRouter.patch('/:id', menuWrite, async (req, res) => {
  const uid = userId(req);
  const before = await findOr404(req.params.id);
  if (before.status !== 'DRAFT' && before.status !== 'SCHEDULED') {
    throw Conflict('Announcement yang sedang / sudah dikirim tidak bisa diubah. Gunakan Duplikat.');
  }
  const input = bodySchema.partial().parse(req.body ?? {});
  const updated = await prisma.announcement.update({ where: { id: before.id }, data: { ...input, updatedById: uid } });
  audit(req, { action: 'UPDATE', resource: 'announcement', resourceId: updated.id, resourceLabel: updated.judul, before, after: updated });
  res.json({ success: true, data: serialize(updated) });
});

announcementRouter.delete('/:id', menuDelete, async (req, res) => {
  const before = await findOr404(req.params.id);
  if (before.status === 'SENDING') throw Conflict('Announcement sedang dikirim — tunggu sampai selesai.');
  await prisma.announcement.delete({ where: { id: before.id } });
  await deleteAnnouncementBanner(before.bannerUrl);
  audit(req, { action: 'DELETE', resource: 'announcement', resourceId: before.id, resourceLabel: before.judul, before });
  res.status(204).end();
});

// ---------------- banner
announcementRouter.post('/:id/banner', menuWrite, flexImageUpload({ maxBytes: 5 * 1024 * 1024 }), async (req, res) => {
  const a = await findOr404(req.params.id);
  if (a.status !== 'DRAFT' && a.status !== 'SCHEDULED') throw Conflict('Banner tidak bisa diubah setelah dikirim.');
  if (!req.file) throw BadRequest('File gambar wajib (multipart).');
  const bannerUrl = await saveAnnouncementBanner(a.id, req.file.buffer);
  await deleteAnnouncementBanner(a.bannerUrl);
  const updated = await prisma.announcement.update({ where: { id: a.id }, data: { bannerUrl } });
  audit(req, { action: 'UPLOAD_PHOTO', resource: 'announcement', resourceId: a.id, resourceLabel: `${a.judul} (banner)` });
  res.json({ success: true, data: serialize(updated) });
});

announcementRouter.delete('/:id/banner', menuWrite, async (req, res) => {
  const a = await findOr404(req.params.id);
  if (a.status !== 'DRAFT' && a.status !== 'SCHEDULED') throw Conflict('Banner tidak bisa diubah setelah dikirim.');
  await deleteAnnouncementBanner(a.bannerUrl);
  const updated = await prisma.announcement.update({ where: { id: a.id }, data: { bannerUrl: null } });
  res.json({ success: true, data: serialize(updated) });
});

// ---------------- kirim / jadwal
const sendSchema = z.object({ mode: z.enum(['now', 'schedule']), scheduledAt: z.string().datetime({ offset: true }).optional() });

announcementRouter.post('/:id/send', menuWrite, async (req, res) => {
  const uid = userId(req);
  const a = await findOr404(req.params.id);
  if (a.status !== 'DRAFT' && a.status !== 'SCHEDULED') throw Conflict('Announcement ini sudah dikirim.');
  const input = sendSchema.parse(req.body ?? {});
  const channels = a.channels.filter((c) => (ANNOUNCEMENT_CHANNELS as string[]).includes(c));
  if (!channels.length) throw BadRequest('Pilih minimal satu kanal.');
  const preview = await previewAudience(
    {
      audienceMode: a.audienceMode === 'FILTER' ? 'FILTER' : 'ALL',
      combine: a.combine === 'AND' ? 'AND' : 'OR',
      cabangIds: a.cabangIds,
      areaIds: a.areaIds,
      homecellIds: a.homecellIds,
      jemaatIds: a.jemaatIds,
    },
    0,
  );
  if (preview.total === 0) throw BadRequest('Tidak ada penerima yang cocok dengan saringan ini.');

  let scheduledAt = new Date();
  if (input.mode === 'schedule') {
    if (!input.scheduledAt) throw BadRequest('Isi tanggal & jam kirim.');
    scheduledAt = new Date(input.scheduledAt);
    if (scheduledAt.getTime() < Date.now() - 60_000) throw BadRequest('Waktu kirim sudah lewat.');
  }
  const updated = await prisma.announcement.update({
    where: { id: a.id },
    data: { status: 'SCHEDULED', scheduledAt, updatedById: uid },
  });
  audit(req, {
    action: 'UPDATE',
    resource: 'announcement',
    resourceId: a.id,
    resourceLabel: a.judul,
    metadata: { kind: input.mode === 'now' ? 'announcement-send' : 'announcement-schedule', scheduledAt, recipients: preview.total, channels },
  });
  if (input.mode === 'now') void tickAnnouncements().catch(() => undefined);
  res.json({ success: true, data: serialize(updated) });
});

announcementRouter.post('/:id/cancel', menuWrite, async (req, res) => {
  const a = await findOr404(req.params.id);
  const r = await prisma.announcement.updateMany({ where: { id: a.id, status: 'SCHEDULED' }, data: { status: 'DRAFT', scheduledAt: null } });
  if (r.count !== 1) throw Conflict('Hanya announcement terjadwal (belum dikirim) yang bisa dibatalkan.');
  audit(req, { action: 'UPDATE', resource: 'announcement', resourceId: a.id, resourceLabel: a.judul, metadata: { kind: 'announcement-cancel' } });
  res.json({ success: true, data: serialize({ ...a, status: 'DRAFT', scheduledAt: null }) });
});

announcementRouter.post('/:id/duplicate', menuWrite, async (req, res) => {
  const uid = userId(req);
  const a = await findOr404(req.params.id);
  const judul = `${a.judul} (salinan)`.slice(0, 200);
  const created = await prisma.announcement.create({
    data: {
      judul,
      isi: a.isi,
      bannerUrl: a.bannerUrl,
      links: a.links as Prisma.InputJsonValue,
      audienceMode: a.audienceMode,
      combine: a.combine,
      cabangIds: a.cabangIds,
      areaIds: a.areaIds,
      homecellIds: a.homecellIds,
      jemaatIds: a.jemaatIds,
      channels: a.channels,
      waProvider: a.waProvider,
      slug: makeSlug(judul),
      status: 'DRAFT',
      createdById: uid,
      updatedById: uid,
    },
  });
  audit(req, { action: 'CREATE', resource: 'announcement', resourceId: created.id, resourceLabel: created.judul, metadata: { duplicatedFrom: a.id } });
  res.status(201).json({ success: true, data: serialize(created) });
});

// ---------------- penerima
announcementRouter.get('/:id/recipients', menuRead, async (req, res) => {
  const a = await findOr404(req.params.id);
  const page = Math.max(1, Number(req.query.page ?? 1) || 1);
  const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 50) || 50));
  const channel = typeof req.query.channel === 'string' ? req.query.channel : '';
  const status = typeof req.query.status === 'string' ? req.query.status.toUpperCase() : '';
  const where: Prisma.AnnouncementRecipientWhereInput = { announcementId: a.id };
  if (channel === 'WHATSAPP' && status) where.waStatus = status;
  if (channel === 'EMAIL' && status) where.emailStatus = status;
  if (channel === 'IN_APP' && status === 'READ') where.readAt = { not: null };
  const [rows, total] = await Promise.all([
    prisma.announcementRecipient.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { jemaat: { namaLengkap: 'asc' } },
      select: {
        id: true,
        inAppStatus: true,
        waStatus: true,
        waError: true,
        waAt: true,
        emailStatus: true,
        emailError: true,
        emailAt: true,
        readAt: true,
        jemaat: { select: { id: true, namaLengkap: true, kode: true, cabang: { select: { nama: true } } } },
      },
    }),
    prisma.announcementRecipient.count({ where }),
  ]);
  res.json({
    success: true,
    data: rows.map((r) => ({ ...r, jemaat: { id: r.jemaat.id, nama: r.jemaat.namaLengkap, kode: r.jemaat.kode, cabang: r.jemaat.cabang?.nama ?? null } })),
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});
