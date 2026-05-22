'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, Loader2, Save, AlertCircle, Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiClient } from '@/lib/api-client';
import { ConfirmDelete } from '@/components/crud/confirm-delete';

type LegalKey = 'TERMS' | 'PRIVACY';
type LegalLang = 'id' | 'en';

interface LegalDoc {
  id: string;
  key: LegalKey;
  language: string;
  title: string;
  content: string;
  version: string;
  isPublished: boolean;
  publishedAt: string;
  publishedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

const KEY_LABEL: Record<LegalKey, string> = {
  TERMS: 'Syarat & Ketentuan',
  PRIVACY: 'Kebijakan Privasi',
};

const LANG_LABEL: Record<LegalLang, string> = {
  id: 'Bahasa Indonesia',
  en: 'English',
};

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function LegalPage() {
  const qc = useQueryClient();
  const [activeKey, setActiveKey] = useState<LegalKey>('TERMS');
  const [activeLang, setActiveLang] = useState<LegalLang>('id');

  const listQ = useQuery({
    queryKey: ['legal', 'list'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: LegalDoc[] }>('/admin/legal');
      return res.data.data;
    },
  });

  const docs = listQ.data ?? [];
  const docMap = new Map<string, LegalDoc>();
  for (const d of docs) docMap.set(`${d.key}/${d.language}`, d);
  const currentDoc = docMap.get(`${activeKey}/${activeLang}`);
  const hasEn = (key: LegalKey) => docMap.has(`${key}/en`);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 flex items-center gap-2">
            <FileText className="w-6 h-6" />
            Legal Documents
          </h1>
          <p className="text-neutral-500 mt-1">
            Syarat & Ketentuan + Kebijakan Privasi. Mobile fetch via
            <code className="text-xs bg-neutral-100 px-1 rounded mx-1">GET /public/legal/:key</code>
            (no auth) untuk display di login/signup screen.
          </p>
        </div>
      </div>

      {/* Tabs: key (TERMS/PRIVACY) */}
      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        <div className="flex border-b border-neutral-200">
          {(['TERMS', 'PRIVACY'] as LegalKey[]).map((k) => (
            <button
              key={k}
              onClick={() => setActiveKey(k)}
              className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 transition ${
                activeKey === k
                  ? 'border-brand-500 text-brand-700 bg-brand-50/30'
                  : 'border-transparent text-neutral-600 hover:bg-neutral-50'
              }`}
            >
              {KEY_LABEL[k]}
            </button>
          ))}
        </div>

        {/* Sub-tabs: language */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-neutral-100 bg-neutral-50/50">
          <span className="text-xs text-neutral-500 mr-2">Bahasa:</span>
          {(['id', 'en'] as LegalLang[]).map((l) => (
            <button
              key={l}
              onClick={() => setActiveLang(l)}
              className={`px-3 py-1 text-xs font-medium rounded transition ${
                activeLang === l
                  ? 'bg-brand-500 text-white'
                  : 'text-neutral-600 hover:bg-neutral-100'
              }`}
            >
              {LANG_LABEL[l]}
              {l === 'id' && (
                <span className="ml-1 text-[10px] opacity-70">(wajib)</span>
              )}
              {l === 'en' && !hasEn(activeKey) && (
                <span className="ml-1 text-[10px] opacity-70">(belum ada)</span>
              )}
            </button>
          ))}
        </div>

        {listQ.isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
          </div>
        ) : (
          <Editor
            key={`${activeKey}-${activeLang}`}
            keyName={activeKey}
            lang={activeLang}
            existing={currentDoc}
            onSaved={() => {
              qc.invalidateQueries({ queryKey: ['legal', 'list'] });
            }}
          />
        )}
      </div>

      <div className="mt-3 text-xs text-neutral-500 flex items-start gap-2">
        <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <span>
          Mobile cache content berdasarkan field <code className="bg-neutral-100 px-1 rounded">version</code>.
          Bump version setiap save supaya client tahu ada update. Konvensi: pakai ISO date hari ini
          (YYYY-MM-DD).
        </span>
      </div>
    </div>
  );
}

function Editor({
  keyName,
  lang,
  existing,
  onSaved,
}: {
  keyName: LegalKey;
  lang: LegalLang;
  existing: LegalDoc | undefined;
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const [title, setTitle] = useState(existing?.title ?? `${KEY_LABEL[keyName]} ECC`);
  const [content, setContent] = useState(existing?.content ?? '');
  const [version, setVersion] = useState(existing?.version ?? todayIso());
  const [isPublished, setIsPublished] = useState(existing?.isPublished ?? true);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setTitle(existing?.title ?? `${KEY_LABEL[keyName]} ECC`);
    setContent(existing?.content ?? '');
    setVersion(existing?.version ?? todayIso());
    setIsPublished(existing?.isPublished ?? true);
  }, [existing, keyName]);

  const saveMut = useMutation({
    mutationFn: async () =>
      apiClient.put(`/admin/legal/${keyName}/${lang}`, {
        title,
        content,
        version,
        isPublished,
      }),
    onSuccess: () => {
      toast.success(`${KEY_LABEL[keyName]} (${lang}) tersimpan`);
      onSaved();
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message ?? 'Gagal'),
  });

  const deleteMut = useMutation({
    mutationFn: async () => apiClient.delete(`/admin/legal/${keyName}/${lang}`),
    onSuccess: () => {
      toast.success('Versi bahasa dihapus');
      setDeleting(false);
      qc.invalidateQueries({ queryKey: ['legal', 'list'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.error?.message ?? 'Gagal'),
  });

  const isEmpty = !existing;
  const wordCount = content.trim().length === 0 ? 0 : content.trim().split(/\s+/).length;

  return (
    <div className="p-6 space-y-4">
      {isEmpty && lang === 'en' && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs px-3 py-2 rounded-lg flex items-start gap-2">
          <Plus className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>
            Versi English belum ada. Kalau di-skip, mobile akan fallback ke
            versi Bahasa Indonesia. Untuk publish, isi field & klik Simpan.
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-neutral-600 mb-1">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-neutral-600 mb-1">
            Version <span className="text-neutral-400">(ISO date YYYY-MM-DD)</span>
          </label>
          <input
            type="text"
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            placeholder="2026-05-22"
            className="w-full px-3 py-2 border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500 text-sm font-mono"
          />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-xs font-medium text-neutral-600">
            Content <span className="text-neutral-400">(markdown — mobile render via react-native-markdown-display)</span>
          </label>
          <span className="text-[10px] text-neutral-400">{wordCount} kata · {content.length} karakter</span>
        </div>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={20}
          className="w-full px-3 py-2 border border-neutral-300 rounded-lg outline-none focus:ring-2 focus:ring-brand-500 text-sm font-mono"
          placeholder={`# ${KEY_LABEL[keyName]}\n\n## 1. ...\n\nIsi raw markdown...`}
        />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={isPublished}
          onChange={(e) => setIsPublished(e.target.checked)}
          className="w-4 h-4 accent-brand-500"
        />
        <span className="text-neutral-700">
          Published <span className="text-xs text-neutral-500">(mobile akan fetch versi ini)</span>
        </span>
      </label>

      <div className="flex items-center justify-between pt-4 border-t border-neutral-100">
        {existing && lang === 'en' ? (
          <button
            onClick={() => setDeleting(true)}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg"
          >
            <Trash2 className="w-4 h-4" />
            Hapus versi English
          </button>
        ) : (
          <span />
        )}
        <button
          onClick={() => saveMut.mutate()}
          disabled={saveMut.isPending || !title.trim() || !content.trim() || !version.trim()}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 rounded-lg disabled:opacity-50"
        >
          {saveMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Simpan
        </button>
      </div>

      <ConfirmDelete
        open={deleting}
        loading={deleteMut.isPending}
        onClose={() => setDeleting(false)}
        title="Hapus versi bahasa ini?"
        itemName={`${KEY_LABEL[keyName]} — ${LANG_LABEL[lang]}`}
        onConfirm={() => deleteMut.mutate()}
      />
    </div>
  );
}
