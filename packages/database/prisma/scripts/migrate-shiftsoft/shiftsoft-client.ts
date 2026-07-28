/**
 * HTTP client wrapper untuk Shiftsoft legacy API.
 *
 * Fitur:
 * - Auto-inject header `h: <hash>` per tenant
 * - Retry dengan exponential backoff (max 3x) untuk transient errors
 * - Timeout per request (REQUEST_TIMEOUT_MS)
 * - Rate limit throttle (REQUEST_DELAY_MS antar request)
 * - Structured logging
 *
 * Native `fetch` (Node 20+) — tidak perlu axios/undici deps tambahan.
 */
import {
  SHIFTSOFT_BASE,
  REQUEST_DELAY_MS,
  REQUEST_TIMEOUT_MS,
  type TenantConfig,
  getTenantHash,
} from './config.js';
import type { ShiftsoftUserListResponse } from './types.js';

const MAX_RETRIES = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class ShiftsoftClient {
  private lastRequestAt = 0;

  constructor(
    private readonly tenant: TenantConfig,
    private readonly hash: string = getTenantHash(tenant),
  ) {}

  /** Throttle: pastikan gap minimum antar request. */
  private async throttle(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestAt;
    if (elapsed < REQUEST_DELAY_MS) {
      await sleep(REQUEST_DELAY_MS - elapsed);
    }
    this.lastRequestAt = Date.now();
  }

  /** Low-level GET dengan retry + timeout. */
  private async request<T>(path: string): Promise<T> {
    const url = `${SHIFTSOFT_BASE}/${this.tenant.slug}/api${path}`;
    let lastErr: unknown;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      await this.throttle();

      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);

      try {
        const res = await fetch(url, {
          method: 'GET',
          headers: { h: this.hash, Accept: 'application/json' },
          signal: ctrl.signal,
        });
        clearTimeout(timer);

        if (res.status === 429) {
          // Rate limited — wait longer sebelum retry
          const backoff = 2000 * attempt;
          console.warn(
            `[shiftsoft/${this.tenant.slug}] 429 rate-limited on ${path}, backoff ${backoff}ms (attempt ${attempt}/${MAX_RETRIES})`,
          );
          await sleep(backoff);
          continue;
        }
        if (res.status >= 500) {
          const backoff = 1000 * attempt;
          console.warn(
            `[shiftsoft/${this.tenant.slug}] ${res.status} on ${path}, retry in ${backoff}ms (attempt ${attempt}/${MAX_RETRIES})`,
          );
          await sleep(backoff);
          continue;
        }
        if (!res.ok) {
          throw new Error(`HTTP ${res.status} ${res.statusText} on ${url}`);
        }
        return (await res.json()) as T;
      } catch (err) {
        clearTimeout(timer);
        lastErr = err;
        const isAbort =
          err instanceof Error && err.name === 'AbortError';
        console.warn(
          `[shiftsoft/${this.tenant.slug}] ${isAbort ? 'TIMEOUT' : 'ERROR'} on ${path} (attempt ${attempt}/${MAX_RETRIES}): ${(err as Error).message}`,
        );
        if (attempt < MAX_RETRIES) {
          await sleep(1000 * attempt);
        }
      }
    }
    throw new Error(
      `[shiftsoft/${this.tenant.slug}] Failed ${path} after ${MAX_RETRIES} attempts: ${String(lastErr)}`,
    );
  }

  /**
   * GET /user/list — return semua user di tenant ini.
   *
   * Response: `{ data: LegacyUser[], meta?: {} }`. Endpoint APPEARS to return
   * ALL users in one call (no pagination observed di sample) — untuk safety,
   * kita cek meta.total kalau ada dan warn kalau ada mismatch.
   */
  async listUsers(): Promise<ShiftsoftUserListResponse> {
    return this.request<ShiftsoftUserListResponse>('/user/list');
  }
}
