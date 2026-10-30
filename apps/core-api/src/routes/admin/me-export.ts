/**
 * Unduh data saya — /admin/me/export (kepatuhan no. 6 · hak akses UU PDP,
 * portabilitas PDPA Malaysia, APP 12).
 *
 *   POST /link → { url, expiresInSec } — link bertanda tangan 10 menit ke
 *                print view PDF salinan data pribadi (format sama dengan
 *                Export PDF di Portal → detail jemaat, plus persetujuan,
 *                pengaturan pesan, prayer request, Bible 365 & hak jemaat).
 *
 * Dibatasi 3x per jam per jemaat; setiap permintaan dicatat di Audit Log.
 */
import { Router } from 'express';
import { TooManyRequests, Unauthorized } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { createReportToken } from '../../lib/report-link.js';
import { apiBase } from '../../lib/worship.js';

export const meExportRouter = Router();

const LINK_TTL_SEC = 10 * 60;
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 3;
const hits = new Map<string, number[]>();

function rateLimit(jemaatId: string) {
  const now = Date.now();
  const recent = (hits.get(jemaatId) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) throw TooManyRequests('Batas unduh data tercapai. Coba lagi dalam 1 jam.');
  recent.push(now);
  hits.set(jemaatId, recent);
}

meExportRouter.post('/link', async (req, res) => {
  if (!req.user) throw Unauthorized();
  const jemaatId = req.user.jemaatId;
  rateLimit(jemaatId);
  const token = createReportToken({ k: 'self', id: jemaatId }, LINK_TTL_SEC);
  audit(req, {
    action: 'UPDATE',
    resource: 'personal_data_export',
    resourceId: jemaatId,
    resourceLabel: 'Unduh data saya (PDF)',
    metadata: { kind: 'self-export' },
  });
  res.json({ success: true, data: { url: `${apiBase(req)}/public/report/${token}`, expiresInSec: LINK_TTL_SEC } });
});
