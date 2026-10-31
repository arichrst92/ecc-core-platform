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
import { createHash } from 'node:crypto';
import type { Request, RequestHandler } from 'express';

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

/*
 * PENTING untuk launching: ratusan HP di WiFi gereja (dan pelanggan operator
 * seluler di balik CGNAT) keluar lewat SATU IP. Batas ketat untuk login /
 * daftar / perpanjang sesi karena itu dihitung per IDENTITAS (no HP, email,
 * token) — bukan per IP. Batas per IP tetap ada sebagai pengaman kasar
 * terhadap serangan, tapi dibuat longgar (cukup untuk ±2000 jemaat satu lokasi).
 */
const hash = (v: string) => createHash('sha256').update(v).digest('hex').slice(0, 24);

/** Identitas dari body: no HP → email → token; fallback IP. */
function identityKey(req: Request): string {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const hp = str(b.noHp)?.replace(/\D/g, '');
  if (hp && hp.length >= 8) return `hp:${hp.replace(/^0/, '62')}`;
  const em = str(b.email)?.toLowerCase();
  if (em) return `em:${em}`;
  const tok = str(b.refreshToken) ?? str(b.token);
  if (tok) return `tk:${hash(tok)}`;
  return `ip:${req.ip ?? 'unknown'}`;
}

/** Gabungan: batas per identitas (ketat) + batas per IP (longgar). */
function combo(name: string, perIdentity: Partial<Options>, perIp: Partial<Options>): RequestHandler {
  const ipLimiter = makeLimiter(`${name}-ip`, { ...perIp, keyGenerator: (req) => `ip:${req.ip ?? 'unknown'}` });
  const idLimiter = makeLimiter(name, { ...perIdentity, keyGenerator: identityKey });
  return (req, res, next) => {
    void ipLimiter(req, res, (err?: unknown) => (err ? next(err) : void idLimiter(req, res, next)));
  };
}

// ===== Limiter instances =====

/** OTP request: 5 per nomor HP per 15 menit; per IP longgar (WiFi gereja). */
export const otpRequestLimiter = combo(
  'otp-request',
  { windowMs: 15 * 60 * 1000, limit: 5 },
  { windowMs: 15 * 60 * 1000, limit: 1500 },
);

/**
 * Magic link email request — anti-spam email + prevent enumeration.
 * Ketat: 5 request per 1 jam per IP. Cukup untuk normal usage
 * (user salah ketik email, resend 1-2x), tapi block email flood.
 */
export const magicLinkLimiter = combo(
  'magic-link',
  { windowMs: 60 * 60 * 1000, limit: 5 }, // per email
  { windowMs: 60 * 60 * 1000, limit: 1000 },
);

/**
 * Onboarding endpoints — moderate (user might submit form multiple times).
 */
export const onboardingLimiter = makeLimiter('onboarding', {
  windowMs: 15 * 60 * 1000,
  limit: 20,
  keyGenerator: userOrIp,
});

/** Verifikasi OTP / magic link: 10 percobaan per nomor HP (atau token) per 15 menit — cegah tebak kode. */
export const authVerifyLimiter = combo(
  'auth-verify',
  { windowMs: 15 * 60 * 1000, limit: 10 },
  { windowMs: 15 * 60 * 1000, limit: 3000 },
);

/** Perpanjang sesi: per refresh token (bukan per IP — jangan sampai jemaat ter-logout massal di gereja). */
export const refreshLimiter = combo(
  'refresh',
  { windowMs: 5 * 60 * 1000, limit: 30 },
  { windowMs: 5 * 60 * 1000, limit: 6000 },
);

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
  limit: 3000,
});

/** Self-registration: 3 per nomor HP per jam (tetap wajib OTP); per IP longgar untuk pendaftaran massal di gereja. */
export const registerLimiter = combo(
  'register',
  { windowMs: 60 * 60 * 1000, limit: 3 },
  { windowMs: 60 * 60 * 1000, limit: 2500 },
);

/**
 * Public cabang list — dipanggil mobile saat splash / first launch utk
 * populate picker cabang di sign-up. Disesuaikan dengan asumsi mobile
 * cache 24 jam, jadi quota relatif rendah cukup.
 */
export const cabangListLimiter = makeLimiter('cabang-list', {
  windowMs: 1 * 60 * 1000,     // 1 menit
  limit: 1000,                 // per IP — banyak HP baru di WiFi gereja sekaligus
});

/**
 * Telemetry fire-and-forget endpoint — mobile push event saat face login flow.
 * Tinggi karena 1 face login attempt = up to 4 events (attempt, liveness,
 * descriptor, server-response). 10 user x 10 attempt/menit = 400, jadi limit
 * 500/menit/IP cukup untuk pilot scale tanpa risk DoS.
 */
export const telemetryLimiter = makeLimiter('telemetry', {
  windowMs: 1 * 60 * 1000,
  limit: 2000,
});

/**
 * Public browse — guest mode endpoints (ibadah calendar, event, local-market,
 * cabang rekening). Mobile guest user belum login → IP-based rate limit.
 * 60/menit/IP cukup untuk pattern browse (user tap-tap tab atau filter cabang).
 * Lihat docs/backend-request-public-endpoints-for-guest.md.
 */
export const publicBrowseLimiter = makeLimiter('public-browse', {
  windowMs: 1 * 60 * 1000,
  limit: 1500, // per IP — banyak tamu di WiFi gereja satu IP
});

/**
 * Telemetri Els App — per perangkat (installId), BUKAN per IP: ratusan HP di
 * WiFi gereja tampil sebagai satu IP. Terpisah dari limiter API utama supaya
 * kiriman analitik tidak pernah menghabiskan jatah check-in / reservasi.
 * App mengirim ±2×/menit; 30/menit memberi ruang untuk kirim ulang offline.
 */
export const appTelemetryLimiter = makeLimiter('app-telemetry', {
  windowMs: 60 * 1000,
  limit: 30,
  keyGenerator: (req) => {
    const id = (req.body as { installId?: unknown } | undefined)?.installId;
    return typeof id === 'string' && id.length >= 16 && id.length <= 64 ? `i:${id}` : `ip:${req.ip ?? 'unknown'}`;
  },
});

/** Layar monitor (/public/monitor): coba kode akses — anti tebak per IP. */
export const monitorUnlockLimiter = makeLimiter('monitor-unlock', {
  windowMs: 15 * 60 * 1000,
  limit: 10,
});

/**
 * Layar monitor: polling tiap 15 detik. Banyak monitor di satu gereja keluar
 * lewat satu IP → batas longgar per IP.
 */
export const monitorLimiter = makeLimiter('monitor', {
  windowMs: 60 * 1000,
  limit: 300,
});

/** Mode tamu: minta bergabung homecell (tanpa akun) — anti-spam per IP. */
export const guestJoinLimiter = combo(
  'guest-join',
  { windowMs: 60 * 60 * 1000, limit: 6 }, // per no HP tamu
  { windowMs: 60 * 60 * 1000, limit: 300 },
);

/**
 * Diagnostics error reporting — mobile push runtime error.
 * Lebih ketat dari telemetry karena 1 error report = 1 event (vs telemetry
 * yang multi-event per flow). 100/menit/IP cukup defensive untuk bursty
 * scenarios (kalau ada infinite loop di mobile, jangan sampai overwhelm BE).
 */
export const diagnosticsErrorLimiter = makeLimiter('diag-error', {
  windowMs: 1 * 60 * 1000,
  limit: 1000,
});

/**
 * Web action token mint (POST /auth/web-action-token) — per user.
 * Per backend-request-event-bebas-web-action-token.md: ~10/menit/jemaat.
 */
export const webActionMintLimiter = makeLimiter('web-action-mint', {
  windowMs: 60 * 1000,
  limit: 10,
  keyGenerator: userOrIp,
});

/**
 * Web action endpoints (exchange + scoped session calls).
 * Request datang dari server landing (SSR/proxy), jadi IP-nya sama untuk
 * semua user → key per session / token, fallback IP.
 */
export const webActionLimiter = makeLimiter('web-action', {
  windowMs: 60 * 1000,
  limit: 60,
  keyGenerator: (req) => {
    const session = req.get('x-web-session');
    if (session) return `s:${session.slice(0, 16)}`;
    const token = (req.body as { token?: unknown } | undefined)?.token;
    if (typeof token === 'string') return `t:${token.slice(0, 16)}`;
    return req.ip ?? 'unknown';
  },
});
