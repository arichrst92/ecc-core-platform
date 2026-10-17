/**
 * Privasi data pribadi (mobile) — /admin/me/privacy
 *
 *   GET → { settings, discoverableByPhone, fields, audiences, defaults }
 *   PUT → { settings?: { [field]: Audience[] }, discoverableByPhone?: boolean }
 */
import { Router } from 'express';
import { prisma, Prisma } from '@ecc/database';
import { z } from 'zod';
import { Unauthorized } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { AUDIENCES, DEFAULT_PRIVACY, PRIVACY_FIELDS, getPrivacy, normalizePrivacy } from '../../lib/privacy.js';

export const mePrivacyRouter = Router();

function meId(req: { user?: { jemaatId: string } }) {
  if (!req.user) throw Unauthorized();
  return req.user.jemaatId;
}

mePrivacyRouter.get('/', async (req, res) => {
  const p = await getPrivacy(meId(req));
  res.json({
    success: true,
    data: { ...p, fields: PRIVACY_FIELDS, audiences: AUDIENCES, defaults: DEFAULT_PRIVACY },
  });
});

const audienceArr = z.array(z.enum(AUDIENCES)).max(AUDIENCES.length);
const putSchema = z.object({
  settings: z.object(Object.fromEntries(PRIVACY_FIELDS.map((f) => [f, audienceArr.optional()])) as Record<(typeof PRIVACY_FIELDS)[number], z.ZodOptional<typeof audienceArr>>).optional(),
  discoverableByPhone: z.boolean().optional(),
});

mePrivacyRouter.put('/', async (req, res) => {
  const jemaatId = meId(req);
  const body = putSchema.parse(req.body ?? {});
  const current = await getPrivacy(jemaatId);
  const merged = normalizePrivacy({ ...current.settings, ...(body.settings ?? {}) });
  const discoverableByPhone = body.discoverableByPhone ?? current.discoverableByPhone;
  await prisma.jemaatPrivacy.upsert({
    where: { jemaatId },
    create: { jemaatId, settings: merged as unknown as Prisma.InputJsonValue, discoverableByPhone },
    update: { settings: merged as unknown as Prisma.InputJsonValue, discoverableByPhone },
  });
  audit(req, {
    action: 'UPDATE',
    resource: 'jemaat_privacy',
    resourceLabel: 'Ubah pengaturan privasi',
    metadata: { kind: 'privacy', jemaatId },
  });
  res.json({ success: true, data: { settings: merged, discoverableByPhone }, message: 'Pengaturan privasi disimpan.' });
});
