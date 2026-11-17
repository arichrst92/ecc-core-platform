/**
 * Deteksi data jemaat lama saat pendaftaran (cegah akun ganda).
 *
 * Banyak data hasil impor belum punya nomor HP / email dan belum pernah login.
 * Saat orangnya mendaftar sendiri, server mencari data lama yang cocok:
 * cabang sama, tanggal lahir sama, nama mirip (nameSimilarity dari
 * jemaat-consolidation — toleran gelar, salah ketik, inisial).
 *
 *   - Pendaftar (app baru) ditawari klaim lewat kode ke email data lama.
 *   - Data lama tanpa email / app lama → dicatat sebagai kandidat ganda
 *     untuk ditinjau admin (Portal → Konsolidasi Jemaat).
 * Tidak pernah menyambung otomatis tanpa bukti.
 */
import { prisma } from '@ecc/database';
import { nameSimilarity } from './jemaat-consolidation.js';

/** Skor minimum untuk ditawarkan ke pendaftar. */
export const OFFER_MIN_SCORE = 0.8;
/** Skor minimum untuk dicatat sebagai kandidat ganda (ditinjau admin). */
export const RECORD_MIN_SCORE = 0.7;
/** Kandidat teratas harus unggul sejauh ini dari kandidat kedua. */
const OFFER_MARGIN = 0.1;

export interface OldRecord {
  id: string;
  namaLengkap: string;
  email: string | null;
  noHp: string | null;
  score: number;
}

const symScore = (a: string, b: string) => Math.max(nameSimilarity(a, b), nameSimilarity(b, a));

/** Data lama yang mungkin milik pendaftar, skor tertinggi dulu. */
export async function findOldRecords(args: {
  namaLengkap: string;
  tanggalLahir: Date;
  cabangId: string;
  /** Saluran pendaftaran: data lama yang belum punya kontak di saluran itu. */
  channel: 'whatsapp' | 'email' | 'any';
  excludeId?: string;
  minScore?: number;
}): Promise<OldRecord[]> {
  const rows = await prisma.jemaat.findMany({
    where: {
      cabangId: args.cabangId,
      tanggalLahir: args.tanggalLahir,
      isActive: true,
      isTamu: false,
      ...(args.excludeId ? { id: { not: args.excludeId } } : {}),
      ...(args.channel === 'whatsapp' ? { noHp: null } : args.channel === 'email' ? { email: null } : {}),
      // Belum pernah login (akun aktif tidak ditawarkan untuk diklaim).
      OR: [{ user: { is: null } }, { user: { is: { lastLoginAt: null } } }],
    },
    select: { id: true, namaLengkap: true, email: true, noHp: true },
    take: 200,
  });
  const min = args.minScore ?? RECORD_MIN_SCORE;
  return rows
    .map((r) => ({ ...r, score: symScore(args.namaLengkap, r.namaLengkap) }))
    .filter((r) => r.score >= min)
    .sort((a, b) => b.score - a.score);
}

/** Satu kandidat yang jelas unggul untuk ditawarkan, atau null (tidak ada / ambigu). */
export function pickOffer(list: OldRecord[]): OldRecord | null {
  const [top, second] = list;
  if (!top || top.score < OFFER_MIN_SCORE) return null;
  if (second && second.score > top.score - OFFER_MARGIN) return null;
  return top;
}

/**
 * Catat kandidat ganda untuk jemaat yang baru dibuat (dipanggil setelah
 * /auth/register). Tidak menghalangi pendaftaran.
 */
export async function recordDuplicateCandidates(newJemaatId: string): Promise<number> {
  const j = await prisma.jemaat.findUnique({
    where: { id: newJemaatId },
    select: { id: true, namaLengkap: true, tanggalLahir: true, cabangId: true },
  });
  if (!j?.tanggalLahir) return 0;
  const list = await findOldRecords({
    namaLengkap: j.namaLengkap,
    tanggalLahir: j.tanggalLahir,
    cabangId: j.cabangId,
    channel: 'any',
    excludeId: j.id,
  });
  for (const o of list.slice(0, 5)) {
    await prisma.duplicateCandidate.upsert({
      where: { newJemaatId_oldJemaatId: { newJemaatId: j.id, oldJemaatId: o.id } },
      create: {
        newJemaatId: j.id,
        oldJemaatId: o.id,
        score: o.score,
        reason: `Pendaftar baru mirip data lama: nama ${Math.round(o.score * 100)}%, tanggal lahir & cabang sama`,
      },
      update: {},
    });
  }
  return Math.min(list.length, 5);
}
