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

/**
 * Supaya Audit Log tidak penuh catatan berulang (tetap informatif):
 *  1. UPDATE hanya menyimpan isian yang BENAR-BENAR berubah (before/after dipangkas).
 *     Simpan ulang tanpa perubahan & tanpa metadata → tidak dicatat.
 *  2. UPDATE / UPLOAD_PHOTO beruntun oleh orang yang sama pada data yang sama dalam
 *     AUDIT_MERGE_MINUTES (bawaan 10) → digabung ke satu catatan: nilai awal tetap,
 *     nilai akhir terbaru, metadata.mergedCount & firstAt.
 *  3. LOGIN berulang (akun, IP & perangkat sama) dalam 60 menit → digabung.
 * CREATE / DELETE / LOGOUT / wajah selalu dicatat apa adanya.
 */
const MERGE_MS = Number(process.env.AUDIT_MERGE_MINUTES ?? 10) * 60_000;
const LOGIN_MERGE_MS = 60 * 60_000;
const DIFF_IGNORE = /^(updatedAt|createdAt|lastSeenAt|lastLoginAt|version)$/;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date);
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Pangkas before/after ke kunci yang berubah. null = bukan pasangan objek (tidak dipangkas). */
function diffOnly(before: unknown, after: unknown): { before: Obj; after: Obj } | null {
  if (!isObj(before) || !isObj(after)) return null;
  const b: Obj = {};
  const a: Obj = {};
  for (const k of Object.keys(after)) {
    if (DIFF_IGNORE.test(k)) continue;
    if (!same(before[k], after[k])) {
      b[k] = before[k] ?? null;
      a[k] = after[k];
    }
  }
  return { before: b, after: a };
}

const hasKeys = (o: unknown) => isObj(o) && Object.keys(o).length > 0;

export function audit(req: Request, input: AuditInput): void {
  void writeAudit(req, input).catch((err) => {
    logger.warn({ err, input: { action: input.action, resource: input.resource } }, 'audit log insert failed (non-fatal)');
  });
}

async function writeAudit(req: Request, input: AuditInput): Promise<void> {
  const userId = input.userId ?? req.user?.sub ?? null;
  const userName = input.userName ?? null;

  // Sanitize sensitive fields sebelum simpan
  let before = sanitize(input.before);
  let after = sanitize(input.after);
  // Lewat token API pribadi → catat token yang dipakai (otomasi / agentic AI).
  const metadata = (req.pat
    ? { ...((input.metadata as Obj | undefined) ?? {}), viaApiToken: req.pat.nama, apiTokenId: req.pat.id }
    : input.metadata) as Obj | undefined;
  const ipAddress = req.ip ?? null;
  const userAgent = req.get('user-agent') ?? null;

  if (input.action === 'UPDATE') {
    const d = diffOnly(before, after);
    if (d) {
      if (!hasKeys(d.after) && !hasKeys(metadata)) return; // disimpan ulang tanpa perubahan
      before = hasKeys(d.after) ? d.before : undefined;
      after = hasKeys(d.after) ? d.after : undefined;
    }
  }

  // ---- gabung catatan beruntun
  const mergeable =
    !!userId &&
    ((input.action === 'UPDATE' || input.action === 'UPLOAD_PHOTO') ? !!input.resourceId : input.action === 'LOGIN');
  if (mergeable) {
    const windowMs = input.action === 'LOGIN' ? LOGIN_MERGE_MS : MERGE_MS;
    const prev = await prisma.auditLog.findFirst({
      where: {
        userId,
        action: input.action,
        resource: input.resource,
        createdAt: { gte: new Date(Date.now() - windowMs) },
        ...(input.action === 'LOGIN' ? { ipAddress, userAgent } : { resourceId: input.resourceId }),
      },
      orderBy: { createdAt: 'desc' },
    });
    // Hanya gabung tindakan yang sama persis: label (mis. "Konseling dijadwalkan" vs
    // "Konseling selesai") & metadata (alasan, cara, token API) harus sama.
    const prevMeta = (isObj(prev?.metadata) ? prev!.metadata : {}) as Obj;
    const { mergedCount: _mc, firstAt: _fa, ...prevCore } = prevMeta;
    const sameKind =
      !!prev &&
      (input.resourceLabel ?? prev.resourceLabel) === prev.resourceLabel &&
      same(prevCore, metadata ?? {});
    if (prev && sameKind) {
      let mb: Obj | undefined;
      let ma: Obj | undefined;
      if (isObj(prev.after) || isObj(after)) {
        const pb = (isObj(prev.before) ? prev.before : {}) as Obj;
        const pa = (isObj(prev.after) ? prev.after : {}) as Obj;
        const nb = (isObj(before) ? before : {}) as Obj;
        const na = (isObj(after) ? after : {}) as Obj;
        // Nilai awal = yang pertama tercatat; nilai akhir = yang terbaru.
        const fb: Obj = { ...nb, ...pb };
        const fa: Obj = { ...pa, ...na };
        mb = {};
        ma = {};
        for (const k of Object.keys(fa)) {
          if (!same(fb[k], fa[k])) {
            mb[k] = fb[k] ?? null;
            ma[k] = fa[k];
          }
        }
      }
      const { mergedCount, firstAt, ...restPrev } = prevMeta;
      await prisma.auditLog.update({
        where: { id: prev.id },
        data: {
          createdAt: new Date(),
          resourceLabel: input.resourceLabel ?? prev.resourceLabel,
          ...(mb ? { before: mb as Prisma.InputJsonValue, after: ma as Prisma.InputJsonValue } : {}),
          metadata: {
            ...restPrev,
            ...(metadata ?? {}),
            mergedCount: (typeof mergedCount === 'number' ? mergedCount : 1) + 1,
            firstAt: typeof firstAt === 'string' ? firstAt : prev.createdAt.toISOString(),
          } as Prisma.InputJsonValue,
        },
      });
      return;
    }
  }

  await prisma.auditLog.create({
    data: {
      userId,
      userName,
      action: input.action,
      resource: input.resource,
      resourceId: input.resourceId ?? null,
      resourceLabel: input.resourceLabel ?? null,
      before: before as Prisma.InputJsonValue | undefined,
      after: after as Prisma.InputJsonValue | undefined,
      metadata: metadata as Prisma.InputJsonValue | undefined,
      ipAddress,
      userAgent,
    },
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
