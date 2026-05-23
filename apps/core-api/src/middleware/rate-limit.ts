/**
 * Rate limiting policies untuk berbagai kategori endpoint.
 *
 * Pakai express-rate-limit dengan in-memory store (default).
 * Untuk multi-instance deployment, swap ke `rate-limit-redis`:
 *
 *   import RedisStore from 'rate-limit-redis';
 *   import { createClient } from 'redis';
 *   const redis = createClient({ url: process.env.REDIS_URL });
 *   await redis.connect();
 *   store: new RedisStore({ sendCommand: (...args) => redis.sendCommand(args) })
 *
 * Limit ter-customize per kategori — lihat array `LIMITS` di bawah.
 * Headers `RateLimit-*` dikirim otomatis supaya client tahu sisa quota.
 */
import rateLimit, { type Options } from 'express-rate-limit';
import type { Request } from 'express';

const STANDARD_HEADERS = { standardHeaders: 'draft-7' as const, legacyHeaders: false };

function makeLimiter(name: string, options: Partial<Options>): ReturnType<typeof rateLimit> {
  return rateLimit({
    ...STANDARD_HEADERS,
    skipSuccessfulRequests: false,
    handler: (_req, res) => {
      res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: `Terlalu banyak permintaan. Coba lagi nanti.`,
          details: { limiter: name },
        },
      });
    },
    ...options,
  });
}

// Identifier per-user kalau JWT ada, jatuh ke IP kalau tidak
function userOrIp(req: Request): string {
  return req.user?.sub ?? req.ip ?? 'unknown';
}

// ===== Limiter instances =====

/** OTP request: paling ketat. Block brute-force enumeration nomor HP. */
export const otpRequestLimiter = makeLimiter('otp-request', {
  windowMs: 15 * 60 * 1000,    // 15 menit
  limit: 5,                    // 5 request per IP per 15 menit
});

/** OTP verify + face login: cegah brute-force OTP code. */
export const authVerifyLimiter = makeLimiter('auth-verify', {
  windowMs: 15 * 60 * 1000,
  limit: 10,
});

/** Refresh token: relatif lebih longgar — bisa ada banyak tab. */
export const refreshLimiter = makeLimiter('refresh', {
  windowMs: 5 * 60 * 1000,
  limit: 30,
});

/** Admin endpoints: moderate per-user, supaya UI bulk operations tetap nyaman. */
export const adminLimiter = makeLimiter('admin', {
  windowMs: 1 * 60 * 1000,     // 1 menit
  limit: 300,                  // 300 req/menit per user
  keyGenerator: userOrIp,
});

/** Public consumer API: moderate per API key (yang sudah ter-resolve di middleware sebelumnya). */
export const publicApiLimiter = makeLimiter('public-api', {
  windowMs: 1 * 60 * 1000,
  limit: 120,
  keyGenerator: (req) => req.apiKey?.id ?? req.ip ?? 'unknown',
});

/** Upload limiter: tighter karena resource-heavy (sharp processing). */
export const uploadLimiter = makeLimiter('upload', {
  windowMs: 1 * 60 * 1000,
  limit: 20,
  keyGenerator: userOrIp,
});

/** Global fallback: catch-all untuk endpoint yang belum punya limiter spesifik. */
export const globalLimiter = makeLimiter('global', {
  windowMs: 1 * 60 * 1000,
  limit: 200,
});

/** Self-registration: 3 attempt per IP per jam (anti-abuse). */
export const registerLimiter = makeLimiter('register', {
  windowMs: 60 * 60 * 1000,    // 1 jam
  limit: 3,
});

/**
 * Public cabang list — dipanggil mobile saat splash / first launch utk
 * populate picker cabang di sign-up. Disesuaikan dengan asumsi mobile
 * cache 24 jam, jadi quota relatif rendah cukup.
 */
export const cabangListLimiter = makeLimiter('cabang-list', {
  windowMs: 1 * 60 * 1000,     // 1 menit
  limit: 30,                   // 30/menit/IP
});

/**
 * Telemetry fire-and-forget endpoint — mobile push event saat face login flow.
 * Tinggi karena 1 face login attempt = up to 4 events (attempt, liveness,
 * descriptor, server-response). 10 user x 10 attempt/menit = 400, jadi limit
 * 500/menit/IP cukup untuk pilot scale tanpa risk DoS.
 */
export const telemetryLimiter = makeLimiter('telemetry', {
  windowMs: 1 * 60 * 1000,
  limit: 500,
});

/**
 * Diagnostics error reporting — mobile push runtime error.
 * Lebih ketat dari telemetry karena 1 error report = 1 event (vs telemetry
 * yang multi-event per flow). 100/menit/IP cukup defensive untuk bursty
 * scenarios (kalau ada infinite loop di mobile, jangan sampai overwhelm BE).
 */
export const diagnosticsErrorLimiter = makeLimiter('diag-error', {
  windowMs: 1 * 60 * 1000,
  limit: 100,
});
