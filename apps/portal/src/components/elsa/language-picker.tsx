'use client';

/**
 * Language picker modal — first visit dashboard Elsa.
 * User pilih EN/ID → di-persist di localStorage 'elsa-lang'.
 * Referensi pattern: https://ide.asia/agent
 */
import { Sparkles } from 'lucide-react';

interface Props {
  onSelect: (lang: 'id' | 'en') => void;
}

export function LanguagePicker({ onSelect }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 text-center">
        <div className="flex justify-center mb-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-lg">
            <Sparkles className="w-8 h-8 text-white" />
          </div>
        </div>
        <h1 className="text-2xl font-bold text-neutral-900">Elsa</h1>
        <p className="text-xs uppercase tracking-widest text-brand-600 mt-1 mb-4 font-semibold">
          Els Agentic · Your ECC Assistant
        </p>

        <h2 className="text-lg font-semibold text-neutral-800 mb-1">
          Choose your language
        </h2>
        <p className="text-sm text-neutral-500 mb-6">
          Pilih bahasa Anda — Elsa akan konsisten pakai bahasa yang dipilih.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => onSelect('en')}
            className="flex flex-col items-center gap-2 p-4 border-2 border-neutral-200 hover:border-brand-500 hover:bg-brand-50 rounded-xl transition group"
          >
            <span className="text-2xl font-bold text-neutral-700 group-hover:text-brand-700">EN</span>
            <span className="font-medium text-neutral-900">English</span>
            <span className="text-xs text-neutral-500">Continue in English</span>
          </button>
          <button
            onClick={() => onSelect('id')}
            className="flex flex-col items-center gap-2 p-4 border-2 border-neutral-200 hover:border-brand-500 hover:bg-brand-50 rounded-xl transition group"
          >
            <span className="text-2xl font-bold text-neutral-700 group-hover:text-brand-700">ID</span>
            <span className="font-medium text-neutral-900">Bahasa Indonesia</span>
            <span className="text-xs text-neutral-500">Lanjutkan dalam Bahasa Indonesia</span>
          </button>
        </div>
      </div>
    </div>
  );
}
