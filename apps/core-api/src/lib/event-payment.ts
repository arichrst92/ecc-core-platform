/**
 * Aturan pembayaran event — satu sumber untuk tiket, self check-in, check-in
 * petugas, dan pembatalan otomatis.
 *
 *   GRATIS         → tidak perlu bayar.
 *   NOMINAL_TETAP  → wajib lunas sebelum check-in.
 *   NOMINAL_BEBAS  → sukarela: wajib lunas HANYA bila ada nominal minimum (> 0);
 *                    tanpa minimum, peserta boleh hadir walau belum memberi.
 */
type Ev = { tipeBayar: string; nominal?: unknown };
type Part = { status: string; donations?: { status: string }[] };

export function requiresPayment(e: Ev): boolean {
  if (e.tipeBayar === 'GRATIS') return false;
  if (e.tipeBayar === 'NOMINAL_TETAP') return true;
  return Number(e.nominal ?? 0) > 0;
}

export type PaymentStatus = 'GRATIS' | 'LUNAS' | 'MENUNGGU' | 'BELUM_BAYAR';

/** Status pembayaran tiket (tampilan & aturan batal). */
export function paymentStatusOf(e: Ev, p: Part): PaymentStatus {
  if (e.tipeBayar === 'GRATIS') return 'GRATIS';
  if (p.status === 'BAYAR' || p.status === 'HADIR') return 'LUNAS';
  // Bukti di partisipasi (alur app/web) ATAU di baris pembayaran (alur lama).
  if (p.status === 'MENUNGGU_VERIFIKASI' || p.donations?.some((d) => d.status === 'MENUNGGU_VERIFIKASI')) return 'MENUNGGU';
  // Sukarela tanpa minimum & belum memberi → diperlakukan seperti gratis (bukan "belum bayar").
  if (!requiresPayment(e)) return 'GRATIS';
  return 'BELUM_BAYAR';
}

/** Boleh check-in (self / petugas tanpa force)? */
export function paymentOkForCheckin(e: Ev, status: string): boolean {
  return !requiresPayment(e) || status === 'BAYAR' || status === 'HADIR';
}
