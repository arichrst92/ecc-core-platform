/**
 * Tautan follow-up jemaat: WhatsApp & email dengan sapaan "Hi, <nama>".
 * No HP disimpan bervariasi (0812…, +62 812…, 62812…) → dinormalkan ke 62….
 */
export function waDigits(noHp: string): string {
  let d = noHp.replace(/\D/g, '');
  if (d.startsWith('0')) d = `62${d.slice(1)}`;
  else if (d.startsWith('8')) d = `62${d}`;
  return d;
}

export const greeting = (nama: string) => `Hi, ${nama.trim()}`;

export function waUrl(noHp: string | null | undefined, nama: string): string | null {
  if (!noHp) return null;
  const d = waDigits(noHp);
  return d.length >= 8 ? `https://wa.me/${d}?text=${encodeURIComponent(`${greeting(nama)} `)}` : null;
}

export function mailUrl(email: string | null | undefined, nama: string): string | null {
  if (!email) return null;
  return `mailto:${email}?body=${encodeURIComponent(`${greeting(nama)},\n\n`)}`;
}
