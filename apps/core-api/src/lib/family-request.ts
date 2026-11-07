/**
 * Permintaan hubungan keluarga (2.4.7).
 *
 * Menambah jemaat yang sudah punya akun (scan QR, input kode, cari jemaat,
 * no HP) tidak langsung menghubungkan — dibuat permintaan yang harus
 * disetujui orangnya, atau wali utamanya bila ia tanggungan tanpa HP.
 * Mencegah orang menambahkan jemaat acak sebagai keluarga.
 *
 * Penambahan oleh admin (Portal) dan "Daftarkan Baru" tetap langsung.
 */
import type { Request } from 'express';
import { prisma } from '@ecc/database';
import type { FamilyRole } from '@ecc/shared-types';
import { BadRequest, Conflict, NotFound } from './errors.js';
import { createNotification } from './notification.js';
import { resolveTipeRelasiId, upsertJemaatRelasi } from './family-relation.js';

export type FamilyVia = 'KODE' | 'PHONE' | 'SEARCH';

/** App baru (≥ 2.4.7) mengirim header ini dan memahami respons PENDING. */
export function supportsFamilyRequest(req: Request): boolean {
  return (req.get('x-family-request') ?? '') === '1';
}

export async function createFamilyLinkRequest(
  requesterId: string,
  targetId: string,
  input: { role?: FamilyRole; tipeRelasiId?: string },
  via: FamilyVia,
) {
  if (requesterId === targetId) throw BadRequest('Tidak bisa link diri sendiri.');
  const [self, target, linked] = await Promise.all([
    prisma.jemaat.findUnique({ where: { id: requesterId }, select: { id: true, namaLengkap: true, jenisKelamin: true } }),
    prisma.jemaat.findUnique({
      where: { id: targetId },
      select: { id: true, namaLengkap: true, kode: true, jenisKelamin: true, noHp: true, primaryGuardianId: true, isActive: true },
    }),
    prisma.jemaatRelasi.findFirst({ where: { jemaatId: requesterId, jemaatTerkaitId: targetId }, select: { id: true } }),
  ]);
  if (!self || !target) throw NotFound('Jemaat tidak ditemukan.');
  if (!target.isActive) throw BadRequest(`Jemaat "${target.namaLengkap}" sudah nonaktif. Hubungi admin.`);
  if (linked) throw Conflict(`${target.namaLengkap} sudah terhubung sebagai keluarga Anda.`);

  // Tanggungan tanpa HP → disetujui wali utamanya.
  const viaGuardian = !target.noHp && !!target.primaryGuardianId && target.primaryGuardianId !== targetId;
  const approverId = viaGuardian ? target.primaryGuardianId! : target.id;

  const tipeRelasiId = await prisma.$transaction((tx) =>
    resolveTipeRelasiId(tx, input, target.jenisKelamin as 'L' | 'P' | null, self.jenisKelamin as 'L' | 'P' | null),
  );
  const tipe = await prisma.tipeRelasiKeluarga.findUnique({ where: { id: tipeRelasiId }, select: { id: true, nama: true } });
  if (!tipe) throw BadRequest('Tipe hubungan tidak valid.');

  // Pemohon = wali yang menyetujui (mis. menghubungkan tanggungannya sendiri) → langsung.
  if (approverId === requesterId) {
    const link = await upsertJemaatRelasi(requesterId, targetId, { tipeRelasiId }, { notify: false });
    return { status: 'LINKED' as const, link, target, tipe };
  }

  const dup = await prisma.familyLinkRequest.findFirst({
    where: {
      status: 'PENDING',
      OR: [
        { requesterId, targetId },
        { requesterId: targetId, targetId: requesterId },
      ],
    },
    select: { requesterId: true },
  });
  if (dup?.requesterId === requesterId) {
    throw Conflict(`Permintaan ke ${target.namaLengkap} sudah terkirim dan masih menunggu persetujuan.`);
  }
  if (dup) {
    throw Conflict(`${target.namaLengkap} sudah mengirim permintaan keluarga ke Anda — buka Keluarga untuk menyetujuinya.`);
  }

  const created = await prisma.familyLinkRequest.create({
    data: { requesterId, targetId, approverId, tipeRelasiId, via },
    select: { id: true },
  });
  void createNotification({
    jemaatId: approverId,
    type: 'FAMILY_LINK_REQUESTED',
    title: 'Permintaan hubungan keluarga',
    body: viaGuardian
      ? `${self.namaLengkap} ingin menambahkan ${target.namaLengkap} (tanggungan Anda) sebagai "${tipe.nama}" di keluarganya. Setujui atau tolak di menu Keluarga.`
      : `${self.namaLengkap} ingin menambahkan Anda sebagai "${tipe.nama}" di keluarganya. Setujui atau tolak di menu Keluarga.`,
    actionUrl: '/family',
    metadata: { requestId: created.id, byJemaatId: requesterId, targetId },
  });
  return {
    status: 'PENDING' as const,
    requestId: created.id,
    target,
    tipe,
    viaGuardian,
    message: viaGuardian
      ? `Permintaan terkirim ke wali ${target.namaLengkap}. ${target.namaLengkap} masuk ke Keluarga Anda setelah disetujui.`
      : `Permintaan terkirim ke ${target.namaLengkap}. Ia masuk ke Keluarga Anda setelah menyetujui.`,
  };
}

const personSelect = { id: true, namaLengkap: true, kode: true, fotoUrl: true, cabang: { select: { nama: true } } } as const;

/** Permintaan masuk (saya penyetuju) & keluar (saya pemohon) yang masih menunggu. */
export async function listFamilyLinkRequests(jemaatId: string) {
  const sel = {
    id: true,
    via: true,
    createdAt: true,
    requester: { select: personSelect },
    target: { select: personSelect },
    tipeRelasi: { select: { id: true, nama: true } },
    approverId: true,
  } as const;
  const [incoming, outgoing] = await Promise.all([
    prisma.familyLinkRequest.findMany({ where: { approverId: jemaatId, status: 'PENDING' }, orderBy: { createdAt: 'desc' }, select: sel }),
    prisma.familyLinkRequest.findMany({ where: { requesterId: jemaatId, status: 'PENDING' }, orderBy: { createdAt: 'desc' }, select: sel }),
  ]);
  const flat = (r: (typeof incoming)[number]) => ({
    id: r.id,
    via: r.via,
    createdAt: r.createdAt,
    tipeRelasi: r.tipeRelasi,
    requester: { ...r.requester, cabang: r.requester.cabang.nama },
    target: { ...r.target, cabang: r.target.cabang.nama },
    // Disetujui wali (target = tanggungan, bukan penyetuju).
    viaGuardian: r.approverId !== r.target.id,
  });
  return { incoming: incoming.map(flat), outgoing: outgoing.map(flat) };
}

async function claim(id: string, approverId: string, status: 'APPROVED' | 'REJECTED', alasan?: string | null) {
  const r = await prisma.familyLinkRequest.findUnique({
    where: { id },
    select: {
      id: true,
      approverId: true,
      requesterId: true,
      targetId: true,
      tipeRelasiId: true,
      status: true,
      requester: { select: { namaLengkap: true } },
      target: { select: { namaLengkap: true } },
      approver: { select: { namaLengkap: true } },
      tipeRelasi: { select: { nama: true } },
    },
  });
  if (!r || r.approverId !== approverId) throw NotFound('Permintaan tidak ditemukan.');
  const upd = await prisma.familyLinkRequest.updateMany({
    where: { id, status: 'PENDING' },
    data: { status, reviewedAt: new Date(), alasanTolak: alasan ?? null },
  });
  if (upd.count === 0) throw Conflict('Permintaan ini sudah diproses.');
  return r;
}

export async function approveFamilyLinkRequest(id: string, approverId: string) {
  const r = await claim(id, approverId, 'APPROVED');
  try {
    await upsertJemaatRelasi(r.requesterId, r.targetId, { tipeRelasiId: r.tipeRelasiId }, { notify: false });
  } catch (e) {
    await prisma.familyLinkRequest.update({ where: { id }, data: { status: 'PENDING', reviewedAt: null } });
    throw e;
  }
  void createNotification({
    jemaatId: r.requesterId,
    type: 'FAMILY_LINK_APPROVED',
    title: 'Permintaan keluarga disetujui',
    body: `${r.target.namaLengkap} kini ada di Keluarga Anda sebagai "${r.tipeRelasi.nama}".`,
    actionUrl: '/family',
    metadata: { requestId: id, targetId: r.targetId },
  });
  return r;
}

export async function rejectFamilyLinkRequest(id: string, approverId: string, alasan?: string | null) {
  const r = await claim(id, approverId, 'REJECTED', alasan);
  void createNotification({
    jemaatId: r.requesterId,
    type: 'FAMILY_LINK_REJECTED',
    title: 'Permintaan keluarga ditolak',
    body: `Permintaan menambahkan ${r.target.namaLengkap} sebagai "${r.tipeRelasi.nama}" tidak disetujui.${alasan ? ` Alasan: ${alasan}` : ''}`,
    actionUrl: '/family',
    metadata: { requestId: id, targetId: r.targetId },
  });
  return r;
}

export async function cancelFamilyLinkRequest(id: string, requesterId: string) {
  const upd = await prisma.familyLinkRequest.updateMany({
    where: { id, requesterId, status: 'PENDING' },
    data: { status: 'CANCELLED', reviewedAt: new Date() },
  });
  if (upd.count === 0) throw Conflict('Permintaan tidak ditemukan atau sudah diproses.');
}
