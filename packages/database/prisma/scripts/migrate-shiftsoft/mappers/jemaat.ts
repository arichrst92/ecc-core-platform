/**
 * LegacyUser → Prisma Jemaat data mapper.
 *
 * Return shape kompatibel dengan `prisma.jemaat.upsert()` create/update.
 * Field yg mapping-nya null di-skip (Prisma undefined = don't set) supaya
 * update tidak overwrite dengan null.
 */
import type { LegacyUser } from '../types.js';
import {
  cleanString,
  mapGender,
  mapStatusPernikahan,
  normalizePhone,
  parseLegacyDate,
  parseYesNo,
} from '../normalize.js';

export interface MappedJemaat {
  /** Untuk upsert where: match by legacyShiftsoftId */
  legacyShiftsoftId: number;
  /** Untuk create.data + update.data */
  create: {
    cabangId: string;
    namaLengkap: string;
    email: string | null;
    noHp: string | null;
    tanggalLahir: Date | null;
    jenisKelamin: 'L' | 'P' | null;
    alamat: string | null;
    tanggalBergabungGereja: Date | null;
    pendidikanTerakhir: string | null;
    statusPekerjaan: string | null;
    namaKantor: string | null;
    alamatKantor: string | null;
    statusPernikahan: string | null;
    tanggalPernikahan: Date | null;
    sudahBaptisAir: boolean | null;
    sudahBaptisRohKudus: boolean | null;
    spiritualJourneyLevel: string | null;
    legacyShiftsoftId: number;
  };
  /** Optional: metadata untuk log/report */
  warnings: string[];
}

/**
 * Map 1 LegacyUser → Prisma Jemaat data. `cabangId` di-resolve upstream via
 * slug → cabang inference; passed in supaya mapper testable tanpa DB access.
 *
 * Return null kalau record HARUS di-skip (mis. Name kosong, semua identifier
 * gak valid). Warnings di-collect untuk visibility di report.
 */
export function mapLegacyUserToJemaat(
  u: LegacyUser,
  cabangId: string,
): MappedJemaat | null {
  const warnings: string[] = [];

  const namaLengkap = cleanString(u.Name);
  if (!namaLengkap) {
    // Skip completely — nama wajib untuk Jemaat.
    return null;
  }

  const email = cleanString(u.Email);
  const noHpRaw = cleanString(u.Phone1);
  const noHp = noHpRaw ? normalizePhone(noHpRaw) : null;
  if (noHpRaw && !noHp) {
    warnings.push(`Phone1 "${noHpRaw}" invalid — di-skip`);
  }

  const gender = mapGender(u.Gender);
  const tanggalLahir = parseLegacyDate(u.Birthday);
  if (u.Birthday && !tanggalLahir) {
    warnings.push(`Birthday "${u.Birthday}" invalid — di-skip`);
  }

  // Address: kalau City ada, append supaya konteks lokasi lebih jelas.
  const addrPart = cleanString(u.Address);
  const cityPart = cleanString(u.City);
  let alamat: string | null = null;
  if (addrPart && cityPart && !addrPart.toLowerCase().includes(cityPart.toLowerCase())) {
    alamat = `${addrPart}, ${cityPart}`;
  } else {
    alamat = addrPart ?? cityPart;
  }

  // SpecialAttrs — undefined-safe access.
  const sa = u.SpecialAttrs ?? {};
  const bergabungGereja = parseLegacyDate(sa.Berjemaat_di_ECC_sejak ?? null);
  const pendidikan = cleanString(sa.Pendidikan_Terakhir);
  const statusPekerjaan = cleanString(sa.Status_Pekerjaan);
  const namaKantor = cleanString(
    sa['Nama_Sekolah/Tempat_Bekerja'] ?? sa.Nama_Sekolah_Tempat_Bekerja ?? null,
  );
  const alamatKantor = cleanString(
    sa['Alamat_Sekolah/Tempat_Bekerja'] ?? sa.Alamat_Sekolah_Tempat_Bekerja ?? null,
  );
  const statusPernikahan = mapStatusPernikahan(sa.Status ?? null, gender);
  const tanggalPernikahan = parseLegacyDate(sa.Tanggal_Pernikahan ?? null);
  const sudahBaptisAir = parseYesNo(sa.Sudah_Baptis_Air ?? null);
  const sudahBaptisRohKudus = parseYesNo(sa.Sudah_Baptis_Roh_Kudus ?? null);
  const spiritualJourneyLevel = cleanString(sa.Spiritual_Journey_Terakhir);

  return {
    legacyShiftsoftId: u.ID,
    create: {
      cabangId,
      namaLengkap,
      email,
      noHp,
      tanggalLahir,
      jenisKelamin: gender,
      alamat,
      tanggalBergabungGereja: bergabungGereja,
      pendidikanTerakhir: pendidikan,
      statusPekerjaan,
      namaKantor,
      alamatKantor,
      statusPernikahan,
      tanggalPernikahan,
      sudahBaptisAir,
      sudahBaptisRohKudus,
      spiritualJourneyLevel,
      legacyShiftsoftId: u.ID,
    },
    warnings,
  };
}
