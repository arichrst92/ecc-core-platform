/**
 * Bukti persetujuan S&K + Kebijakan Privasi (kepatuhan no. 2).
 *
 * Versi yang berlaku = `version` dokumen TERMS & PRIVACY bahasa 'id' yang
 * sedang terbit (Portal → Legal). Jemaat wajib setuju ulang bila versi
 * berubah. Untuk perbaikan kecil (salah ketik) admin cukup TIDAK mengubah
 * kolom Version supaya jemaat tidak diminta setuju ulang.
 */
import type { Request } from 'express';
import { prisma, Prisma } from '@ecc/database';
import type { ConsentAcceptInput, ConsentStatus } from '@ecc/shared-types';
import { BadRequest, Forbidden } from './errors.js';

type Db = Prisma.TransactionClient | typeof prisma;

export async function getCurrentLegalVersions(db: Db = prisma) {
  const docs = await db.legalDocument.findMany({
    where: { language: 'id', isPublished: true, key: { in: ['TERMS', 'PRIVACY'] } },
    select: { key: true, version: true },
  });
  return {
    termsVersion: docs.find((d) => d.key === 'TERMS')?.version ?? null,
    privacyVersion: docs.find((d) => d.key === 'PRIVACY')?.version ?? null,
  };
}

export async function getConsentStatus(jemaatId: string): Promise<ConsentStatus> {
  const [current, latest, jemaat] = await Promise.all([
    getCurrentLegalVersions(),
    prisma.userConsent.findFirst({
      where: { jemaatId },
      orderBy: { acceptedAt: 'desc' },
      select: { termsVersion: true, privacyVersion: true, ageGroup: true, acceptedAt: true },
    }),
    prisma.jemaat.findUnique({ where: { id: jemaatId }, select: { tanggalLahir: true } }),
  ]);
  // Belum ada dokumen terbit → tidak ada yang bisa disetujui.
  const hasDocs = !!(current.termsVersion && current.privacyVersion);
  const required =
    hasDocs &&
    (!latest ||
      latest.termsVersion !== current.termsVersion ||
      latest.privacyVersion !== current.privacyVersion);
  return {
    required,
    birthDate: jemaat?.tanggalLahir ? jemaat.tanggalLahir.toISOString().slice(0, 10) : null,
    current,
    latest: latest ? { ...latest, acceptedAt: latest.acceptedAt.toISOString() } : null,
  };
}

/** Umur dalam tahun penuh, null bila tanggal lahir tidak diketahui. */
export function ageFrom(tanggalLahir: Date | null | undefined, now = new Date()): number | null {
  if (!tanggalLahir) return null;
  let age = now.getFullYear() - tanggalLahir.getFullYear();
  const m = now.getMonth() - tanggalLahir.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < tanggalLahir.getDate())) age--;
  return age;
}

/**
 * Validasi usia (S&K 3.1 / PP Tunas): < 13 tahun tidak boleh punya akun
 * sendiri; 13–<18 wajib dengan izin orang tua/wali.
 */
export function assertAgeAllowed(tanggalLahir: Date | null | undefined, ageGroup: ConsentAcceptInput['ageGroup']) {
  const age = ageFrom(tanggalLahir);
  if (age == null) return;
  if (age < 13) {
    throw Forbidden('Menurut tanggal lahir yang tercatat, usia Anda di bawah 13 tahun. Bila tanggal lahir salah, perbaiki di layar ini. Anak di bawah 13 tahun didaftarkan orang tua/wali melalui menu Keluarga.');
  }
  if (age < 18 && ageGroup !== 'MINOR_WITH_GUARDIAN') {
    throw BadRequest('Menurut tanggal lahir yang tercatat, usia Anda di bawah 18 tahun — pilih "13–17 tahun dengan izin orang tua", atau perbaiki tanggal lahir bila salah.');
  }
}

export async function recordConsent(
  db: Db,
  req: Request,
  jemaatId: string,
  input: ConsentAcceptInput,
  source: 'REGISTER' | 'RECONSENT',
) {
  const current = await getCurrentLegalVersions(db);
  return db.userConsent.create({
    data: {
      jemaatId,
      // Simpan versi yang benar-benar terbit saat ini; fallback ke versi yang
      // ditampilkan app bila dokumen belum terbit.
      termsVersion: current.termsVersion ?? input.termsVersion ?? 'unknown',
      privacyVersion: current.privacyVersion ?? input.privacyVersion ?? 'unknown',
      sensitiveData: input.sensitiveData,
      ageGroup: input.ageGroup,
      source,
      language: input.language ?? null,
      platform: input.platform ?? null,
      appVersion: input.appVersion ?? null,
      ipAddress: req.ip ?? null,
      userAgent: req.get('user-agent')?.slice(0, 500) ?? null,
    },
  });
}
