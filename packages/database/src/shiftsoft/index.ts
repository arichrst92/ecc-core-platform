/**
 * Barrel export untuk shiftsoft legacy migration utilities.
 *
 * Konsumer utama:
 *   - CLI script (run.ts, run-groups.ts, cleanup-system-accounts.ts) — sudah
 *     sekomponen di folder ini.
 *   - Backend apps/core-api — untuk preview + commit flow via UI (module 25
 *     ShiftsoftSyncJob, endpoint /admin/shiftsoft-sync/preview-jemaat).
 *
 * Yang di-export: pure utilities (mappers, normalize, types, config, client).
 * Runner scripts (run.ts, run-groups.ts) TIDAK di-export supaya konsumer
 * eksternal tidak accidentally invoke orchestrator process.
 */
export { ShiftsoftClient } from './shiftsoft-client.js';
export {
  TENANTS,
  SHIFTSOFT_BASE,
  REQUEST_DELAY_MS,
  REQUEST_TIMEOUT_MS,
  getTenant,
  getTenantHash,
} from './config.js';
export type { TenantConfig } from './config.js';
export {
  normalizePhone,
  parseLegacyDate,
  mapGender,
  mapStatusPernikahan,
  parseYesNo,
  cleanString,
} from './normalize.js';
export { mapLegacyUserToJemaat } from './mappers/jemaat.js';
export type { MappedJemaat } from './mappers/jemaat.js';
export type {
  LegacyUser,
  LegacyCircle,
  ShiftsoftSpecialAttrs,
  ShiftsoftUserListResponse,
  ShiftsoftCircleListResponse,
} from './types.js';
