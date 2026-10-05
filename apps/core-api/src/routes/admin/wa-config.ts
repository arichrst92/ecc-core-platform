/**
 * WA Notification Config router.
 * GET  /admin/wa-config          → list semua config (grouped by category)
 * PATCH /admin/wa-config/:type    → update isEnabled + template
 * POST /admin/wa-config/:type/test → kirim test ke noHp requester
 */
import { Router } from 'express';
import { prisma } from '@ecc/database';
import { BadRequest, NotFound, Unauthorized } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import {
  invalidateWaConfigCache,
  renderTemplate,
  type WaNotifType,
} from '../../lib/wa-notif.js';
import { sendWhatsAppText } from '@ecc/auth';

export const waConfigRouter = Router();

waConfigRouter.get('/', async (_req, res) => {
  const rows = await prisma.waNotificationConfig.findMany({
    orderBy: [{ category: 'asc' }, { label: 'asc' }],
  });
  res.json({ success: true, data: rows });
});

waConfigRouter.get('/:type', async (req, res) => {
  const row = await prisma.waNotificationConfig.findUnique({
    where: { type: req.params.type },
  });
  if (!row) throw NotFound('Config tidak ditemukan');
  res.json({ success: true, data: row });
});

waConfigRouter.patch('/:type', async (req, res) => {
  const body = req.body ?? {};
  const before = await prisma.waNotificationConfig.findUnique({
    where: { type: req.params.type },
  });
  if (!before) throw NotFound('Config tidak ditemukan');

  const data: Record<string, unknown> = {};
  if (typeof body.isEnabled === 'boolean') data.isEnabled = body.isEnabled;
  if (typeof body.template === 'string' && body.template.trim()) {
    data.template = body.template.trim();
  }
  if (!req.user) throw Unauthorized();
  data.updatedById = req.user.jemaatId;

  const updated = await prisma.waNotificationConfig.update({
    where: { type: req.params.type },
    data,
  });

  invalidateWaConfigCache(req.params.type as WaNotifType);

  audit(req, {
    action: 'UPDATE',
    resource: 'wa_notification_config',
    resourceId: updated.id,
    resourceLabel: updated.label,
    before,
    after: updated,
    metadata: { kind: 'wa-config-update' },
  });

  res.json({ success: true, data: updated });
});

/**
 * POST /admin/wa-config/:type/test
 * Body: { noHp?, placeholders? }
 * Kirim test message dgn template current ke noHp (default: user current).
 */
waConfigRouter.post('/:type/test', async (req, res) => {
  if (!req.user) throw Unauthorized();
  const row = await prisma.waNotificationConfig.findUnique({
    where: { type: req.params.type },
  });
  if (!row) throw NotFound('Config tidak ditemukan');

  const body = req.body ?? {};
  let noHp: string | null = typeof body.noHp === 'string' ? body.noHp : null;
  if (!noHp) {
    const self = await prisma.jemaat.findUnique({
      where: { id: req.user.jemaatId },
      select: { noHp: true },
    });
    noHp = self?.noHp ?? null;
  }
  if (!noHp) throw BadRequest('noHp wajib (atau user current harus punya noHp).');

  // Dummy placeholders — gabung default + user-provided
  const defaults: Record<string, string> = {
    nama: 'Jemaat Test',
    event_judul: 'Event Sample',
    event_tanggal: '12 Oktober 2026',
    tanggal: '12 Oktober 2026',
    jam: '09:00',
    lokasi: 'Sanctuary',
    ibadah_nama: 'Ibadah Umum',
    group_nama: 'Group Sample',
    by_nama: 'Admin',
    tipe_relasi: 'Suami',
    ministry_nama: 'Worship Team',
    posisi: 'Vocalist',
    notes: '',
    status: 'MENUNGGU_VERIFIKASI',
    usia: '30',
  };
  const placeholders = { ...defaults, ...(body.placeholders ?? {}) };
  const message = renderTemplate(row.template, placeholders);
  try {
    const result = await sendWhatsAppText(noHp, message);
    audit(req, {
      action: 'UPDATE',
      resource: 'wa_notification_config',
      resourceId: row.id,
      resourceLabel: `TEST send ${row.label} → ${noHp}`,
      metadata: { kind: 'wa-config-test', noHp, messageId: result.messageId },
    });
    res.json({ success: true, data: { sent: true, noHp, preview: message, messageId: result.messageId } });
  } catch (err) {
    audit(req, {
      action: 'UPDATE',
      resource: 'wa_notification_config',
      resourceId: row.id,
      resourceLabel: `TEST send FAILED → ${noHp}`,
      metadata: { kind: 'wa-config-test-failed', noHp, err: (err as Error).message },
    });
    return res
      .status(502)
      .json({ success: false, error: { code: 'WA_SEND_FAILED', message: (err as Error).message } });
  }
});
