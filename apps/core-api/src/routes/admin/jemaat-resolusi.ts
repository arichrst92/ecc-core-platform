/**
 * Resolusi Tahunan jemaat — portal (read-only) — /admin/jemaat/:jemaatId/resolusi?tahun=
 * Akses: menu "jemaat" (read).
 */
import { Router } from 'express';
import { resolusiTahunSchema } from '@ecc/shared-types';
import { NotFound } from '../../lib/errors.js';
import { UUID_RE } from '../../lib/prayer.js';
import { loadResolusi } from '../../lib/resolusi.js';
import { requireMenu } from '../../middleware/require-menu.js';

export const jemaatResolusiRouter = Router({ mergeParams: true });

jemaatResolusiRouter.get('/', requireMenu('jemaat'), async (req, res) => {
  const jemaatId = (req.params as Record<string, string>).jemaatId ?? '';
  if (!UUID_RE.test(jemaatId)) throw NotFound('Jemaat tidak ditemukan');
  const parsed = resolusiTahunSchema.safeParse(req.query.tahun);
  const data = await loadResolusi(jemaatId, parsed.success ? parsed.data : new Date().getFullYear());
  res.json({ success: true, data });
});
