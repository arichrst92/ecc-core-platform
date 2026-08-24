'use client';

/**
 * Voice picker — populate dari browser Web Speech API `speechSynthesis.getVoices()`.
 * Filter voices by user's lang (id/en). User pilih voice → di-persist di localStorage.
 * Kalau user matikan voice, TTS di-skip di ElsaChat.
 */
import { useEffect, useState } from 'react';
import { Volume2, VolumeX, Play } from 'lucide-react';

interface Props {
  lang: 'id' | 'en';
  value: string | null; // voiceURI dari SpeechSynthesisVoice
  enabled: boolean;
  onChange: (voiceURI: string | null, enabled: boolean) => void;
}

export function VoicePicker({ lang, value, enabled, onChange }: Props) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    const loadVoices = () => {
      const all = window.speechSynthesis.getVoices();
      // Filter by lang prefix (id, en). Kalau kosong, tampil semua.
      const filtered = all.filter((v) => v.lang.toLowerCase().startsWith(lang));
      setVoices(filtered.length > 0 ? filtered : all);
    };

    loadVoices();
    // Voices di-load async di beberapa browser (Chrome/Edge)
    window.speechSynthesis.onvoiceschanged = loadVoices;

    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, [lang]);

  const currentVoice = voices.find((v) => v.voiceURI === value);

  function preview() {
    if (!currentVoice || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(
      lang === 'id'
        ? 'Halo, saya Elsa. Siap membantu Anda dengan data ECC.'
        : 'Hello, I am Elsa. Ready to help you with ECC data.',
    );
    utter.voice = currentVoice;
    utter.lang = currentVoice.lang;
    window.speechSynthesis.speak(utter);
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => onChange(value, !enabled)}
        className={`p-1.5 rounded transition ${
          enabled
            ? 'text-brand-600 hover:bg-brand-50'
            : 'text-neutral-400 hover:bg-neutral-100'
        }`}
        title={enabled ? 'Nonaktifkan suara' : 'Aktifkan suara'}
      >
        {enabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
      </button>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null, enabled)}
        disabled={!enabled || voices.length === 0}
        className="text-xs px-2 py-1 border border-neutral-300 rounded bg-white disabled:opacity-50 disabled:cursor-not-allowed max-w-[180px] truncate"
      >
        <option value="">
          {voices.length === 0
            ? 'Voice tidak tersedia'
            : `— pilih suara (${voices.length}) —`}
        </option>
        {voices.map((v) => (
          <option key={v.voiceURI} value={v.voiceURI}>
            {v.name} ({v.lang})
          </option>
        ))}
      </select>
      {currentVoice && enabled && (
        <button
          onClick={preview}
          className="p-1 text-neutral-500 hover:text-brand-600 hover:bg-brand-50 rounded"
          title="Preview suara"
        >
          <Play className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
