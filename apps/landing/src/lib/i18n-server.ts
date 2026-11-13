/** Bahasa aktif di server component (cookie `lang`, default Indonesia). */
import { cookies } from 'next/headers';
import { LANG_COOKIE, normLang, translator, type Lang } from './i18n';

export function getLang(): Lang {
  return normLang(cookies().get(LANG_COOKIE)?.value);
}

export function getT() {
  const lang = getLang();
  return { lang, t: translator(lang) };
}

/** Bahasa aktif + helper L('ID', 'EN') untuk teks sekali pakai. */
export function getL() {
  const lang = getLang();
  return { lang, L: (idText: string, enText: string) => (lang === 'en' ? enText : idText) };
}
