/**
 * Pembayaran event yang menunggu verifikasi admin (2026-11).
 *
 * Dihitung per PESERTA (bukan per baris donasi) supaya satu orang tidak
 * terhitung dua kali: peserta (bukan BATAL) yang statusnya MENUNGGU_VERIFIKASI
 * (alur lama, bukti di partisipasi) ATAU punya donasi MENUNGGU_VERIFIKASI
 * yang sudah ada bukti transfernya.
 *
 * Dipakai badge menu Event (pending-counts), badge per event di daftar Event,
 * dan filter "Perlu verifikasi".
 */
import { prisma, Prisma } from '@ecc/database';

/** eventId → jumlah peserta yang pembayarannya menunggu verifikasi. `eventIds` kosong = semua event. */
export async function pendingPaymentByEvent(eventIds?: string[]): Promise<Map<string, number>> {
  if (eventIds && eventIds.length === 0) return new Map();
  const filter = eventIds ? Prisma.sql`AND p.event_id IN (${Prisma.join(eventIds.map((id) => Prisma.sql`${id}::uuid`))})` : Prisma.empty;
  const rows = await prisma.$queryRaw<{ event_id: string; n: bigint }[]>`
    SELECT p.event_id, COUNT(DISTINCT p.id) AS n
    FROM "event_participation" p
    WHERE p.status <> 'BATAL'
      AND (
        p.status = 'MENUNGGU_VERIFIKASI'
        OR EXISTS (
          SELECT 1 FROM "event_donation" d
          WHERE d.participation_id = p.id AND d.status = 'MENUNGGU_VERIFIKASI' AND d.bukti_transfer_url IS NOT NULL
        )
      )
      ${filter}
    GROUP BY p.event_id`;
  return new Map(rows.map((r) => [r.event_id, Number(r.n)]));
}

/** Total peserta yang pembayarannya menunggu verifikasi (semua event). */
export async function pendingPaymentTotal(): Promise<number> {
  let n = 0;
  for (const v of (await pendingPaymentByEvent()).values()) n += v;
  return n;
}
