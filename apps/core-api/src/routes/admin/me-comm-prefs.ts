/**
 * Preferensi pesan WhatsApp jemaat — /admin/me/communication
 *
 *   GET → { waReminders, waGreetings, waUpdates }
 *   PUT → ubah sebagian/semua (boolean)
 */
import { Router } from 'express';
import { prisma } from '@ecc/database';
import { z } from 'zod';
import { Unauthorized } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { getCommPrefs } from '../../lib/comm-prefs.js';

export const meCommPrefsRouter = Router();

function meId(req: { user?: { jemaatId: string } }) {
  if (!req.user) throw Unauthorized();
  return req.user.jemaatId;
}

meCommPrefsRouter.get('/', async (req, res) => {
  res.json({ success: true, data: await getCommPrefs(meId(req)) });
});

const putSchema = z
  .object({ waReminders: z.boolean(), waGreetings: z.boolean(), waUpdates: z.boolean() })
  .partial();

meCommPrefsRouter.put('/', async (req, res) => {
  const jemaatId = meId(req);
  const body = putSchema.parse(req.body ?? {});
  const saved = await prisma.jemaatPrivacy.upsert({
    where: { jemaatId },
    create: { jemaatId, ...body },
    update: body,
    select: { waReminders: true, waGreetings: true, waUpdates: true },
  });
  audit(req, {
    action: 'UPDATE',
    resource: 'communication_prefs',
    resourceId: jemaatId,
    resourceLabel: 'Preferensi pesan WhatsApp',
    metadata: body,
  });
  res.json({ success: true, data: saved });
});
