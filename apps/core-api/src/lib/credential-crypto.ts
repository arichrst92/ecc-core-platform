/**
 * Enkripsi kolom rahasia Credential vault (kepatuhan no. 11).
 * Hanya `nama` yang disimpan apa adanya (untuk daftar & pencarian).
 */
import { prisma } from '@ecc/database';
import { decryptText, encryptText, encryptionEnabled, isEncryptedText } from './crypto-at-rest.js';
import { logger } from './logger.js';

export const SECRET_FIELDS = ['email', 'username', 'noHpTerdaftar', 'linkAkses', 'recoveryEmail', 'catatan'] as const;
type SecretField = (typeof SECRET_FIELDS)[number];

export function encryptCredentialFields<T extends Partial<Record<SecretField, string | null | undefined>>>(data: T): T {
  const out: Record<string, unknown> = { ...data };
  for (const f of SECRET_FIELDS) if (f in out) out[f] = encryptText(out[f] as string | null | undefined);
  return out as T;
}

export function decryptCredential<T extends Partial<Record<SecretField, string | null>>>(row: T): T {
  const out: Record<string, unknown> = { ...row };
  for (const f of SECRET_FIELDS) if (f in out) out[f] = decryptText(out[f] as string | null);
  return out as T;
}

/** Sekali saat server start: enkripsi baris lama yang masih teks biasa. */
export async function encryptLegacyCredentials(): Promise<number> {
  if (!encryptionEnabled()) {
    logger.warn('DATA_ENCRYPTION_KEY belum di-set — Credential & backup disimpan TANPA enkripsi.');
    return 0;
  }
  const rows = await prisma.credential.findMany();
  let n = 0;
  for (const r of rows) {
    const plain = SECRET_FIELDS.filter((f) => r[f] && !isEncryptedText(r[f]));
    if (!plain.length) continue;
    const data: Record<string, string | null | undefined> = {};
    for (const f of plain) data[f] = encryptText(r[f]);
    await prisma.credential.update({ where: { id: r.id }, data });
    n++;
  }
  if (n) logger.info({ encrypted: n }, '🔐 Credential lama dienkripsi');
  return n;
}
