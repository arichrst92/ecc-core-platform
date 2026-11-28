/**
 * Pencatat aktivitas Els App per jemaat per bulan per platform (Forecast, 2026-11).
 *
 * Dipanggil untuk setiap request /admin/* yang sudah login. Hanya request dari
 * Els App (header X-Client: mobile — iOS, Android & Els App web), bukan Portal.
 * Platform dari X-App-Version ("2.5.1/ios"); app lama tanpa platform → dari
 * User-Agent. Satu tulis per jemaat × platform × hari (penanda di memori), tidak
 * menunggu database — request tidak pernah melambat / gagal karena ini.
 */
import type { NextFunction, Request, Response } from 'express';
import { prisma } from '@ecc/database';
import { isMobileClient } from './client-kind.js';
import { logger } from './logger.js';
import { todayInTz } from './tz.js';

const TZ = 'Asia/Jakarta';
const seen = new Set<string>();
let seenDay = '';

export function platformOf(req: Request): 'ios' | 'android' | 'web' | 'lainnya' {
  const p = ((req.get('x-app-version') ?? '').split('/')[1] ?? '').trim().toLowerCase();
  if (p === 'ios' || p === 'android' || p === 'web') return p;
  const ua = (req.get('user-agent') ?? '').toLowerCase();
  if (ua.includes('okhttp')) return 'android';
  if (ua.includes('cfnetwork') || ua.includes('darwin')) return 'ios';
  if (ua.includes('mozilla')) return 'web';
  return 'lainnya';
}

export function trackAppActivity(req: Request, _res: Response, next: NextFunction) {
  try {
    const jemaatId = req.user?.jemaatId;
    if (jemaatId && !req.pat && isMobileClient(req)) {
      const day = todayInTz(TZ);
      const dayKey = day.toISOString().slice(0, 10);
      if (dayKey !== seenDay) {
        seen.clear();
        seenDay = dayKey;
      }
      const platform = platformOf(req);
      const key = `${jemaatId}|${platform}`;
      if (!seen.has(key)) {
        seen.add(key);
        const month = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 1));
        const now = new Date();
        void prisma.$executeRaw`
          INSERT INTO jemaat_activity_monthly (month, jemaat_id, platform, days, first_seen, last_seen, source)
          VALUES (${month}::date, ${jemaatId}::uuid, ${platform}, 1, ${now}, ${now}, 'live')
          ON CONFLICT (month, jemaat_id, platform) DO UPDATE SET
            days = CASE WHEN jemaat_activity_monthly.source = 'riwayat' THEN EXCLUDED.days ELSE jemaat_activity_monthly.days + 1 END,
            last_seen = EXCLUDED.last_seen,
            source = 'live'`.catch((e) => {
          seen.delete(key);
          logger.debug({ err: e }, 'app-activity: gagal mencatat');
        });
      }
    }
  } catch {
    /* jangan pernah mengganggu request */
  }
  next();
}
