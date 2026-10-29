/**
 * Enkripsi data saat disimpan (at rest) — kepatuhan no. 11 & 12.
 *
 *   - Teks (kolom Credential): AES-256-GCM → "enc:v1:<iv>:<tag>:<ciphertext>" (base64url)
 *   - File (backup database): header "ECCENC1\n" + IV(12) + ciphertext + TAG(16)
 *
 * Kunci: env DATA_ENCRYPTION_KEY (string acak panjang; di-hash SHA-256 jadi
 * 32 byte). Buat dengan:  openssl rand -base64 48
 *
 * ⚠ SIMPAN KUNCI DI TEMPAT AMAN DI LUAR SERVER (password manager pengurus).
 *    Tanpa kunci, isi Credential & file backup terenkripsi TIDAK BISA dibuka.
 *
 * Bila kunci belum di-set, data tetap disimpan apa adanya (kompatibel) dan
 * server menulis peringatan di log.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { open, stat } from 'node:fs/promises';
import { finished, pipeline } from 'node:stream/promises';
import { once } from 'node:events';

const ALGO = 'aes-256-gcm';
const TEXT_PREFIX = 'enc:v1:';
export const FILE_MAGIC = Buffer.from('ECCENC1\n');
const IV_LEN = 12;
const TAG_LEN = 16;

let cachedKey: Buffer | null | undefined;
export function encryptionKey(): Buffer | null {
  if (cachedKey !== undefined) return cachedKey;
  const raw = process.env.DATA_ENCRYPTION_KEY?.trim();
  cachedKey = raw && raw.length >= 16 ? createHash('sha256').update(raw).digest() : null;
  return cachedKey;
}
export const encryptionEnabled = () => encryptionKey() !== null;

/** Hanya untuk test. */
export function _resetKeyCache() {
  cachedKey = undefined;
}

// ------------------------------------------------------------------ teks

export const isEncryptedText = (v: string | null | undefined) => !!v && v.startsWith(TEXT_PREFIX);

export function encryptText(plain: string | null | undefined): string | null | undefined {
  if (plain == null || plain === '' || isEncryptedText(plain)) return plain;
  const key = encryptionKey();
  if (!key) return plain;
  const iv = randomBytes(IV_LEN);
  const c = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return `${TEXT_PREFIX}${iv.toString('base64url')}:${c.getAuthTag().toString('base64url')}:${ct.toString('base64url')}`;
}

export function decryptText(value: string | null | undefined): string | null | undefined {
  if (!isEncryptedText(value)) return value;
  const key = encryptionKey();
  if (!key) throw new Error('DATA_ENCRYPTION_KEY belum di-set — data terenkripsi tidak bisa dibuka.');
  const [ivB, tagB, ctB] = value!.slice(TEXT_PREFIX.length).split(':');
  const d = createDecipheriv(ALGO, key, Buffer.from(ivB!, 'base64url'));
  d.setAuthTag(Buffer.from(tagB!, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(ctB!, 'base64url')), d.final()]).toString('utf8');
}

// ------------------------------------------------------------------ file

export async function isEncryptedFile(file: string): Promise<boolean> {
  const fh = await open(file, 'r');
  try {
    const buf = Buffer.alloc(FILE_MAGIC.length);
    const { bytesRead } = await fh.read(buf, 0, buf.length, 0);
    return bytesRead === buf.length && buf.equals(FILE_MAGIC);
  } finally {
    await fh.close();
  }
}

/** Enkripsi `src` → `dest` (streaming, cocok untuk file besar). */
export async function encryptFile(src: string, dest: string): Promise<void> {
  const key = encryptionKey();
  if (!key) throw new Error('DATA_ENCRYPTION_KEY belum di-set.');
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const out = createWriteStream(dest, { mode: 0o600 });
  const done = finished(out);
  const write = async (b: Buffer) => {
    if (b.length && !out.write(b)) await once(out, 'drain');
  };
  try {
    await write(Buffer.concat([FILE_MAGIC, iv]));
    for await (const chunk of createReadStream(src)) await write(cipher.update(chunk as Buffer));
    await write(cipher.final());
    await write(cipher.getAuthTag());
    out.end();
    await done;
  } catch (e) {
    out.destroy();
    throw e;
  }
}

/** Dekripsi `src` (format ECCENC1) → `dest`. Gagal bila kunci salah / file rusak. */
export async function decryptFile(src: string, dest: string): Promise<void> {
  const key = encryptionKey();
  if (!key) throw new Error('DATA_ENCRYPTION_KEY belum di-set — backup terenkripsi tidak bisa dibuka.');
  const { size } = await stat(src);
  const headerLen = FILE_MAGIC.length + IV_LEN;
  if (size < headerLen + TAG_LEN) throw new Error('File backup terenkripsi rusak (terlalu kecil).');
  const fh = await open(src, 'r');
  const iv = Buffer.alloc(IV_LEN);
  const tag = Buffer.alloc(TAG_LEN);
  try {
    await fh.read(iv, 0, IV_LEN, FILE_MAGIC.length);
    await fh.read(tag, 0, TAG_LEN, size - TAG_LEN);
  } finally {
    await fh.close();
  }
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  await pipeline(
    createReadStream(src, { start: headerLen, end: size - TAG_LEN - 1 }),
    decipher,
    createWriteStream(dest, { mode: 0o600 }),
  ).catch((e) => {
    throw new Error(`Gagal membuka backup terenkripsi (kunci salah atau file rusak): ${e instanceof Error ? e.message : e}`);
  });
}
