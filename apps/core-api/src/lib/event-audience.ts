/**
 * Audiens event level pelayanan (2026-11).
 *
 * Event bisa ditargetkan ke anggota pelayanan tertentu (selain sinode / cabang),
 * opsional sampai level role pelayanan: minLevel 5 = hanya anggota dengan
 * PelayananRole.level ≥ 5 (mis. koordinator ke atas). NULL = semua anggota.
 * Kosong = semua jemaat (perilaku lama). Diisi = event hanya terlihat di app &
 * hanya bisa diikuti jemaat yang punya JemaatPelayanan AKTIF di salah satu
 * pelayanan itu. Penyaringan dilakukan di SERVER, jadi app lama (≤ 2.5.0) yang
 * menyaring cabang di HP pun otomatis tidak menampilkan event ini ke non-anggota.
 *
 * Tetap terlihat untuk: peserta yang sudah terdaftar, petugas event, dan
 * pengelola event di Portal. Tidak tampil di website / mode tamu (publik).
 */
import { prisma, type Prisma } from '@ecc/database';
import { BadRequest } from './errors.js';

/** Event yang boleh dilihat jemaat ini di app (gabungkan dengan AND ke where lain). */
export function eventAudienceVisibleWhere(jemaatId: string): Prisma.EventWhereInput {
  return {
    OR: [
      { audiencePelayanan: { none: {} } },
      // Anggota pelayanan tanpa batas level…
      { audiencePelayanan: { some: { minLevel: null, pelayanan: { jemaatPelayanan: { some: { jemaatId, isActive: true } } } } } },
      { partisipasi: { some: { jemaatId, status: { not: 'BATAL' } } } },
      { pelayanan: { some: { petugas: { some: { jemaatId } } } } },
    ],
  };
}

/**
 * Versi lengkap (termasuk batas level): event yang boleh dilihat jemaat di app.
 * Prisma tidak bisa membandingkan kolom (role.level ≥ minLevel) → event dengan
 * batas level dihitung dulu dari keanggotaan jemaat.
 */
export async function eventAudienceVisibleWhereFull(jemaatId: string): Promise<Prisma.EventWhereInput> {
  const mine = await prisma.jemaatPelayanan.findMany({
    where: { jemaatId, isActive: true },
    select: { pelayananId: true, pelayananRole: { select: { level: true } } },
  });
  const levelOk: Prisma.EventWhereInput[] = mine.map((m) => ({
    audiencePelayanan: { some: { pelayananId: m.pelayananId, minLevel: { not: null, lte: m.pelayananRole.level } } },
  }));
  const base = eventAudienceVisibleWhere(jemaatId);
  return { OR: [...(base.OR as Prisma.EventWhereInput[]), ...levelOk] };
}

/** Untuk endpoint publik (website / tamu): event khusus pelayanan disembunyikan. */
export const EVENT_PUBLIC_AUDIENCE: Prisma.EventWhereInput = { audiencePelayanan: { none: {} } };

/**
 * Label syarat untuk app/web: "Anggota pelayanan Worship atau Multimedia
 * (Koordinator ke atas)". `names` sudah berisi keterangan level bila ada.
 */
export function audienceLabel(names: string[]): string | null {
  if (!names.length) return null;
  const list = names.length === 1 ? names[0]! : `${names.slice(0, -1).join(', ')} atau ${names[names.length - 1]}`;
  return `Anggota pelayanan ${list}`;
}

/** "Worship (Koordinator ke atas)" — nama role terendah yang memenuhi level minimal. */
function nameWithLevel(p: { nama: string; roles: { nama: string; level: number }[] }, minLevel: number | null): string {
  if (minLevel === null || minLevel === undefined) return p.nama;
  const r = p.roles.filter((x) => x.level >= minLevel).sort((a, b) => a.level - b.level)[0];
  return `${p.nama} (${r ? `${r.nama} ke atas` : `level ${minLevel} ke atas`})`;
}

/** Nama pelayanan audiens event + apakah jemaat anggota aktif salah satunya. */
export async function eventAudienceStatus(
  eventId: string,
  jemaatId: string | null,
): Promise<{ names: string[]; ok: boolean }> {
  const rows = await prisma.eventAudiencePelayanan.findMany({
    where: { eventId },
    select: {
      pelayananId: true,
      minLevel: true,
      pelayanan: { select: { nama: true, roles: { select: { nama: true, level: true } } } },
    },
    orderBy: { createdAt: 'asc' },
  });
  if (!rows.length) return { names: [], ok: true };
  const names = rows.map((r) => nameWithLevel(r.pelayanan, r.minLevel));
  if (!jemaatId) return { names, ok: false };
  const mine = await prisma.jemaatPelayanan.findMany({
    where: { jemaatId, isActive: true, pelayananId: { in: rows.map((r) => r.pelayananId) } },
    select: { pelayananId: true, pelayananRole: { select: { level: true } } },
  });
  const ok = rows.some((r) =>
    mine.some((m) => m.pelayananId === r.pelayananId && (r.minLevel === null || m.pelayananRole.level >= r.minLevel)),
  );
  return { names, ok };
}

/**
 * Simpan audiens (replace all). `undefined` = tidak diubah.
 * `list` (dengan minLevel) diutamakan; `ids` = bentuk lama (semua anggota).
 */
export async function saveEventAudience(
  eventId: string,
  ids: string[] | undefined,
  list?: { pelayananId: string; minLevel?: number | null }[],
): Promise<void> {
  const items = list ?? ids?.map((pelayananId) => ({ pelayananId, minLevel: null }));
  if (items === undefined) return;
  const byId = new Map<string, number | null>();
  for (const it of items) byId.set(it.pelayananId, it.minLevel ?? null);
  const unique = [...byId.keys()];
  if (unique.length) {
    const found = await prisma.pelayanan.count({ where: { id: { in: unique }, isActive: true } });
    if (found !== unique.length) throw BadRequest('Pelayanan audiens tidak ditemukan atau nonaktif.');
  }
  await prisma.$transaction([
    prisma.eventAudiencePelayanan.deleteMany({ where: { eventId } }),
    ...(unique.length
      ? [
          prisma.eventAudiencePelayanan.createMany({
            data: unique.map((pelayananId) => ({ eventId, pelayananId, minLevel: byId.get(pelayananId) ?? null })),
          }),
        ]
      : []),
  ]);
}

export const eventAudienceInclude = {
  audiencePelayanan: {
    orderBy: { createdAt: 'asc' as const },
    select: { minLevel: true, pelayanan: { select: { id: true, nama: true } } },
  },
};
