/**
 * Kunci per event (dalam proses) — pendaftaran untuk event yang sama diproses
 * bergantian supaya cek kuota + simpan tidak balapan (kuota tidak terlampaui
 * saat banyak orang mendaftar bersamaan). core-api berjalan 1 proses (pm2 fork).
 */
import type { RequestHandler } from 'express';

const tails = new Map<string, Promise<void>>();

/** Tunggu giliran; kembalikan fungsi pelepas kunci. */
export async function acquireEventLock(key: string): Promise<() => void> {
  const prev = tails.get(key) ?? Promise.resolve();
  let release!: () => void;
  const mine = new Promise<void>((r) => (release = r));
  const tail = prev.then(() => mine);
  tails.set(key, tail);
  await prev;
  let done = false;
  return () => {
    if (done) return;
    done = true;
    release();
    if (tails.get(key) === tail) tails.delete(key);
  };
}

/** Middleware: kunci berdasarkan :id event sampai respons selesai (maks 30 dtk). */
export const lockEventParam: RequestHandler = (req, res, next) => {
  const key = `event:${req.params.id ?? req.params.idOrSlug ?? ''}`;
  acquireEventLock(key)
    .then((release) => {
      const t = setTimeout(release, 30_000);
      const free = () => {
        clearTimeout(t);
        release();
      };
      res.once('finish', free);
      res.once('close', free);
      next();
    })
    .catch(next);
};
