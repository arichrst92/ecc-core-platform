/**
 * Maintenance Mode — global flag untuk mobile force-pause.
 *
 * Singleton row di backend dengan id="global". Admin upsert untuk toggle
 * on/off + set message + durasi. Public endpoint (no auth) untuk mobile
 * polling.
 */
import { z } from 'zod';
import { emptyToUndefined } from './common.js';

/**
 * Admin PUT body — set status maintenance.
 *
 * Field semantics:
 *   - isEnabled: required (true=aktifkan, false=matikan)
 *   - message: optional. Default text disediakan kalau null.
 *   - durationMinutes: hanya berlaku saat enable + di-set non-null.
 *     Server compute estimatedEndAt = now + durationMinutes.
 *     null/undefined → estimatedEndAt null (mobile tampil tanpa countdown).
 */
export const setMaintenanceModeSchema = z.object({
  isEnabled: z.boolean(),
  message: emptyToUndefined(z.string().trim().max(1000)),
  /**
   * Durasi estimasi maintenance dalam menit. Range 1 menit – 24 jam.
   * Diabaikan saat isEnabled=false.
   */
  durationMinutes: emptyToUndefined(
    z.coerce.number().int().min(1).max(24 * 60),
  ),
});
export type SetMaintenanceModeInput = z.infer<typeof setMaintenanceModeSchema>;

/** Convenience preset durasi untuk UI. */
export const MAINTENANCE_DURATION_PRESETS = [
  { label: '15 menit', minutes: 15 },
  { label: '30 menit', minutes: 30 },
  { label: '1 jam', minutes: 60 },
  { label: '2 jam', minutes: 120 },
  { label: '4 jam', minutes: 240 },
  { label: '8 jam', minutes: 480 },
];
