'use client';

/**
 * Dashboard = Elsa (Els Agentic) — fullscreen AI agent interface.
 *
 * Modul 31. Pattern mirror ide.asia /agent:
 *   - Fullscreen canvas particle animation
 *   - Language + voice picker modal (first visit)
 *   - Speech bubble center + input at bottom + mic button
 *
 * Persist: 'elsa-lang' + 'elsa-voice-uri' di localStorage.
 * Ganti bahasa/voice → clear localStorage → picker muncul lagi.
 */
import { useEffect, useState } from 'react';
import { LanguagePicker } from '@/components/elsa/language-picker';
import { ElsaAgent } from '@/components/elsa/elsa-agent';

export default function DashboardPage() {
  const [lang, setLang] = useState<'id' | 'en' | null>(null);
  const [voiceURI, setVoiceURI] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const savedLang = localStorage.getItem('elsa-lang');
    const savedVoice = localStorage.getItem('elsa-voice-uri');
    if (savedLang === 'id' || savedLang === 'en') {
      setLang(savedLang);
    }
    if (savedVoice) setVoiceURI(savedVoice);
  }, []);

  function handleSelect(l: 'id' | 'en', v: string | null) {
    localStorage.setItem('elsa-lang', l);
    if (v) localStorage.setItem('elsa-voice-uri', v);
    else localStorage.removeItem('elsa-voice-uri');
    setLang(l);
    setVoiceURI(v);
  }

  function changeLang() {
    localStorage.removeItem('elsa-lang');
    localStorage.removeItem('elsa-voice-uri');
    setLang(null);
    setVoiceURI(null);
  }

  if (!mounted) return null;

  return (
    <div
      className="relative -mx-6 md:-mx-8 -mt-6 md:-mt-8 overflow-hidden"
      style={{ height: 'calc(100vh - 7rem)' }}
    >
      {lang ? (
        <ElsaAgent lang={lang} voiceURI={voiceURI} onChangeLang={changeLang} />
      ) : (
        <LanguagePicker onSelect={handleSelect} />
      )}
    </div>
  );
}
