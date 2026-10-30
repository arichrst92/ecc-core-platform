/**
 * Persetujuan S&K + Kebijakan Privasi (mobile/web) — /admin/me/consent
 *
 *   GET  → ConsentStatus { required, current, latest }
 *   POST → catat persetujuan versi dokumen yang sedang terbit
 */
import { Router } from 'express';
import { prisma } from '@ecc/database';
import { consentAcceptSchema } from '@ecc/shared-types';
import { BadRequest, NotFound, Unauthorized } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { ageFrom, assertAgeAllowed, getConsentStatus, recordConsent } from '../../lib/consent.js';

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

  // Koreksi tanggal lahir oleh jemaat (data impor bisa salah) sebelum cek usia.
  let tanggalLahir = jemaat.tanggalLahir;
  if (input.tanggalLahir) {
    const baru = new Date(`${input.tanggalLahir}T00:00:00.000Z`);
    const age = ageFrom(baru);
    if (age == null || baru.getTime() > Date.now() || age > 120) throw BadRequest('Tanggal lahir tidak valid.');
    const lama = jemaat.tanggalLahir?.toISOString().slice(0, 10) ?? null;
    if (lama !== input.tanggalLahir) {
      await prisma.jemaat.update({ where: { id: jemaatId }, data: { tanggalLahir: baru } });
      audit(req, {
        action: 'UPDATE',
        resource: 'jemaat',
        resourceId: jemaatId,
        resourceLabel: 'Koreksi tanggal lahir (layar persetujuan)',
        metadata: { from: lama, to: input.tanggalLahir, kind: 'self-dob-correction' },
      });
    }
    tanggalLahir = baru;
  }
  assertAgeAllowed(tanggalLahir, input.ageGroup);

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
