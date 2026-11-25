/**
 * Konseling (2026-12) — helper bersama app & Portal.
 *
 * Konselor = jemaat aktif yang menjadi anggota aktif pelayanan (dan peran,
 * bila diisi) yang dikonfigurasi di Portal → Konseling → Pengaturan.
 * Isi konseling hanya untuk konselor yang ditugaskan & admin menu Konseling.
 */
import { prisma, type Prisma } from '@ecc/database';
import { createNotification } from './notification.js';

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const OPEN_STATUSES = ['BARU', 'DITUGASKAN', 'DIJADWALKAN'];

/** Where JemaatPelayanan untuk konselor; null = belum dikonfigurasi. */
export async function konselorPelayananWhere(): Promise<Prisma.JemaatPelayananWhereInput | null> {
  const cfg = await prisma.konselingKonselorPelayanan.findMany({ select: { pelayananId: true, pelayananRoleId: true } });
  if (!cfg.length) return null;
  return {
    isActive: true,
    OR: cfg.map((c) => (c.pelayananRoleId ? { pelayananId: c.pelayananId, pelayananRoleId: c.pelayananRoleId } : { pelayananId: c.pelayananId })),
  };
}

export async function isKonselor(jemaatId: string): Promise<boolean> {
  const w = await konselorPelayananWhere();
  if (!w) return false;
  return (await prisma.jemaat.count({ where: { id: jemaatId, isActive: true, jemaatPelayanan: { some: w } } })) > 0;
}

export const personSelect = { id: true, namaLengkap: true, fotoUrl: true, jenisKelamin: true } as const;

export async function peopleMap(ids: (string | null | undefined)[]) {
  const uniq = [...new Set(ids.filter((x): x is string => !!x))];
  if (!uniq.length) return new Map<string, { id: string; namaLengkap: string; fotoUrl: string | null; jenisKelamin: 'L' | 'P' | null }>();
  const rows = await prisma.jemaat.findMany({ where: { id: { in: uniq } }, select: personSelect });
  return new Map(rows.map((r) => [r.id, r]));
}

type Row = Prisma.KonselingRequestGetPayload<object>;

/** Tampilan untuk jemaat pengaju (nama konselor, jadwal, catatan konselor). */
export function ownerView(r: Row, people: Awaited<ReturnType<typeof peopleMap>>) {
  const k = r.konselorId ? people.get(r.konselorId) : null;
  return {
    id: r.id,
    pokokMasalah: r.pokokMasalah,
    harapan: r.harapan,
    jadwalUsulan: r.jadwalUsulan,
    catatanJadwal: r.catatanJadwal,
    preferensiGender: r.preferensiGender,
    kontakNoHp: r.kontakNoHp,
    kontakEmail: r.kontakEmail,
    status: r.status,
    konselor: k ? { id: k.id, namaLengkap: k.namaLengkap, fotoUrl: k.fotoUrl } : null,
    assignedAt: r.assignedAt,
    jadwalFinal: r.jadwalFinal,
    catatanKonselor: r.catatanKonselor,
    selesaiAt: r.selesaiAt,
    dibatalkanAt: r.dibatalkanAt,
    dibatalkanOleh: r.dibatalkanOleh,
    alasanBatal: r.alasanBatal,
    createdAt: r.createdAt,
    canCancel: OPEN_STATUSES.includes(r.status),
  };
}

/** Tampilan untuk konselor (data jemaat + kontak yang disetujui). */
export async function konselorView(r: Row) {
  const j = await prisma.jemaat.findUnique({
    where: { id: r.jemaatId },
    select: { ...personSelect, tanggalLahir: true, cabang: { select: { nama: true } }, statusPernikahan: true },
  });
  let usia: number | null = null;
  if (j?.tanggalLahir) {
    const n = new Date();
    usia = n.getUTCFullYear() - j.tanggalLahir.getUTCFullYear();
    const m = n.getUTCMonth() - j.tanggalLahir.getUTCMonth();
    if (m < 0 || (m === 0 && n.getUTCDate() < j.tanggalLahir.getUTCDate())) usia--;
  }
  return {
    id: r.id,
    pokokMasalah: r.pokokMasalah,
    harapan: r.harapan,
    jadwalUsulan: r.jadwalUsulan,
    catatanJadwal: r.catatanJadwal,
    preferensiGender: r.preferensiGender,
    status: r.status,
    jadwalFinal: r.jadwalFinal,
    catatanKonselor: r.catatanKonselor,
    assignedAt: r.assignedAt,
    selesaiAt: r.selesaiAt,
    dibatalkanAt: r.dibatalkanAt,
    alasanBatal: r.alasanBatal,
    createdAt: r.createdAt,
    jemaat: j
      ? {
          id: j.id,
          namaLengkap: j.namaLengkap,
          fotoUrl: j.fotoUrl,
          jenisKelamin: j.jenisKelamin,
          usia,
          cabang: j.cabang?.nama ?? null,
          statusPernikahan: j.statusPernikahan,
        }
      : null,
    kontak: { noHp: r.kontakNoHp, email: r.kontakEmail, disetujuiAt: r.kontakDisetujuiAt },
  };
}

export const fmtWaktu = (d: Date) =>
  d.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) + ' WIB';

export function notifyJemaat(jemaatId: string, type: 'KONSELING_SCHEDULED' | 'KONSELING_UPDATED', title: string, body: string, id: string) {
  void createNotification({ jemaatId, type, title, body, actionUrl: `/konseling/${id}`, metadata: { konselingId: id } });
}

export function notifyKonselor(jemaatId: string, title: string, body: string, id: string) {
  void createNotification({ jemaatId, type: 'KONSELING_ASSIGNED', title, body, actionUrl: `/konseling/${id}?as=konselor`, metadata: { konselingId: id } });
}
