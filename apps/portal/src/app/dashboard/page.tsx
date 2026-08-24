'use client';

/**
 * Dashboard = Elsa (Els Agentic) — AI chat agent untuk data ECC.
 *
 * Modul 31. Replace globe view sebelumnya.
 *
 * Flow:
 *   1. First visit → LanguagePicker modal (persist 'elsa-lang' localStorage)
 *   2. Chat UI (ElsaChat) — voice picker + message history + input
 *   3. Backend: POST /admin/elsa/chat via ElsaChat mutation
 */
import { useEffect, useState } from 'react';
import { LanguagePicker } from '@/components/elsa/language-picker';
import { ElsaChat } from '@/components/elsa/elsa-chat';

export default function DashboardPage() {
  const [lang, setLang] = useState<'id' | 'en' | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem('elsa-lang');
    if (saved === 'id' || saved === 'en') setLang(saved);
  }, []);

  function handleSelect(l: 'id' | 'en') {
    localStorage.setItem('elsa-lang', l);
    setLang(l);
  }

  function changeLang() {
    localStorage.removeItem('elsa-lang');
    setLang(null);
  }

  // Prevent hydration mismatch — render nothing sampai mounted
  if (!mounted) return null;

  return (
    <div className="relative -m-6 md:-m-8 bg-white" style={{ height: 'calc(100vh - 72px)' }}>
      {lang ? (
        <ElsaChat lang={lang} onChangeLang={changeLang} />
      ) : (
        <LanguagePicker onSelect={handleSelect} />
      )}
    </div>
  );
}
