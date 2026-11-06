/**
 * Proteksi sync Shiftsoft → jemaat yang sudah "disentuh" di ECC tidak ditimpa.
 *
 *   - Jemaat NONAKTIF (mis. dinonaktifkan admin sebagai junk) → dilewati sama sekali.
 *   - Jemaat yang sudah onboarding di app, pernah diubah admin di Portal
 *     (portalEditedAt), atau ditandai "Bukan junk" → hanya mengisi field yang
 *     masih KOSONG di ECC; nilai yang sudah ada tidak ditimpa.
 *   - Selain itu → diperbarui penuh seperti sebelumnya.
 */
export const PROTECT_SELECT = {
  id: true,
  isActive: true,
  onboardedAt: true,
  portalEditedAt: true,
  junkDismissedAt: true,
  namaLengkap: true,
  email: true,
  noHp: true,
  tanggalLahir: true,
  jenisKelamin: true,
  alamat: true,
  tanggalBergabungGereja: true,
  pendidikanTerakhir: true,
  statusPekerjaan: true,
  namaKantor: true,
  alamatKantor: true,
  statusPernikahan: true,
  tanggalPernikahan: true,
  sudahBaptisAir: true,
  sudahBaptisRohKudus: true,
  spiritualJourneyLevel: true,
} as const;

export type ProtectMode = 'FULL' | 'FILL_BLANKS' | 'SKIP';

export function protectMode(existing: {
  isActive: boolean;
  onboardedAt: Date | null;
  portalEditedAt: Date | null;
  junkDismissedAt: Date | null;
}): ProtectMode {
  if (!existing.isActive) return 'SKIP';
  if (existing.onboardedAt || existing.portalEditedAt || existing.junkDismissedAt) return 'FILL_BLANKS';
  return 'FULL';
}

/** Data update yang aman sesuai mode (FILL_BLANKS: hanya field yang kosong di ECC). */
export function protectedUpdateData<T extends Record<string, unknown>>(
  existing: Record<string, unknown>,
  data: T,
  mode: ProtectMode,
): Partial<T> {
  if (mode === 'FULL') return data;
  if (mode === 'SKIP') return {};
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(data)) {
    if (k === 'cabangId' || k === 'legacyShiftsoftId') continue;
    const cur = existing[k];
    if ((cur === null || cur === undefined || cur === '') && v !== null && v !== undefined) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}
