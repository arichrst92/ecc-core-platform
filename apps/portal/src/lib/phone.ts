/** Normalisasi input no HP ke format E.164 Indonesia (+62...). */
export function normalizePhoneInput(input: string): string | null {
  let s = input.trim().replace(/[\s\-()]/g, '');
  if (s.startsWith('+62')) {
    // keep
  } else if (s.startsWith('62')) {
    s = `+${s}`;
  } else if (s.startsWith('0')) {
    s = `+62${s.slice(1)}`;
  } else if (s.startsWith('8')) {
    s = `+62${s}`;
  } else {
    return null;
  }
  if (!/^\+62\d{8,13}$/.test(s)) return null;
  return s;
}
