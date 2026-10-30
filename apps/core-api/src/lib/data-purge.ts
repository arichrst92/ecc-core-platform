/**
 * Penghapusan / penyamaran data pribadi (kepatuhan no. 5 & 14).
 *
 * Kebijakan Privasi v3.0 Bag. 11:
 *   - Akun dihapus → data pribadi dihapus/disamarkan permanen maks. 3 tahun,
 *     atau lebih cepat atas permintaan (admin: Portal → Jemaat → Hapus data permanen).
 *   - Bukti transfer event → maks. 1 tahun setelah event.
 *   - Data tamu → maks. 3 tahun sejak kunjungan terakhir.
 *
 * "Disamarkan" = baris jemaat tetap ada (supaya angka kehadiran/statistik
 * historis tidak berubah) tetapi semua data yang mengenali orang dihapus.
 * Jenis kelamin & cabang dipertahankan karena tidak mengenali seseorang
 * tanpa nama/kontak dan dipakai untuk statistik agregat.
 */
import { prisma, Prisma } from '@ecc/database';
import { logger } from './logger.js';
import {
  deleteEventBuktiTransfer,
  deleteEventDonationBukti,
  deleteProfilePhoto,
  deleteSertifikatFile,
} from './storage.js';

const DAY = 24 * 60 * 60 * 1000;
export const ACCOUNT_RETENTION_DAYS = Number(process.env.ACCOUNT_RETENTION_DAYS ?? 3 * 365);
export const TAMU_RETENTION_DAYS = Number(process.env.TAMU_RETENTION_DAYS ?? 3 * 365);
export const PAYMENT_PROOF_RETENTION_DAYS = Number(process.env.PAYMENT_PROOF_RETENTION_DAYS ?? 365);
const BATCH = 50;

export const PURGED_NAME = 'Data dihapus';

export async function purgeJemaatPersonalData(jemaatId: string, reason: string) {
  const j = await prisma.jemaat.findUnique({
    where: { id: jemaatId },
    select: {
      id: true,
      noHp: true,
      dataPurgedAt: true,
      user: { select: { id: true } },
      sertifikat: { select: { id: true } },
      eventPartisipasi: { select: { id: true, buktiTransferUrl: true, donations: { select: { id: true, buktiTransferUrl: true } } } },
    },
  });
  if (!j) return { purged: false as const, reason: 'not-found' };
  if (j.dataPurgedAt) return { purged: false as const, reason: 'already-purged' };

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.jemaat.update({
      where: { id: j.id },
      data: {
        namaLengkap: PURGED_NAME,
        kode: null,
        email: null,
        noHp: null,
        tanggalLahir: null,
        alamat: null,
        fotoUrl: null,
        pendidikanTerakhir: null,
        statusPekerjaan: null,
        namaKantor: null,
        alamatKantor: null,
        statusPernikahan: null,
        tanggalPernikahan: null,
        sudahBaptisAir: null,
        tanggalBaptisAir: null,
        sudahBaptisRohKudus: null,
        tanggalBaptisRohKudus: null,
        spiritualJourneyLevel: null,
        bapaRohaniJemaatId: null,
        tamuCatatan: null,
        isActive: false,
        deactivatedAt: now,
        deactivationReason: reason.slice(0, 500),
        dataPurgedAt: now,
      },
    });
    if (j.user) {
      await tx.user.update({
        where: { id: j.user.id },
        data: {
          fotoUrl: null,
          faceDescriptor: Prisma.DbNull,
          faceMetadata: Prisma.DbNull,
          faceEnrolledAt: null,
          faceModelVersion: null,
          isActive: false,
        },
      });
      await tx.refreshToken.deleteMany({ where: { userId: j.user.id } });
    }
    // Hubungan & catatan pribadi
    await tx.jemaatPrivacy.deleteMany({ where: { jemaatId: j.id } });
    await tx.jemaatRelasi.deleteMany({ where: { OR: [{ jemaatId: j.id }, { jemaatTerkaitId: j.id }] } });
    await tx.jemaatTamu.deleteMany({ where: { OR: [{ inviterId: j.id }, { tamuId: j.id }] } });
    await tx.homecellTamu.updateMany({ where: { tamuId: j.id }, data: { catatan: null } });
    await tx.bible365Note.deleteMany({ where: { plan: { jemaatId: j.id } } });
    await tx.prayerRequest.updateMany({
      where: { jemaatId: j.id },
      data: { isi: '[dihapus]', untukNama: null, kesaksian: null, catatanPetugas: null },
    });
    await tx.feedback.updateMany({ where: { jemaatId: j.id }, data: { isi: '[dihapus]' } });
    await tx.serviceReview.updateMany({ where: { jemaatId: j.id }, data: { komentar: null, isAnonim: true } });
    await tx.jemaatSertifikat.deleteMany({ where: { jemaatId: j.id } });
    await tx.magicLinkToken.deleteMany({ where: { jemaatId: j.id } });
    await tx.webActionToken.deleteMany({ where: { jemaatId: j.id } });
    await tx.notificationLog.deleteMany({ where: { jemaatId: j.id } });
    await tx.worshipPlay.updateMany({ where: { jemaatId: j.id }, data: { jemaatId: null } });
    await tx.worshipDownload.updateMany({ where: { jemaatId: j.id }, data: { jemaatId: null } });
    await tx.userConsent.updateMany({ where: { jemaatId: j.id }, data: { ipAddress: null, userAgent: null } });
    // Bukti transfer
    await tx.eventParticipation.updateMany({ where: { jemaatId: j.id }, data: { buktiTransferUrl: null, catatan: null } });
    await tx.eventDonation.updateMany({ where: { participation: { jemaatId: j.id } }, data: { buktiTransferUrl: null } });
    if (j.noHp) {
      await tx.otpVerification.deleteMany({ where: { noHp: j.noHp } });
      await tx.faceTelemetryEvent.deleteMany({ where: { noHp: j.noHp } });
      await tx.diagnosticsErrorEvent.deleteMany({ where: { userNoHp: j.noHp } });
      await tx.homecellGuestRequest.deleteMany({ where: { noHp: j.noHp } });
    }
  });

  // File di disk (di luar transaksi; gagal hapus file tidak membatalkan penyamaran)
  const files: Promise<unknown>[] = [deleteProfilePhoto('jemaat', j.id)];
  if (j.user) files.push(deleteProfilePhoto('user', j.user.id));
  for (const s of j.sertifikat) files.push(deleteSertifikatFile(j.id, s.id));
  for (const p of j.eventPartisipasi) {
    if (p.buktiTransferUrl) files.push(deleteEventBuktiTransfer(p.id));
    for (const d of p.donations) if (d.buktiTransferUrl) files.push(deleteEventDonationBukti(d.id));
  }
  const results = await Promise.allSettled(files);
  const fileErrors = results.filter((r) => r.status === 'rejected').length;
  if (fileErrors) logger.warn({ jemaatId: j.id, fileErrors }, 'purge: sebagian file gagal dihapus');
  return { purged: true as const };
}

/** Hapus bukti transfer event yang sudah lewat masa simpan (1 tahun setelah event). */
export async function purgeOldPaymentProofs() {
  const cutoff = new Date(Date.now() - PAYMENT_PROOF_RETENTION_DAYS * DAY);
  const eventDone = {
    OR: [
      { tanggalSelesai: { lt: cutoff } },
      { tanggalSelesai: null, tanggalMulai: { lt: cutoff } },
    ],
  };
  const parts = await prisma.eventParticipation.findMany({
    where: { buktiTransferUrl: { not: null }, event: eventDone },
    select: { id: true },
    take: 500,
  });
  const dons = await prisma.eventDonation.findMany({
    where: { buktiTransferUrl: { not: null }, participation: { event: eventDone } },
    select: { id: true },
    take: 500,
  });
  for (const p of parts) await deleteEventBuktiTransfer(p.id).catch(() => undefined);
  for (const d of dons) await deleteEventDonationBukti(d.id).catch(() => undefined);
  if (parts.length) {
    await prisma.eventParticipation.updateMany({ where: { id: { in: parts.map((p) => p.id) } }, data: { buktiTransferUrl: null } });
  }
  if (dons.length) {
    await prisma.eventDonation.updateMany({ where: { id: { in: dons.map((d) => d.id) } }, data: { buktiTransferUrl: null } });
  }
  return { participationProofs: parts.length, donationProofs: dons.length };
}

/** Akun yang dihapus/nonaktif > 3 tahun → disamarkan permanen. */
export async function purgeExpiredAccounts() {
  const cutoff = new Date(Date.now() - ACCOUNT_RETENTION_DAYS * DAY);
  const rows = await prisma.jemaat.findMany({
    where: { isTamu: false, isActive: false, dataPurgedAt: null, deactivatedAt: { lt: cutoff } },
    select: { id: true },
    take: BATCH,
  });
  for (const r of rows) await purgeJemaatPersonalData(r.id, 'Retensi otomatis: akun nonaktif > 3 tahun');
  return rows.length;
}

/** Tamu tanpa kunjungan/aktivitas > 3 tahun → disamarkan permanen. */
export async function purgeExpiredTamu() {
  const cutoff = new Date(Date.now() - TAMU_RETENTION_DAYS * DAY);
  const rows = await prisma.jemaat.findMany({
    where: {
      isTamu: true,
      dataPurgedAt: null,
      createdAt: { lt: cutoff },
      updatedAt: { lt: cutoff },
      user: null,
      eventPartisipasi: { none: { registeredAt: { gte: cutoff } } },
      reservasi: { none: { createdAt: { gte: cutoff } } },
      tamuHomecellHadir: { none: { createdAt: { gte: cutoff } } },
      tamuHomecell: { none: { createdAt: { gte: cutoff } } },
    },
    select: { id: true },
    take: BATCH,
  });
  for (const r of rows) await purgeJemaatPersonalData(r.id, 'Retensi otomatis: tamu tanpa kunjungan > 3 tahun');
  return rows.length;
}

export async function runDataRetention() {
  const accounts = await purgeExpiredAccounts();
  const tamu = await purgeExpiredTamu();
  const proofs = await purgeOldPaymentProofs();
  return { accounts, tamu, ...proofs };
}
