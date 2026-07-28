/**
 * Config Shiftsoft → ECC migration.
 *
 * 8 tenant Shiftsoft (1 sinode + 7 cabang). Setiap tenant punya slug + hash
 * unik untuk auth API. Slug juga dipakai inference untuk cabang mapping di
 * ECC production.
 *
 * Hash SECRETS — jangan di-commit. Load dari .env via SHIFTSOFT_HASH_<SLUG>.
 * Example .env entry:
 *   SHIFTSOFT_HASH_ECCGLOBAL=RGxNjtMZ2532cnMFoccDX4y1T3raK4jcQZ0=
 *   SHIFTSOFT_HASH_ECCBANDUNG=aSENJM8r2pp7vgUIGacTM64Mm7x3I-Zwf5U=
 *   ...
 */

export interface TenantConfig {
  /** URL slug di shiftsoft.org (mis. "eccbandung") */
  slug: string;
  /** Env var name yang menyimpan hash header `h` */
  hashEnvVar: string;
  /**
   * Cabang name substring untuk inference match ke `CabangGereja.nama` di ECC.
   * Contoh: "Bandung" → match "ECC Bandung", "Ecc Bandung", dll (case-insensitive).
   *
   * eccglobal = sinode-level, akan resolve ke cabang "Global" atau
   * default sinode primary cabang (fallback opsional di code).
   */
  cabangMatch: string;
  /** Label untuk log/report */
  label: string;
}

export const TENANTS: TenantConfig[] = [
  {
    slug: 'eccglobal',
    hashEnvVar: 'SHIFTSOFT_HASH_ECCGLOBAL',
    cabangMatch: 'Global',
    label: 'ECC Global (Sinode)',
  },
  {
    slug: 'eccbandung',
    hashEnvVar: 'SHIFTSOFT_HASH_ECCBANDUNG',
    cabangMatch: 'Bandung',
    label: 'ECC Bandung',
  },
  {
    slug: 'eccjakarta',
    hashEnvVar: 'SHIFTSOFT_HASH_ECCJAKARTA',
    cabangMatch: 'Jakarta',
    label: 'ECC Jakarta',
  },
  {
    slug: 'eccbali',
    hashEnvVar: 'SHIFTSOFT_HASH_ECCBALI',
    cabangMatch: 'Bali',
    label: 'ECC Bali',
  },
  {
    slug: 'eccmalang',
    hashEnvVar: 'SHIFTSOFT_HASH_ECCMALANG',
    cabangMatch: 'Malang',
    label: 'ECC Malang',
  },
  {
    slug: 'eccsydney',
    hashEnvVar: 'SHIFTSOFT_HASH_ECCSYDNEY',
    cabangMatch: 'Sydney',
    label: 'ECC Sydney',
  },
  {
    slug: 'ecckualalumpur',
    hashEnvVar: 'SHIFTSOFT_HASH_ECCKUALALUMPUR',
    cabangMatch: 'Kuala Lumpur',
    label: 'ECC Kuala Lumpur',
  },
  {
    slug: 'eccmakassar',
    hashEnvVar: 'SHIFTSOFT_HASH_ECCMAKASSAR',
    cabangMatch: 'Makassar',
    label: 'ECC Makassar',
  },
];

/** Base URL Shiftsoft API */
export const SHIFTSOFT_BASE = 'https://shiftsoft.org';

/** Rate-limit: delay antar request per tenant (ms) — konservatif */
export const REQUEST_DELAY_MS = 250;

/** Timeout per HTTP call (ms) */
export const REQUEST_TIMEOUT_MS = 60_000;

/**
 * Resolve tenant config by slug. Throws kalau slug gak ada di TENANTS.
 */
export function getTenant(slug: string): TenantConfig {
  const t = TENANTS.find((x) => x.slug === slug);
  if (!t) {
    const known = TENANTS.map((x) => x.slug).join(', ');
    throw new Error(`Unknown tenant slug "${slug}". Known: ${known}`);
  }
  return t;
}

/**
 * Get hash from env for a tenant. Throws kalau env var kosong.
 */
export function getTenantHash(tenant: TenantConfig): string {
  const h = process.env[tenant.hashEnvVar];
  if (!h || !h.trim()) {
    throw new Error(
      `Missing env var ${tenant.hashEnvVar}. Set it in root .env (see .env.example).`,
    );
  }
  return h.trim();
}
