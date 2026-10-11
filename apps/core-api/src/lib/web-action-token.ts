/**
 * Web Action Token — helper murni (tanpa DB) supaya mudah di-unit-test.
 *
 * Alur (per backend-request-event-bebas-web-action-token.md):
 *   1. App (JWT) → POST /auth/web-action-token → token sekali pakai, TTL 10 menit
 *   2. Web SSR → POST /web-action/exchange { token } → session web, TTL 30 menit
 *   3. Web → endpoint /web-action/* dgn header X-Web-Session (scope: 1 jemaat + 1 event)
 *
 * Raw token/session TIDAK disimpan di DB — hanya SHA-256 hex.
 */
import { createHash, randomBytes } from 'node:crypto';

export const WEB_ACTION_PURPOSES = ['event-payment'] as const;
export type WebActionPurpose = (typeof WEB_ACTION_PURPOSES)[number];

export const TOKEN_TTL_MS = 10 * 60 * 1000;
export const SESSION_TTL_MS = 30 * 60 * 1000;

/** 32 byte random → base64url (43 char). Aman dipakai di query string. */
export function generateSecret(): string {
  return randomBytes(32).toString('base64url');
}

export function hashSecret(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex');
}

export type ExchangeCheck = 'ok' | 'not_found' | 'used' | 'expired';

export function checkExchangeable(
  row: { usedAt: Date | null; expiresAt: Date } | null,
  now: Date = new Date(),
): ExchangeCheck {
  if (!row) return 'not_found';
  if (row.usedAt) return 'used';
  if (row.expiresAt.getTime() <= now.getTime()) return 'expired';
  return 'ok';
}

export type SessionCheck = 'ok' | 'not_found' | 'expired' | 'wrong_event';

export function checkSession(
  row: { sessionExpiresAt: Date | null; eventId: string } | null,
  routeEventId: string | undefined,
  now: Date = new Date(),
): SessionCheck {
  if (!row || !row.sessionExpiresAt) return 'not_found';
  if (row.sessionExpiresAt.getTime() <= now.getTime()) return 'expired';
  if (routeEventId !== undefined && routeEventId !== row.eventId) return 'wrong_event';
  return 'ok';
}
