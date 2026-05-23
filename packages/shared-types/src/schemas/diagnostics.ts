/**
 * Diagnostics & App Config — Zod schemas + types.
 *
 * Backend response untuk 2 mobile requests:
 *   - face-confidence-threshold-and-telemetry.md
 *   - diagnostics-error-endpoint.md
 *
 * Endpoint group:
 *   - GET  /public/app-config              — mobile fetch tune-able config (no auth)
 *   - POST /auth/face/telemetry            — mobile push face login event (no auth)
 *   - POST /diagnostics/error              — mobile push runtime error (no auth)
 *   - PATCH /admin/app-config              — admin update config
 *   - GET  /admin/diagnostics/face-telemetry — aggregate funnel + latency
 *   - GET  /admin/diagnostics/error-events   — aggregate by fingerprint
 *   - GET  /admin/diagnostics/error-events/:fingerprint — detail
 */
import { z } from 'zod';

// ============================================================
// App Config — singleton
// ============================================================

export const appConfigSchema = z.object({
  id: z.literal('global'),
  faceMatchThreshold: z.number().min(0).max(1),
  lowConfidenceWarnThreshold: z.number().min(0).max(1),
  telemetrySamplingRate: z.number().min(0).max(1),
  errorReportingEnabled: z.boolean(),
  updatedAt: z.coerce.date(),
});
export type AppConfig = z.infer<typeof appConfigSchema>;

/** Patch payload — semua field optional, hanya yang dikirim akan di-update. */
export const appConfigUpdateSchema = z.object({
  faceMatchThreshold: z.number().min(0).max(1).optional(),
  lowConfidenceWarnThreshold: z.number().min(0).max(1).optional(),
  telemetrySamplingRate: z.number().min(0).max(1).optional(),
  errorReportingEnabled: z.boolean().optional(),
});
export type AppConfigUpdate = z.infer<typeof appConfigUpdateSchema>;

// ============================================================
// Face Telemetry Event — POST /auth/face/telemetry
// ============================================================

export const FACE_TELEMETRY_EVENTS = [
  'face_login_attempt',
  'face_login_server_response',
  'face_enroll_attempt',
  'face_enroll_complete',
  'face_enroll_fail',
  'face_liveness_pass',
  'face_liveness_fail',
  'face_descriptor_compute',
  'face_nonce_request',
] as const;

export const FACE_TELEMETRY_FLOWS = ['login', 'enroll'] as const;

export const faceTelemetryDeviceSchema = z
  .object({
    platform: z.enum(['ios', 'android']),
    model: z.string().max(64).optional(),
    osVersion: z.string().max(32).optional(),
    appVersion: z.string().max(32).optional(),
    modelVersion: z.string().max(32).optional(),
  })
  .strict();

export const faceTelemetryDurationSchema = z
  .object({
    livenessTotal: z.number().int().min(0).max(60_000).optional(),
    descriptorCompute: z.number().int().min(0).max(60_000).optional(),
    serverRoundtrip: z.number().int().min(0).max(60_000).optional(),
  })
  .strict()
  .partial();

export const faceTelemetryEventInputSchema = z.object({
  sessionId: z.string().uuid(),
  noHp: z.string().min(8).max(32).optional().nullable(),
  event: z.enum(FACE_TELEMETRY_EVENTS),
  flow: z.enum(FACE_TELEMETRY_FLOWS).optional().nullable(),
  outcome: z.enum(['success', 'failure']),
  failureReason: z.string().max(64).optional().nullable(),
  confidence: z.number().min(0).max(1).optional().nullable(),
  durationMs: faceTelemetryDurationSchema.optional().nullable(),
  device: faceTelemetryDeviceSchema.optional().nullable(),
  timestamp: z.coerce.date(),
});
export type FaceTelemetryEventInput = z.infer<typeof faceTelemetryEventInputSchema>;

// ============================================================
// Diagnostics Error Event — POST /diagnostics/error
// ============================================================

export const errorBreadcrumbSchema = z
  .object({
    timestamp: z.coerce.date(),
    message: z.string().max(500),
    category: z.string().max(64).optional(),
    data: z.record(z.unknown()).optional(),
  })
  .strict();

export const diagnosticsErrorDeviceSchema = z
  .object({
    platform: z.enum(['ios', 'android']),
    osVersion: z.string().max(32).optional(),
    appVersion: z.string().max(32).optional(),
    release: z.string().max(64).optional(),
  })
  .strict();

export const diagnosticsErrorInputSchema = z.object({
  type: z.enum(['error', 'message']).default('error'),
  release: z.string().min(1).max(64),
  device: diagnosticsErrorDeviceSchema,
  user: z
    .object({
      noHp: z.string().min(8).max(32).optional().nullable(),
    })
    .optional()
    .nullable(),
  breadcrumbs: z.array(errorBreadcrumbSchema).max(50).optional().nullable(),
  timestamp: z.coerce.date(),
  message: z.string().min(1).max(2000),
  stack: z.string().max(16000).optional().nullable(),
  name: z.string().max(64).optional().nullable(),
  context: z.record(z.unknown()).optional().nullable(),
});
export type DiagnosticsErrorInput = z.infer<typeof diagnosticsErrorInputSchema>;

// ============================================================
// Admin query schemas — aggregate dashboard
// ============================================================

export const faceTelemetryQuerySchema = z.object({
  // ISO date range — default last 7 days di handler.
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  platform: z.enum(['ios', 'android', 'all']).optional().default('all'),
  flow: z.enum(['login', 'enroll', 'all']).optional().default('all'),
  release: z.string().max(64).optional(),
  noHp: z.string().max(32).optional(),
});
export type FaceTelemetryQuery = z.infer<typeof faceTelemetryQuerySchema>;

export const errorEventQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  platform: z.enum(['ios', 'android', 'all']).optional().default('all'),
  release: z.string().max(64).optional(),
  search: z.string().max(200).optional(),     // substring di message
  noHp: z.string().max(32).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type ErrorEventQuery = z.infer<typeof errorEventQuerySchema>;
