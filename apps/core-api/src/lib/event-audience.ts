/**
 * Audiens event level pelayanan (2026-11).
 *
 * Event bisa ditargetkan ke anggota pelayanan tertentu (selain sinode / cabang
 * event). Tiap baris audiens: pelayanan + level role minimal (opsional) +
 * cabang anggota (opsional), mis. "Worship, Koordinator (level 5) ke atas,
 * ECC Bali". Jemaat lolos bila cocok dengan SALAH SATU baris:
 *   - punya JemaatPelayanan AKTIF di pelayanan itu,
 *   - level role-nya ≥ minLevel (bila diisi; level makin tinggi makin senior),
 *   - cabang jemaat (Jemaat.cabangId) = cabang baris (bila diisi).
 * Tanpa baris = semua jemaat (perilaku lama).
 *
 * Penyaringan di SERVER → app lama (≤ 2.5.0) pun tidak menampilkan event ini ke
 * yang tidak memenuhi. Tetap terlihat untuk: peserta terdaftar, petugas event,
 * pengelola event di Portal. Tidak tampil di website / mode tamu (publik).
 */
import { prisma, type Prisma } from '@ecc/database';
import { BadRequest } from './errors.js';

export type AudienceRow = { pelayananId: string; minLevel: number | null; cabangId: string | null };

/** Event yang boleh dilihat jemaat ini di app (gabungkan dengan AND ke where lain). */
export async function eventAudienceVisibleWhereFull(jemaatId: string): Promise<Prisma.EventWhereInput> {
  const [me, mine] = await Promise.all([
    prisma.jemaat.findUnique({ where: { id: jemaatId }, select: { cabangId: true } }),
    prisma.jemaatPelayanan.findMany({
      where: { jemaatId, isActive: true },
      select: { pelayananId: true, pelayananRole: { select: { level: true } } },
    }),
  ]);
  const cabangOk: Prisma.EventAudiencePelayananWhereInput = me?.cabangId
    ? { OR: [{ cabangId: null }, { cabangId: me.cabangId }] }
    : { cabangId: null };
  const memberOk: Prisma.EventWhereInput[] = mine.map((m) => ({
    audiencePelayanan: {
      some: {
        pelayananId: m.pelayananId,
        AND: [{ OR: [{ minLevel: null }, { minLevel: { lte: m.pelayananRole.level } }] }, cabangOk],
      },
    },
  }));
  return {
    OR: [
      { audiencePelayanan: { none: {} } },
      ...memberOk,
      { partisipasi: { some: { jemaatId, status: { not: 'BATAL' } } } },
      { pelayanan: { some: { petugas: { some: { jemaatId } } } } },
    ],
  };
}

/** Untuk endpoint publik (website / tamu): event khusus pelayanan disembunyikan. */
export const EVENT_PUBLIC_AUDIENCE: Prisma.EventWhereInput = { audiencePelayanan: { none: {} } };

/** "Anggota pelayanan Worship (Koordinator ke atas · ECC Bali) atau Multimedia". */
export function audienceLabel(names: string[]): string | null {
  if (!names.length) return null;
  const list = names.length === 1 ? names[0]! : `${names.slice(0, -1).join(', ')} atau ${names[names.length - 1]}`;
  return `Anggota pelayanan ${list}`;
}

function rowName(
  p: { nama: string; roles: { nama: string; level: number }[] },
  minLevel: number | null,
  cabangNama: string | null,
): string {
  const extra: string[] = [];
  if (minLevel !== null && minLevel !== undefined) {
    const r = p.roles.filter((x) => x.level >= minLevel).sort((a, b) => a.level - b.level)[0];
    extra.push(r ? `${r.nama} ke atas` : `level ${minLevel} ke atas`);
  }
  if (cabangNama) extra.push(cabangNama);
  return extra.length ? `${p.nama} (${extra.join(' · ')})` : p.nama;
}

/** Nama baris audiens event + apakah jemaat memenuhi salah satunya. */
export async function eventAudienceStatus(
  eventId: string,
  jemaatId: string | null,
): Promise<{ names: string[]; ok: boolean }> {
  const rows = await prisma.eventAudiencePelayanan.findMany({
    where: { eventId },
    select: {
      pelayananId: true,
      minLevel: true,
      cabangId: true,
      cabang: { select: { nama: true } },
      pelayanan: { select: { nama: true, roles: { select: { nama: true, level: true } } } },
    },
    orderBy: { createdAt: 'asc' },
  });
  if (!rows.length) return { names: [], ok: true };
  const names = rows.map((r) => rowName(r.pelayanan, r.minLevel, r.cabang?.nama ?? null));
  if (!jemaatId) return { names, ok: false };
  const [me, mine] = await Promise.all([
    prisma.jemaat.findUnique({ where: { id: jemaatId }, select: { cabangId: true } }),
    prisma.jemaatPelayanan.findMany({
      where: { jemaatId, isActive: true, pelayananId: { in: rows.map((r) => r.pelayananId) } },
      select: { pelayananId: true, pelayananRole: { select: { level: true } } },
    }),
  ]);
  const ok = rows.some(
    (r) =>
      (r.cabangId === null || r.cabangId === me?.cabangId) &&
      mine.some((m) => m.pelayananId === r.pelayananId && (r.minLevel === null || m.pelayananRole.level >= r.minLevel)),
  );
  return { names, ok };
}

/**
 * Simpan audiens (replace all). `undefined` = tidak diubah.
 * `list` (dengan minLevel / cabangId) diutamakan; `ids` = bentuk lama (semua anggota, semua cabang).
 */
export async function saveEventAudience(
  eventId: string,
  ids: string[] | undefined,
  list?: { pelayananId: string; minLevel?: number | null; cabangId?: string | null }[],
): Promise<void> {
  const items = list ?? ids?.map((pelayananId) => ({ pelayananId, minLevel: null, cabangId: null }));
  if (items === undefined) return;
  // Buang duplikat persis (pelayanan + level + cabang sama).
  const seen = new Set<string>();
  const rows: AudienceRow[] = [];
  for (const it of items) {
    const r = { pelayananId: it.pelayananId, minLevel: it.minLevel ?? null, cabangId: it.cabangId ?? null };
    const k = `${r.pelayananId}|${r.minLevel}|${r.cabangId}`;
    if (!seen.has(k)) {
      seen.add(k);
      rows.push(r);
    }
  }
  const pelIds = [...new Set(rows.map((r) => r.pelayananId))];
  if (pelIds.length) {
    const found = await prisma.pelayanan.count({ where: { id: { in: pelIds }, isActive: true } });
    if (found !== pelIds.length) throw BadRequest('Pelayanan audiens tidak ditemukan atau nonaktif.');
  }
  const cabIds = [...new Set(rows.map((r) => r.cabangId).filter((x): x is string => !!x))];
  if (cabIds.length) {
    const found = await prisma.cabangGereja.count({ where: { id: { in: cabIds } } });
    if (found !== cabIds.length) throw BadRequest('Cabang audiens pelayanan tidak ditemukan.');
  }
  await prisma.$transaction([
    prisma.eventAudiencePelayanan.deleteMany({ where: { eventId } }),
    ...(rows.length ? [prisma.eventAudiencePelayanan.createMany({ data: rows.map((r) => ({ eventId, ...r })) })] : []),
  ]);
}

export const eventAudienceInclude = {
  audiencePelayanan: {
    orderBy: { createdAt: 'asc' as const },
    select: {
      minLevel: true,
      cabangId: true,
      cabang: { select: { id: true, nama: true } },
      pelayanan: { select: { id: true, nama: true } },
    },
  },
};
