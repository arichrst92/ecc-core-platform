/**
 * Status pendaftaran pelayanan per cabang (lihat model PelayananPendaftaran).
 *
 *   - Tanpa baris            → MENERIMA (perilaku lama), tanpa badge.
 *   - isOpen=true            → BUKA (badge "Buka pendaftaran"), sampai tutupOtomatis lewat.
 *   - isOpen=false / lewat   → TUTUP (request baru ditolak).
 * Pelayanan nonaktif selalu TUTUP. Patokan = cabang jemaat yang mendaftar.
 */
import { prisma } from '@ecc/database';

export type StatusPendaftaran = 'MENERIMA' | 'BUKA' | 'TUTUP';

export interface PendaftaranInfo {
  cabangId: string;
  status: StatusPendaftaran;
  catatan: string | null;
  tutupOtomatis: string | null; // YYYY-MM-DD
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);

export function resolveStatus(
  row: { isOpen: boolean; tutupOtomatis: Date | null } | null | undefined,
  pelayananAktif = true,
  today = ymd(new Date()),
): StatusPendaftaran {
  if (!pelayananAktif) return 'TUTUP';
  if (!row) return 'MENERIMA';
  if (!row.isOpen) return 'TUTUP';
  if (row.tutupOtomatis && ymd(row.tutupOtomatis) < today) return 'TUTUP';
  return 'BUKA';
}

/** Map pelayananId → info untuk satu cabang. */
export async function pendaftaranForCabang(pelayananIds: string[], cabangId: string | null | undefined) {
  const out = new Map<string, PendaftaranInfo>();
  if (!cabangId || !pelayananIds.length) return out;
  const rows = await prisma.pelayananPendaftaran.findMany({
    where: { cabangId, pelayananId: { in: pelayananIds } },
    select: { pelayananId: true, isOpen: true, catatan: true, tutupOtomatis: true },
  });
  for (const r of rows) {
    out.set(r.pelayananId, {
      cabangId,
      status: resolveStatus(r),
      catatan: r.catatan,
      tutupOtomatis: r.tutupOtomatis ? ymd(r.tutupOtomatis) : null,
    });
  }
  return out;
}

export function infoOrDefault(m: Map<string, PendaftaranInfo>, pelayananId: string, cabangId: string | null, aktif: boolean): PendaftaranInfo | null {
  if (!cabangId) return null;
  const v = m.get(pelayananId);
  if (!aktif) return { cabangId, status: 'TUTUP', catatan: v?.catatan ?? null, tutupOtomatis: v?.tutupOtomatis ?? null };
  return v ?? { cabangId, status: 'MENERIMA', catatan: null, tutupOtomatis: null };
}
