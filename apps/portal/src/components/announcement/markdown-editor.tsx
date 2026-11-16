'use client';

/**
 * Editor Markdown sederhana untuk isi Announcement: toolbar (tebal, miring,
 * coret, judul, daftar, kutipan, link) + tab Tulis / Pratinjau.
 * Pratinjau memakai renderer yang sama dengan email (mdToHtml, sudah di-escape).
 */
import { useRef, useState } from 'react';
import { Bold, Heading2, Italic, Link2, List, ListOrdered, Quote, Strikethrough } from 'lucide-react';
import { mdToHtml } from '@ecc/shared-types';

export function MarkdownEditor({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [tab, setTab] = useState<'write' | 'preview'>('write');

  function wrap(before: string, after = before, placeholder = 'teks') {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    const sel = value.slice(s, e) || placeholder;
    const next = value.slice(0, s) + before + sel + after + value.slice(e);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + before.length, s + before.length + sel.length);
    });
  }
  function prefixLines(prefix: (i: number) => string) {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    const start = value.lastIndexOf('\n', s - 1) + 1;
    const block = value.slice(start, e) || '';
    const lines = (block || 'teks').split('\n').map((l, i) => prefix(i) + l.replace(/^(#{1,3}\s|[-*]\s|\d+[.)]\s|>\s?)/, ''));
    const next = value.slice(0, start) + lines.join('\n') + value.slice(e);
    onChange(next);
    requestAnimationFrame(() => el.focus());
  }
  function link() {
    const url = window.prompt('Alamat link (https://…)', 'https://');
    if (!url || !/^https?:\/\//i.test(url)) return;
    wrap('[', `](${url})`, 'teks link');
  }

  const tools: { icon: typeof Bold; title: string; run: () => void }[] = [
    { icon: Bold, title: 'Tebal', run: () => wrap('**') },
    { icon: Italic, title: 'Miring', run: () => wrap('*') },
    { icon: Strikethrough, title: 'Coret', run: () => wrap('~~') },
    { icon: Heading2, title: 'Judul kecil', run: () => prefixLines(() => '## ') },
    { icon: List, title: 'Daftar', run: () => prefixLines(() => '- ') },
    { icon: ListOrdered, title: 'Daftar bernomor', run: () => prefixLines((i) => `${i + 1}. `) },
    { icon: Quote, title: 'Kutipan', run: () => prefixLines(() => '> ') },
    { icon: Link2, title: 'Link dalam teks', run: link },
  ];

  return (
    <div className="border border-neutral-300 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-brand-500">
      <div className="flex items-center gap-0.5 px-2 py-1.5 bg-neutral-50 border-b border-neutral-200">
        {tools.map((t) => (
          <button
            key={t.title}
            type="button"
            title={t.title}
            disabled={disabled || tab === 'preview'}
            onClick={t.run}
            className="p-1.5 rounded hover:bg-neutral-200 text-neutral-600 disabled:opacity-40"
          >
            <t.icon className="w-4 h-4" />
          </button>
        ))}
        <span className="flex-1" />
        {(['write', 'preview'] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`px-2.5 py-1 rounded-md text-xs font-semibold ${tab === k ? 'bg-white text-brand-700 shadow-sm' : 'text-neutral-500 hover:text-neutral-800'}`}
          >
            {k === 'write' ? 'Tulis' : 'Pratinjau'}
          </button>
        ))}
      </div>
      {tab === 'write' ? (
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          rows={9}
          placeholder={'Shalom jemaat ECC!\n\n**Ibadah Natal** diadakan 24 Desember pukul 18.00.\n- Reservasi dibuka 1 Desember'}
          className="w-full px-3 py-2.5 text-sm outline-none resize-y font-mono leading-relaxed disabled:bg-neutral-50"
        />
      ) : (
        <div
          className="min-h-[200px] px-4 py-3 text-sm leading-relaxed text-neutral-800"
          // Aman: mdToHtml meng-escape HTML & hanya mengizinkan link http(s)/mailto.
          dangerouslySetInnerHTML={{ __html: value.trim() ? mdToHtml(value) : '<p style="color:#a3a3a3">Belum ada isi.</p>' }}
        />
      )}
    </div>
  );
}
