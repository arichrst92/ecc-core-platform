'use client';

/**
 * Technical Documentation — panduan teknis komprehensif ECC Master Data Platform.
 *
 * Untuk dev/ops team (Fulltimer level access). Cover: architecture, stack,
 * apps, database, auth, notification, Elsa AI agent, deploy workflow, env vars,
 * API conventions, mobile integration.
 */
import { useEffect, useRef, useState } from 'react';
import {
  FileText,
  ChevronDown,
  ChevronRight,
  Server,
  Database,
  Smartphone,
  Bell,
  Shield,
  Sparkles,
  Rocket,
  Cloud,
  GitBranch,
  Package,
  Code2,
  Terminal,
  Globe,
  Layers,
  FlaskConical,
} from 'lucide-react';
import { SECTIONS, type Section, type Block } from '@/lib/docs/tech-docs-content';
import clsx from 'clsx';

// ============================================================
// Page
// ============================================================

export default function TechDocsPage() {
  const [openId, setOpenId] = useState<string>('overview');

  return (
    <div className="w-full">
      <div className="flex items-center gap-3 mb-2">
        <FileText className="w-7 h-7 text-brand-500" />
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Technical Documentation</h1>
          <p className="text-sm text-neutral-500 mt-0.5">
            Dokumentasi teknis komprehensif ECC Master Data Platform. Untuk dev + ops team.
          </p>
        </div>
      </div>

      {/* Nav pills */}
      <div className="flex flex-wrap gap-2 mb-6 sticky top-0 bg-neutral-50 py-3 z-10">
        {SECTIONS.map((s) => {
          const Icon = s.icon;
          return (
            <button
              key={s.id}
              onClick={() => {
                setOpenId(s.id);
                document.getElementById(`section-${s.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full transition',
                openId === s.id
                  ? 'bg-brand-600 text-white'
                  : 'bg-white border border-neutral-200 text-neutral-700 hover:border-brand-300',
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {s.title}
            </button>
          );
        })}
      </div>

      {/* Sections */}
      <div className="space-y-4">
        {SECTIONS.map((s) => (
          <SectionCard key={s.id} section={s} open={openId === s.id} onToggle={() => setOpenId(openId === s.id ? '' : s.id)} />
        ))}
      </div>
    </div>
  );
}

function SectionCard({ section, open, onToggle }: { section: Section; open: boolean; onToggle: () => void }) {
  const Icon = section.icon;
  return (
    <section id={`section-${section.id}`} className="bg-white border border-neutral-200 rounded-xl overflow-hidden scroll-mt-20">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-6 py-4 hover:bg-neutral-50 text-left"
      >
        <Icon className="w-5 h-5 text-brand-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-neutral-900">{section.title}</h2>
          <p className="text-xs text-neutral-500 mt-0.5">{section.summary}</p>
        </div>
        {open ? (
          <ChevronDown className="w-4 h-4 text-neutral-400 shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-neutral-400 shrink-0" />
        )}
      </button>
      {open && (
        <div className="px-6 pb-6 border-t border-neutral-100 space-y-4 pt-4">
          {section.blocks.map((b, i) => (
            <BlockRenderer key={i} block={b} />
          ))}
        </div>
      )}
    </section>
  );
}

function BlockRenderer({ block }: { block: Block }) {
  switch (block.kind) {
    case 'p':
      return <p className="text-sm text-neutral-700 leading-relaxed">{block.text}</p>;
    case 'list':
      return (
        <ul className="list-disc pl-5 space-y-1.5 text-sm text-neutral-700 leading-relaxed">
          {block.items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      );
    case 'code':
      return (
        <pre className="bg-neutral-900 text-neutral-100 rounded-lg p-4 text-xs overflow-x-auto">
          <code>{block.content}</code>
        </pre>
      );
    case 'table':
      return (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-neutral-50 border-b border-neutral-200">
                {block.headers.map((h, i) => (
                  <th key={i} className="text-left px-3 py-2 font-semibold text-neutral-700 text-xs uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, i) => (
                <tr key={i} className="border-b border-neutral-100 hover:bg-neutral-50">
                  {row.map((cell, j) => (
                    <td key={j} className="px-3 py-2 text-neutral-700 align-top">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'callout': {
      const variantCls =
        block.variant === 'warning'
          ? 'bg-amber-50 border-amber-200 text-amber-900'
          : block.variant === 'success'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
            : 'bg-blue-50 border-blue-200 text-blue-900';
      return <div className={`border rounded-lg p-3 text-sm ${variantCls}`}>{block.text}</div>;
    }
    case 'mermaid':
      return <MermaidBlock caption={block.caption} content={block.content} />;
    default:
      return null;
  }
}

let mermaidLoader: Promise<any> | null = null;
function loadMermaid(): Promise<any> {
  if (mermaidLoader) return mermaidLoader;
  mermaidLoader = new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return reject(new Error('SSR'));
    const w = window as any;
    if (w.mermaid) return resolve(w.mermaid);
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js';
    s.async = true;
    s.onload = () => {
      try {
        w.mermaid.initialize({ startOnLoad: false, theme: 'neutral', securityLevel: 'strict' });
        resolve(w.mermaid);
      } catch (err) {
        reject(err);
      }
    };
    s.onerror = () => reject(new Error('Failed to load mermaid'));
    document.head.appendChild(s);
  });
  return mermaidLoader;
}

function MermaidBlock({ caption, content }: { caption?: string; content: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const idRef = useRef(`mmd-${Math.random().toString(36).slice(2, 10)}`);

  useEffect(() => {
    let alive = true;
    loadMermaid()
      .then(async (mermaid) => {
        if (!alive || !ref.current) return;
        try {
          const { svg } = await mermaid.render(idRef.current, content);
          if (alive && ref.current) ref.current.innerHTML = svg;
        } catch (e: any) {
          if (alive) setErr(e?.message ?? 'Render error');
        }
      })
      .catch((e) => alive && setErr(e?.message ?? 'Load error'));
    return () => {
      alive = false;
    };
  }, [content]);

  return (
    <figure className="border border-neutral-200 rounded-lg overflow-hidden bg-white">
      <div ref={ref} className="p-4 overflow-x-auto text-center min-h-[80px]">
        {!err && <span className="text-xs text-neutral-400">Rendering diagram…</span>}
      </div>
      {err && (
        <pre className="text-xs text-red-600 px-4 pb-3 whitespace-pre-wrap">Mermaid error: {err}</pre>
      )}
      {caption && (
        <figcaption className="text-xs text-neutral-500 border-t border-neutral-100 px-4 py-2 bg-neutral-50">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
