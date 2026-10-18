/**
 * Prayer Request ("Doa") — helper bersama (me + admin).
 *
 * Status tampilan: TERJAWAB jika terjawabAt terisi, selain itu status petugas.
 * Petugas doa = jemaat dengan JemaatRole aktif yang cocok dengan salah satu
 * baris PrayerPetugasRole (subRoleId NULL = semua sub-role role tsb).
 */
import { prisma, type Prisma } from '@ecc/database';
import {
  PRAYER_KATEGORI_LABEL,
  type PrayerDisplayStatus,
  type PrayerKategori,
} from '@ecc/shared-types';
import { createNotification } from './notification.js';
import { sendWaIfEnabled } from './wa-notif.js';

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function displayStatus(r: { status: string; terjawabAt: Date | null }): PrayerDisplayStatus {
  return r.terjawabAt ? 'TERJAWAB' : (r.status as PrayerDisplayStatus);
}

export function kategoriLabel(k: string): string {
  return PRAYER_KATEGORI_LABEL[k as PrayerKategori]?.id ?? k;
}

/** Where-filter untuk status tampilan (eksklusif: TERJAWAB menimpa status). */
export function statusWhere(s: string | undefined): Prisma.PrayerRequestWhereInput {
  if (s === 'TERJAWAB') return { terjawabAt: { not: null } };
  if (s === 'BARU' || s === 'DITUGASKAN' || s === 'SUDAH_DIDOAKAN') return { status: s, terjawabAt: null };
  return {};
}

/** JemaatRole where untuk role petugas yang dikonfigurasi. null = belum dikonfigurasi. */
export async function petugasRoleWhere(): Promise<Prisma.JemaatRoleWhereInput | null> {
  const cfg = await prisma.prayerPetugasRole.findMany({ select: { roleId: true, subRoleId: true } });
  if (cfg.length === 0) return null;
  return {
    isActive: true,
    OR: cfg.map((c) => (c.subRoleId ? { roleId: c.roleId, subRoleId: c.subRoleId } : { roleId: c.roleId })),
  };
}

export async function isPetugasDoa(jemaatId: string): Promise<boolean> {
  const w = await petugasRoleWhere();
  if (!w) return false;
  const n = await prisma.jemaatRole.count({ where: { ...w, jemaatId } });
  return n > 0;
}

export const prayerPersonSelect = { id: true, namaLengkap: true, fotoUrl: true } as const;

/** Select untuk tampilan pengirim (app) — nama petugas tidak ditampilkan. */
export const mineSelect = {
  id: true,
  kategori: true,
  untuk: true,
  untukNama: true,
  untukJemaatId: true,
  untukJemaat: { select: { id: true, namaLengkap: true } },
  isi: true,
  isAnonim: true,
  status: true,
  assignedAt: true,
  didoakanAt: true,
  catatanPetugas: true,
  terjawabAt: true,
  kesaksian: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.PrayerRequestSelect;

type MineRow = Prisma.PrayerRequestGetPayload<{ select: typeof mineSelect }>;

export function serializeMine(r: MineRow) {
  const status = displayStatus(r);
  return {
    ...r,
    untukNama: r.untukNama ?? r.untukJemaat?.namaLengkap ?? null,
    displayStatus: status,
    canEdit: !r.terjawabAt && (r.status === 'BARU' || r.status === 'DITUGASKAN'),
  };
}

/** Select untuk petugas (app) — pengirim disembunyikan bila anonim. */
export const assignedSelect = {
  ...mineSelect,
  petugasId: true,
  jemaat: { select: prayerPersonSelect },
  cabang: { select: { id: true, nama: true } },
} satisfies Prisma.PrayerRequestSelect;

type AssignedRow = Prisma.PrayerRequestGetPayload<{ select: typeof assignedSelect }>;

export function serializeAssigned(r: AssignedRow) {
  const { jemaat, ...rest } = r;
  return {
    ...serializeMine(rest),
    canEdit: false,
    pengirim: r.isAnonim ? null : jemaat,
    cabang: r.cabang,
  };
}

/** Notif in-app + WA ke petugas saat ditugaskan. */
export async function notifyAssigned(prayerId: string) {
  const p = await prisma.prayerRequest.findUnique({
    where: { id: prayerId },
    select: {
      id: true,
      kategori: true,
      isi: true,
      isAnonim: true,
      jemaat: { select: { namaLengkap: true } },
      petugas: { select: { id: true, namaLengkap: true, noHp: true } },
    },
  });
  if (!p?.petugas) return;
  const pengirim = p.isAnonim ? 'Anonim' : p.jemaat.namaLengkap;
  const kategori = kategoriLabel(p.kategori);
  void createNotification({
    jemaatId: p.petugas.id,
    type: 'PRAYER_ASSIGNED',
    title: 'Prayer request baru untuk Anda',
    body: `${pengirim} · ${kategori}: ${p.isi.slice(0, 160)}`,
    actionUrl: `/doa/assigned/${p.id}`,
    metadata: { prayerId: p.id },
  });
  void sendWaIfEnabled('PRAYER_ASSIGNED', p.petugas.noHp, {
    nama: p.petugas.namaLengkap,
    pengirim,
    kategori,
    isi: p.isi.length > 300 ? `${p.isi.slice(0, 300)}…` : p.isi,
  });
}

/** Notif in-app + WA ke pengirim saat doanya sudah didoakan. */
export async function notifyPrayed(prayerId: string) {
  const p = await prisma.prayerRequest.findUnique({
    where: { id: prayerId },
    select: {
      id: true,
      kategori: true,
      catatanPetugas: true,
      deletedAt: true,
      jemaat: { select: { id: true, namaLengkap: true, noHp: true } },
    },
  });
  if (!p || p.deletedAt) return;
  const kategori = kategoriLabel(p.kategori);
  void createNotification({
    jemaatId: p.jemaat.id,
    type: 'PRAYER_PRAYED',
    title: 'Doa Anda sudah didoakan',
    body: p.catatanPetugas ? p.catatanPetugas.slice(0, 200) : `Pokok doa Anda (${kategori}) sudah didoakan oleh tim ECC.`,
    actionUrl: `/doa/${p.id}`,
    metadata: { prayerId: p.id },
  });
  void sendWaIfEnabled('PRAYER_PRAYED', p.jemaat.noHp, {
    nama: p.jemaat.namaLengkap,
    kategori,
    catatan: p.catatanPetugas ? `\n\nCatatan: "${p.catatanPetugas}"` : '',
  });
}
