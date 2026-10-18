/**
 * Alias halaman pembayaran event: /bayar/event/{id}
 *
 * App membuka URL ini (bukan /event/{id}/pembayaran) karena di Android
 * semua https://eccchurch.global/event/* ditangkap App Link milik Els App
 * sendiri → browser pembayaran malah membuka app → "Unmatched Route".
 * Path /bayar/* tidak didaftarkan sebagai App Link / Universal Link.
 */
export { default, generateMetadata } from '../../../event/[slug]/pembayaran/page';
