'use client';

import { useState, useMemo } from 'react';
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
    <div className="p-6 max-w-7xl mx-auto">
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
              <strong>Markdown</strong> — tulis dengan format Markdown biasa (bold dengan
              <code className="px-1 bg-blue-100 rounded">**text**</code>, list dengan
              <code className="px-1 bg-blue-100 rounded">- item</code>, dll).
            </li>
            <li>
              <strong>JSON</strong> — edit struktur JSON. Pastikan format valid (cek
              quotes, koma, braces). Salah JSON = save di-reject.
            </li>
            <li>
              Perubahan akan tampil di landing dalam ~10 menit (next cache refresh) atau
              langsung kalau user hard reload.
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

  // Auto-format JSON kalau contentType=json — validate saat user ketik
  function handleContentChange(value: string) {
    setContent(value);
    if (section.contentType === 'json') {
      try {
        JSON.parse(value);
        setJsonError(null);
      } catch (err) {
        setJsonError(err instanceof Error ? err.message : 'JSON tidak valid');
      }
    }
  }

  function formatJson() {
    try {
      const parsed = JSON.parse(content);
      setContent(JSON.stringify(parsed, null, 2));
      setJsonError(null);
    } catch (err) {
      setJsonError(err instanceof Error ? err.message : 'JSON tidak valid');
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
                {section.contentType}
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

          {/* Content */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-neutral-700">
                Content
              </label>
              {section.contentType === 'json' && (
                <button
                  type="button"
                  onClick={formatJson}
                  className="text-xs text-brand-600 hover:underline"
                >
                  Format JSON
                </button>
              )}
            </div>
            <textarea
              value={content}
              onChange={(e) => handleContentChange(e.target.value)}
              rows={16}
              className={`w-full px-3 py-2 border rounded-lg text-sm font-mono focus:outline-none focus:border-brand-500 ${
                jsonError ? 'border-red-300 bg-red-50' : 'border-neutral-300'
              }`}
              spellCheck={false}
            />
            {jsonError && (
              <p className="mt-1 text-xs text-red-600 flex items-start gap-1">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                JSON tidak valid: {jsonError}
              </p>
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
