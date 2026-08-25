'use client';

/**
 * ElsaAgent — fullscreen agent interface adopted dari ide.asia /agent.
 *
 * Layout:
 *   - <ElsaCanvas /> — particle animation background (audio-reactive)
 *   - Header: logo Elsa + status dot online + lang badge + reset
 *   - Speech bubble center-top: latest exchange (typing indicator or text)
 *   - Bottom: floating action chips + input row (textarea + mic + send)
 *
 * Behavior:
 *   - Speak response via SpeechSynthesisUtterance dgn voice pilihan user
 *   - Mic button: SpeechRecognition (voice input → transcribe → send)
 *   - Simulated audio pulse (setAudioLevel) untuk sync particle animation
 *     dgn TTS (SpeechSynthesis tidak expose audio stream API)
 *   - Mic input: real audio analyser dari getUserMedia → particle react
 */
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { Send, Mic, RefreshCw, ArrowRight, ExternalLink, Mail, Loader2 } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { ElsaCanvas } from './elsa-canvas';

interface ElsaAction {
  type: 'navigate' | 'external' | 'contact_admin';
  label: string;
  url?: string;
  message?: string;
}

interface ChatResponse {
  reply: string;
  actions: ElsaAction[];
  iterations: number;
  usage: { inputTokens: number; outputTokens: number };
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface Props {
  lang: 'id' | 'en';
  voiceURI: string | null;
  onChangeLang: () => void;
}

// Web Speech API types (avoid TS complaint kalau global tidak ada)
type SpeechRecognitionCtor = new () => {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onstart: () => void;
  onend: () => void;
  onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
  onerror: (e: { error: string }) => void;
};

export function ElsaAgent({ lang, voiceURI, onChangeLang }: Props) {
  const router = useRouter();
  const [history, setHistory] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [currentReply, setCurrentReply] = useState<string>('');
  const [currentActions, setCurrentActions] = useState<ElsaAction[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const recognitionRef = useRef<InstanceType<SpeechRecognitionCtor> | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const speakingPulseRef = useRef<number>(0);

  // Cache voice object
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  useEffect(() => {
    if (!voiceURI || typeof window === 'undefined' || !window.speechSynthesis) return;
    const load = () => {
      const v = window.speechSynthesis.getVoices().find((x) => x.voiceURI === voiceURI);
      if (v) voiceRef.current = v;
    };
    load();
    window.speechSynthesis.onvoiceschanged = load;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, [voiceURI]);

  const handleAction = (action: ElsaAction) => {
    switch (action.type) {
      case 'navigate':
        if (action.url) router.push(action.url);
        break;
      case 'external':
        if (action.url) window.open(action.url, '_blank', 'noopener,noreferrer');
        break;
      case 'contact_admin':
        router.push(action.message ? `/contact?msg=${encodeURIComponent(action.message)}` : '/contact');
        break;
    }
  };

  const chatMut = useMutation({
    mutationFn: async (userMsg: string) => {
      const newHistory: Message[] = [...history, { role: 'user', content: userMsg }];
      const res = await apiClient.post<{ data: ChatResponse }>('/admin/elsa/chat', {
        messages: newHistory,
        lang,
      });
      return { newHistory, response: res.data.data };
    },
    onMutate: () => {
      setShowWelcome(false);
      setCurrentReply('');
      setCurrentActions([]);
    },
    onSuccess: ({ newHistory, response }) => {
      const updated: Message[] = [
        ...newHistory,
        { role: 'assistant', content: response.reply },
      ];
      setHistory(updated);
      setCurrentReply(response.reply);
      setCurrentActions(response.actions);
      speak(response.reply);
    },
    onError: () => {
      const errText =
        lang === 'id'
          ? 'Maaf, Elsa error. Coba lagi.'
          : 'Sorry, Elsa error. Try again.';
      setCurrentReply(errText);
      setCurrentActions([]);
    },
  });

  function speak(text: string) {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    if (!voiceRef.current) return; // user chose no voice
    window.speechSynthesis.cancel();
    // Strip markdown syntax supaya TTS tidak baca simbol formatting
    const cleaned = text
      .replace(/\*\*([^*]+)\*\*/g, '$1')       // bold
      .replace(/\*([^*]+)\*/g, '$1')           // italic
      .replace(/`([^`]+)`/g, '$1')             // code
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // link → text only
      .replace(/^#{1,3}\s+/gm, '')             // heading marker
      .replace(/^[-*]\s+/gm, '')               // bullet marker
      .replace(/\n{2,}/g, '. ')                // paragraph break → pause
      .replace(/\n/g, ' ');                    // soft break → space
    const u = new SpeechSynthesisUtterance(cleaned);
    u.voice = voiceRef.current;
    u.lang = voiceRef.current.lang;
    u.volume = 1;

    let speaking = false;
    u.onstart = () => {
      speaking = true;
      pulse();
    };
    u.onend = () => {
      speaking = false;
    };

    function pulse() {
      if (!speaking) return;
      const t = performance.now() * 0.006;
      // Boost pulse: base 0.65 + swing 0.3 + jitter 0.2 → range 0.35-1.15 clamped to 0.4-1.0
      const p = 0.65 + 0.3 * Math.sin(t) + 0.15 * Math.sin(t * 2.3) + (Math.random() - 0.5) * 0.2;
      window.__elsaSetAudioLevel?.(Math.max(0.4, Math.min(1.0, p)));
      speakingPulseRef.current = requestAnimationFrame(pulse);
    }

    window.speechSynthesis.speak(u);
  }

  function send() {
    const trimmed = input.trim();
    if (!trimmed || chatMut.isPending) return;
    setInput('');
    chatMut.mutate(trimmed);
    // Reset textarea height
    if (inputRef.current) inputRef.current.style.height = 'auto';
  }

  function reset() {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    cancelAnimationFrame(speakingPulseRef.current);
    setHistory([]);
    setCurrentReply('');
    setCurrentActions([]);
    setShowWelcome(true);
  }

  // Mic — SpeechRecognition + audio analyser feed particle animation
  function toggleMic() {
    const SR: SpeechRecognitionCtor | undefined =
      (window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor })
        .SpeechRecognition ??
      (window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor })
        .webkitSpeechRecognition;
    if (!SR) {
      alert(lang === 'id' ? 'Browser tidak support voice input.' : 'Browser does not support voice input.');
      return;
    }

    if (isRecording && recognitionRef.current) {
      recognitionRef.current.stop();
      return;
    }

    if (window.speechSynthesis) window.speechSynthesis.cancel();

    const recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = lang === 'id' ? 'id-ID' : 'en-US';

    recognition.onstart = () => setIsRecording(true);
    recognition.onresult = (e) => {
      const transcript = Array.from(e.results)
        .map((r) => r[0]?.transcript ?? '')
        .join('');
      setInput(transcript);
    };
    recognition.onend = () => {
      setIsRecording(false);
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((t) => t.stop());
        micStreamRef.current = null;
      }
      // Auto-send if got transcript
      setTimeout(() => {
        setInput((current) => {
          if (current.trim()) chatMut.mutate(current.trim());
          return '';
        });
      }, 300);
    };
    recognition.onerror = (e) => {
      console.error('Speech recognition error:', e.error);
      setIsRecording(false);
    };

    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        micStreamRef.current = stream;
        // Setup audio analyser → feed particle animation
        try {
          const ac = new AudioContext();
          const source = ac.createMediaStreamSource(stream);
          const analyser = ac.createAnalyser();
          analyser.fftSize = 256;
          source.connect(analyser);
          const data = new Uint8Array(analyser.frequencyBinCount);
          function poll() {
            if (!micStreamRef.current) return;
            analyser.getByteFrequencyData(data);
            let sum = 0;
            for (const v of data) sum += v;
            const avg = sum / data.length / 255;
            window.__elsaSetAudioLevel?.(avg * 2.2);
            requestAnimationFrame(poll);
          }
          poll();
        } catch (e) {
          console.warn('Mic analyser failed:', e);
        }
        recognitionRef.current = recognition;
        recognition.start();
      })
      .catch((err) => {
        console.error('Mic denied:', err);
        alert(lang === 'id' ? 'Izin mikrofon ditolak.' : 'Microphone permission denied.');
      });
  }

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 120) + 'px';
    }
  }, [input]);

  const welcomeText =
    lang === 'id'
      ? 'Halo! Saya Elsa. Tanyakan apapun tentang data ECC — jemaat, ibadah, event, homecell, dll.'
      : "Hi! I'm Elsa. Ask me anything about ECC data — members, services, events, homecells, and more.";

  return (
    <div className="relative w-full h-full bg-white overflow-hidden">
      {/* Canvas particle animation */}
      <ElsaCanvas />

      {/* Header overlay — reset button di kanan atas (lang picker pindah ke input row) */}
      {history.length > 0 && (
        <header className="absolute top-0 right-0 z-20 flex items-center px-6 py-4">
          <button
            onClick={reset}
            className="text-xs px-3 py-1.5 text-neutral-600 hover:text-red-600 hover:bg-red-50 rounded-lg flex items-center gap-1 bg-white border border-neutral-300"
          >
            <RefreshCw className="w-3 h-3" /> Reset
          </button>
        </header>
      )}

      {/* Speech bubble center */}
      <div className="absolute inset-x-0 top-24 z-10 flex justify-center pointer-events-none px-6">
        <div className="max-w-2xl w-full">
          {chatMut.isPending ? (
            <div className="bg-white rounded-2xl shadow-lg px-6 py-4 pointer-events-auto">
              <div className="flex items-center gap-2 text-neutral-600">
                <span className="flex gap-1">
                  <span className="w-2 h-2 rounded-full bg-brand-500 animate-bounce" style={{ animationDelay: '0s' }}></span>
                  <span className="w-2 h-2 rounded-full bg-brand-500 animate-bounce" style={{ animationDelay: '0.15s' }}></span>
                  <span className="w-2 h-2 rounded-full bg-brand-500 animate-bounce" style={{ animationDelay: '0.3s' }}></span>
                </span>
                <span className="text-sm">{lang === 'id' ? 'Elsa sedang berpikir...' : 'Elsa is thinking...'}</span>
              </div>
            </div>
          ) : currentReply ? (
            <div className="bg-white rounded-2xl shadow-lg px-6 py-4 pointer-events-auto">
              <MarkdownText text={currentReply} />
            </div>
          ) : showWelcome ? (
            <div className="bg-white rounded-2xl shadow-lg px-6 py-4 pointer-events-auto text-center">
              <div className="text-sm text-neutral-900 leading-relaxed">{welcomeText}</div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Bottom panel — pb-32 supaya clear BottomDock (dock height 64px + gap 16px + safe area) */}
      <div className="absolute bottom-0 left-0 right-0 z-20 px-6 pt-6 pb-32 flex flex-col items-center gap-3 pointer-events-none">
        {/* Action chips floating (kalau ada) */}
        {currentActions.length > 0 && (
          <div className="flex flex-wrap gap-2 justify-center max-w-2xl pointer-events-auto">
            {currentActions.map((action, i) => (
              <ActionChip key={i} action={action} onClick={() => handleAction(action)} />
            ))}
          </div>
        )}

        {/* Input row */}
        <div className="w-full max-w-2xl bg-white rounded-2xl shadow-lg border border-neutral-200 flex items-end gap-2 p-2 pointer-events-auto">
          {/* Language picker button — di kiri chatbox */}
          <button
            onClick={onChangeLang}
            className="shrink-0 px-3 py-2.5 text-xs font-semibold text-neutral-600 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition border border-neutral-200"
            title={lang === 'id' ? 'Ganti bahasa' : 'Change language'}
          >
            {lang.toUpperCase()}
          </button>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={
              isRecording
                ? lang === 'id' ? 'Mendengarkan...' : 'Listening...'
                : lang === 'id' ? 'Tanya Elsa tentang ECC...' : 'Ask Elsa about ECC...'
            }
            rows={1}
            maxLength={1000}
            className="flex-1 resize-none px-3 py-2.5 outline-none max-h-32 text-sm"
          />
          <button
            onClick={toggleMic}
            className={`p-2.5 rounded-xl transition ${
              isRecording
                ? 'bg-red-500 text-white animate-pulse'
                : 'text-neutral-500 hover:bg-neutral-100 hover:text-brand-600'
            }`}
            title={lang === 'id' ? 'Voice input' : 'Voice input'}
          >
            <Mic className="w-5 h-5" />
          </button>
          <button
            onClick={send}
            disabled={!input.trim() || chatMut.isPending}
            className="p-2.5 bg-brand-600 hover:bg-brand-700 disabled:bg-neutral-300 text-white rounded-xl transition"
          >
            {chatMut.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * MarkdownText — lightweight renderer untuk Elsa response.
 * Support: **bold**, *italic*, `code`, [link](url), bullet list (- item / * item),
 * paragraph breaks (double newline), single newline dalam paragraph.
 * Pattern: split ke blocks (list vs paragraph), render inline formatting per line.
 * No external dep (avoid react-markdown install).
 */
function MarkdownText({ text }: { text: string }) {
  // Split ke blocks by blank line
  const lines = text.split('\n');
  const blocks: Array<{ type: 'p' | 'ul' | 'h'; items: string[]; level?: number }> = [];
  let current: { type: 'p' | 'ul' | 'h'; items: string[]; level?: number } | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      // Blank line = close current block
      if (current) {
        blocks.push(current);
        current = null;
      }
      continue;
    }
    // Heading (# ...)
    const headingMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (headingMatch) {
      if (current) blocks.push(current);
      blocks.push({ type: 'h', items: [headingMatch[2]!], level: headingMatch[1]!.length });
      current = null;
      continue;
    }
    // Bullet list
    const bulletMatch = line.match(/^[-*]\s+(.+)/);
    if (bulletMatch) {
      if (!current || current.type !== 'ul') {
        if (current) blocks.push(current);
        current = { type: 'ul', items: [] };
      }
      current.items.push(bulletMatch[1]!);
      continue;
    }
    // Paragraph
    if (!current || current.type !== 'p') {
      if (current) blocks.push(current);
      current = { type: 'p', items: [] };
    }
    current.items.push(line);
  }
  if (current) blocks.push(current);

  return (
    <div className="text-sm text-neutral-900 leading-relaxed space-y-2">
      {blocks.map((block, i) => {
        if (block.type === 'h') {
          const cls =
            block.level === 1
              ? 'text-lg font-bold'
              : block.level === 2
                ? 'text-base font-bold'
                : 'text-sm font-bold';
          return (
            <div key={i} className={cls}>
              {renderInline(block.items[0] ?? '')}
            </div>
          );
        }
        if (block.type === 'ul') {
          return (
            <ul key={i} className="list-disc pl-5 space-y-1">
              {block.items.map((item, j) => (
                <li key={j}>{renderInline(item)}</li>
              ))}
            </ul>
          );
        }
        // paragraph — join lines with soft break
        return (
          <p key={i}>
            {block.items.map((line, j) => (
              <span key={j}>
                {renderInline(line)}
                {j < block.items.length - 1 && <br />}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}

/** Render inline: **bold**, *italic*, `code`, [text](url). */
function renderInline(text: string): React.ReactNode {
  // Token regex: bold **...**, italic *...* (not conflicting w/ bold — greedy first),
  // code `...`, link [text](url)
  const tokens: Array<{ type: string; content: string; url?: string }> = [];
  const regex = /(\*\*[^*\n]+\*\*)|(`[^`\n]+`)|(\[[^\]]+\]\([^)\s]+\))|(\*[^*\n]+\*)/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      tokens.push({ type: 'text', content: text.slice(lastIdx, match.index) });
    }
    const m = match[0];
    if (m.startsWith('**')) {
      tokens.push({ type: 'bold', content: m.slice(2, -2) });
    } else if (m.startsWith('`')) {
      tokens.push({ type: 'code', content: m.slice(1, -1) });
    } else if (m.startsWith('[')) {
      const linkMatch = m.match(/\[([^\]]+)\]\(([^)\s]+)\)/);
      if (linkMatch) tokens.push({ type: 'link', content: linkMatch[1]!, url: linkMatch[2] });
    } else if (m.startsWith('*')) {
      tokens.push({ type: 'italic', content: m.slice(1, -1) });
    }
    lastIdx = match.index + m.length;
  }
  if (lastIdx < text.length) {
    tokens.push({ type: 'text', content: text.slice(lastIdx) });
  }

  return tokens.map((tok, i) => {
    switch (tok.type) {
      case 'bold':
        return <strong key={i} className="font-semibold text-neutral-900">{tok.content}</strong>;
      case 'italic':
        return <em key={i}>{tok.content}</em>;
      case 'code':
        return (
          <code key={i} className="px-1 py-0.5 bg-neutral-100 text-brand-700 rounded text-[0.9em] font-mono">
            {tok.content}
          </code>
        );
      case 'link':
        return (
          <a key={i} href={tok.url} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline">
            {tok.content}
          </a>
        );
      default:
        return <span key={i}>{tok.content}</span>;
    }
  });
}

function ActionChip({ action, onClick }: { action: ElsaAction; onClick: () => void }) {
  const Icon =
    action.type === 'external' ? ExternalLink : action.type === 'contact_admin' ? Mail : ArrowRight;
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-xs font-medium rounded-full shadow-md transition"
    >
      <Icon className="w-3.5 h-3.5" />
      <span>{action.label}</span>
    </button>
  );
}

