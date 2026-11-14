'use client';

import { useState } from 'react';
import {
  BookOpenCheck,
  ChevronRight,
  ChevronDown,
  Search,
  Building2,
  Church,
  Calendar,
  Layers,
  HandHeart,
  Ticket,
  Users,
  Shield,
  Heart,
  MapPin,
  Home as HomeIcon,
  Megaphone,
  Handshake,
  Store,
  Newspaper,
  BookOpen,
  FileText,
  Smartphone,
  Key,
  Activity,
  Wrench,
  Gauge,
  HelpCircle,
  Sparkles,
  Lightbulb,
  AlertCircle,
} from 'lucide-react';
import { SECTIONS, type Section, type ContentBlock } from '@/lib/docs/user-guide-content';

// ===========================================================================
// TYPES
// ===========================================================================
// ===========================================================================
// PAGE
// ===========================================================================
export default function UserGuidePage() {
  const [search, setSearch] = useState('');
  const [openIds, setOpenIds] = useState<Set<string>>(new Set([SECTIONS[0]!.id]));

  function toggle(id: string) {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function expandAll() {
    setOpenIds(new Set(SECTIONS.map((s) => s.id)));
  }
  function collapseAll() {
    setOpenIds(new Set());
  }

  // Filter sections berdasar search
  const q = search.trim().toLowerCase();
  const filtered = q
    ? SECTIONS.map((s) => {
        const matchTitle = s.title.toLowerCase().includes(q);
        const matchSummary = s.summary.toLowerCase().includes(q);
        const matchBlocks = s.content.some((b) => {
          if (b.kind === 'paragraph' || b.kind === 'tip' || b.kind === 'warning') {
            return b.text.toLowerCase().includes(q);
          }
          if (b.kind === 'steps' || b.kind === 'bullet') {
            return (
              (b.title ?? '').toLowerCase().includes(q) ||
              b.items.some((i) => i.toLowerCase().includes(q))
            );
          }
          if (b.kind === 'menu-card') {
            return (
              b.label.toLowerCase().includes(q) ||
              b.description.toLowerCase().includes(q)
            );
          }
          return false;
        });
        return { section: s, matched: matchTitle || matchSummary || matchBlocks };
      })
        .filter((x) => x.matched)
        .map((x) => x.section)
    : SECTIONS;

  return (
    <div className="w-full">
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
            <BookOpenCheck className="w-6 h-6" />
            User Guide
          </h1>
          <p className="text-neutral-500 mt-1">
            Panduan lengkap cara menggunakan ECC Portal. Klik section untuk expand
            isinya. Pakai search untuk cari topik spesifik.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={expandAll}
            className="px-3 py-1.5 text-xs text-neutral-700 border border-neutral-300 hover:bg-neutral-50 rounded-lg"
          >
            Expand all
          </button>
          <button
            onClick={collapseAll}
            className="px-3 py-1.5 text-xs text-neutral-700 border border-neutral-300 hover:bg-neutral-50 rounded-lg"
          >
            Collapse all
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="flex items-center gap-2 border border-neutral-300 rounded-lg px-3 focus-within:ring-2 focus-within:ring-brand-500 bg-white">
          <Search className="w-4 h-4 text-neutral-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari di panduan... (mis. 'ibadah', 'login', 'donation')"
            className="flex-1 py-2 outline-none text-sm"
          />
        </div>
        {q && (
          <div className="mt-2 text-xs text-neutral-500">
            {filtered.length} dari {SECTIONS.length} section cocok dengan "{search}".
          </div>
        )}
      </div>

      {/* TOC quick links */}
      {!q && (
        <div className="mb-6 grid grid-cols-2 md:grid-cols-3 gap-2">
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            return (
              <a
                key={s.id}
                href={`#${s.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  setOpenIds((prev) => new Set(prev).add(s.id));
                  setTimeout(
                    () => document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
                    50,
                  );
                }}
                className="flex items-center gap-2 px-3 py-2 text-sm text-neutral-700 hover:bg-brand-50 hover:text-brand-700 rounded-lg border border-neutral-200"
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{s.title}</span>
              </a>
            );
          })}
        </div>
      )}

      {/* Sections */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="bg-white border border-neutral-200 rounded-xl p-10 text-center text-sm text-neutral-400 italic">
            Tidak ada section yang cocok dengan pencarian "{search}".
          </div>
        ) : (
          filtered.map((s) => {
            const open = openIds.has(s.id);
            const Icon = s.icon;
            return (
              <div
                key={s.id}
                id={s.id}
                className="bg-white border border-neutral-200 rounded-xl overflow-hidden scroll-mt-6"
              >
                <button
                  onClick={() => toggle(s.id)}
                  className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-neutral-50"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-neutral-900">{s.title}</div>
                      <div className="text-xs text-neutral-500 mt-0.5 truncate">{s.summary}</div>
                    </div>
                  </div>
                  {open ? (
                    <ChevronDown className="w-4 h-4 text-neutral-400 shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-neutral-400 shrink-0" />
                  )}
                </button>
                {open && (
                  <div className="px-5 pb-5 pt-1 border-t border-neutral-100 space-y-3">
                    {s.content.map((block, idx) => (
                      <ContentBlockRender key={idx} block={block} />
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="mt-8 mb-4 text-xs text-neutral-500 text-center border-t border-neutral-100 pt-4">
        Panduan dimaintain oleh tim IDEA. Update terakhir: 2026-05-22. Saran perbaikan?
        Hubungi admin sinode atau buka issue di repo internal.
      </div>
    </div>
  );
}

function ContentBlockRender({ block }: { block: ContentBlock }) {
  switch (block.kind) {
    case 'paragraph':
      return <p className="text-sm text-neutral-700 leading-relaxed">{block.text}</p>;

    case 'steps':
      return (
        <div>
          {block.title && (
            <div className="font-semibold text-sm text-neutral-900 mb-2">{block.title}</div>
          )}
          <ol className="space-y-1.5 text-sm text-neutral-700 list-decimal ml-5">
            {block.items.map((it, i) => (
              <li key={i} className="pl-1">
                {it}
              </li>
            ))}
          </ol>
        </div>
      );

    case 'bullet':
      return (
        <div>
          {block.title && (
            <div className="font-semibold text-sm text-neutral-900 mb-2">{block.title}</div>
          )}
          <ul className="space-y-1 text-sm text-neutral-700 list-disc ml-5">
            {block.items.map((it, i) => (
              <li key={i} className="pl-1">
                {it}
              </li>
            ))}
          </ul>
        </div>
      );

    case 'tip':
      return (
        <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-900">
          <Lightbulb className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <div><strong>Tip:</strong> {block.text}</div>
        </div>
      );

    case 'warning':
      return (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-900">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <div><strong>Perhatian:</strong> {block.text}</div>
        </div>
      );

    case 'menu-card': {
      const isExternal = block.href.startsWith('http');
      return (
        <a
          href={block.href}
          className="block bg-neutral-50 hover:bg-brand-50/40 border border-neutral-200 hover:border-brand-200 rounded-lg px-3 py-2 transition"
          {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        >
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-semibold text-neutral-900">{block.label}</span>
            <span className="text-[10px] font-mono text-neutral-400">{block.href}</span>
          </div>
          <div className="text-xs text-neutral-600">{block.description}</div>
        </a>
      );
    }
  }
}
