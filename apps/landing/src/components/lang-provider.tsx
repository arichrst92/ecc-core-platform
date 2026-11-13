'use client';

/** Bahasa aktif di client component + tombol ganti bahasa (ID | EN). */
import { createContext, useContext, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { LANG_COOKIE, translator, type Lang } from '@/lib/i18n';

const Ctx = createContext<Lang>('id');

export function LangProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  return <Ctx.Provider value={lang}>{children}</Ctx.Provider>;
}

export function useLang() {
  const lang = useContext(Ctx);
  const t = useMemo(() => translator(lang), [lang]);
  return { lang, t };
}

export function LangSwitch({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  const { lang } = useLang();
  const router = useRouter();
  const [pending, start] = useTransition();
  const set = (l: Lang) => {
    if (l === lang) return;
    document.cookie = `${LANG_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.lang = l;
    start(() => router.refresh());
  };
  const base = tone === 'light' ? 'border-white/40 text-white' : 'border-neutral-300 text-neutral-700';
  return (
    <span className={`inline-flex shrink-0 rounded-full border p-0.5 text-[11.5px] font-bold ${base} ${pending ? 'opacity-60' : ''}`} role="group" aria-label="Bahasa / Language">
      {(['id', 'en'] as Lang[]).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => set(l)}
          aria-pressed={l === lang}
          className={`px-2 py-0.5 rounded-full uppercase transition ${
            l === lang ? (tone === 'light' ? 'bg-white text-brand-700' : 'bg-brand-600 text-white') : 'opacity-85 hover:opacity-100'
          }`}
        >
          {l}
        </button>
      ))}
    </span>
  );
}
