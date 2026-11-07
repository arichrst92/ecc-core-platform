/**
 * Family relation helpers — dipakai oleh mobile /admin/me/family/* dan
 * portal /admin/keluarga/* untuk consistent behavior.
 *
 * Storage single source: `jemaat_relasi` + `tipe_relasi_keluarga`.
 * Auto-reciprocal gender-aware — kalau A tag "Suami" B, otomatis B punya
 * "Istri" A, dst.
 */
import { prisma, Prisma } from '@ecc/database';
import type { FamilyRole } from '@ecc/shared-types';
import { BadRequest, NotFound } from './errors.js';
import { createNotification } from './notification.js';
import { sendWaIfEnabled } from './wa-notif.js';

/**
 * Return set of jemaatIds yang user boleh act on (view/edit/cancel/upload)
 * atas nama mereka: diri sendiri + semua relasi keluarga direct (JemaatRelasi
 * dgn jemaatId=self) + transitive via pasangan (anak/ortu/saudara pasangan,
 * sejalan dgn GET /me/family viaSpouse behavior).
 *
 * Tidak include kakek/nenek/cucu extended, tidak include suami/istri
 * pasangan (privacy). Include self.
 *
 * Dipakai di endpoint yang butuh authorize "act on family": mine-and-family
 * participation list, self-cancel by id, upload bukti untuk family.
 */
export async function getFamilyJemaatIds(selfId: string): Promise<Set<string>> {
  const result = new Set<string>([selfId]);

  const direct = await prisma.jemaatRelasi.findMany({
    where: { jemaatId: selfId },
    select: {
      jemaatTerkaitId: true,
      tipeRelasi: { select: { nama: true } },
    },
  });

  const spouseIds: string[] = [];
  for (const r of direct) {
    result.add(r.jemaatTerkaitId);
    if (r.tipeRelasi.nama === 'Suami' || r.tipeRelasi.nama === 'Istri') {
      spouseIds.push(r.jemaatTerkaitId);
    }
  }

  if (spouseIds.length > 0) {
    const spouseFamily = await prisma.jemaatRelasi.findMany({
      where: {
        jemaatId: { in: spouseIds },
        NOT: { jemaatTerkaitId: { in: Array.from(result) } },
        tipeRelasi: {
          nama: {
            in: [
              'Anak Laki-Laki',
              'Anak Perempuan',
              'Ayah',
              'Ibu',
              'Saudara Kandung',
            ],
          },
        },
      },
      select: { jemaatTerkaitId: true },
    });
    for (const r of spouseFamily) {
      result.add(r.jemaatTerkaitId);
    }
  }

  // Tamu saya (non-anggota yang saya bawa) — boleh saya daftarkan, batalkan,
  // bayarkan, dan check-in-kan seperti keluarga.
  const tamu = await prisma.jemaatTamu.findMany({ where: { inviterId: selfId }, select: { tamuId: true } });
  for (const t of tamu) result.add(t.tamuId);

  return result;
}

/**
 * Broad enum → nama TipeRelasiKeluarga default (as seeded). Refine di
 * resolver berdasarkan gender.
 */
const ROLE_TO_TIPE_NAMA: Record<FamilyRole, string> = {
  SPOUSE: 'Suami',
  CHILD: 'Anak Laki-Laki',
  PARENT: 'Ayah',
  SIBLING: 'Saudara Kandung',
  GUARDIAN: 'Wali',
  OTHER: 'Lainnya',
};

/**
 * Broad enum reverse: TipeRelasi.nama → FamilyRole (untuk response backward
 * compat mobile lama).
 */
const TIPE_TO_BROAD_ROLE: Record<string, FamilyRole> = {
  Suami: 'SPOUSE',
  Istri: 'SPOUSE',
  Ayah: 'PARENT',
  Ibu: 'PARENT',
  'Anak Laki-Laki': 'CHILD',
  'Anak Perempuan': 'CHILD',
  'Saudara Kandung': 'SIBLING',
  Kakek: 'GUARDIAN',
  Nenek: 'GUARDIAN',
  Cucu: 'OTHER',
  Wali: 'GUARDIAN',
  Lainnya: 'OTHER',
};

export function tipeNamaToBroadRole(nama: string): FamilyRole {
  return TIPE_TO_BROAD_ROLE[nama] ?? 'OTHER';
}

/**
 * Resolve tipeRelasiId dari input (role atau tipeRelasiId langsung).
 * Refine granularity dgn gender kalau input pakai role broad.
 */
export async function resolveTipeRelasiId(
  tx: Prisma.TransactionClient,
  input: { role?: FamilyRole; tipeRelasiId?: string },
  targetJenisKelamin: 'L' | 'P' | null,
  selfJenisKelamin: 'L' | 'P' | null,
): Promise<string> {
  if (input.tipeRelasiId) {
    const t = await tx.tipeRelasiKeluarga.findUnique({
      where: { id: input.tipeRelasiId },
      select: { id: true },
    });
    if (!t) throw BadRequest('tipeRelasiId tidak ditemukan');
    return t.id;
  }
  if (!input.role) throw BadRequest('role atau tipeRelasiId harus dikirim');

  let namaTipe = ROLE_TO_TIPE_NAMA[input.role];
  if (input.role === 'SPOUSE') {
    namaTipe = selfJenisKelamin === 'P' ? 'Suami' : 'Istri';
  } else if (input.role === 'CHILD') {
    namaTipe = targetJenisKelamin === 'P' ? 'Anak Perempuan' : 'Anak Laki-Laki';
  } else if (input.role === 'PARENT') {
    namaTipe = targetJenisKelamin === 'P' ? 'Ibu' : 'Ayah';
  }
  const tipe = await tx.tipeRelasiKeluarga.findUnique({
    where: { nama: namaTipe },
    select: { id: true },
  });
  if (!tipe) throw BadRequest(`TipeRelasi "${namaTipe}" belum di-seed`);
  return tipe.id;
}

/**
 * Reciprocal tipe nama — untuk create row balik B → A.
 * Pakai gender info reciprocal target (yaitu jemaat A dari sisi B).
 */
export function reciprocalTipeNama(
  tipeNama: string,
  reciprocalTargetGender: 'L' | 'P' | null,
): string {
  const M: Record<string, string> = {
    Suami: 'Istri',
    Istri: 'Suami',
    Ayah: reciprocalTargetGender === 'P' ? 'Anak Perempuan' : 'Anak Laki-Laki',
    Ibu: reciprocalTargetGender === 'P' ? 'Anak Perempuan' : 'Anak Laki-Laki',
    'Anak Laki-Laki': reciprocalTargetGender === 'P' ? 'Ibu' : 'Ayah',
    'Anak Perempuan': reciprocalTargetGender === 'P' ? 'Ibu' : 'Ayah',
    'Saudara Kandung': 'Saudara Kandung',
    Kakek: 'Cucu',
    Nenek: 'Cucu',
    Cucu: reciprocalTargetGender === 'P' ? 'Nenek' : 'Kakek',
    Wali: 'Lainnya',
    Lainnya: 'Lainnya',
  };
  return M[tipeNama] ?? 'Lainnya';
}

/**
 * Auto-reciprocal family link — 2 row di JemaatRelasi.
 * Idempotent via deleteMany + create fresh.
 */
export async function upsertJemaatRelasi(
  selfId: string,
  targetId: string,
  input: { role?: FamilyRole; tipeRelasiId?: string },
  opts: { notify?: boolean } = {},
): Promise<{ id: string; tipeRelasi: { id: string; nama: string } }> {
  if (selfId === targetId) throw BadRequest('Tidak bisa link ke diri sendiri.');

  const result = await prisma.$transaction(async (tx) => {
    const [self, target] = await Promise.all([
      tx.jemaat.findUnique({
        where: { id: selfId },
        select: { id: true, jenisKelamin: true, namaLengkap: true },
      }),
      tx.jemaat.findUnique({
        where: { id: targetId },
        select: { id: true, jenisKelamin: true, namaLengkap: true },
      }),
    ]);
    if (!self) throw NotFound('Jemaat self tidak ditemukan');
    if (!target) throw NotFound('Jemaat target tidak ditemukan');

    const tipeAId = await resolveTipeRelasiId(
      tx,
      input,
      target.jenisKelamin,
      self.jenisKelamin,
    );
    const tipeA = await tx.tipeRelasiKeluarga.findUnique({
      where: { id: tipeAId },
      select: { id: true, nama: true },
    });
    if (!tipeA) throw BadRequest('TipeRelasi tidak valid');

    const recipNama = reciprocalTipeNama(tipeA.nama, self.jenisKelamin);
    const tipeB = await tx.tipeRelasiKeluarga.findUnique({
      where: { nama: recipNama },
      select: { id: true, nama: true },
    });
    if (!tipeB) throw BadRequest(`Reciprocal tipe "${recipNama}" belum di-seed`);

    // Hapus row lama antara pair ini + create fresh (idempotent).
    await tx.jemaatRelasi.deleteMany({
      where: {
        OR: [
          { jemaatId: selfId, jemaatTerkaitId: targetId },
          { jemaatId: targetId, jemaatTerkaitId: selfId },
        ],
      },
    });
    const a = await tx.jemaatRelasi.create({
      data: {
        jemaatId: selfId,
        jemaatTerkaitId: targetId,
        tipeRelasiId: tipeA.id,
      },
      include: { tipeRelasi: { select: { id: true, nama: true } } },
    });
    await tx.jemaatRelasi.create({
      data: {
        jemaatId: targetId,
        jemaatTerkaitId: selfId,
        tipeRelasiId: tipeB.id,
      },
    });
    // Lengkapi keluarga inti: pasangan ↔ anak (mis. suami menambah istri &
    // anak → istri juga otomatis terhubung sebagai ibu dari anak-anak itu).
    await lengkapiKeluargaInti(tx, selfId, targetId, tipeA.nama);
    return { a, self, target, tipeA, tipeB };
  });

  // Notif in-app ke target jemaat — consent info (fire-and-forget).
  // Pakai tipeA (bagaimana self memandang target) untuk body notif, karena
  // itu describe konteks "aku ditambahkan sebagai apa di daftar keluarga X".
  // Contoh: Ari(L) add Sarah(P) SPOUSE → tipeA=Istri, tipeB=Suami.
  //   Notif ke Sarah: "Ari menambahkan Anda sebagai Istri di daftar keluarganya"
  //   (bukan "Suami" — Sarah perempuan).
  // Lewat permintaan yang sudah disetujui target → tidak perlu notif "Anda ditambahkan".
  if (opts.notify === false) return result.a;

  void createNotification({
    jemaatId: targetId,
    type: 'FAMILY_LINKED',
    title: `Anda ditambahkan sebagai ${result.tipeA.nama}`,
    body: `${result.self.namaLengkap} menambahkan Anda sebagai "${result.tipeA.nama}" di daftar keluarganya. Kalau ini bukan Anda / tidak benar, hubungi admin untuk hapus.`,
    actionUrl: `/family`,
    metadata: {
      byJemaatId: selfId,
      byNamaLengkap: result.self.namaLengkap,
      tipeRelasi: result.tipeA.nama,
      reciprocalTipe: result.tipeB.nama,
    },
  });

  // WA notif (opt-in via WaNotificationConfig admin)
  void (async () => {
    const targetFull = await prisma.jemaat.findUnique({
      where: { id: targetId },
      select: { noHp: true, namaLengkap: true },
    });
    if (!targetFull?.noHp) return;
    await sendWaIfEnabled('FAMILY_LINKED', targetFull.noHp, {
      nama: targetFull.namaLengkap,
      by_nama: result.self.namaLengkap,
      tipe_relasi: result.tipeA.nama,
    });
  })();

  return result.a;
}

// ------------------------------------------------------------------ keluarga inti

const ANAK = ['Anak Laki-Laki', 'Anak Perempuan'];
const PASANGAN = ['Suami', 'Istri'];

/** Relasi keluar dari `id` dengan tipe tertentu → [{ id terkait, nama tipe }]. */
async function relasiDari(tx: Prisma.TransactionClient, id: string, tipe: string[]) {
  const rows = await tx.jemaatRelasi.findMany({
    where: { jemaatId: id, tipeRelasi: { nama: { in: tipe } } },
    select: { jemaatTerkaitId: true, tipeRelasi: { select: { nama: true } } },
  });
  return rows.map((r) => ({ id: r.jemaatTerkaitId, tipe: r.tipeRelasi.nama }));
}

/**
 * Pastikan relasi orang tua ↔ anak ada (dua arah). Tidak menimpa relasi lain
 * yang sudah dibuat manual antara keduanya. `parentIsFemale` dipakai bila jenis
 * kelamin orang tua belum diisi (diambil dari tipe Suami/Istri).
 */
async function pastikanOrtuAnak(
  tx: Prisma.TransactionClient,
  parentId: string,
  childId: string,
  parentIsFemale: boolean | null,
) {
  if (parentId === childId) return;
  const ada = await tx.jemaatRelasi.findFirst({
    where: {
      OR: [
        { jemaatId: parentId, jemaatTerkaitId: childId },
        { jemaatId: childId, jemaatTerkaitId: parentId },
      ],
    },
    select: { id: true },
  });
  if (ada) return;
  const [parent, child] = await Promise.all([
    tx.jemaat.findUnique({ where: { id: parentId }, select: { jenisKelamin: true } }),
    tx.jemaat.findUnique({ where: { id: childId }, select: { jenisKelamin: true } }),
  ]);
  if (!parent || !child) return;
  const ortuP = parent.jenisKelamin ? parent.jenisKelamin === 'P' : parentIsFemale === true;
  const [tAnak, tOrtu] = await Promise.all([
    tx.tipeRelasiKeluarga.findUnique({ where: { nama: child.jenisKelamin === 'P' ? 'Anak Perempuan' : 'Anak Laki-Laki' }, select: { id: true } }),
    tx.tipeRelasiKeluarga.findUnique({ where: { nama: ortuP ? 'Ibu' : 'Ayah' }, select: { id: true } }),
  ]);
  if (!tAnak || !tOrtu) return;
  await tx.jemaatRelasi.createMany({
    data: [
      { jemaatId: parentId, jemaatTerkaitId: childId, tipeRelasiId: tAnak.id },
      { jemaatId: childId, jemaatTerkaitId: parentId, tipeRelasiId: tOrtu.id },
    ],
    skipDuplicates: true,
  });
}

/**
 * Setelah relasi self → target dibuat dengan tipe `tipeNama` (cara self
 * memandang target), sambungkan pasangan dengan anak:
 *  - target = anak self      → pasangan self juga orang tua target
 *  - target = ayah/ibu self  → pasangan target juga orang tua self
 *  - target = pasangan self  → anak self jadi anak target, anak target jadi anak self
 */
export async function lengkapiKeluargaInti(
  tx: Prisma.TransactionClient,
  selfId: string,
  targetId: string,
  tipeNama: string,
) {
  if (ANAK.includes(tipeNama)) {
    for (const p of await relasiDari(tx, selfId, PASANGAN)) {
      await pastikanOrtuAnak(tx, p.id, targetId, p.tipe === 'Istri');
    }
  } else if (tipeNama === 'Ayah' || tipeNama === 'Ibu') {
    for (const p of await relasiDari(tx, targetId, PASANGAN)) {
      await pastikanOrtuAnak(tx, p.id, selfId, p.tipe === 'Istri');
    }
  } else if (PASANGAN.includes(tipeNama)) {
    const targetIsFemale = tipeNama === 'Istri';
    for (const c of await relasiDari(tx, selfId, ANAK)) {
      await pastikanOrtuAnak(tx, targetId, c.id, targetIsFemale);
    }
    for (const c of await relasiDari(tx, targetId, ANAK)) {
      await pastikanOrtuAnak(tx, selfId, c.id, !targetIsFemale);
    }
  }
}
