'use client';

/**
 * Language picker + voice picker (2-step flow, adopted dari ide.asia /agent).
 *
 * Step 1: pick EN/ID
 * Step 2: voice picker (dropdown populate dari speechSynthesis.getVoices())
 * Step 3: Continue → persist lang + voice ke localStorage
 */
import { useEffect, useState } from 'react';
import { Sparkles, Play } from 'lucide-react';

interface Props {
  onSelect: (lang: 'id' | 'en', voiceURI: string | null) => void;
}

// Recommended voice hints per lang (male preference untuk Elsa persona)
const EN_RECOMMENDED = ['Daniel', 'Microsoft Mark', 'Google UK English Male', 'Microsoft David', 'Alex', 'Google US English'];
const ID_RECOMMENDED = ['Microsoft Andika', 'Google bahasa Indonesia', 'Damayanti', 'Microsoft Gadis'];

function pickRecommended(lang: 'id' | 'en', voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const langMatch = voices.filter((v) => v.lang.toLowerCase().startsWith(lang));
  if (!langMatch.length) return null;
  const list = lang === 'id' ? ID_RECOMMENDED : EN_RECOMMENDED;
  for (const wanted of list) {
    const hit = langMatch.find((v) => (v.name || '').includes(wanted));
    if (hit) return hit;
  }
  return langMatch[0] ?? null;
}

export function LanguagePicker({ onSelect }: Props) {
  const [lang, setLang] = useState<'id' | 'en' | null>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<string>('');

  useEffect(() => {
    if (!lang || typeof window === 'undefined' || !window.speechSynthesis) return;

    function loadVoices() {
      const all = window.speechSynthesis.getVoices();
      const filtered = all.filter((v) => v.lang.toLowerCase().startsWith(lang!));
      const list = filtered.length > 0 ? filtered : all;
      setVoices(list);
      // Auto-select recommended
      const recommended = pickRecommended(lang!, list);
      if (recommended) setSelectedVoice(recommended.voiceURI);
    }

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, [lang]);

  function preview() {
    if (!selectedVoice || !window.speechSynthesis || !lang) return;
    window.speechSynthesis.cancel();
    const voice = voices.find((v) => v.voiceURI === selectedVoice);
    if (!voice) return;
    const text = lang === 'id'
      ? 'Halo, saya Elsa. Siap membantu Anda dengan data ECC.'
      : 'Hello, I am Elsa. Ready to help you with ECC data.';
    const u = new SpeechSynthesisUtterance(text);
    u.voice = voice;
    u.lang = voice.lang;
    window.speechSynthesis.speak(u);
  }

  function handleContinue() {
    onSelect(lang!, selectedVoice || null);
  }

  const recommendedVoice = lang ? pickRecommended(lang, voices) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8">
        <div className="flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-lg mb-4">
            <Sparkles className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-neutral-900">Elsa</h1>
          <p className="text-xs uppercase tracking-widest text-brand-600 mt-1 mb-4 font-semibold">
            Els Agentic · Your ECC Assistant
          </p>
        </div>

        {!lang ? (
          <>
            <h2 className="text-lg font-semibold text-neutral-800 text-center mb-1">
              Choose your language <span className="text-neutral-400">·</span>{' '}
              <span className="text-neutral-600">Pilih bahasa Anda</span>
            </h2>
            <p className="text-sm text-neutral-500 text-center mb-6">
              Elsa akan konsisten pakai bahasa yang dipilih.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setLang('en')}
                className="flex flex-col items-center gap-2 p-4 border-2 border-neutral-200 hover:border-brand-500 hover:bg-brand-50 rounded-xl transition group"
              >
                <span className="text-2xl font-bold text-neutral-700 group-hover:text-brand-700">EN</span>
                <span className="font-medium text-neutral-900">English</span>
                <span className="text-xs text-neutral-500">Continue in English</span>
              </button>
              <button
                onClick={() => setLang('id')}
                className="flex flex-col items-center gap-2 p-4 border-2 border-neutral-200 hover:border-brand-500 hover:bg-brand-50 rounded-xl transition group"
              >
                <span className="text-2xl font-bold text-neutral-700 group-hover:text-brand-700">ID</span>
                <span className="font-medium text-neutral-900">Bahasa Indonesia</span>
                <span className="text-xs text-neutral-500">Lanjutkan dalam Bahasa Indonesia</span>
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-lg font-semibold text-neutral-800 text-center mb-1">
              {lang === 'id' ? 'Pilih suara Elsa' : 'Choose Elsa\'s voice'}
              <span className="text-xs text-neutral-400 ml-1">
                ({lang === 'id' ? 'opsional' : 'optional'})
              </span>
            </h2>
            <p className="text-sm text-neutral-500 text-center mb-4">
              {lang === 'id'
                ? 'Elsa akan membaca response pakai suara ini. Bisa diganti nanti.'
                : 'Elsa will speak responses using this voice. Changeable later.'}
            </p>

            <div className="space-y-3 mb-6">
              <div className="flex items-center gap-2">
                <select
                  value={selectedVoice}
                  onChange={(e) => setSelectedVoice(e.target.value)}
                  className="flex-1 px-3 py-2 border border-neutral-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                >
                  <option value="">
                    {voices.length === 0
                      ? lang === 'id' ? 'Memuat suara...' : 'Loading voices...'
                      : lang === 'id' ? '(Tanpa suara)' : '(No voice)'}
                  </option>
                  {voices.map((v) => (
                    <option key={v.voiceURI} value={v.voiceURI}>
                      {v.name} ({v.lang})
                      {recommendedVoice?.voiceURI === v.voiceURI ? ' ★ Recommended' : ''}
                    </option>
                  ))}
                </select>
                {selectedVoice && (
                  <button
                    onClick={preview}
                    className="p-2 border border-neutral-300 rounded-lg hover:bg-neutral-50 text-brand-600"
                    title={lang === 'id' ? 'Preview suara' : 'Preview voice'}
                  >
                    <Play className="w-4 h-4" />
                  </button>
                )}
              </div>
              {voices.length === 0 && (
                <p className="text-xs text-amber-600">
                  {lang === 'id'
                    ? 'Browser Anda belum expose voice list — Elsa akan pakai suara default OS.'
                    : 'Your browser has not exposed voice list — Elsa will use OS default.'}
                </p>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setLang(null)}
                className="px-4 py-2 text-sm text-neutral-600 hover:bg-neutral-100 rounded-lg"
              >
                ← {lang === 'id' ? 'Kembali' : 'Back'}
              </button>
              <button
                onClick={handleContinue}
                className="flex-1 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white font-medium rounded-lg transition"
              >
                {lang === 'id' ? 'Lanjutkan' : 'Continue'} →
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
