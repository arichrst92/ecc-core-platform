/**
 * Audit log helper — fire-and-forget supaya tidak menambah latency request.
 *
 * Pemakaian:
 *   audit(req, { action: 'CREATE', resource: 'sinode', resourceId: created.id,
 *                resourceLabel: created.nama, after: created });
 *
 * Audit insert error TIDAK menggagalkan request — hanya di-log warn.
 */
import type { Request } from 'express';
import { prisma, type Prisma } from '@ecc/database';
import { logger } from './logger.js';

type AuditAction =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'LOGIN'
  | 'LOGOUT'
  | 'ENROLL_FACE'
  | 'RESET_FACE'
  | 'UPLOAD_PHOTO';

interface AuditInput {
  action: AuditAction;
  resource: string;
  resourceId?: string;
  resourceLabel?: string;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
  /**
   * Override userId/userName — biasanya tidak perlu karena di-extract dari req.user.
   * Tapi untuk endpoint auth seperti LOGIN, user belum di-attach ke req, jadi
   * caller bisa pass eksplisit.
   */
  userId?: string;
  userName?: string;
}

export function audit(req: Request, input: AuditInput): void {
  const userId = input.userId ?? req.user?.sub ?? null;
  const userName = input.userName ?? null;

  // Sanitize sensitive fields sebelum simpan
  const before = sanitize(input.before);
  const after = sanitize(input.after);

  prisma.auditLog
    .create({
      data: {
        userId,
        userName,
        action: input.action,
        resource: input.resource,
        resourceId: input.resourceId ?? null,
        resourceLabel: input.resourceLabel ?? null,
        before: before as Prisma.InputJsonValue | undefined,
        after: after as Prisma.InputJsonValue | undefined,
        metadata: (input.metadata as Prisma.InputJsonValue | undefined) ?? undefined,
        ipAddress: req.ip ?? null,
        userAgent: req.get('user-agent') ?? null,
      },
    })
    .catch((err) => {
      logger.warn({ err, input }, 'audit log insert failed (non-fatal)');
    });
}

/**
 * Strip sensitive fields supaya tidak masuk log.
 * Tambah field di sini jika ada PII baru.
 */
const SENSITIVE_KEYS = new Set([
  'password',
  'passwordHash',
  'password_hash',
  'kodeHash',
  'kode_hash',
  'faceDescriptor',
  'face_descriptor',
  'tokenHash',
  'token_hash',
  'keyHash',
  'key_hash',
  'accessToken',
  'refreshToken',
  'access_token',
  'refresh_token',
]);

function sanitize(value: unknown): unknown {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map(sanitize);
  if (typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(k)) out[k] = '[REDACTED]';
    else out[k] = sanitize(v);
  }
  return out;
}
