/**
 * Persetujuan S&K + Kebijakan Privasi (mobile/web) — /admin/me/consent
 *
 *   GET  → ConsentStatus { required, current, latest }
 *   POST → catat persetujuan versi dokumen yang sedang terbit
 */
import { Router } from 'express';
import { prisma } from '@ecc/database';
import { consentAcceptSchema } from '@ecc/shared-types';
import { NotFound, Unauthorized } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { assertAgeAllowed, getConsentStatus, recordConsent } from '../../lib/consent.js';

export const meConsentRouter = Router();

function meId(req: { user?: { jemaatId: string } }) {
  if (!req.user) throw Unauthorized();
  return req.user.jemaatId;
}

meConsentRouter.get('/', async (req, res) => {
  res.json({ success: true, data: await getConsentStatus(meId(req)) });
});

meConsentRouter.post('/', async (req, res) => {
  const jemaatId = meId(req);
  const input = consentAcceptSchema.parse(req.body ?? {});
  const jemaat = await prisma.jemaat.findUnique({ where: { id: jemaatId }, select: { tanggalLahir: true } });
  if (!jemaat) throw NotFound('Jemaat tidak ditemukan');
  assertAgeAllowed(jemaat.tanggalLahir, input.ageGroup);

  const row = await recordConsent(prisma, req, jemaatId, input, 'RECONSENT');
  audit(req, {
    action: 'CREATE',
    resource: 'user_consent',
    resourceId: row.id,
    resourceLabel: `Persetujuan S&K ${row.termsVersion} · Privasi ${row.privacyVersion}`,
    metadata: { ageGroup: row.ageGroup, platform: row.platform },
  });
  res.status(201).json({ success: true, data: await getConsentStatus(jemaatId) });
});
