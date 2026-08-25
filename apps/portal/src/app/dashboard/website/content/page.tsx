'use client';

import { useState, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  LayoutTemplate,
  Loader2,
  Save,
  X,
  AlertCircle,
  Eye,
  EyeOff,
  Code2,
  FileText,
  ExternalLink,
  Info,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  Bold,
  List,
  Link as LinkIcon,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';

interface WebsiteSection {
  id: string;
  key: string;
  title: string;
  contentType: 'markdown' | 'json';
  content: string;
  description: string | null;
  isActive: boolean;
  updatedAt: string;
}

export default function WebsiteContentPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<WebsiteSection | null>(null);

  const listQ = useQuery({
    queryKey: ['website-content'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: WebsiteSection[] }>('/admin/website-content');
      return res.data.data;
    },
  });

  // Group by prefix sebelum titik (mis. "home.*", "about.*", "contact.*")
  const grouped = useMemo(() => {
    const items = listQ.data ?? [];
    const map = new Map<string, WebsiteSection[]>();
    for (const s of items) {
      const prefix = s.key.includes('.') ? s.key.split('.')[0]! : 'other';
      const arr = map.get(prefix) ?? [];
      arr.push(s);
      map.set(prefix, arr);
    }
    // Sort items in each group by key
    for (const arr of map.values()) {
      arr.sort((a, b) => a.key.localeCompare(b.key));
    }
    // Order groups: home → about → contact → footer → app → other
    const order = ['home', 'about', 'contact', 'footer', 'app'];
    return [...map.entries()].sort(([a], [b]) => {
      const ai = order.indexOf(a);
      const bi = order.indexOf(b);
      if (ai === -1 && bi === -1) return a.localeCompare(b);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
  }, [listQ.data]);

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <LayoutTemplate className="w-7 h-7 text-brand-500" />
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">Konten Website</h1>
            <p className="text-sm text-neutral-500 mt-0.5">
              CMS untuk landing site{' '}
              <a
                href="https://eccchurch.global"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-600 hover:underline inline-flex items-center gap-1"
              >
                eccchurch.global
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              . Edit content section di-cache landing 10 menit.
            </p>
          </div>
        </div>
      </div>

      <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-3 text-sm text-blue-800">
        <Info className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
        <div>
          <p className="font-medium mb-1">Cara edit content</p>
          <ul className="text-xs space-y-1 text-blue-700">
            <li>
              <strong>Text section</strong> — ketik langsung di editor. Pakai toolbar
              (Bold, List, Link) untuk formatting cepat.
            </li>
            <li>
              <strong>Structured section</strong> — isi form setiap kolom (title, subtitle,
              list item, dll). Klik <em>Tambah Item</em> untuk menambah entry di list.
            </li>
            <li>
              Perubahan tampil di landing dalam ~10 menit (auto refresh) atau langsung
              kalau user hard reload.
            </li>
          </ul>
        </div>
      </div>

      {listQ.isLoading ? (
        <div className="bg-white border border-neutral-200 rounded-xl p-12 text-center">
          <Loader2 className="w-5 h-5 mx-auto animate-spin text-neutral-400" />
        </div>
      ) : grouped.length === 0 ? (
        <div className="bg-white border border-neutral-200 rounded-xl p-12 text-center text-neutral-400">
          Belum ada section. Migration belum di-apply?
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([groupKey, items]) => (
            <section key={groupKey}>
              <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-3">
                {groupKey === 'home'
                  ? 'Home Page'
                  : groupKey === 'about'
                    ? 'About Page'
                    : groupKey === 'contact'
                      ? 'Contact Page'
                      : groupKey === 'footer'
                        ? 'Footer'
                        : groupKey === 'app'
                          ? 'App Download'
                          : groupKey}
              </h2>
              <div className="space-y-2">
                {items.map((s) => (
                  <SectionRow key={s.id} section={s} onEdit={() => setEditing(s)} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {editing && (
        <EditModal
          section={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['website-content'] });
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function SectionRow({
  section,
  onEdit,
}: {
  section: WebsiteSection;
  onEdit: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onEdit}
      className="w-full text-left bg-white border border-neutral-200 rounded-lg p-4 hover:border-brand-300 hover:shadow-sm transition flex items-start gap-4"
    >
      <div className="w-10 h-10 bg-brand-50 text-brand-500 rounded-lg flex items-center justify-center shrink-0">
        {section.contentType === 'json' ? (
          <Code2 className="w-5 h-5" />
        ) : (
          <FileText className="w-5 h-5" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="font-semibold text-neutral-900">{section.title}</h3>
          <span className="text-xs font-mono text-neutral-400">{section.key}</span>
          {!section.isActive && (
            <span className="px-2 py-0.5 text-xs bg-neutral-100 text-neutral-500 rounded-full inline-flex items-center gap-1">
              <EyeOff className="w-3 h-3" />
              Nonaktif
            </span>
          )}
        </div>
        {section.description && (
          <p className="text-xs text-neutral-500 line-clamp-2">{section.description}</p>
        )}
      </div>
      <div className="text-xs text-neutral-400 shrink-0">
        {new Date(section.updatedAt).toLocaleDateString('id-ID', {
          day: 'numeric',
          month: 'short',
        })}
      </div>
    </button>
  );
}

function EditModal({
  section,
  onClose,
  onSaved,
}: {
  section: WebsiteSection;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(section.title);
  const [content, setContent] = useState(section.content);
  const [isActive, setIsActive] = useState(section.isActive);
  const [jsonError, setJsonError] = useState<string | null>(null);
  // Parsed JSON value untuk form editor (kalau contentType=json)
  const [jsonValue, setJsonValue] = useState<unknown>(() => {
    if (section.contentType !== 'json') return null;
    try {
      return JSON.parse(section.content);
    } catch {
      return null;
    }
  });

  // Sync jsonValue → content string setiap kali form berubah
  function updateJsonValue(newValue: unknown) {
    setJsonValue(newValue);
    try {
      setContent(JSON.stringify(newValue, null, 2));
      setJsonError(null);
    } catch (err) {
      setJsonError(err instanceof Error ? err.message : 'Serialize gagal');
    }
  }

  const save = useMutation({
    mutationFn: async () => {
      const res = await apiClient.put(`/admin/website-content/${section.id}`, {
        title,
        content,
        isActive,
      });
      return res.data;
    },
    onSuccess: () => {
      toast.success('Tersimpan. Landing akan refresh dalam ~10 menit.');
      onSaved();
    },
    onError: (err: { response?: { data?: { error?: { message?: string } } } }) =>
      toast.error(err.response?.data?.error?.message ?? 'Gagal save'),
  });

  const isDirty = title !== section.title || content !== section.content || isActive !== section.isActive;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="border-b border-neutral-200 px-6 py-4 flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-lg text-neutral-900">{section.title}</h3>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs font-mono text-neutral-500">{section.key}</span>
              <span
                className={`px-2 py-0.5 text-xs rounded ${
                  section.contentType === 'json'
                    ? 'bg-purple-100 text-purple-700'
                    : 'bg-emerald-100 text-emerald-700'
                }`}
              >
                {section.contentType === 'json' ? 'form' : 'text'}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-neutral-400 hover:text-neutral-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {section.description && (
            <div className="text-sm text-neutral-600 bg-neutral-50 border border-neutral-200 rounded-lg p-3 flex items-start gap-2">
              <Info className="w-4 h-4 text-neutral-400 mt-0.5 shrink-0" />
              <span>{section.description}</span>
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              Title (admin display)
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:border-brand-500"
            />
          </div>

          {/* Content — Form editor untuk JSON, Textarea+toolbar untuk Markdown */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Content
            </label>
            {section.contentType === 'json' ? (
              jsonValue === null ? (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900">
                  Content JSON tidak bisa di-parse. Hubungi tim IT untuk perbaikan.
                </div>
              ) : (
                <div className="border border-neutral-200 rounded-lg p-4 bg-neutral-50">
                  <FormEditor value={jsonValue} onChange={updateJsonValue} />
                </div>
              )
            ) : (
              <MarkdownEditor value={content} onChange={setContent} />
            )}
          </div>

          {/* Active toggle */}
          <div className="flex items-center justify-between p-3 bg-neutral-50 rounded-lg">
            <div className="flex items-center gap-2">
              {isActive ? (
                <Eye className="w-4 h-4 text-green-600" />
              ) : (
                <EyeOff className="w-4 h-4 text-neutral-400" />
              )}
              <span className="text-sm font-medium text-neutral-700">
                {isActive ? 'Aktif — section ditampilkan di landing' : 'Nonaktif — section di-skip di landing'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsActive(!isActive)}
              className={`w-11 h-6 rounded-full transition ${
                isActive ? 'bg-brand-500' : 'bg-neutral-300'
              }`}
            >
              <span
                className={`block w-5 h-5 bg-white rounded-full transition transform ${
                  isActive ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-neutral-200 px-6 py-4 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-neutral-600 hover:text-neutral-900 font-medium"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={() => save.mutate()}
            disabled={!isDirty || save.isPending || !!jsonError}
            className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg font-medium text-sm inline-flex items-center gap-2 disabled:opacity-50"
          >
            {save.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Simpan Perubahan
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
//  FormEditor — recursive form untuk edit JSON content sbg fields
// ============================================================

/**
 * FormEditor generic — parse value type + render form input yg sesuai.
 * Support: string, number, boolean, array (primitives + objects), object nested.
 * User non-IT bisa edit tanpa touch JSON syntax.
 */
function FormEditor({ value, onChange }: { value: unknown; onChange: (v: unknown) => void }) {
  if (value === null || value === undefined) {
    return <FormField label="value" type="text" value="" onChange={onChange} />;
  }

  if (typeof value === 'string') {
    return <FormField label="value" type={value.length > 100 ? 'textarea' : 'text'} value={value} onChange={onChange} />;
  }

  if (typeof value === 'number') {
    return <FormField label="value" type="number" value={value} onChange={onChange} />;
  }

  if (typeof value === 'boolean') {
    return <FormField label="value" type="boolean" value={value} onChange={onChange} />;
  }

  if (Array.isArray(value)) {
    return <ArrayEditor value={value} onChange={onChange as (v: unknown[]) => void} />;
  }

  if (typeof value === 'object') {
    return <ObjectEditor value={value as Record<string, unknown>} onChange={onChange as (v: Record<string, unknown>) => void} />;
  }

  return null;
}

function ObjectEditor({
  value,
  onChange,
}: {
  value: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
}) {
  const keys = Object.keys(value);
  return (
    <div className="space-y-3">
      {keys.map((key) => {
        const v = value[key];
        return (
          <FieldRow
            key={key}
            label={humanizeKey(key)}
            value={v}
            onChange={(newV) => onChange({ ...value, [key]: newV })}
          />
        );
      })}
    </div>
  );
}

function ArrayEditor({
  value,
  onChange,
}: {
  value: unknown[];
  onChange: (v: unknown[]) => void;
}) {
  const [expanded, setExpanded] = useState<boolean[]>(() => value.map(() => true));

  function addItem() {
    const template = inferTemplate(value);
    onChange([...value, template]);
    setExpanded([...expanded, true]);
  }

  function removeItem(idx: number) {
    if (!window.confirm(`Hapus item #${idx + 1}?`)) return;
    onChange(value.filter((_, i) => i !== idx));
    setExpanded(expanded.filter((_, i) => i !== idx));
  }

  function updateItem(idx: number, newV: unknown) {
    onChange(value.map((item, i) => (i === idx ? newV : item)));
  }

  function toggleExpand(idx: number) {
    setExpanded(expanded.map((e, i) => (i === idx ? !e : e)));
  }

  return (
    <div className="space-y-2">
      {value.map((item, idx) => {
        const isObj = item !== null && typeof item === 'object' && !Array.isArray(item);
        const isExpanded = expanded[idx] ?? true;
        return (
          <div key={idx} className="border border-neutral-200 rounded-lg bg-white">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-neutral-100">
              {isObj && (
                <button
                  type="button"
                  onClick={() => toggleExpand(idx)}
                  className="p-0.5 text-neutral-500 hover:text-neutral-900"
                >
                  {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
              )}
              <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
                Item #{idx + 1}
              </span>
              <div className="flex-1" />
              <button
                type="button"
                onClick={() => removeItem(idx)}
                className="p-1 text-red-500 hover:bg-red-50 rounded"
                title="Hapus item"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            {isExpanded && (
              <div className="p-3">
                <FormEditor value={item} onChange={(newV) => updateItem(idx, newV)} />
              </div>
            )}
          </div>
        );
      })}
      <button
        type="button"
        onClick={addItem}
        className="w-full py-2 border border-dashed border-neutral-300 text-neutral-500 hover:border-brand-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg text-sm font-medium inline-flex items-center justify-center gap-1"
      >
        <Plus className="w-4 h-4" />
        Tambah Item
      </button>
    </div>
  );
}

function FieldRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  // Inline row untuk primitive values
  if (typeof value === 'string') {
    return <FormField label={label} type={value.length > 80 ? 'textarea' : 'text'} value={value} onChange={onChange} />;
  }
  if (typeof value === 'number') {
    return <FormField label={label} type="number" value={value} onChange={onChange} />;
  }
  if (typeof value === 'boolean') {
    return <FormField label={label} type="boolean" value={value} onChange={onChange} />;
  }
  if (value === null) {
    return <FormField label={label} type="text" value="" onChange={onChange} />;
  }

  // Nested object / array — indent + label header
  return (
    <div>
      <div className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2">
        {label}
      </div>
      <div className="pl-4 border-l-2 border-neutral-200">
        {Array.isArray(value) ? (
          <ArrayEditor value={value} onChange={onChange as (v: unknown[]) => void} />
        ) : (
          <ObjectEditor
            value={value as Record<string, unknown>}
            onChange={onChange as (v: Record<string, unknown>) => void}
          />
        )}
      </div>
    </div>
  );
}

function FormField({
  label,
  type,
  value,
  onChange,
}: {
  label: string;
  type: 'text' | 'textarea' | 'number' | 'boolean';
  value: string | number | boolean;
  onChange: (v: string | number | boolean) => void;
}) {
  const isLongText = type === 'textarea' || (type === 'text' && typeof value === 'string' && value.includes('\n'));

  return (
    <div>
      <label className="block text-xs font-medium text-neutral-600 mb-1">{label}</label>
      {type === 'boolean' ? (
        <button
          type="button"
          onClick={() => onChange(!value)}
          className={`w-11 h-6 rounded-full transition ${value ? 'bg-brand-500' : 'bg-neutral-300'}`}
        >
          <span
            className={`block w-5 h-5 bg-white rounded-full transition transform ${
              value ? 'translate-x-5' : 'translate-x-0.5'
            }`}
          />
        </button>
      ) : type === 'number' ? (
        <input
          type="number"
          value={value as number}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:border-brand-500"
        />
      ) : isLongText ? (
        <textarea
          value={value as string}
          onChange={(e) => onChange(e.target.value)}
          rows={Math.min(6, Math.max(2, (value as string).split('\n').length))}
          className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:border-brand-500"
        />
      ) : (
        <input
          type="text"
          value={value as string}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:border-brand-500"
        />
      )}
    </div>
  );
}

// ============================================================
//  MarkdownEditor — textarea + simple toolbar (bold, list, link)
// ============================================================

function MarkdownEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  function wrap(prefix: string, suffix: string = prefix) {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = value.slice(start, end);
    const before = value.slice(0, start);
    const after = value.slice(end);
    const inserted = `${prefix}${selected || 'text'}${suffix}`;
    onChange(before + inserted + after);
    // Restore selection
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(start + prefix.length, start + prefix.length + (selected.length || 4));
      }
    }, 0);
  }

  function insertList() {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const before = value.slice(0, start);
    const after = value.slice(start);
    const needsNewline = before && !before.endsWith('\n') ? '\n' : '';
    const inserted = `${needsNewline}- Item 1\n- Item 2\n- Item 3\n`;
    onChange(before + inserted + after);
  }

  function insertLink() {
    const url = window.prompt('URL:', 'https://');
    if (!url) return;
    wrap('[', `](${url})`);
  }

  return (
    <div>
      <div className="flex items-center gap-1 mb-2 p-1 bg-neutral-100 border border-neutral-200 rounded-lg">
        <button
          type="button"
          onClick={() => wrap('**')}
          className="p-1.5 text-neutral-700 hover:bg-white rounded"
          title="Bold (Ctrl+B)"
        >
          <Bold className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={insertList}
          className="p-1.5 text-neutral-700 hover:bg-white rounded"
          title="Bullet list"
        >
          <List className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={insertLink}
          className="p-1.5 text-neutral-700 hover:bg-white rounded"
          title="Insert link"
        >
          <LinkIcon className="w-4 h-4" />
        </button>
        <div className="flex-1" />
        <span className="text-[10px] text-neutral-500 pr-2">Markdown supported</span>
      </div>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={12}
        placeholder="Tulis text di sini..."
        className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:border-brand-500"
      />
    </div>
  );
}

// ============================================================
//  Helpers
// ============================================================

/** Convert camelCase/snake_case → Title Case. mis. "heroTitle" → "Hero Title" */
function humanizeKey(key: string): string {
  return key
    .replace(/[_-]/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Infer template untuk "add item" — clone shape dari existing item pertama, or empty */
function inferTemplate(arr: unknown[]): unknown {
  if (arr.length === 0) return '';
  const first = arr[0];
  if (typeof first === 'string') return '';
  if (typeof first === 'number') return 0;
  if (typeof first === 'boolean') return false;
  if (Array.isArray(first)) return [];
  if (first !== null && typeof first === 'object') {
    // Clone object with empty values by type
    const template: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(first)) {
      if (typeof v === 'string') template[k] = '';
      else if (typeof v === 'number') template[k] = 0;
      else if (typeof v === 'boolean') template[k] = false;
      else if (Array.isArray(v)) template[k] = [];
      else if (v !== null && typeof v === 'object') template[k] = {};
      else template[k] = null;
    }
    return template;
  }
  return null;
}
