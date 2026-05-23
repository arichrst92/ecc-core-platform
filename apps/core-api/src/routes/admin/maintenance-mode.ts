/**
 * Admin Maintenance Mode — global on/off flag untuk mobile force-pause.
 *
 * Singleton row di `maintenance_mode` table dengan id="global".
 *
 *   - GET /admin/maintenance-mode  → current status
 *   - PUT /admin/maintenance-mode  → set status (toggle + message + duration)
 *
 * Mobile pakai GET /public/maintenance (no auth, lihat public-unauth.ts).
 */
import { Router } from 'express';
import { prisma } from '@ecc/database';
import { setMaintenanceModeSchema } from '@ecc/shared-types';
import { Unauthorized } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';

export const maintenanceModeRouter = Router();

const SINGLETON_ID = 'global';

/** Lazy-create singleton kalau belum ada (seeded di migration tapi defensive). */
async function getOrCreateSingleton() {
  let row = await prisma.maintenanceMode.findUnique({ where: { id: SINGLETON_ID } });
  if (!row) {
    row = await prisma.maintenanceMode.create({
      data: { id: SINGLETON_ID, isEnabled: false },
    });
  }
  return row;
}

maintenanceModeRouter.get('/', async (_req, res) => {
  const row = await getOrCreateSingleton();
  res.json({ success: true, data: row });
});

maintenanceModeRouter.put('/', async (req, res) => {
  if (!req.user) throw Unauthorized();
  const input = setMaintenanceModeSchema.parse(req.body);
  const before = await getOrCreateSingleton();

  const now = new Date();
  const startedAt = input.isEnabled ? (before.isEnabled && before.startedAt ? before.startedAt : now) : null;
  const estimatedEndAt =
    input.isEnabled && input.durationMinutes
      ? new Date(now.getTime() + input.durationMinutes * 60 * 1000)
      : null;

  const updated = await prisma.maintenanceMode.upsert({
    where: { id: SINGLETON_ID },
    create: {
      id: SINGLETON_ID,
      isEnabled: input.isEnabled,
      message: input.message ?? null,
      startedAt,
      estimatedEndAt,
      updatedByUserId: req.user.sub,
    },
    update: {
      isEnabled: input.isEnabled,
      message: input.message ?? null,
      startedAt,
      estimatedEndAt,
      updatedByUserId: req.user.sub,
    },
  });

  audit(req, {
    action: 'UPDATE',
    resource: 'maintenance_mode',
    resourceId: SINGLETON_ID,
    resourceLabel: `Maintenance ${updated.isEnabled ? 'ENABLED' : 'DISABLED'}${input.durationMinutes ? ` (${input.durationMinutes} menit)` : ''}`,
    before,
    after: updated,
    metadata: {
      kind: 'maintenance-mode-toggle',
      isEnabled: updated.isEnabled,
      durationMinutes: input.durationMinutes,
    },
  });

  res.json({ success: true, data: updated });
});
