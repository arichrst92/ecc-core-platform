'use client';

/**
 * Elsa Chat — main chat interface.
 *
 * Message bubbles (user right, assistant left), input at bottom, send button.
 * Backend: POST /admin/elsa/chat { messages, lang } → { finalText, usage, iterations }
 * TTS: kalau voice enabled + voiceURI set, speak response via SpeechSynthesisUtterance.
 */
import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Send, Loader2, Sparkles, User as UserIcon, AlertCircle, RefreshCw } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { VoicePicker } from './voice-picker';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  usage?: { inputTokens: number; outputTokens: number };
  iterations?: number;
}

interface Props {
  lang: 'id' | 'en';
  onChangeLang: () => void;
}

const SAMPLE_PROMPTS_ID = [
  'Ada berapa jemaat aktif di ECC Bandung?',
  'Event apa saja minggu depan?',
  'Cari jemaat bernama Ari',
  'Ibadah hari ini apa saja?',
  'Homecell PIC-nya siapa yang di area timur?',
];

const SAMPLE_PROMPTS_EN = [
  'How many active members in ECC Bandung?',
  'What events are coming up next week?',
  'Find members named Ari',
  "What are today's services?",
  'Who is the PIC of homecell in east area?',
];

export function ElsaChat({ lang, onChangeLang }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [voiceURI, setVoiceURI] = useState<string | null>(null);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Load voice prefs
  useEffect(() => {
    const savedURI = localStorage.getItem('elsa-voice-uri');
    const savedEnabled = localStorage.getItem('elsa-voice-enabled') === '1';
    if (savedURI) setVoiceURI(savedURI);
    if (savedEnabled) setVoiceEnabled(true);
  }, []);

  // Persist voice prefs
  useEffect(() => {
    if (voiceURI) localStorage.setItem('elsa-voice-uri', voiceURI);
    else localStorage.removeItem('elsa-voice-uri');
    localStorage.setItem('elsa-voice-enabled', voiceEnabled ? '1' : '0');
  }, [voiceURI, voiceEnabled]);

  // Auto-scroll ke bawah on new message
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const chatMut = useMutation({
    mutationFn: async (userMsg: string) => {
      const newHistory = [...messages, { role: 'user' as const, content: userMsg }];
      // API messages format
      const apiMessages = newHistory.map((m) => ({
        role: m.role,
        content: m.content,
      }));
      const res = await apiClient.post<{
        data: {
          finalText: string;
          iterations: number;
          usage: { inputTokens: number; outputTokens: number };
        };
      }>('/admin/elsa/chat', { messages: apiMessages, lang });
      return { history: newHistory, response: res.data.data };
    },
    onSuccess: ({ history, response }) => {
      const newMessage: Message = {
        role: 'assistant',
        content: response.finalText,
        usage: response.usage,
        iterations: response.iterations,
      };
      setMessages([...history, newMessage]);
      // TTS
      if (voiceEnabled && voiceURI && window.speechSynthesis) {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(response.finalText);
        const voice = window.speechSynthesis.getVoices().find((v) => v.voiceURI === voiceURI);
        if (voice) utter.voice = voice;
        window.speechSynthesis.speak(utter);
      }
    },
    onError: () => {
      // Keep user message in history + append error placeholder
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content:
            lang === 'id'
              ? '⚠️ Maaf, Elsa error. Coba lagi atau hubungi admin sistem kalau berulang.'
              : '⚠️ Sorry, Elsa error. Try again or contact system admin if persistent.',
        },
      ]);
    },
  });

  function send() {
    const trimmed = input.trim();
    if (!trimmed || chatMut.isPending) return;
    setInput('');
    // Optimistic add user message
    setMessages((prev) => [...prev, { role: 'user', content: trimmed }]);
    chatMut.mutate(trimmed);
  }

  function reset() {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    setMessages([]);
  }

  const samplePrompts = lang === 'id' ? SAMPLE_PROMPTS_ID : SAMPLE_PROMPTS_EN;

  return (
    <div className="flex flex-col h-full max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 bg-white">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-neutral-900 leading-tight">Elsa</h1>
            <p className="text-[10px] uppercase tracking-widest text-brand-600 font-semibold">
              Els Agentic
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <VoicePicker
            lang={lang}
            value={voiceURI}
            enabled={voiceEnabled}
            onChange={(uri, en) => {
              setVoiceURI(uri);
              setVoiceEnabled(en);
            }}
          />
          <button
            onClick={onChangeLang}
            className="text-xs px-2 py-1 border border-neutral-300 rounded hover:bg-neutral-50 text-neutral-600"
            title="Ganti bahasa"
          >
            {lang.toUpperCase()}
          </button>
          {messages.length > 0 && (
            <button
              onClick={reset}
              className="text-xs px-2 py-1 text-neutral-500 hover:text-red-600 hover:bg-red-50 rounded flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" /> Reset
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        {messages.length === 0 && (
          <div className="text-center max-w-md mx-auto pt-12">
            <div className="inline-block w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-lg mb-4">
              <Sparkles className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-xl font-bold text-neutral-900 mb-1">
              {lang === 'id' ? 'Halo, saya Elsa' : "Hi, I'm Elsa"}
            </h2>
            <p className="text-sm text-neutral-600 mb-6">
              {lang === 'id'
                ? 'Tanyakan apapun tentang data ECC — jemaat, ibadah, event, homecell, dll.'
                : 'Ask me anything about ECC data — members, services, events, homecells, and more.'}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {samplePrompts.map((p) => (
                <button
                  key={p}
                  onClick={() => {
                    setInput(p);
                  }}
                  className="text-left text-sm px-3 py-2 border border-neutral-200 hover:border-brand-300 hover:bg-brand-50 rounded-lg text-neutral-700"
                >
                  💡 {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, idx) => (
          <MessageBubble key={idx} message={msg} />
        ))}

        {chatMut.isPending && (
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1 pt-1.5">
              <div className="inline-flex items-center gap-2 px-3 py-2 bg-neutral-100 rounded-lg text-sm text-neutral-600">
                <Loader2 className="w-3 h-3 animate-spin" />
                {lang === 'id' ? 'Elsa sedang berpikir...' : 'Elsa is thinking...'}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-neutral-200 bg-white p-4">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={
              lang === 'id'
                ? 'Tanyakan sesuatu tentang ECC...'
                : 'Ask something about ECC...'
            }
            rows={1}
            className="flex-1 resize-none px-4 py-3 border border-neutral-300 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none max-h-32"
          />
          <button
            onClick={send}
            disabled={!input.trim() || chatMut.isPending}
            className="p-3 bg-brand-600 hover:bg-brand-700 disabled:bg-neutral-300 text-white rounded-xl transition"
          >
            {chatMut.isPending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </div>
        <p className="text-[11px] text-neutral-400 mt-2 text-center">
          {lang === 'id'
            ? 'Elsa bisa membuat kesalahan. Untuk keputusan penting, verifikasi dengan sumber data langsung.'
            : 'Elsa can make mistakes. For critical decisions, verify with source data directly.'}
        </p>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';
  return (
    <div className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div
        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
          isUser
            ? 'bg-neutral-300 text-neutral-700'
            : 'bg-gradient-to-br from-brand-500 to-brand-700 text-white'
        }`}
      >
        {isUser ? <UserIcon className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
      </div>
      <div className={`flex-1 min-w-0 ${isUser ? 'flex justify-end' : ''}`}>
        <div
          className={`inline-block max-w-[80%] px-4 py-2.5 rounded-2xl text-sm ${
            isUser
              ? 'bg-brand-600 text-white rounded-tr-sm'
              : 'bg-neutral-100 text-neutral-900 rounded-tl-sm'
          }`}
        >
          {isUser ? (
            <span className="whitespace-pre-wrap">{message.content}</span>
          ) : message.content.startsWith('⚠️') ? (
            <p className="flex items-start gap-2 my-0 text-red-600">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{message.content.replace('⚠️', '').trim()}</span>
            </p>
          ) : (
            <span className="whitespace-pre-wrap">{message.content}</span>
          )}
        </div>
        {message.usage && (
          <div
            className={`text-[10px] text-neutral-400 mt-1 px-1 ${isUser ? 'text-right' : ''}`}
          >
            {message.iterations} step · {message.usage.inputTokens}+{message.usage.outputTokens} tokens
          </div>
        )}
      </div>
    </div>
  );
}
