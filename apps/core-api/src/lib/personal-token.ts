/**
 * Token API pribadi (Developer Tools → API Access) untuk otomasi & agentic AI.
 *
 *   Header: Authorization: Bearer ecc_pat_<prefix>_<secret>
 *
 * Token bertindak atas nama pemiliknya: payload sama dengan JWT login
 * (roles, isFulltimer) sehingga semua gate menu / role berlaku sama dan
 * tindakan tercatat di Audit Log atas nama orang tersebut (+ nama token).
 *
 * Syarat tiap request (dicek ulang, cache 60 detik):
 *   - token aktif (belum dicabut, belum kedaluwarsa)
 *   - user & jemaat aktif
 *   - masih anggota aktif Team IT Minister dengan role yang diizinkan di
 *     AppConfig.apiAccessItRoles (Portal → Developer Tools → API Access)
 */
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { prisma, type ITMinisterRole } from '@ecc/database';
import type { JwtPayload } from '@ecc/shared-types';

export const PAT_PREFIX = 'ecc_pat_';
export const isPersonalToken = (raw: string) => raw.startsWith(PAT_PREFIX);

export interface PatContext {
  id: string;
  nama: string;
}

/** Buat token baru → { raw (tampil SEKALI), prefix, hash }. */
export async function generatePersonalToken(): Promise<{ raw: string; prefix: string; hash: string }> {
  const prefix = crypto.randomBytes(6).toString('hex'); // 12 hex
  const secret = crypto.randomBytes(24).toString('base64url'); // 32 char
  const raw = `${PAT_PREFIX}${prefix}_${secret}`;
  const hash = await bcrypt.hash(raw, 10);
  return { raw, prefix, hash };
}

/** Role IT Minister yang diizinkan memakai API (default Head IT Minister). */
export async function allowedItRoles(): Promise<ITMinisterRole[]> {
  const row = await prisma.appConfig.findUnique({ where: { id: 'global' }, select: { apiAccessItRoles: true } });
  return row?.apiAccessItRoles ?? ['HEAD_IT_MINISTER'];
}

/** Boleh pakai API? → daftar assignment IT Minister aktif yang memenuhi syarat. */
export async function apiEligibility(jemaatId: string) {
  const [allowed, team] = await Promise.all([
    allowedItRoles(),
    prisma.iTMinisterTeam.findMany({
      where: { jemaatId, isActive: true },
      select: { divisi: true, roleTitle: true },
    }),
  ]);
  const matching = team.filter((t) => allowed.includes(t.roleTitle));
  return { eligible: matching.length > 0, allowed, team, matching };
}

/** Payload setara JWT login untuk user ini (roles terkini dari DB). */
async function payloadFor(userId: string): Promise<JwtPayload | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      isActive: true,
      jemaatId: true,
      jemaat: {
        select: {
          isActive: true,
          jemaatRoles: {
            where: { isActive: true },
            select: { role: { select: { nama: true } }, subRole: { select: { nama: true } }, subRoleStatus: { select: { nama: true } } },
          },
        },
      },
    },
  });
  if (!user || !user.isActive || !user.jemaat.isActive) return null;
  const roles = user.jemaat.jemaatRoles.map(
    (jr) => `${jr.role.nama}:${jr.subRole.nama}${jr.subRoleStatus?.nama ? `:${jr.subRoleStatus.nama}` : ''}`,
  );
  const now = Math.floor(Date.now() / 1000);
  return {
    sub: user.id,
    jemaatId: user.jemaatId,
    roles,
    isFulltimer: user.jemaat.jemaatRoles.some((jr) => jr.role.nama === 'Fulltimer'),
    iat: now,
    exp: now + 60,
  };
}

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { at: number; value: { user: JwtPayload; pat: PatContext } | null }>();
export const invalidatePatCache = () => cache.clear();

/**
 * Verifikasi token pribadi → payload user + konteks token, atau null bila
 * tidak valid / tidak lagi memenuhi syarat.
 */
export async function verifyPersonalToken(raw: string, ip?: string | null): Promise<{ user: JwtPayload; pat: PatContext } | null> {
  const hit = cache.get(raw);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  const m = /^ecc_pat_([a-f0-9]{12})_[A-Za-z0-9_-]{20,}$/.exec(raw);
  let value: { user: JwtPayload; pat: PatContext } | null = null;
  if (m) {
    const row = await prisma.personalAccessToken.findUnique({ where: { keyPrefix: m[1] } });
    const now = new Date();
    if (row && !row.revokedAt && (!row.expiresAt || row.expiresAt > now) && (await bcrypt.compare(raw, row.keyHash))) {
      const user = await payloadFor(row.userId);
      if (user && (await apiEligibility(user.jemaatId)).eligible) {
        value = { user, pat: { id: row.id, nama: row.nama } };
        prisma.personalAccessToken
          .update({ where: { id: row.id }, data: { lastUsedAt: now, lastUsedIp: ip ?? null } })
          .catch(() => undefined);
      }
    }
  }
  cache.set(raw, { at: Date.now(), value });
  if (cache.size > 500) cache.delete(cache.keys().next().value!);
  return value;
}
