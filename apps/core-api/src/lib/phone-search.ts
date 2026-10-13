/**
 * Kondisi pencarian no HP untuk query `contains`.
 *
 * No HP disimpan E.164 (+6281234…, +6591234…). Admin sering mengetik format
 * lokal ("0812 3456", "62812…", "+65 9123"). Tanpa ini, "0812" tidak cocok
 * dengan "+62812…". Return [] kalau input bukan seperti nomor.
 */
export function phoneSearchTerms(search: string): string[] {
  const raw = search.trim();
  if (!/^[+\d\s().-]+$/.test(raw)) return [];
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 4) return [];
  const terms = new Set<string>([digits]);
  // "0812…" → "812…" (bagian setelah kode negara, cocok untuk semua negara)
  if (digits.startsWith('0')) terms.add(digits.replace(/^0+/, ''));
  return [...terms].filter((t) => t.length >= 3);
}
